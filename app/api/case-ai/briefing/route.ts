// app/api/case-ai/briefing/route.ts
// Deterministic once-a-day POS submission-readiness briefing for the signed-in user.
//
// Batch C — part 2. Reuses evaluateReadiness() from lib/readiness.ts VERBATIM so the
// five submission gates live in exactly one place — no rule duplication with the
// evaluate_client_readiness bot tool. No LLM call and no schema changes: this route
// loads the user's in-scope ACTIVE clients (role-scoped identically to search_clients
// and evaluate_client_readiness), evaluates each, and returns a summary — the ready
// count plus every not-ready client with its blocking gates.
//
// "Once/day" is a front-end concern (localStorage in YourCaseAI.tsx); the route itself
// is stateless and safe to call anytime.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { checkAiRateLimit } from '@/lib/ai-rate-limit'
import { auditLog } from '@/lib/audit'
import { isAzureConfigured, withRlsContext } from '@/lib/db/azure'
import { evaluateReadiness, SIGNATURE_CATEGORIES } from '@/lib/readiness'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

// Safety bound on rows evaluated in one request. Covers any realistic SP/TM caseload
// in full; only a supervisor/admin/owner org-wide view could approach it, in which
// case `truncated` is set in the payload.
const MAX_CLIENTS = 2000

// Role scoping mirrors search_clients / evaluate_client_readiness EXACTLY so the
// briefing can never disagree with the per-client tool. Everything not in these two
// sets (supervisor, it, admin_assistant, owner, case_manager, …) is org-wide, same as
// those handlers.
const SP_ROLES = new Set(['supports_planner', 'SUPPORT_PLANNER', 'STAFF'])
const TM_ROLES = new Set(['team_manager', 'TEAM_MANAGER', 'MANAGER'])

type ClientRow = {
  id: string
  client_id: string | null
  first_name: string | null
  last_name: string | null
  eligibility_end_date: string | null
  loc_date: string | null
  pos_status: string | null
  poc_date: string | null
}

const CLIENT_COLS =
  'id, client_id, first_name, last_name, eligibility_end_date, loc_date, pos_status, poc_date'

export async function GET(req: NextRequest) {
  const aiRateLimit = await checkAiRateLimit(req, '/api/case-ai/briefing')
  if (aiRateLimit) return aiRateLimit

  // Verify session — never trust identity from the request.
  const serverSupabase = await createServerClient()
  const { data: authData, error: authErr } = await serverSupabase.auth.getUser()
  if (authErr || !authData?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const userId = authData.user.id

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
    resourceType: 'case-ai-briefing',
    details: { kind: 'daily_briefing' },
  }).catch(() => {})

  const sigCats: string[] = [...SIGNATURE_CATEGORIES]

  // --- Load in-scope ACTIVE clients + which of them have a signature doc ---------
  let clients: ClientRow[] = []
  let sigSet = new Set<string>()

  if (isAzureConfigured()) {
    const loaded = await withRlsContext(userId, async (sql) => {
      let scope = sql``
      if (SP_ROLES.has(userRole)) {
        scope = sql`AND assigned_to = ${userId}`
      } else if (TM_ROLES.has(userRole)) {
        const tm = await sql`SELECT id FROM profiles WHERE team_manager_id = ${userId}`
        const ids = (tm as unknown as { id: string }[]).map((m) => m.id)
        ids.push(userId)
        scope = sql`AND assigned_to = ANY(${ids}::uuid[])`
      }
      // supervisor / admin / owner / etc.: no scope filter (org-wide), same as search_clients.
      const rows = await sql`SELECT id, client_id, first_name, last_name, eligibility_end_date, loc_date, pos_status, poc_date FROM clients WHERE is_active = true AND client_classification = 'real' ${scope} ORDER BY last_name ASC, first_name ASC LIMIT ${MAX_CLIENTS}`
      const list = rows as unknown as ClientRow[]
      const ids = list.map((c) => c.id)
      let sig: { client_id: string }[] = []
      if (ids.length) {
        sig = (await sql`SELECT DISTINCT client_id FROM client_documents WHERE client_id = ANY(${ids}::uuid[]) AND category = ANY(${sigCats}::text[])`) as unknown as { client_id: string }[]
      }
      return { list, sigIds: sig.map((s) => s.client_id) }
    })
    clients = loaded.list
    sigSet = new Set(loaded.sigIds)
  } else {
    let query = supabase
      .from('clients')
      .select(CLIENT_COLS)
      .eq('is_active', true)
      .eq('client_classification', 'real')
    if (SP_ROLES.has(userRole)) {
      query = query.eq('assigned_to', userId)
    } else if (TM_ROLES.has(userRole)) {
      const { data: teamMembers } = await supabase
        .from('profiles')
        .select('id')
        .eq('team_manager_id', userId)
      const teamIds = (teamMembers || []).map((m: { id: string }) => m.id)
      teamIds.push(userId)
      query = query.in('assigned_to', teamIds)
    }
    const { data, error } = await query
      .order('last_name', { ascending: true })
      .order('first_name', { ascending: true })
      .limit(MAX_CLIENTS)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    clients = (data || []) as ClientRow[]
    const ids = clients.map((c) => c.id)
    if (ids.length) {
      const { data: sigDocs } = await supabase
        .from('client_documents')
        .select('client_id')
        .in('client_id', ids)
        .in('category', sigCats)
      for (const d of (sigDocs || []) as { client_id: string }[]) sigSet.add(d.client_id)
    }
  }

  // --- Evaluate — single source of truth is evaluateReadiness ------------------
  const now = new Date()
  let readyCount = 0
  const notReady: Array<{
    id: string
    client_id: string | null
    name: string
    blocking_count: number
    blocking: string[]
  }> = []

  for (const c of clients) {
    const result = evaluateReadiness(
      {
        eligibility_end_date: c.eligibility_end_date ?? null,
        loc_date: c.loc_date ?? null,
        pos_status: c.pos_status ?? null,
        poc_date: c.poc_date ?? null,
      },
      sigSet.has(c.id),
      now,
    )
    if (result.ready) {
      readyCount++
    } else {
      const blocking = result.gates
        .filter((g) => g.status === 'fail')
        .map((g) => `${g.label}: ${g.detail}`)
      const name =
        [c.first_name, c.last_name].filter(Boolean).join(' ').trim() || c.client_id || 'client'
      notReady.push({ id: c.id, client_id: c.client_id, name, blocking_count: blocking.length, blocking })
    }
  }

  // Closest-to-submittable first (fewest blockers), then alphabetical — deterministic.
  notReady.sort((a, b) => a.blocking_count - b.blocking_count || a.name.localeCompare(b.name))

  return NextResponse.json({
    generated_at: now.toISOString(),
    role: userRole,
    total: clients.length,
    ready_count: readyCount,
    not_ready_count: notReady.length,
    truncated: clients.length >= MAX_CLIENTS,
    not_ready: notReady,
  })
}
