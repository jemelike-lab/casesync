import { isSupervisorLike, canManageTeam, getRoleLabel, getRoleColor } from '@/lib/roles'
import { createClient as createSupabaseJsClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'

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

    const admin = createSupabaseJsClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    let query = admin
      .from('clients')
      .select('client_id, last_name, first_name, category, eligibility_code, eligibility_end_date, assigned_to, last_contact_date, last_contact_type, goal_pct, pos_status, assessment_due, spm_next_due, profiles!clients_assigned_to_fkey(full_name), three_month_visit_due, quarterly_waiver_date, med_tech_redet_date, pos_deadline, thirty_day_letter_date, co_financial_redet_date, co_app_date, mfp_consent_date, two57_date, doc_mdh_date')
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

    if (search.trim()) {
      const q = search.trim().toLowerCase().replace(/[,()%_\\]/g, '')
      if (q) {
        query = query.or(
          `last_name.ilike.%${q}%,first_name.ilike.%${q}%,client_id.ilike.%${q}%,eligibility_code.ilike.%${q}%`
        )
      }
    }

    query = query.order('last_name')

    const { data, error } = await query

    if (error) {
      return new Response(error.message, { status: 500 })
    }

    const headers = [
      'Client ID', 'Last Name', 'First Name', 'Category', 'Eligibility Code', 'Eligibility End Date',
      'Last Contact Date', 'Last Contact Type', 'Goal %', 'POS Status', 'Assigned To',
      'Assessment Due', 'SPM Next Due'
    ]

    const rows = (data ?? []).map((client: any) => {
      const plannerProfile = Array.isArray(client.profiles) ? client.profiles[0] : client.profiles
      return [
        client.client_id,
        client.last_name,
        client.first_name ?? '',
        client.category,
        client.eligibility_code ?? '',
        client.eligibility_end_date ?? '',
        client.last_contact_date ?? '',
        client.last_contact_type ?? '',
        client.goal_pct ?? '',
        client.pos_status ?? '',
        plannerProfile?.full_name ?? '',
        client.assessment_due ?? '',
        client.spm_next_due ?? '',
      ]
    })

    const csv = [headers, ...rows]
      .map((row) => row.map(csvEscape).join(','))
      .join('\n')

    return new Response(csv, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="casesync-export-${new Date().toISOString().split('T')[0]}.csv"`,
      },
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Internal error'
    return new Response(msg, { status: 500 })
  }
}
