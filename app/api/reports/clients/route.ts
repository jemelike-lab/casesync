import { isSupervisorLike } from '@/lib/roles'
import { createClient as createSupabaseJsClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
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
      includePhi && ['supervisor', 'it'].includes(role)

    const admin = createSupabaseJsClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    const selectString = canSeePhi ? PHI_EXPORT_SELECT : SAFE_EXPORT_SELECT

    let query = admin
      .from('clients')
      .select(selectString)
      .eq('is_active', true)

    if (role === 'supports_planner') {
      query = query.eq('assigned_to', userId)
    } else if ((role === 'team_manager' || isSupervisorLike(role)) && assignedTo) {
      query = query.eq('assigned_to', assignedTo)
    }

    const now = new Date().toISOString().split('T')[0]
    const weekLater = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]

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

    const { data, error } = await query

    if (error) {
      return new Response(error.message, { status: 500 })
    }

    const headers = canSeePhi ? PHI_EXPORT_HEADERS : SAFE_EXPORT_HEADERS
    const rowMapper = canSeePhi ? phiRowToCSV : safeRowToCSV

    const rows = (data ?? []).map((client: any) => rowMapper(client))

    const csv = [headers, ...rows]
      .map((row) => row.map(csvEscape).join(','))
      .join('\n')

    // Audit trail (was missing before)
    await admin.from('audit_exports').insert({
      user_id: userId,
      export_type: canSeePhi ? 'clients_csv_phi' : 'clients_csv',
      filter_params: { filter, assignedTo, search, deadlineDate, includePhi: canSeePhi },
      row_count: (data ?? []).length,
    })

    const label = canSeePhi ? 'phi' : 'safe'
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
