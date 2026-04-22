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
    const SORT_FIELDS = new Set(['goal_pct', 'last_contact_date', 'eligibility_end_date'])
  const _sortFieldRaw = searchParams.get('sortField') ?? ''
  const sortField = SORT_FIELDS.has(_sortFieldRaw) ? _sortFieldRaw : 'name'
    const sortDir = (searchParams.get('sortDir') ?? 'asc').toLowerCase() === 'desc' ? 'desc' : 'asc'
    const deadlineDate = searchParams.get('deadlineDate') ?? ''

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

    const role = String(profile.role ?? '')
    const from = page * limit
    const to = from + limit - 1

    const admin = createSupabaseJsClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    let query = admin
      .from('clients')
      .select('id, client_id, first_name, last_name, category, assigned_to, is_active, last_contact_date, goal_pct, eligibility_code, eligibility_end_date, three_month_visit_due, quarterly_waiver_date, med_tech_redet_date, pos_deadline, assessment_due, thirty_day_letter_date, co_financial_redet_date, co_app_date, mfp_consent_date, two57_date, doc_mdh_date, spm_next_due, pos_status, profiles!clients_assigned_to_fkey(id, full_name, role)', { count: 'exact' })

    if (role === 'supports_planner') {
      query = query.eq('assigned_to', userId)
    } else if (role === 'team_manager' || isSupervisorLike(role)) {
      if (assignedTo) {
        query = query.eq('assigned_to', assignedTo)
      }
    }

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

    const deadlineFields = [
      'eligibility_end_date', 'three_month_visit_due', 'quarterly_waiver_date',
      'med_tech_redet_date', 'pos_deadline', 'assessment_due', 'thirty_day_letter_date',
      'co_financial_redet_date', 'co_app_date', 'mfp_consent_date', 'two57_date',
      'doc_mdh_date', 'spm_next_due',
    ]

    if (deadlineDate) {
      query = query.or(deadlineFields.map(f => `${f}.eq.${deadlineDate}`).join(','))
    } else if (filter === 'overdue') {
      query = query.or(deadlineFields.map(f => `${f}.lt.${now}`).join(','))
    } else if (filter === 'due_today') {
      query = query.or(deadlineFields.map(f => `${f}.eq.${now}`).join(','))
    } else if (filter === 'due_this_week') {
      const t = tomorrow.toISOString().split('T')[0]
      const w = weekLater.toISOString().split('T')[0]
      query = query.or(deadlineFields.map(f => `and(${f}.gte.${t},${f}.lte.${w})`).join(','))
    } else if (filter === 'due_next_14_days') {
      const t = tomorrow.toISOString().split('T')[0]
      const tw = twoWeeksLater.toISOString().split('T')[0]
      query = query.or(deadlineFields.map(f => `and(${f}.gte.${t},${f}.lte.${tw})`).join(','))
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
    let fullScopeQuery = admin
      .from('clients')
      .select('id, client_id, first_name, last_name, category, assigned_to, is_active, last_contact_date, goal_pct, eligibility_code, eligibility_end_date, three_month_visit_due, quarterly_waiver_date, med_tech_redet_date, pos_deadline, assessment_due, thirty_day_letter_date, co_financial_redet_date, co_app_date, mfp_consent_date, two57_date, doc_mdh_date, spm_next_due, pos_status, profiles!clients_assigned_to_fkey(id, full_name, role)')

    if (role === 'supports_planner') {
      fullScopeQuery = fullScopeQuery.eq('assigned_to', userId)
    } else if (role === 'team_manager' || isSupervisorLike(role)) {
      if (assignedTo) {
        fullScopeQuery = fullScopeQuery.eq('assigned_to', assignedTo)
      }
    }

    const [filteredResult, fullScopeResult] = await Promise.all([
      query,
      isFiltered ? fullScopeQuery : Promise.resolve(null),
    ])

    const { data: clients, error, count } = filteredResult

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

    const allClients = fullScopeResult?.data ?? pageClients
    const fullSummary = isFiltered ? {
      total: allClients.length,
      overdue: allClients.filter(isOverdue).length,
      dueThisWeek: allClients.filter(isDueThisWeek).length,
      eligibilitySoon: allClients.filter(isEligibilityEndingSoon).length,
      noContact: allClients.filter(client => {
        const days = getDaysSinceContact(client.last_contact_date)
        return days !== null && days >= 7
      }).length,
    } : summary

    return new Response(JSON.stringify({ clients: pageClients, total, hasMore, summary, fullSummary }), {
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Internal error'
    return new Response(JSON.stringify({ error: msg }), { status: 500 })
  }
}