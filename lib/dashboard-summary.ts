import { createClient } from '@/lib/supabase/server'
import { isAzureConfigured, withRlsContext } from '@/lib/db/azure'

/**
 * Dashboard summary counts (supervisor control panel + team manager views).
 *
 * PHI go-live migration (2026-07-04): these aggregates now run on the Azure
 * data plane whenever it is configured, via `withRlsContext` — the same RLS
 * scoping as the rest of the clients data path (SET ROLE authenticated +
 * app.user_id), so counts reflect exactly the clients the caller can see.
 * The Supabase views (client_status_summary_by_assignee / _global) remain
 * ONLY as the fallback for environments without Azure configured — in
 * production they would under-report as real PHI lives in Azure.
 *
 * Predicate provenance — the Azure SQL mirrors lib/types (the canonical
 * definitions used by the clients list and AttentionCard):
 *   - overdue / due-this-week check the FULL 13 tracked deadline columns.
 *     (The live Supabase view from migration 030 had drifted to 8 columns
 *     for due_this_week; that drift is deliberately NOT ported.)
 *   - is_active = true is restored (030 accidentally dropped 007's WHERE).
 *   - eligibility_ending_soon: eligibility_end_date within [today, today+30]
 *     (migration 030 semantics).
 *   - no_contact_7_days: never contacted OR last contact 15+ days (SPM compliance window)
 *     ago (migration 030 semantics).
 *   - 2026-07-04 audit: aggregates count client_classification = 'real' only
 *     (matching the cron, agenda, bot tools, and briefing), and "today" is
 *     the America/New_York business date — the bare Postgres today-value is
 *     UTC on Azure and flipped counts a day early every evening ET.
 */

export interface AssigneeSummaryRow {
  assigned_to: string | null
  total_clients: number
  overdue_clients: number
  due_this_week_clients: number
  eligibility_ending_soon_clients: number
  no_contact_7_days_clients: number
}

interface GlobalSummaryRow {
  total_clients: number
  overdue_clients: number
  due_this_week_clients: number
  eligibility_ending_soon_clients: number
  no_contact_7_days_clients: number
}

const EMPTY_GLOBAL: GlobalSummaryRow = {
  total_clients: 0,
  overdue_clients: 0,
  due_this_week_clients: 0,
  eligibility_ending_soon_clients: 0,
  no_contact_7_days_clients: 0,
}

async function getSessionUserId(): Promise<string | null> {
  const supabase = await createClient()
  const { data } = await supabase.auth.getUser()
  return data?.user?.id ?? null
}

export async function getAssigneeSummaryMap(assignedTo?: string[]) {
  if (assignedTo && assignedTo.length === 0) {
    return new Map<string, AssigneeSummaryRow>()
  }

  if (isAzureConfigured()) {
    const userId = await getSessionUserId()
    if (!userId) return new Map<string, AssigneeSummaryRow>()

    const rows = await withRlsContext(userId, async (sql) => {
      const whereSql = assignedTo
        ? sql`c.is_active = true AND c.client_classification = 'real' AND c.assigned_to = ANY(${assignedTo}::uuid[])`
        : sql`c.is_active = true AND c.client_classification = 'real' AND c.assigned_to IS NOT NULL`
      return await sql<AssigneeSummaryRow[]>`
        WITH t AS (SELECT (now() at time zone 'America/New_York')::date AS today)
        SELECT
          c.assigned_to,
          COUNT(*)::int AS total_clients,
          (COUNT(*) FILTER (WHERE
            c.eligibility_end_date < t.today OR c.three_month_visit_due < t.today OR
            c.quarterly_waiver_date < t.today OR c.med_tech_redet_date < t.today OR
            c.pos_deadline < t.today OR c.assessment_due < t.today OR
            c.thirty_day_letter_date < t.today OR c.co_financial_redet_date < t.today OR
            c.co_app_date < t.today OR c.mfp_consent_date < t.today OR
            c.two57_date < t.today OR c.doc_mdh_date < t.today OR
            c.spm_next_due < t.today
          ))::int AS overdue_clients,
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
          ))::int AS due_this_week_clients,
          (COUNT(*) FILTER (WHERE
            c.eligibility_end_date BETWEEN t.today AND t.today + 30
          ))::int AS eligibility_ending_soon_clients,
          (COUNT(*) FILTER (WHERE
            c.last_contact_date IS NULL OR c.last_contact_date <= t.today - 15
          ))::int AS no_contact_7_days_clients
        FROM clients c CROSS JOIN t
        WHERE ${whereSql}
        GROUP BY c.assigned_to
      `
    })

    return new Map(
      rows
        .filter((row) => row.assigned_to)
        .map((row) => [row.assigned_to as string, row])
    )
  }

  // Fallback: Supabase views (non-Azure environments only).
  const supabase = await createClient()

  let query = supabase
    .from('client_status_summary_by_assignee')
    .select('*')

  if (assignedTo) {
    query = query.in('assigned_to', assignedTo)
  }

  const { data, error } = await query
  if (error) throw error

  return new Map(
    ((data ?? []) as AssigneeSummaryRow[])
      .filter(row => row.assigned_to)
      .map(row => [row.assigned_to as string, row])
  )
}

export async function getGlobalSummary(): Promise<GlobalSummaryRow> {
  if (isAzureConfigured()) {
    const userId = await getSessionUserId()
    if (!userId) return EMPTY_GLOBAL

    const rows = await withRlsContext(userId, async (sql) => {
      return await sql<GlobalSummaryRow[]>`
        WITH t AS (SELECT (now() at time zone 'America/New_York')::date AS today)
        SELECT
          COUNT(*)::int AS total_clients,
          (COUNT(*) FILTER (WHERE
            c.eligibility_end_date < t.today OR c.three_month_visit_due < t.today OR
            c.quarterly_waiver_date < t.today OR c.med_tech_redet_date < t.today OR
            c.pos_deadline < t.today OR c.assessment_due < t.today OR
            c.thirty_day_letter_date < t.today OR c.co_financial_redet_date < t.today OR
            c.co_app_date < t.today OR c.mfp_consent_date < t.today OR
            c.two57_date < t.today OR c.doc_mdh_date < t.today OR
            c.spm_next_due < t.today
          ))::int AS overdue_clients,
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
          ))::int AS due_this_week_clients,
          (COUNT(*) FILTER (WHERE
            c.eligibility_end_date BETWEEN t.today AND t.today + 30
          ))::int AS eligibility_ending_soon_clients,
          (COUNT(*) FILTER (WHERE
            c.last_contact_date IS NULL OR c.last_contact_date <= t.today - 15
          ))::int AS no_contact_7_days_clients
        FROM clients c CROSS JOIN t
        WHERE c.is_active = true AND c.client_classification = 'real'
      `
    })

    return rows[0] ?? EMPTY_GLOBAL
  }

  // Fallback: Supabase view (non-Azure environments only).
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('client_status_summary_global')
    .select('*')
    .single()

  if (error) throw error

  return (data as GlobalSummaryRow) ?? EMPTY_GLOBAL
}
