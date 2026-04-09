import { isSupervisorLike } from '@/lib/roles'
import { createClient as createSupabaseJsClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'

const QUEUE_RESULTS = [
  { id: 'queue:overdue', label: 'Overdue Queue', description: 'All overdue active clients', href: '/team?full=1&filter=overdue', roles: ['team_manager', 'supervisor', 'it'] },
  { id: 'queue:due_today', label: 'Due Today Queue', description: 'Clients due today', href: '/team?full=1&filter=due_today', roles: ['team_manager', 'supervisor', 'it'] },
  { id: 'queue:due_this_week', label: 'Due This Week Queue', description: 'Upcoming work due this week', href: '/team?full=1&filter=due_this_week', roles: ['team_manager', 'supervisor', 'it'] },
  { id: 'queue:next_14_days', label: 'Next 14 Days Queue', description: 'Upcoming work in the next 14 days', href: '/team?full=1&filter=due_next_14_days', roles: ['team_manager', 'supervisor', 'it'] },
  { id: 'queue:no_contact_7', label: 'No Contact 7+ Days', description: 'Clients without recent contact', href: '/team?full=1&filter=no_contact_7', roles: ['team_manager', 'supervisor', 'it'] },
  { id: 'queue:my_overdue', label: 'My Overdue', description: 'Your overdue assigned clients', href: '/dashboard?filter=overdue', roles: ['supports_planner'] },
  { id: 'queue:my_due_this_week', label: 'My Due This Week', description: 'Your work due this week', href: '/dashboard?filter=due_this_week', roles: ['supports_planner'] },
  { id: 'queue:my_all', label: 'My Active Clients', description: 'All active clients on your caseload', href: '/dashboard?filter=all', roles: ['supports_planner'] },
]

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url)
    const q = (searchParams.get('q') ?? '').trim()
    const assignedTo = searchParams.get('assignedTo') ?? ''
    const limit = Math.min(Math.max(parseInt(searchParams.get('limit') ?? '8', 10), 1), 20)

    if (!q) {
      return new Response(JSON.stringify({ clients: [], staff: [], queues: [] }), {
        headers: { 'Content-Type': 'application/json' },
      })
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

    const role = String(profile.role ?? '')

    const admin = createSupabaseJsClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    let clientQuery = admin
      .from('clients')
      .select('id, client_id, last_name, first_name, assigned_to, profiles!clients_assigned_to_fkey(id, full_name, role, team_manager_id)')
      .eq('is_active', true)
      .or(`last_name.ilike.%${q}%,first_name.ilike.%${q}%,client_id.ilike.%${q}%`)
      .order('last_name')
      .limit(limit)

    if (role === 'supports_planner') {
      clientQuery = clientQuery.eq('assigned_to', userId)
    } else if ((role === 'team_manager' || isSupervisorLike(role)) && assignedTo) {
      clientQuery = clientQuery.eq('assigned_to', assignedTo)
    }

    const [{ data: clients, error: clientError }, { data: rawStaff, error: staffError }] = await Promise.all([
      clientQuery,
      admin
        .from('profiles')
        .select('id, full_name, role, team_manager_id')
        .or(`full_name.ilike.%${q}%`)
        .in('role', role === 'supports_planner' ? ['team_manager', 'supervisor', 'it'] : ['supports_planner', 'team_manager', 'supervisor', 'it'])
        .order('full_name')
        .limit(limit),
    ])

    if (clientError) {
      return new Response(JSON.stringify({ error: clientError.message }), { status: 500 })
    }

    if (staffError) {
      return new Response(JSON.stringify({ error: staffError.message }), { status: 500 })
    }

    const staff = (rawStaff ?? []).filter((person) => {
      if (role === 'supports_planner') return person.id !== userId
      if (role === 'team_manager') return person.role !== 'supervisor' ? person.team_manager_id === userId || person.id === userId : true
      return true
    })

    const queues = QUEUE_RESULTS
      .filter((queue) => queue.roles.includes(role))
      .filter((queue) => `${queue.label} ${queue.description}`.toLowerCase().includes(q.toLowerCase()))
      .slice(0, 6)

    return new Response(JSON.stringify({ clients: clients ?? [], staff, queues }), {
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Internal error'
    return new Response(JSON.stringify({ error: msg }), { status: 500 })
  }
}
