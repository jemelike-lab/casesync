import { isSupervisorLike } from '@/lib/roles'
import { NextRequest } from 'next/server'
import { createClient as createSupabaseJsClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { isDueThisWeek, isEligibilityEndingSoon, isOverdue, getDaysSinceContact } from '@/lib/types'

export const dynamic = 'force-dynamic'

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
    const sortField = searchParams.get('sortField') ?? 'name'
    const sortDir = (searchParams.get('sortDir') ?? 'asc').toLowerCase() === 'desc' ? 'desc' : 'asc'
    const deadlineDate = searchParams.get('deadlineDate') ?? ''

    const supabase = await createServerClient()
    const { data: authData, error: authErr } = await supabase.auth.getUser()

    if (authErr || !authData?.user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })
    }

    const userId = authData.user.id

    // Read the caller's role from profiles
    const { data: profile, error: profileErr } = await supabase
      .from('profiles')
      .select('id, role')
      .eq('id', userId)
      .single()

    if (profileErr || !profile) {
      return new Response(JSON.stringify({ error: 'Profile not found' }), { status: 403 })
    }

    const role = String(profile.role ?? '')
    const from = page * limit
    const to = from + limit - 1

    // Use service role ONLY after we have authenticated the caller.
    // This endpoint returns data scoped by role, so RLS is not required here.
    // (Alternatively we can rewrite to rely on RLS for all reads.)
    const admin = createSupabaseJsClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    let query = admin
      .from('clients')
      .select('*, profiles!clients_assigned_to_fkey(id, full_name, role)', { count: 'exact' })

    // Role-based scoping (server-validated)
    if (role === 'supports_planner') {
      query = query.eq('assigned_to', userId)
    } else if (role === 'team_manager' || isSupervisorLike(role)) {
      if (assignedTo) {
        query = query.eq('assigned_to', assignedTo)
      }
    }

    // Filter
    const nowDate = new Date()
    const now = nowDate.toISOString().split('T')[0]
    const todayStart = new Date(nowDate)
    todayStart.setHours(0, 0, 0, 0)
    const tomorrow = new Date(todayStart)
    tomorrow.setDate(tomorrow.getDate() + 1)
    const weekLater = new Date(todayStart)
    weekLater.setDate(weekLater.getDate() + 7)
    const twoWeeksLater = new Date(todayStart)
    twoWeeksLater.setDate(twoWeeksLater.getDate() + 14)

    if (deadlineDate) {
      query = query.or(
        [
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
        ].join(',')
      )
    } else if (filter === 'overdue') {
      query = query.or(
        [
          `eligibility_end_date.lt.${now}`,
          `three_month_visit_due.lt.${now}`,
          `quarterly_waiver_date.lt.${now}`,
          `med_tech_redet_date.lt.${now}`,
          `pos_deadline.lt.${now}`,
          `assessment_due.lt.${now}`,
          `thirty_day_letter_date.lt.${now}`,
          `spm_next_due.lt.${now}`,
          `co_financial_redet_date.lt.${now}`,
          `co_app_date.lt.${now}`,
          `mfp_consent_date.lt.${now}`,
          `two57_date.lt.${now}`,
          `doc_mdh_date.lt.${now}`,
        ].join(',')
      )
    } else if (filter === 'due_today') {
      query = query.or(
        [
          `eligibility_end_date.eq.${now}`,
          `three_month_visit_due.eq.${now}`,
          `quarterly_waiver_date.eq.${now}`,
          `med_tech_redet_date.eq.${now}`,
          `pos_deadline.eq.${now}`,
          `assessment_due.eq.${now}`,
          `thirty_day_letter_date.eq.${now}`,
          `spm_next_due.eq.${now}`,
          `co_financial_redet_date.eq.${now}`,
          `co_app_date.eq.${now}`,
          `mfp_consent_date.eq.${now}`,
          `two57_date.eq.${now}`,
          `doc_mdh_date.eq.${now}`,
        ].join(',')
      )
    } else if (filter === 'due_this_week') {
      query = query.or(
        [
          `and(eligibility_end_date.gte.${tomorrow.toISOString().split('T')[0]},eligibility_end_date.lte.${weekLater.toISOString().split('T')[0]})`,
          `and(three_month_visit_due.gte.${tomorrow.toISOString().split('T')[0]},three_month_visit_due.lte.${weekLater.toISOString().split('T')[0]})`,
          `and(quarterly_waiver_date.gte.${tomorrow.toISOString().split('T')[0]},quarterly_waiver_date.lte.${weekLater.toISOString().split('T')[0]})`,
          `and(med_tech_redet_date.gte.${tomorrow.toISOString().split('T')[0]},med_tech_redet_date.lte.${weekLater.toISOString().split('T')[0]})`,
          `and(pos_deadline.gte.${tomorrow.toISOString().split('T')[0]},pos_deadline.lte.${weekLater.toISOString().split('T')[0]})`,
          `and(assessment_due.gte.${tomorrow.toISOString().split('T')[0]},assessment_due.lte.${weekLater.toISOString().split('T')[0]})`,
          `and(thirty_day_letter_date.gte.${tomorrow.toISOString().split('T')[0]},thirty_day_letter_date.lte.${weekLater.toISOString().split('T')[0]})`,
          `and(spm_next_due.gte.${tomorrow.toISOString().split('T')[0]},spm_next_due.lte.${weekLater.toISOString().split('T')[0]})`,
          `and(co_financial_redet_date.gte.${tomorrow.toISOString().split('T')[0]},co_financial_redet_date.lte.${weekLater.toISOString().split('T')[0]})`,
          `and(co_app_date.gte.${tomorrow.toISOString().split('T')[0]},co_app_date.lte.${weekLater.toISOString().split('T')[0]})`,
          `and(mfp_consent_date.gte.${tomorrow.toISOString().split('T')[0]},mfp_consent_date.lte.${weekLater.toISOString().split('T')[0]})`,
          `and(two57_date.gte.${tomorrow.toISOString().split('T')[0]},two57_date.lte.${weekLater.toISOString().split('T')[0]})`,
          `and(doc_mdh_date.gte.${tomorrow.toISOString().split('T')[0]},doc_mdh_date.lte.${weekLater.toISOString().split('T')[0]})`,
        ].join(',')
      )
    } else if (filter === 'due_next_14_days') {
      query = query.or(
        [
          `and(eligibility_end_date.gte.${tomorrow.toISOString().split('T')[0]},eligibility_end_date.lte.${twoWeeksLater.toISOString().split('T')[0]})`,
          `and(three_month_visit_due.gte.${tomorrow.toISOString().split('T')[0]},three_month_visit_due.lte.${twoWeeksLater.toISOString().split('T')[0]})`,
          `and(quarterly_waiver_date.gte.${tomorrow.toISOString().split('T')[0]},quarterly_waiver_date.lte.${twoWeeksLater.toISOString().split('T')[0]})`,
          `and(med_tech_redet_date.gte.${tomorrow.toISOString().split('T')[0]},med_tech_redet_date.lte.${twoWeeksLater.toISOString().split('T')[0]})`,
          `and(pos_deadline.gte.${tomorrow.toISOString().split('T')[0]},pos_deadline.lte.${twoWeeksLater.toISOString().split('T')[0]})`,
          `and(assessment_due.gte.${tomorrow.toISOString().split('T')[0]},assessment_due.lte.${twoWeeksLater.toISOString().split('T')[0]})`,
          `and(thirty_day_letter_date.gte.${tomorrow.toISOString().split('T')[0]},thirty_day_letter_date.lte.${twoWeeksLater.toISOString().split('T')[0]})`,
          `and(spm_next_due.gte.${tomorrow.toISOString().split('T')[0]},spm_next_due.lte.${twoWeeksLater.toISOString().split('T')[0]})`,
          `and(co_financial_redet_date.gte.${tomorrow.toISOString().split('T')[0]},co_financial_redet_date.lte.${twoWeeksLater.toISOString().split('T')[0]})`,
          `and(co_app_date.gte.${tomorrow.toISOString().split('T')[0]},co_app_date.lte.${twoWeeksLater.toISOString().split('T')[0]})`,
          `and(mfp_consent_date.gte.${tomorrow.toISOString().split('T')[0]},mfp_consent_date.lte.${twoWeeksLater.toISOString().split('T')[0]})`,
          `and(two57_date.gte.${tomorrow.toISOString().split('T')[0]},two57_date.lte.${twoWeeksLater.toISOString().split('T')[0]})`,
          `and(doc_mdh_date.gte.${tomorrow.toISOString().split('T')[0]},doc_mdh_date.lte.${twoWeeksLater.toISOString().split('T')[0]})`,
        ].join(',')
      )
    } else if (filter === 'co') {
      query = query.eq('category', 'co')
    } else if (filter === 'cfc') {
      query = query.eq('category', 'cfc')
    } else if (filter === 'cpas') {
      query = query.eq('category', 'cpas')
    }

    // Search — sanitize input to prevent PostgREST filter injection
    if (search.trim()) {
      const q = search.trim().toLowerCase().replace(/[,()%_\\]/g, '')
      if (q) {
        query = query.or(
          `last_name.ilike.%${q}%,first_name.ilike.%${q}%,client_id.ilike.%${q}%,eligibility_code.ilike.%${q}%`
        )
      }
    }

    // Sort
    if (sortField === 'goal_pct') {
      query = query.order('goal_pct', { ascending: sortDir === 'asc' }).order('last_name')
    } else if (sortField === 'last_contact_date') {
      query = query.order('last_contact_date', { ascending: sortDir === 'asc', nullsFirst: false }).order('last_name')
    } else if (sortField === 'eligibility_end_date') {
      query = query.order('eligibility_end_date', { ascending: sortDir === 'asc', nullsFirst: false }).order('last_name')
    } else {
      query = query.order('last_name', { ascending: sortDir === 'asc' })
    }

    // Paginate
    query = query.range(from, to)

    const { data: clients, error, count } = await query

    if (error) {
      console.error('Error fetching paginated clients:', error)
      return new Response(JSON.stringify({ error: error.message }), { status: 500 })
    }

    const pageClients = clients ?? []
    const total = count ?? 0
    const hasMore = from + limit < total
    const summary = {
      total,
      overdue: pageClients.filter(isOverdue).length,
      dueThisWeek: pageClients.filter(isDueThisWeek).length,
      eligibilitySoon: pageClients.filter(isEligibilityEndingSoon).length,
      noContact: pageClients.filter(client => {
        const days = getDaysSinceContact(client.last_contact_date)
        return days !== null && days >= 7
      }).length,
    }

    return new Response(JSON.stringify({ clients: pageClients, total, hasMore, summary }), {
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Internal error'
    return new Response(JSON.stringify({ error: msg }), { status: 500 })
  }
}
