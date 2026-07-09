import { isSupervisorLike } from '@/lib/roles'
import { createClient as createSupabaseJsClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { isAzureConfigured, withRlsContext } from '@/lib/db/azure'
import { auditLog } from '@/lib/audit'
import { businessTodayStr, businessDateOffsetStr } from '@/lib/business-date'
import {
  SAFE_EXPORT_SELECT,
  SAFE_EXPORT_HEADERS,
  safeRowToCSV,
  PHI_EXPORT_SELECT,
  PHI_EXPORT_HEADERS,
  phiRowToCSV,
} from '@/lib/export-columns'

export const dynamic = 'force-dynamic'

function csvEscape(value: unknown) {
  return `"${String(value ?? '').replace(/"/g, '""')}"`
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url)
    const filter = searchParams.get('filter') ?? 'all'
    const search = searchParams.get('search') ?? ''
    const assignedTo = searchParams.get('assignedTo') ?? ''
    const deadlineDate = searchParams.get('deadlineDate') ?? ''
    const includePhi = searchParams.get('includePhi') === 'true'

    const supabase = await createServerClient()
    const { data: authData, error: authErr } = await supabase.auth.getUser()

    if (authErr || !authData?.user) {
      return new Response('Unauthorized', { status: 401 })
    }

    const userId = authData.user.id

    const { data: profile, error: profileErr } = await supabase
      .from('profiles')
      .select('id, role')
      .eq('id', userId)
      .single()

    if (profileErr || !profile) {
      return new Response('Profile not found', { status: 403 })
    }

    const role = String(profile.role ?? '')

    // PHI exports are supervisor/IT only
    const canSeePhi =
      includePhi && ['supervisor', 'administrator'].includes(role)

    let data: any[] = []
    if (isAzureConfigured()) {
      data = await withRlsContext(userId, async (sql) => {
        const now = businessTodayStr()
        const weekLater = businessDateOffsetStr(7)
        const cols = canSeePhi
          ? sql`c.id, c.client_id, c.first_name, c.last_name, c.category, c.eligibility_code, c.eligibility_end_date, c.assigned_to, c.last_contact_date, c.last_contact_type, c.goal_pct, c.pos_status, c.assessment_due, c.spm_next_due, c.three_month_visit_due, c.quarterly_waiver_date, c.med_tech_redet_date, c.pos_deadline, c.thirty_day_letter_date, c.co_financial_redet_date, c.co_app_date, c.mfp_consent_date, c.two57_date, c.doc_mdh_date, c.loc_date, c.drop_in_visit_date, c.is_active, c.client_classification`
          : sql`c.id, c.category, c.eligibility_end_date, c.assigned_to, c.last_contact_date, c.last_contact_type, c.goal_pct, c.pos_status, c.assessment_due, c.spm_next_due, c.three_month_visit_due, c.quarterly_waiver_date, c.med_tech_redet_date, c.pos_deadline, c.thirty_day_letter_date, c.co_financial_redet_date, c.co_app_date, c.mfp_consent_date, c.two57_date, c.doc_mdh_date, c.loc_date, c.drop_in_visit_date, c.is_active, c.client_classification`
        let scope = sql``
        if (role === 'supports_planner') {
          scope = sql`AND c.assigned_to = ${userId}`
        } else if ((role === 'team_manager' || isSupervisorLike(role)) && assignedTo) {
          scope = sql`AND c.assigned_to = ${assignedTo}`
        }
        let filt = sql``
        if (deadlineDate) {
          filt = sql`AND (c.eligibility_end_date = ${deadlineDate} OR c.three_month_visit_due = ${deadlineDate} OR c.quarterly_waiver_date = ${deadlineDate} OR c.med_tech_redet_date = ${deadlineDate} OR c.pos_deadline = ${deadlineDate} OR c.assessment_due = ${deadlineDate} OR c.thirty_day_letter_date = ${deadlineDate} OR c.co_financial_redet_date = ${deadlineDate} OR c.co_app_date = ${deadlineDate} OR c.mfp_consent_date = ${deadlineDate} OR c.two57_date = ${deadlineDate} OR c.doc_mdh_date = ${deadlineDate} OR c.spm_next_due = ${deadlineDate})`
        } else if (filter === 'overdue') {
          filt = sql`AND (c.eligibility_end_date < ${now} OR c.pos_deadline < ${now} OR c.assessment_due < ${now} OR c.three_month_visit_due < ${now} OR c.thirty_day_letter_date < ${now})`
        } else if (filter === 'due_this_week') {
          filt = sql`AND (c.eligibility_end_date >= ${now} OR c.pos_deadline >= ${now} OR c.assessment_due >= ${now}) AND (c.eligibility_end_date <= ${weekLater} OR c.pos_deadline <= ${weekLater} OR c.assessment_due <= ${weekLater})`
        } else if (filter === 'co') {
          filt = sql`AND c.category = 'co'`
        } else if (filter === 'cfc') {
          filt = sql`AND c.category = 'cfc'`
        } else if (filter === 'cpas') {
          filt = sql`AND c.category = 'cpas'`
        }
        let searchFrag = sql``
        if (search.trim() && canSeePhi) {
          const qq = search.trim().toLowerCase().replace(/[,()%_\\]/g, '')
          if (qq) {
            const pat = `%${qq}%`
            searchFrag = sql`AND (c.last_name ILIKE ${pat} OR c.first_name ILIKE ${pat} OR c.client_id ILIKE ${pat} OR c.eligibility_code ILIKE ${pat})`
          }
        } else if (search.trim()) {
          const qq = search.trim().toLowerCase().replace(/[,()%_\\]/g, '')
          if (qq) {
            const pat = `%${qq}%`
            searchFrag = sql`AND c.category ILIKE ${pat}`
          }
        }
        const rows = await sql`
          SELECT ${cols}, p.full_name AS p_full_name
          FROM clients c
          LEFT JOIN profiles p ON p.id = c.assigned_to
          WHERE c.is_active = true AND c.client_classification = 'real' ${scope} ${filt} ${searchFrag}
          ORDER BY c.category
        `
        return (rows as unknown as Array<Record<string, any>>).map((r) => ({ ...r, profiles: { full_name: r.p_full_name } }))
      })
    } else {
      const admin = createSupabaseJsClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
      )

      const selectString = canSeePhi ? PHI_EXPORT_SELECT : SAFE_EXPORT_SELECT

      let query = admin
        .from('clients')
        .select(selectString)
        .eq('is_active', true)
        .eq('client_classification', 'real')

      if (role === 'supports_planner') {
        query = query.eq('assigned_to', userId)
      } else if ((role === 'team_manager' || isSupervisorLike(role)) && assignedTo) {
        query = query.eq('assigned_to', assignedTo)
      }

      const now = businessTodayStr()
      const weekLater = businessDateOffsetStr(7)

      if (deadlineDate) {
        query = query.or([
          `eligibility_end_date.eq.${deadlineDate}`,
          `three_month_visit_due.eq.${deadlineDate}`,
          `quarterly_waiver_date.eq.${deadlineDate}`,
          `med_tech_redet_date.eq.${deadlineDate}`,
          `pos_deadline.eq.${deadlineDate}`,
          `assessment_due.eq.${deadlineDate}`,
          `thirty_day_letter_date.eq.${deadlineDate}`,
          `co_financial_redet_date.eq.${deadlineDate}`,
          `co_app_date.eq.${deadlineDate}`,
          `mfp_consent_date.eq.${deadlineDate}`,
          `two57_date.eq.${deadlineDate}`,
          `doc_mdh_date.eq.${deadlineDate}`,
          `spm_next_due.eq.${deadlineDate}`,
        ].join(','))
      } else if (filter === 'overdue') {
        query = query.or(
          `eligibility_end_date.lt.${now},pos_deadline.lt.${now},assessment_due.lt.${now},three_month_visit_due.lt.${now},thirty_day_letter_date.lt.${now}`
        )
      } else if (filter === 'due_this_week') {
        query = query
          .or(`eligibility_end_date.gte.${now},pos_deadline.gte.${now},assessment_due.gte.${now}`)
          .or(`eligibility_end_date.lte.${weekLater},pos_deadline.lte.${weekLater},assessment_due.lte.${weekLater}`)
      } else if (filter === 'co') {
        query = query.eq('category', 'co')
      } else if (filter === 'cfc') {
        query = query.eq('category', 'cfc')
      } else if (filter === 'cpas') {
        query = query.eq('category', 'cpas')
      }

      if (search.trim() && canSeePhi) {
        const q = search.trim().toLowerCase().replace(/[,()%_\\]/g, '')
        if (q) {
          query = query.or(
            `last_name.ilike.%${q}%,first_name.ilike.%${q}%,client_id.ilike.%${q}%,eligibility_code.ilike.%${q}%`
          )
        }
      } else if (search.trim()) {
        const q = search.trim().toLowerCase().replace(/[,()%_\\]/g, '')
        if (q) {
          query = query.ilike('category', `%${q}%`)
        }
      }

      query = query.order('category')

      const res = await query
      if (res.error) {
        return new Response(res.error.message, { status: 500 })
      }
      data = (res.data ?? []) as any[]
    }

    const headers = canSeePhi ? PHI_EXPORT_HEADERS : SAFE_EXPORT_HEADERS
    const rowMapper = canSeePhi ? phiRowToCSV : safeRowToCSV

    const rows = (data ?? []).map((client: any) => rowMapper(client))

    const csv = [headers, ...rows]
      .map((row) => row.map(csvEscape).join(','))
      .join('\n')

    // Audit trail (was missing before)
    const auditType = canSeePhi ? 'clients_csv_phi' : 'clients_csv'
    const auditParams = { filter, assignedTo, search, deadlineDate, includePhi: canSeePhi }
    if (isAzureConfigured()) {
      await withRlsContext(userId, (sql) => sql`INSERT INTO audit_exports (user_id, export_type, filter_params, row_count) VALUES (${userId}, ${auditType}, ${sql.json(auditParams)}, ${(data ?? []).length})`).catch(() => {})
    } else {
      const auditClient = createSupabaseJsClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
      )
      await auditClient.from('audit_exports').insert({
        user_id: userId,
        export_type: auditType,
        filter_params: auditParams,
        row_count: (data ?? []).length,
      })
    }

    const label = canSeePhi ? 'phi' : 'safe'

    // Audit: log report generation
    await auditLog(req, { userId, userEmail: authData?.user?.email ?? undefined, userRole: profile?.role, action: 'report.generate', resourceType: 'reports' }).catch(() => {})
    return new Response(csv, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="casesync-export-${label}-${new Date().toISOString().split('T')[0]}.csv"`,
      },
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Internal error'
    return new Response(msg, { status: 500 })
  }
}
