import { isSupervisorLike } from '@/lib/roles'
import { NextRequest } from 'next/server'
import { createClient as createSupabaseJsClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { isDueThisWeek, isEligibilityEndingSoon, isOverdue, getDaysSinceContact, Client } from '@/lib/types'
import { auditBulkAccess, auditLog } from '@/lib/audit'
import { withAuth } from '@/lib/api-auth'
import { sanitizeSearchParam } from '@/lib/validation'
import { isAzureConfigured, withRlsContext } from '@/lib/db/azure'
import { handleClientsViaAzure } from '@/lib/db/clients-azure'

export const dynamic = 'force-dynamic'

// Sentinel UUID used when a caller has no legitimate scope (e.g. TM with no
// direct reports, or TM passing ?assignedTo= for a planner that isn't theirs).
// This UUID will never match a real client.assigned_to, so the result set is
// empty by construction — no leak.
const NO_SCOPE_SENTINEL = '00000000-0000-0000-0000-000000000000'

// NOTE:
// Avoid using service role directly with user-supplied ids/roles.
// We derive the requester identity from the Supabase session cookie.
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const page = parseInt(searchParams.get('page') ?? '0', 10)
    const limit = Math.min(Math.max(parseInt(searchParams.get('limit') ?? '20', 10), 1), 100)
    const filter = searchParams.get('filter') ?? 'all'
    const search = searchParams.get('search') ?? ''
    const assignedTo = searchParams.get('assignedTo') ?? ''
    const SORT_FIELDS = new Set(['goal_pct', 'last_contact_date', 'eligibility_end_date'])
  const _sortFieldRaw = searchParams.get('sortField') ?? ''
  const sortField = SORT_FIELDS.has(_sortFieldRaw) ? _sortFieldRaw : 'name'
    const sortDir = (searchParams.get('sortDir') ?? 'asc').toLowerCase() === 'desc' ? 'desc' : 'asc'
    const deadlineDate = searchParams.get('deadlineDate') ?? ''

    // Azure data plane (live in production since the 2026-06-28 Entra cutover):
    // ALL client reads route through Azure, including deadline-derived filters
    // and calendar deadlineDate clicks (added 2026-07-06 - these previously
    // fell through to the abandoned Supabase table and returned 0 rows).
    // The Supabase path below survives only as the non-Azure dev fallback.
    const AZURE_FILTERS = new Set(['all', 'co', 'cfc', 'cpas', 'overdue', 'due_today', 'due_this_week', 'due_next_14_days', 'no_contact_7', 'eligibility_ending_soon'])
    if (isAzureConfigured() && (AZURE_FILTERS.has(filter) || deadlineDate)) {
      return await handleClientsViaAzure(req)
    }

    const supabase = await createServerClient()
    const { data: authData, error: authErr } = await supabase.auth.getUser()
    if (authErr || !authData?.user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })
    }

    const userId = authData.user.id

    const { data: profile, error: profileErr } = await supabase
      .from('profiles')
      .select('id, role')
      .eq('id', userId)
      .single()

    if (profileErr || !profile) {
      return new Response(JSON.stringify({ error: 'Profile not found' }), { status: 403 })
    }

    // Fix 2026-05-22: lowercase the role for consistency with api-auth.ts and
    // to defend against accidental capitalization drift in the profiles table.
    const role = String(profile.role ?? '').toLowerCase()
    const from = page * limit
    const to = from + limit - 1

    const admin = createSupabaseJsClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    // ────────────────────────────────────────────────────────────────────────
    // ROLE-BASED ASSIGNED_TO SCOPING (fix 2026-06-11):
    //
    // Previously the team_manager branch only applied a filter if the caller
    // passed `?assignedTo=X` explicitly — otherwise it fell through and
    // returned the entire org's clients. That broke the v2 TM dashboard's
    // Client Drill-down (showed org-wide clients to a TM caller). Fix is to
    // derive the TM's direct reports once and auto-scope to that set.
    //
    // Behavior:
    //   - supports_planner       → assigned_to = userId (unchanged)
    //   - team_manager           → assigned_to IN (myPlannerIds). If
    //                              ?assignedTo=X is passed AND X is one of
    //                              myPlannerIds, narrow to that. Otherwise
    //                              empty (defense in depth — TM can't query
    //                              clients outside their team).
    //   - supervisor / it        → org-wide; ?assignedTo=X narrows freely
    //                              (unchanged)
    //   - any other / missing    → empty (defensive deny)
    // ────────────────────────────────────────────────────────────────────────

    // Resolve the TM's direct reports up-front (single query, reused below).
    let tmPlannerIds: string[] | null = null
    if (role === 'team_manager') {
      const { data: myPlanners, error: mpErr } = await admin
        .from('profiles')
        .select('id')
        .eq('team_manager_id', userId)
      if (mpErr) {
        console.error('[api/clients] failed to load TM direct reports:', mpErr.message)
        return new Response(JSON.stringify({ error: 'Failed to resolve team scope' }), { status: 500 })
      }
      tmPlannerIds = (myPlanners ?? []).map((p) => p.id as string)
    }

    // Single helper applied to both the paginated query and the full-summary
    // query so the two stay in sync.
    type PostgrestQuery = ReturnType<ReturnType<typeof createSupabaseJsClient>['from']>
    const applyAssignedScope = <T extends PostgrestQuery | ReturnType<PostgrestQuery['select']>>(q: T): T => {
      if (role === 'supports_planner') {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return (q as any).eq('assigned_to', userId) as T
      }
      if (role === 'team_manager') {
        if (assignedTo) {
          // Only honor the drill-down if it's a planner under this TM.
          if (tmPlannerIds && tmPlannerIds.includes(assignedTo)) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            return (q as any).eq('assigned_to', assignedTo) as T
          }
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          return (q as any).eq('assigned_to', NO_SCOPE_SENTINEL) as T
        }
        if (!tmPlannerIds || tmPlannerIds.length === 0) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          return (q as any).eq('assigned_to', NO_SCOPE_SENTINEL) as T
        }
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return (q as any).in('assigned_to', tmPlannerIds) as T
      }
      if (isSupervisorLike(role)) {
        if (assignedTo) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          return (q as any).eq('assigned_to', assignedTo) as T
        }
        return q
      }
      // Unknown / missing role → deny.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (q as any).eq('assigned_to', NO_SCOPE_SENTINEL) as T
    }

    const clientSelect = 'id, client_id, first_name, last_name, category, assigned_to, is_active, last_contact_date, last_contact_type, goal_pct, eligibility_code, eligibility_end_date, three_month_visit_due, quarterly_waiver_date, med_tech_redet_date, pos_deadline, assessment_due, thirty_day_letter_date, co_financial_redet_date, co_app_date, mfp_consent_date, two57_date, doc_mdh_date, spm_next_due, pos_status, profiles!clients_assigned_to_fkey(id, full_name, role)'

    let query = admin
      .from('clients')
      .select(clientSelect, { count: 'exact' })
      .eq('is_active', true)
    query = applyAssignedScope(query)

    const nowDate = new Date()
    const now = nowDate.toISOString().split('T')[0]
    const todayStart = new Date(nowDate)
    todayStart.setHours(0, 0, 0, 0)
    const weekLater = new Date(todayStart)
    weekLater.setDate(weekLater.getDate() + 7)
    const twoWeeksLater = new Date(todayStart)
    twoWeeksLater.setDate(twoWeeksLater.getDate() + 14)

    // Must match the 13 fields in lib/types.ts isOverdue/isDueThisWeek (includes spm_next_due)
    const deadlineFields = [
      'eligibility_end_date', 'three_month_visit_due', 'quarterly_waiver_date',
      'med_tech_redet_date', 'pos_deadline', 'assessment_due', 'thirty_day_letter_date',
      'co_financial_redet_date', 'co_app_date', 'mfp_consent_date', 'two57_date',
      'doc_mdh_date', 'spm_next_due',
    ]

    // deadlineDate filter uses the same set for calendar day-click
    const deadlineDateFields = deadlineFields

    // Counter↔drill-down parity for the dev fallback too (2026-07-12 audit,
    // P3; mirrors the Azure path's P2-12 fix): deadline-derived filters count
    // client_classification = 'real' only.
    const isDeadlineDerived = Boolean(deadlineDate) ||
      ['overdue', 'due_today', 'due_this_week', 'due_next_14_days', 'no_contact_7', 'eligibility_ending_soon'].includes(filter)
    if (isDeadlineDerived) {
      query = query.eq('client_classification', 'real')
    }

    if (deadlineDate) {
      query = query.or(deadlineDateFields.map(f => `${f}.eq.${deadlineDate}`).join(','))
    } else if (filter === 'overdue') {
      query = query.or(deadlineFields.map(f => `${f}.lt.${now}`).join(','))
    } else if (filter === 'due_today') {
      query = query.or(deadlineFields.map(f => `${f}.eq.${now}`).join(','))
    } else if (filter === 'due_this_week') {
      // Include today through +7 days to match client-side isDueThisWeek (orange ≤3d, yellow ≤7d)
      const w = weekLater.toISOString().split('T')[0]
      query = query.or(deadlineFields.map(f => `and(${f}.gte.${now},${f}.lte.${w})`).join(','))
    } else if (filter === 'due_next_14_days') {
      const tw = twoWeeksLater.toISOString().split('T')[0]
      query = query.or(deadlineFields.map(f => `and(${f}.gte.${now},${f}.lte.${tw})`).join(','))
    } else if (filter === 'no_contact_7') {
      // Canonical null-inclusive semantics (lib/types isNoContact7Days):
      // never-contacted counts as no-contact.
      const cutoff = new Date(todayStart)
      cutoff.setDate(cutoff.getDate() - 7)
      const cutoffStr = cutoff.toISOString().split('T')[0]
      query = query.or(`last_contact_date.is.null,last_contact_date.lte.${cutoffStr}`)
    } else if (filter === 'eligibility_ending_soon') {
      const soon = new Date(todayStart)
      soon.setDate(soon.getDate() + 30)
      const soonStr = soon.toISOString().split('T')[0]
      query = query.gte('eligibility_end_date', now).lte('eligibility_end_date', soonStr)
    } else if (filter === 'co') {
      query = query.eq('category', 'co')
    } else if (filter === 'cfc') {
      query = query.eq('category', 'cfc')
    } else if (filter === 'cpas') {
      query = query.eq('category', 'cpas')
    }

    if (search.trim()) {
      const q = sanitizeSearchParam(search.trim())
      if (q) {
        query = query.or(
          `last_name.ilike.%${q}%,first_name.ilike.%${q}%,client_id.ilike.%${q}%,eligibility_code.ilike.%${q}%`
        )
      }
    }

    if (sortField === 'goal_pct') {
      query = query.order('goal_pct', { ascending: sortDir === 'asc' }).order('last_name')
    } else if (sortField === 'last_contact_date') {
      query = query.order('last_contact_date', { ascending: sortDir === 'asc', nullsFirst: false }).order('last_name')
    } else if (sortField === 'eligibility_end_date') {
      query = query.order('eligibility_end_date', { ascending: sortDir === 'asc', nullsFirst: false }).order('last_name')
    } else {
      query = query.order('last_name', { ascending: sortDir === 'asc' })
    }

    query = query.range(from, to)

    const isFiltered = (filter !== 'all' && !deadlineDate) || search.trim()

    // Always fetch full scope for accurate stat counts (not page-scoped)
    let fullScopeQuery = admin
      .from('clients')
      .select(clientSelect)
      .eq('is_active', true)
    fullScopeQuery = applyAssignedScope(fullScopeQuery)

    const [filteredResult, fullScopeResult] = await Promise.all([
      query,
      fullScopeQuery,
    ])

    const { data: clients, error, count } = filteredResult

    if (error) {
      console.error('[api/clients] DB error:', error.message)
      return new Response(JSON.stringify({ error: 'Failed to load clients' }), { status: 500 })
    }

    const pageClients = (clients ?? []) as unknown as Client[]
    const total = count ?? 0
    const hasMore = from + limit < total

    // Full-scope stats — always computed from ALL clients in scope, never page-scoped
    const allClients = (fullScopeResult?.data ?? []) as unknown as Client[]
    const fullSummary = {
      total: allClients.length,
      overdue: allClients.filter(isOverdue).length,
      dueThisWeek: allClients.filter(isDueThisWeek).length,
      eligibilitySoon: allClients.filter(isEligibilityEndingSoon).length,
      noContact: allClients.filter(client => {
        const days = getDaysSinceContact(client.last_contact_date)
        return days === null || days >= 7
      }).length,
    }

    // Page-scoped summary (for filtered result count display)
    const summary = isFiltered ? {
      total,
      overdue: pageClients.filter(isOverdue).length,
      dueThisWeek: pageClients.filter(isDueThisWeek).length,
      eligibilitySoon: pageClients.filter(isEligibilityEndingSoon).length,
      noContact: pageClients.filter(client => {
        const days = getDaysSinceContact(client.last_contact_date)
        return days === null || days >= 7
      }).length,
    } : fullSummary

    // HIPAA: log bulk PHI access. auditBulkAccess only writes when
    // count >= BULK_THRESHOLD (100), so this is silent for normal pages
    // and noisy for the kind of access that matters for exfil detection.
    // Fix 2026-05-22: previously no audit row was written when supervisors
    // pulled their full caseload. See AUDIT_2026-05-22.md §5C P1-11.
    await auditBulkAccess(req, {
      userId,
      userEmail: authData.user.email ?? undefined,
      userRole: role,
      action: 'client.bulk_access',
      resourceType: 'clients',
      count: allClients.length,
      details: { page, limit, filter, search: search ? '[redacted]' : null, has_assigned_filter: !!assignedTo },
    }).catch(() => {})

    return new Response(JSON.stringify({ clients: pageClients, total, hasMore, summary, fullSummary }), {
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Internal error'
    return new Response(JSON.stringify({ error: msg }), { status: 500 })
  }
}
// ---------------------------------------------------------------------------
// POST /api/clients — create a single client (Azure-aware).
//
// Phase 3 data plane: inserts go to Azure under the CALLER's RLS scope when
// configured (same withRlsContext pattern as /api/clients/import); otherwise
// the Supabase session client (RLS applies — never the service role).
//
// Body forms:
//   { validate_only: true, client_id }              -> { exists }  (intake step-1 check)
//   { client_id, last_name, category, ...optional } -> 201 { id }
//
// NOTE: the duplicate-client_id probe runs under the caller's OWN row scope,
// so a unique index on clients.client_id remains the authoritative guard —
// a unique-violation from either plane is translated to 409 below.
export const POST = withAuth(async (req, ctx) => {
  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), { status: 400 })
  }

  const clientIdRaw = typeof body.client_id === 'string' ? body.client_id.trim() : ''

  // --- validate_only: existence probe for the intake form's step-1 check ---
  if (body.validate_only === true) {
    if (!clientIdRaw) return new Response(JSON.stringify({ exists: false }), { status: 200 })
    let exists = false
    if (isAzureConfigured()) {
      const rows = await withRlsContext(ctx.user.id, (sql) => sql`SELECT id FROM clients WHERE client_id = ${clientIdRaw} LIMIT 1`)
      exists = rows.length > 0
    } else {
      const { data } = await ctx.supabase.from('clients').select('id').eq('client_id', clientIdRaw).limit(1)
      exists = Boolean(data && data.length > 0)
    }
    return new Response(JSON.stringify({ exists }), { status: 200 })
  }

  // --- create ---
  if (!clientIdRaw) return new Response(JSON.stringify({ error: 'client_id is required' }), { status: 400 })
  const lastName = typeof body.last_name === 'string' ? body.last_name.trim() : ''
  if (!lastName) return new Response(JSON.stringify({ error: 'last_name is required' }), { status: 400 })
  const category = typeof body.category === 'string' ? body.category.trim().toLowerCase() : ''
  if (!category) return new Response(JSON.stringify({ error: 'category is required' }), { status: 400 })

  const CREATE_FIELDS = [
    'first_name', 'eligibility_code', 'eligibility_end_date', 'assigned_to',
    'last_contact_date', 'last_contact_type', 'three_month_visit_date',
    'three_month_visit_due', 'quarterly_waiver_date', 'drop_in_visit_date',
    'poc_date', 'loc_date', 'med_tech_redet_date', 'med_tech_status',
    'pos_deadline', 'pos_status', 'assessment_due', 'spm_completed', 'foc',
    'provider_forms', 'signatures_needed', 'schedule_docs', 'atp', 'snfs',
    'lease', 'co_financial_redet_date', 'co_app_date', 'request_letter',
    'mfp_consent_date', 'two57_date', 'goal_pct',
  ]
  const payload: Record<string, unknown> = {
    client_id: clientIdRaw,
    last_name: lastName,
    category,
    is_active: true,
    client_classification: 'real',
  }
  for (const key of CREATE_FIELDS) {
    if (key in body) payload[key] = body[key] === '' ? null : body[key]
  }

  let createdId: string | null = null
  let createErr: string | null = null
  if (isAzureConfigured()) {
    try {
      const rows = await withRlsContext(ctx.user.id, (sql) => sql`INSERT INTO clients ${sql(payload)} RETURNING id`)
      createdId = (rows[0] as { id?: string } | undefined)?.id ?? null
    } catch (e) {
      createErr = (e as Error).message
    }
  } else {
    const { data, error } = await ctx.supabase.from('clients').insert(payload).select('id').single()
    if (error) createErr = error.message
    else createdId = data?.id ?? null
  }

  if (createErr || !createdId) {
    const msg = createErr ?? 'Insert failed'
    const isDup = /duplicate|unique/i.test(msg)
    await auditLog(req, {
      userId: ctx.user.id, userEmail: ctx.user.email, userRole: ctx.role,
      action: 'client.create.denied', resourceType: 'client',
      details: { client_id: clientIdRaw, error: msg },
    })
    return new Response(JSON.stringify({ error: isDup ? 'This Client ID is already in use' : msg }), { status: isDup ? 409 : 400 })
  }

  await auditLog(req, {
    userId: ctx.user.id, userEmail: ctx.user.email, userRole: ctx.role,
    action: 'client.create', resourceType: 'client', resourceId: createdId,
    details: { client_id: clientIdRaw },
  })

  return new Response(JSON.stringify({ id: createdId }), { status: 201 })
})
