import { NextRequest } from 'next/server'
import { createClient as createSupabaseJsClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { withRlsContext } from '@/lib/db/azure'
import { isSupervisorLike } from '@/lib/roles'
import {
  isDueThisWeek,
  isEligibilityEndingSoon,
  isOverdue,
  getDaysSinceContact,
  Client,
} from '@/lib/types'
import { auditBulkAccess } from '@/lib/audit'
import { sanitizeSearchParam } from '@/lib/validation'
import { businessTodayStr } from '@/lib/business-date'

/**
 * Phase 3 — Azure data path for GET /api/clients.
 *
 * This is the first REAL (non-diagnostic) read route to move its bulk PHI
 * reads off Supabase and onto the Azure Postgres target via `withRlsContext`.
 * It coexists with the Supabase implementation in route.ts: the route delegates
 * here only when CASESYNC_DATABASE_URL is configured (Preview during Phase 3).
 * Production has no such var, so the route keeps using Supabase untouched.
 *
 * Scope is enforced TWICE on purpose (the project's dual-enforcement rule):
 *   1. Application layer — explicit WHERE predicates below, mirroring the
 *      Supabase route's applyAssignedScope() exactly.
 *   2. RLS — withRlsContext runs as the `authenticated` role with
 *      app.user_id = <caller>, so the auth.uid() shim's policies apply on top.
 *
 * Identity-plane lookups (the caller's role, a team_manager's direct reports)
 * still use Supabase: identity has NOT migrated during Phase 3, and these are
 * tiny metadata reads, not bulk PHI. Only the clients reads move to Azure.
 *
 * Deliberately NOT handled here yet (route.ts keeps these on Supabase until the
 * deadlineFields translation lands): deadline-derived filters (overdue,
 * due_this_week, due_next_14_days, no_contact) and the specific deadlineDate
 * filter. The route guard only delegates filter ∈ {all, co, cfc, cpas} with no
 * deadlineDate.
 */

// Mirrors route.ts: a UUID that can never match a real client.assigned_to, so a
// caller with no legitimate scope gets an empty result set by construction.
const NO_SCOPE_SENTINEL = '00000000-0000-0000-0000-000000000000'

export async function handleClientsViaAzure(req: NextRequest): Promise<Response> {
  try {
    // --- query params (mirrors route.ts) ---
    const { searchParams } = new URL(req.url)
    const page = Math.max(0, parseInt(searchParams.get('page') ?? '0', 10) || 0)
    const limit = Math.min(
      Math.max(parseInt(searchParams.get('limit') ?? '20', 10) || 20, 1),
      100,
    )
    const filter = searchParams.get('filter') ?? 'all'
    const search = searchParams.get('search') ?? ''
    const assignedTo = searchParams.get('assignedTo') ?? ''
    const SORT_FIELDS = new Set(['goal_pct', 'last_contact_date', 'eligibility_end_date'])
    const deadlineDateRaw = searchParams.get('deadlineDate') ?? ''
    const deadlineDate = /^\d{4}-\d{2}-\d{2}$/.test(deadlineDateRaw) ? deadlineDateRaw : ''
    const _sortFieldRaw = searchParams.get('sortField') ?? ''
    const sortField = SORT_FIELDS.has(_sortFieldRaw) ? _sortFieldRaw : 'name'
    const sortDir =
      (searchParams.get('sortDir') ?? 'asc').toLowerCase() === 'desc' ? 'desc' : 'asc'

    const from = page * limit

    // --- identity (Supabase session — unchanged during Phase 3) ---
    const supabase = await createServerClient()
    const { data: authData, error: authErr } = await supabase.auth.getUser()
    if (authErr || !authData?.user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })
    }
    const userId = authData.user.id

    // Caller role, via their own profile row (RLS-bound read, lowercased for
    // consistency with api-auth.ts — same as route.ts).
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', userId)
      .single()
    const role = String(profile?.role ?? '').toLowerCase()

    // Service-role client for identity-plane metadata only (TM direct reports).
    const admin = createSupabaseJsClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    )
    let tmPlannerIds: string[] | null = null
    if (role === 'team_manager') {
      const { data: myPlanners, error: mpErr } = await admin
        .from('profiles')
        .select('id')
        .eq('team_manager_id', userId)
      if (mpErr) {
        console.error('[api/clients:azure] failed to load TM direct reports:', mpErr.message)
        return new Response(JSON.stringify({ error: 'Failed to resolve team scope' }), {
          status: 500,
        })
      }
      tmPlannerIds = (myPlanners ?? []).map((p) => p.id as string)
    }

    const result = await withRlsContext(userId, async (sql) => {
      // --- scope predicate: mirrors applyAssignedScope() exactly ---
      let scope
      if (role === 'supports_planner') {
        scope = sql`c.assigned_to = ${userId}`
      } else if (role === 'team_manager') {
        if (assignedTo && tmPlannerIds && tmPlannerIds.includes(assignedTo)) {
          scope = sql`c.assigned_to = ${assignedTo}`
        } else if (!tmPlannerIds || tmPlannerIds.length === 0) {
          scope = sql`c.assigned_to = ${NO_SCOPE_SENTINEL}`
        } else {
          scope = sql`c.assigned_to = ANY(${tmPlannerIds}::uuid[])`
        }
      } else if (isSupervisorLike(role)) {
        scope = assignedTo ? sql`c.assigned_to = ${assignedTo}` : sql`TRUE`
      } else {
        // Unknown / missing role → defensive deny.
        scope = sql`c.assigned_to = ${NO_SCOPE_SENTINEL}`
      }

      // --- category filter (the only filters the route delegates here) ---
      let categoryPred = null
      if (filter === 'co') categoryPred = sql`c.category = 'co'`
      else if (filter === 'cfc') categoryPred = sql`c.category = 'cfc'`
      else if (filter === 'cpas') categoryPred = sql`c.category = 'cpas'`

      // --- deadline-derived filters (2026-07-06) ---
      // These previously fell through to the legacy Supabase clients table in
      // route.ts, which is empty post-Entra-cutover - every drill-down and
      // calendar day-click returned 0 rows against live Azure data. Same 13
      // tracked fields as lib/types PRIORITY dates, anchored to the
      // America/New_York business date (never UTC).
      const DEADLINE_COLS = ['eligibility_end_date', 'three_month_visit_due', 'quarterly_waiver_date', 'med_tech_redet_date', 'pos_deadline', 'assessment_due', 'thirty_day_letter_date', 'co_financial_redet_date', 'co_app_date', 'mfp_consent_date', 'two57_date', 'doc_mdh_date', 'spm_next_due']
      const today = businessTodayStr()
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const anyDeadline = (mk: (col: any) => any) =>
        DEADLINE_COLS
          .map((f) => mk(sql(f)))
          .reduce((acc: any, p: any, i: number) => (i === 0 ? sql`(${p}` : sql`${acc} OR ${p}`), sql``)
      let deadlinePred = null
      if (deadlineDate) {
        deadlinePred = sql`${anyDeadline((col) => sql`c.${col} = ${deadlineDate}::date`)})`
      } else if (filter === 'overdue') {
        deadlinePred = sql`${anyDeadline((col) => sql`c.${col} < ${today}::date`)})`
      } else if (filter === 'due_today') {
        deadlinePred = sql`${anyDeadline((col) => sql`c.${col} = ${today}::date`)})`
      } else if (filter === 'due_this_week') {
        deadlinePred = sql`${anyDeadline((col) => sql`c.${col} BETWEEN ${today}::date AND ${today}::date + 7`)})`
      } else if (filter === 'due_next_14_days') {
        deadlinePred = sql`${anyDeadline((col) => sql`c.${col} BETWEEN ${today}::date AND ${today}::date + 14`)})`
      } else if (filter === 'no_contact_7') {
        // Canonical null-inclusive semantics (lib/types isNoContact7Days):
        // never-contacted counts as no-contact. 2026-07-12: this filter (and
        // eligibility_ending_soon) previously fell through to the abandoned
        // Supabase table and returned 0 rows in production.
        deadlinePred = sql`(c.last_contact_date IS NULL OR c.last_contact_date <= ${today}::date - 15)`
      } else if (filter === 'eligibility_ending_soon') {
        deadlinePred = sql`(c.eligibility_end_date BETWEEN ${today}::date AND ${today}::date + 30)`
      }

      // --- search (ilike across the same fields as route.ts) ---
      let searchPred = null
      const trimmed = search.trim()
      if (trimmed) {
        const q = sanitizeSearchParam(trimmed)
        if (q) {
          const like = `%${q}%`
          searchPred = sql`(c.last_name ILIKE ${like} OR c.first_name ILIKE ${like} OR c.client_id ILIKE ${like} OR c.eligibility_code ILIKE ${like})`
        }
      }

      // Compose WHERE from the active predicates.
      const preds = [sql`c.is_active = true`, scope]
      if (categoryPred) preds.push(categoryPred)
      if (deadlinePred) {
        preds.push(deadlinePred)
        // Counter↔drill-down parity (2026-07-12 audit, P2-12): every
        // compliance counter is client_classification = 'real' only, so
        // deadline-derived drill-downs must match — otherwise a test client
        // with dates makes a list disagree with the card that opened it.
        // General lists (all / category / search) intentionally keep test
        // clients visible.
        preds.push(sql`c.client_classification = 'real'`)
      }
      if (searchPred) preds.push(searchPred)
      const whereSql = preds.reduce((acc, p, i) => (i === 0 ? sql`${p}` : sql`${acc} AND ${p}`), sql``)

      // --- ORDER BY (whitelisted fields + direction → injection-safe) ---
      let orderSql
      if (sortField === 'goal_pct') {
        orderSql =
          sortDir === 'asc' ? sql`c.goal_pct ASC, c.last_name ASC` : sql`c.goal_pct DESC, c.last_name ASC`
      } else if (sortField === 'last_contact_date') {
        orderSql =
          sortDir === 'asc'
            ? sql`c.last_contact_date ASC NULLS LAST, c.last_name ASC`
            : sql`c.last_contact_date DESC NULLS LAST, c.last_name ASC`
      } else if (sortField === 'eligibility_end_date') {
        orderSql =
          sortDir === 'asc'
            ? sql`c.eligibility_end_date ASC NULLS LAST, c.last_name ASC`
            : sql`c.eligibility_end_date DESC NULLS LAST, c.last_name ASC`
      } else {
        orderSql = sortDir === 'asc' ? sql`c.last_name ASC` : sql`c.last_name DESC`
      }

      // 1) Exact total for the current scope+filter (page-independent; correct
      //    even for empty trailing pages, unlike COUNT(*) OVER()).
      const countRows = await sql<{ total_count: number }[]>`
        SELECT COUNT(*)::int AS total_count FROM clients c WHERE ${whereSql}
      `
      const total = Number(countRows[0]?.total_count ?? 0)

      // 2) The page itself, with the assigned planner embedded as `profiles`
      //    (matching the Supabase select's profiles!fk(id, full_name, role)).
      const pageRows = await sql`
        SELECT
          c.id, c.client_id, c.first_name, c.last_name, c.category, c.assigned_to,
          c.is_active, c.last_contact_date, c.last_contact_type, c.goal_pct,
          c.eligibility_code, c.eligibility_end_date, c.three_month_visit_due,
          c.quarterly_waiver_date, c.med_tech_redet_date, c.pos_deadline,
          c.assessment_due, c.thirty_day_letter_date, c.co_financial_redet_date,
          c.co_app_date, c.mfp_consent_date, c.two57_date, c.doc_mdh_date,
          c.spm_next_due, c.pos_status,
          CASE WHEN p.id IS NULL THEN NULL
               ELSE json_build_object('id', p.id, 'full_name', p.full_name, 'role', p.role)
          END AS profiles
        FROM clients c
        LEFT JOIN profiles p ON p.id = c.assigned_to
        WHERE ${whereSql}
        ORDER BY ${orderSql}
        LIMIT ${limit} OFFSET ${from}
      `

      // 3) Full-scope summary stats (scope + is_active only, no filter/search).
      const fullScopeSql = sql`c.is_active = true AND c.client_classification = 'real' AND ${scope}`

      // Org-wide summary stats as a single in-DB aggregate. Previously this
      // SELECTed every in-scope client row (all columns) and counted them in JS
      // on every request — for a supervisor that meant dragging the whole
      // clients table over the wire each time, which did not survive concurrency.
      // The bucket thresholds below mirror lib/types exactly:
      //   isOverdue => any tracked deadline < today; isDueThisWeek => any tracked
      //   deadline within today..today+7; isEligibilityEndingSoon =>
      //   eligibility_end_date within today..today+30 (expired belongs to
      //   overdue, not "soon"); isNoContact7Days => never contacted OR
      //   last_contact_date <= today-7. "today" is the America/New_York
      //   business date (t.today via CTE) — same anchor as lib/business-date
      //   and lib/dashboard-summary. Counts are client_classification = 'real'
      //   only; test/drill clients stay visible in the list rows but never
      //   inflate compliance stats.
      const summaryRows = await sql<
        {
          total: number
          overdue: number
          due_this_week: number
          eligibility_soon: number
          no_contact: number
        }[]
      >`
        WITH t AS (SELECT (now() at time zone 'America/New_York')::date AS today)
        SELECT
          COUNT(*)::int AS total,
          (COUNT(*) FILTER (WHERE
            c.eligibility_end_date < t.today OR c.three_month_visit_due < t.today OR
            c.quarterly_waiver_date < t.today OR c.med_tech_redet_date < t.today OR
            c.pos_deadline < t.today OR c.assessment_due < t.today OR
            c.thirty_day_letter_date < t.today OR c.co_financial_redet_date < t.today OR
            c.co_app_date < t.today OR c.mfp_consent_date < t.today OR
            c.two57_date < t.today OR c.doc_mdh_date < t.today OR
            c.spm_next_due < t.today
          ))::int AS overdue,
          (COUNT(*) FILTER (WHERE
            c.eligibility_end_date BETWEEN t.today AND t.today + 7 OR
            c.three_month_visit_due BETWEEN t.today AND t.today + 7 OR
            c.quarterly_waiver_date BETWEEN t.today AND t.today + 7 OR
            c.med_tech_redet_date BETWEEN t.today AND t.today + 7 OR
            c.pos_deadline BETWEEN t.today AND t.today + 7 OR
            c.assessment_due BETWEEN t.today AND t.today + 7 OR
            c.thirty_day_letter_date BETWEEN t.today AND t.today + 7 OR
            c.co_financial_redet_date BETWEEN t.today AND t.today + 7 OR
            c.co_app_date BETWEEN t.today AND t.today + 7 OR
            c.mfp_consent_date BETWEEN t.today AND t.today + 7 OR
            c.two57_date BETWEEN t.today AND t.today + 7 OR
            c.doc_mdh_date BETWEEN t.today AND t.today + 7 OR
            c.spm_next_due BETWEEN t.today AND t.today + 7
          ))::int AS due_this_week,
          (COUNT(*) FILTER (WHERE c.eligibility_end_date BETWEEN t.today AND t.today + 30))::int AS eligibility_soon,
          (COUNT(*) FILTER (WHERE c.last_contact_date IS NULL OR c.last_contact_date <= t.today - 7))::int AS no_contact
        FROM clients c CROSS JOIN t
        WHERE ${fullScopeSql}
      `

      return { total, pageRows, summary: summaryRows[0] }
    })

    const pageClients = (result.pageRows ?? []) as unknown as Client[]
    const agg = result.summary ?? {
      total: 0,
      overdue: 0,
      due_this_week: 0,
      eligibility_soon: 0,
      no_contact: 0,
    }
    const total = result.total
    const hasMore = from + limit < total

    // Full-scope summary — always over ALL in-scope clients, computed in-DB.
    const fullSummary = {
      total: agg.total,
      overdue: agg.overdue,
      dueThisWeek: agg.due_this_week,
      eligibilitySoon: agg.eligibility_soon,
      noContact: agg.no_contact,
    }

    // When the list is filtered (category or search), show page-scoped counts;
    // otherwise the full-scope summary. Mirrors route.ts's isFiltered logic
    // (deadlineDate is always absent on this path).
    const isFiltered = filter !== 'all' || search.trim()
    const summary = isFiltered
      ? {
          total,
          overdue: pageClients.filter(isOverdue).length,
          dueThisWeek: pageClients.filter(isDueThisWeek).length,
          eligibilitySoon: pageClients.filter(isEligibilityEndingSoon).length,
          noContact: pageClients.filter((client) => {
            const days = getDaysSinceContact(client.last_contact_date)
            return days === null || days >= 15
          }).length,
        }
      : fullSummary

    // HIPAA: bulk PHI access audit (same payload as route.ts).
    await auditBulkAccess(req, {
      userId,
      userEmail: authData.user.email ?? undefined,
      userRole: role,
      action: 'client.bulk_access',
      resourceType: 'clients',
      count: agg.total,
      details: {
        page,
        limit,
        filter,
        search: search ? '[redacted]' : null,
        has_assigned_filter: !!assignedTo,
        source: 'azure',
      },
    }).catch(() => {})

    return new Response(
      JSON.stringify({ clients: pageClients, total, hasMore, summary, fullSummary }),
      { headers: { 'Content-Type': 'application/json' } },
    )
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Internal error'
    console.error('[api/clients:azure] error:', msg)
    return new Response(JSON.stringify({ error: msg }), { status: 500 })
  }
}
