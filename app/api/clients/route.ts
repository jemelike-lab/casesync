import { isSupervisorLike, canManageTeam, getRoleLabel, getRoleColor } from '@/lib/roles'
import { NextRequest } from 'next/server'
import { createClient as createSupabaseJsClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

// NOTE:
// Avoid using service role directly with user-supplied ids/roles.
// We derive the requester identity from the Supabase session cookie.
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const page = parseInt(searchParams.get('page') ?? '0', 10)
    const limit = parseInt(searchParams.get('limit') ?? '20', 10)
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
    const now = new Date().toISOString().split('T')[0]
    const weekLater = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]

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
        `eligibility_end_date.lt.${now},pos_deadline.lt.${now},assessment_due.lt.${now},` +
          `three_month_visit_due.lt.${now},thirty_day_letter_date.lt.${now}`
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

    // Search
    if (search.trim()) {
      const q = search.trim().toLowerCase()
      query = query.or(
        `last_name.ilike.%${q}%,first_name.ilike.%${q}%,client_id.ilike.%${q}%,eligibility_code.ilike.%${q}%`
      )
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

    const total = count ?? 0
    const hasMore = from + limit < total

    return new Response(JSON.stringify({ clients: clients ?? [], total, hasMore }), {
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Internal error'
    return new Response(JSON.stringify({ error: msg }), { status: 500 })
  }
}
