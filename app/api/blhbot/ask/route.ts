import { NextResponse, NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { rateLimit } from '@/lib/rate-limit'
import { isAzureConfigured, withRlsContext } from '@/lib/db/azure'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  // Note: AI rate limiting is enforced downstream in /api/case-ai.
  // This route only applies the lightweight in-memory IP limiter.
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
  const rl = rateLimit(`blhbot-ask:${ip}`, { limit: 30, windowMs: 60_000 })
  if (!rl.ok) {
    return NextResponse.json({ ok: false, error: 'rate_limited' }, { status: 429 })
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({})) as { id?: string; question?: string }
  const id = body.id
  const question = (body.question ?? '').trim()

  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 })
  if (!question) return NextResponse.json({ error: 'question is required' }, { status: 400 })

  // Validate id format before it reaches the DB (a malformed uuid would
  // otherwise 500 the Azure path; also closes the IDOR-shaped input gap).
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ error: 'Invalid client id' }, { status: 400 })
  }

  // Resolve the client with the caller's RLS scope. In Entra/Azure mode the
  // clients table lives in Azure, so read it there via withRlsContext (runs
  // as `authenticated` with app.user_id = caller, so the same per-user
  // policies apply); otherwise fall back to the Supabase server client.
  let clientExists = false
  if (isAzureConfigured()) {
    const rows: any[] = await withRlsContext(user.id, (sql: any) => sql`SELECT id FROM clients WHERE id = ${id}`)
    clientExists = rows.length > 0
  } else {
    const { data: client, error } = await supabase
      .from('clients')
      .select('id')
      .eq('id', id)
      .single()
    clientExists = !error && !!client
  }

  if (!clientExists) {
    return NextResponse.json({ error: 'Client not found (or access denied)' }, { status: 404 })
  }

  // Delegate to existing AI endpoint which already implements:
  // - client context injection via clientId
  // - role-aware scope + knowledge blocks
  // - Anthropic streaming
  // - AI rate limiting (checkAiRateLimit on /api/case-ai)
  //
  // IMPORTANT: Forward the cookie header so case-ai's getUser() sees the
  // same auth session. Without this, the server-to-server fetch arrives
  // with no cookies and case-ai returns 401.
  const cookieHeader = req.headers.get('cookie') ?? ''
  const res = await fetch(new URL('/api/case-ai', req.url), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(cookieHeader ? { Cookie: cookieHeader } : {}),
    },
    body: JSON.stringify({
      userId: user.id,
      clientId: id,
      messages: [{ role: 'user', content: question }],
    }),
  }).catch(() => null)

  if (!res) {
    return NextResponse.json({ error: 'Failed to reach AI service' }, { status: 502 })
  }

  if (!res.ok) {
    const data = await res.json().catch(() => ({} as any))
    return NextResponse.json({ error: data.error || 'AI request failed' }, { status: res.status })
  }

  // /api/case-ai streams text/plain chunks.
  const answer = await res.text()
  return NextResponse.json({ ok: true, answer })
}
