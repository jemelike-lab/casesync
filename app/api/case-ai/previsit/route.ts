// app/api/case-ai/previsit/route.ts
// Casey Flagship Phase 1 — one-tap pre-visit brief for a single client.
//
// POST { clientId } → assembles the deterministic pre-visit packet
// (lib/previsit.ts — same assembler the get_previsit_brief chat tool uses, so
// the AI rail and Casey chat can never disagree) and makes ONE model call with
// a purpose-built prompt to write a skimmable plain-text brief.
// Auth / rate-limit / role-resolution / audit mirror /api/case-ai/briefing.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { checkAiRateLimit } from '@/lib/ai-rate-limit'
import { auditLog } from '@/lib/audit'
import { isAzureConfigured, withRlsContext } from '@/lib/db/azure'
import { assemblePrevisitPacket } from '@/lib/previsit'
import { businessTodayStr } from '@/lib/business-date'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const BRIEF_SYSTEM_PROMPT = `You are Casey, CaseSync's case-work AI at Beatrice Loving Heart, writing a PRE-VISIT BRIEF a Support Planner will skim on their phone right before walking in to see a client.

Rules:
- Use ONLY the facts in the packet. NEVER invent dates, documents, names, or history. If something is missing, say "not on file".
- Plain text only — NO markdown symbols (no **, no #, no backticks). Use these exact ALL-CAPS section headers, each on its own line, in this order:
SNAPSHOT
DEADLINES
SINCE LAST CONTACT
SUBMISSION READINESS
BEFORE YOU WALK IN
- Under each header use short "- " bullets. At most 5 bullets per section.
- SNAPSHOT: who they are (name, program category, eligibility code, POS status) and one line on overall state.
- DEADLINES: overdue first (write "OVERDUE by N days"), then anything due today, then the next 14 days with dates. If nothing is overdue or upcoming, one bullet saying deadlines are clear plus the next scheduled date if any.
- SINCE LAST CONTACT: when and how the last contact happened, then the 1-3 most relevant takeaways from the recent notes (most recent first). If never contacted, flag it clearly.
- SUBMISSION READINESS: ready or not ready; if not ready, list the failing gates exactly as given in blocking.
- BEFORE YOU WALK IN: 3-5 concrete to-dos or questions for THIS visit derived from the packet (e.g. collect a missing signature, complete an assessment that is due, ask about a follow-up from the last note).
- Total under 300 words. Warm but efficient — planners care for vulnerable people. Never suggest sharing client information outside CaseSync.`

export async function POST(req: NextRequest) {
  const aiRateLimit = await checkAiRateLimit(req, '/api/case-ai/previsit')
  if (aiRateLimit) return aiRateLimit

  // Verify session — never trust identity from the request.
  const serverSupabase = await createServerClient()
  const { data: authData, error: authErr } = await serverSupabase.auth.getUser()
  if (authErr || !authData?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const userId = authData.user.id

  let clientId = ''
  try {
    const body = await req.json()
    clientId = String(body?.clientId ?? '')
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }
  if (!UUID_RE.test(clientId)) {
    return NextResponse.json({ error: 'clientId must be a client uuid' }, { status: 400 })
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  // Resolve role exactly as the bot route does (Azure identity → Supabase fallback).
  let profile: { role?: string | null } | null = null
  if (isAzureConfigured()) {
    profile = await withRlsContext(userId, async (sql) => {
      const rows = await sql`SELECT role FROM profiles WHERE id = ${userId} LIMIT 1`
      return (rows[0] ?? null) as unknown as { role?: string | null } | null
    })
  } else {
    const { data } = await supabase.from('profiles').select('role').eq('id', userId).single()
    profile = data
  }
  const userRole = profile?.role ?? 'unknown'

  auditLog(req, {
    userId,
    userEmail: authData.user.email ?? undefined,
    userRole,
    action: 'client.view',
    resourceType: 'case-ai-previsit',
    details: { kind: 'previsit_brief', clientId },
  }).catch(() => {})

  const packet = await assemblePrevisitPacket(supabase, clientId, userRole, userId)
  if ((packet as { error?: string }).error) {
    return NextResponse.json({ error: (packet as { error: string }).error }, { status: 404 })
  }

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return NextResponse.json({ error: 'AI service not configured' }, { status: 503 })
  }

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), 45000)
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      signal: controller.signal,
      body: JSON.stringify({
        model: 'claude-haiku-4-5',
        max_tokens: 1200,
        system: BRIEF_SYSTEM_PROMPT,
        messages: [
          {
            role: 'user',
            content: `Today is ${businessTodayStr()}. Write the pre-visit brief from this packet:\n${JSON.stringify(packet)}`,
          },
        ],
      }),
    })
    clearTimeout(timeoutId)

    if (!res.ok) {
      const errText = await res.text()
      console.error('Previsit brief model error:', res.status, errText)
      return NextResponse.json({ error: 'AI service error — please try again' }, { status: 502 })
    }

    const data = (await res.json()) as { content?: Array<{ type: string; text?: string }> }
    const brief = (data.content ?? [])
      .filter((b) => b.type === 'text')
      .map((b) => b.text ?? '')
      .join('')
      .trim()
    if (!brief) {
      return NextResponse.json({ error: 'AI service returned no brief — please try again' }, { status: 502 })
    }

    return NextResponse.json({ brief, generated_for: (packet as { generated_for?: string }).generated_for ?? null })
  } catch (err) {
    clearTimeout(timeoutId)
    if ((err as Error).name === 'AbortError') {
      return NextResponse.json({ error: 'The brief took too long — please try again' }, { status: 504 })
    }
    console.error('Previsit brief error:', err)
    return NextResponse.json({ error: 'AI service error — please try again' }, { status: 502 })
  }
}
