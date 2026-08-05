// app/api/case-ai/briefing/route.ts
// Deterministic once-a-day POS submission-readiness briefing for the signed-in user.
//
// Batch C — part 2. Reuses evaluateReadiness() from lib/readiness.ts VERBATIM so the
// five submission gates live in exactly one place — no rule duplication with the
// evaluate_client_readiness bot tool. No LLM call and no schema changes: this route
// loads the user's in-scope ACTIVE clients (role-scoped identically to search_clients
// and evaluate_client_readiness), evaluates each, and returns a summary — the ready
// count plus not-ready clients with their blocking gates.
//
// 2026-07-04 accuracy-at-scale rebuild (audit item #6):
//   • The scan now paginates through the FULL in-scope caseload instead of a
//     silent LIMIT 2000 — at 5k clients the old cap made supervisor/admin
//     ready/not-ready counts simply wrong. A generous safety ceiling remains
//     (SCAN_CEILING) and sets `truncated` if ever hit.
//   • Signature-doc lookup joins clients in SQL instead of shipping thousands
//     of uuids back and forth (the Supabase fallback chunks its .in() filter).
//   • Counts are always exact; the not_ready DETAIL list is capped at
//     NOT_READY_DETAIL_MAX (closest-to-submittable first — the card only
//     renders a handful). `not_ready_count` is the number to display.
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

// Page size for the caseload scan and the absolute safety ceiling. The ceiling
// exists only to bound a pathological runaway — it is far above any realistic
// BLH caseload, and hitting it sets `truncated: true` in the payload.
const SCAN_PAGE = 2000
const SCAN_CEILING = 25000

// Counts are always exact; only the per-client detail list is capped (the
// briefing card renders 4 rows and a "+N more" from not_ready_count).
const NOT_READY_DETAIL_MAX = 50

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

  // --- Load ALL in-scope ACTIVE clients + which of them have a signature doc ----
  let clients: ClientRow[] = []
  let sigSet = new Set<string>()
  let truncated = false

  if (isAzureConfigured()) {
    const loaded = await withRlsContext(userId, async (sql) => {
      let scope = sql``
      if (SP_ROLES.has(userRole)) {
        scope = sql`AND c.assigned_to = ${userId}`
      } else if (TM_ROLES.has(userRole)) {
        const tm = await sql`SELECT id FROM profiles WHERE team_manager_id = ${userId}`
        const ids = (tm as unknown as { id: string }[]).map((m) => m.id)
        ids.push(userId)
        scope = sql`AND c.assigned_to = ANY(${ids}::uuid[])`
      }
      // supervisor / admin / owner / etc.: no scope filter (org-wide), same as search_clients.

      // Paginate the full caseload. Stable ORDER BY (id tiebreak) keeps pages
      // disjoint even when names collide.
      const list: ClientRow[] = []
      let hitCeiling = false
      for (let offset = 0; offset < SCAN_CEILING; offset += SCAN_PAGE) {
        const rows = await sql`SELECT c.id, c.client_id, c.first_name, c.last_name, c.eligibility_end_date, c.loc_date, c.pos_status, c.poc_date FROM clients c WHERE c.is_active = true AND c.client_classification = 'real' ${scope} ORDER BY c.last_name ASC, c.first_name ASC, c.id ASC LIMIT ${SCAN_PAGE} OFFSET ${offset}`
        const page = rows as unknown as ClientRow[]
        list.push(...page)
        if (page.length < SCAN_PAGE) break
        if (offset + SCAN_PAGE >= SCAN_CEILING) hitCeiling = true
      }

      // Signature docs resolved by JOIN under the same scope — no uuid arrays
      // over the wire.
      const sig = (await sql`SELECT DISTINCT d.client_id FROM client_documents d JOIN clients c ON c.id = d.client_id WHERE c.is_active = true AND c.client_classification = 'real' ${scope} AND d.category = ANY(${sigCats}::text[])`) as unknown as { client_id: string }[]

      return { list, sigIds: sig.map((s) => s.client_id), hitCeiling }
    })
    clients = loaded.list
    sigSet = new Set(loaded.sigIds)
    truncated = loaded.hitCeiling
  } else {
    // Fallback plane: same pagination discipline (a bare select caps at the
    // PostgREST max-rows setting and would silently truncate).
    let teamIds: string[] | null = null
    if (TM_ROLES.has(userRole)) {
      const { data: teamMembers } = await supabase
        .from('profiles')
        .select('id')
        .eq('team_manager_id', userId)
      teamIds = (teamMembers || []).map((m: { id: string }) => m.id)
      teamIds.push(userId)
    }

    for (let offset = 0; offset < SCAN_CEILING; offset += SCAN_PAGE) {
      let query = supabase
        .from('clients')
        .select(CLIENT_COLS)
        .eq('is_active', true)
        .eq('client_classification', 'real')
      if (SP_ROLES.has(userRole)) {
        query = query.eq('assigned_to', userId)
      } else if (teamIds) {
        query = query.in('assigned_to', teamIds)
      }
      const { data, error } = await query
        .order('last_name', { ascending: true })
        .order('first_name', { ascending: true })
        .order('id', { ascending: true })
        .range(offset, offset + SCAN_PAGE - 1)
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      const page = (data || []) as ClientRow[]
      clients.push(...page)
      if (page.length < SCAN_PAGE) break
      if (offset + SCAN_PAGE >= SCAN_CEILING) truncated = true
    }

    // Chunk the id filter — thousands of uuids in one .in() overflows the
    // request line.
    const ids = clients.map((c) => c.id)
    for (let i = 0; i < ids.length; i += 500) {
      const chunk = ids.slice(i, i + 500)
      const { data: sigDocs } = await supabase
        .from('client_documents')
        .select('client_id')
        .in('client_id', chunk)
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
        appeal_status: (c as { appeal_status?: string | null }).appeal_status ?? null,
        appeal_received_date: (c as { appeal_received_date?: string | null }).appeal_received_date ?? null,
        appeal_hearing_date: (c as { appeal_hearing_date?: string | null }).appeal_hearing_date ?? null,
        appeal_decision_date: (c as { appeal_decision_date?: string | null }).appeal_decision_date ?? null,
        appeal_status_changed_at: (c as { appeal_status_changed_at?: string | null }).appeal_status_changed_at ?? null,
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
    truncated,
    not_ready: notReady.slice(0, NOT_READY_DETAIL_MAX),
  })
}
