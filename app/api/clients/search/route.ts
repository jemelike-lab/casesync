import { isSupervisorLike } from '@/lib/roles'
import { getStarterViewNamesForRole, listSavedViewsForCurrentUser } from '@/lib/saved-views'
import { createClient as createSupabaseJsClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { isAzureConfigured, withRlsContext } from '@/lib/db/azure'
import { sanitizeSearchParam } from '@/lib/validation'

const QUEUE_RESULTS = [
  { id: 'queue:overdue', label: 'Overdue Queue', description: 'All overdue active clients', href: '/team?full=1&filter=overdue', roles: ['team_manager', 'supervisor', 'it', 'administrator'] },
  { id: 'queue:due_today', label: 'Due Today Queue', description: 'Clients due today', href: '/team?full=1&filter=due_today', roles: ['team_manager', 'supervisor', 'it', 'administrator'] },
  { id: 'queue:due_this_week', label: 'Due This Week Queue', description: 'Upcoming work due this week', href: '/team?full=1&filter=due_this_week', roles: ['team_manager', 'supervisor', 'it', 'administrator'] },
  { id: 'queue:next_14_days', label: 'Next 14 Days Queue', description: 'Upcoming work in the next 14 days', href: '/team?full=1&filter=due_next_14_days', roles: ['team_manager', 'supervisor', 'it', 'administrator'] },
  { id: 'queue:no_contact_7', label: 'No Contact 7+ Days', description: 'Clients without recent contact', href: '/team?full=1&filter=no_contact_7', roles: ['team_manager', 'supervisor', 'it', 'administrator'] },
  { id: 'queue:my_overdue', label: 'My Overdue', description: 'Your overdue assigned clients', href: '/dashboard?filter=overdue', roles: ['supports_planner'] },
  { id: 'queue:my_due_this_week', label: 'My Due This Week', description: 'Your work due this week', href: '/dashboard?filter=due_this_week', roles: ['supports_planner'] },
  { id: 'queue:my_all', label: 'My Active Clients', description: 'All active clients on your caseload', href: '/dashboard?filter=all', roles: ['supports_planner'] },
]

interface SearchResultQueue {
  id: string
  label: string
  description: string
  href: string
  kind: 'queue' | 'saved_view'
}

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

    const role = String(profile.role ?? '').toLowerCase()
    const qSafe = sanitizeSearchParam(q)
    const qLower = q.toLowerCase()

    let clients: any[] = []
    let rawStaff: Array<{ id: string; full_name: string; role: string; team_manager_id: string | null }> = []
    let savedViewsResult: Awaited<ReturnType<typeof listSavedViewsForCurrentUser>>

    if (isAzureConfigured()) {
      const pat = `%${qSafe}%`
      const staffRoles = role === 'supports_planner'
        ? ['team_manager', 'supervisor', 'it', 'administrator']
        : ['supports_planner', 'team_manager', 'supervisor', 'it', 'administrator']
      const [azure, saved] = await Promise.all([
        withRlsContext(userId, async (sql) => {
          let scope = sql``
          if (role === 'supports_planner') {
            scope = sql`AND c.assigned_to = ${userId}`
          } else if ((role === 'team_manager' || isSupervisorLike(role)) && assignedTo) {
            scope = sql`AND c.assigned_to = ${assignedTo}`
          }
          const clientRows = await sql`
            SELECT c.id, c.client_id, c.last_name, c.first_name, c.assigned_to,
                   p.id AS p_id, p.full_name AS p_full_name, p.role AS p_role, p.team_manager_id AS p_team_manager_id
            FROM clients c
            LEFT JOIN profiles p ON p.id = c.assigned_to
            WHERE c.is_active = true
              AND (c.last_name ILIKE ${pat} OR c.first_name ILIKE ${pat} OR c.client_id ILIKE ${pat})
              ${scope}
            ORDER BY c.last_name
            LIMIT ${limit}`
          const staffRows = await sql`
            SELECT id, full_name, role, team_manager_id
            FROM profiles
            WHERE full_name ILIKE ${pat} AND role = ANY(${staffRoles}::text[])
            ORDER BY full_name
            LIMIT ${limit}`
          return { clientRows, staffRows }
        }),
        listSavedViewsForCurrentUser(),
      ])
      clients = azure.clientRows.map((r: any) => ({
        id: r.id,
        client_id: r.client_id,
        last_name: r.last_name,
        first_name: r.first_name,
        assigned_to: r.assigned_to,
        profiles: r.p_id
          ? { id: r.p_id, full_name: r.p_full_name, role: r.p_role, team_manager_id: r.p_team_manager_id }
          : null,
      }))
      rawStaff = azure.staffRows as unknown as typeof rawStaff
      savedViewsResult = saved
    } else {
      const admin = createSupabaseJsClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
      )

      let clientQuery = admin
        .from('clients')
        .select('id, client_id, last_name, first_name, assigned_to, profiles!clients_assigned_to_fkey(id, full_name, role, team_manager_id)')
        .eq('is_active', true)
        .or(`last_name.ilike.%${qSafe}%,first_name.ilike.%${qSafe}%,client_id.ilike.%${qSafe}%`)
        .order('last_name')
        .limit(limit)

      if (role === 'supports_planner') {
        clientQuery = clientQuery.eq('assigned_to', userId)
      } else if ((role === 'team_manager' || isSupervisorLike(role)) && assignedTo) {
        clientQuery = clientQuery.eq('assigned_to', assignedTo)
      }

      const [
        { data: clientsData, error: clientError },
        { data: rawStaffData, error: staffError },
        saved,
      ] = await Promise.all([
        clientQuery,
        admin
          .from('profiles')
          .select('id, full_name, role, team_manager_id')
          .or(`full_name.ilike.%${qSafe}%`)
          .in('role', role === 'supports_planner' ? ['team_manager', 'supervisor', 'administrator'] : ['supports_planner', 'team_manager', 'supervisor', 'it', 'administrator'])
          .order('full_name')
          .limit(limit),
        listSavedViewsForCurrentUser(),
      ])

      if (clientError) {
        return new Response(JSON.stringify({ error: clientError.message }), { status: 500 })
      }
      if (staffError) {
        return new Response(JSON.stringify({ error: staffError.message }), { status: 500 })
      }
      clients = (clientsData ?? []) as any[]
      rawStaff = (rawStaffData ?? []) as unknown as typeof rawStaff
      savedViewsResult = saved
    }

    const staff = (rawStaff ?? []).filter((person) => {
      if (role === 'supports_planner') return person.id !== userId
      if (role === 'team_manager') return person.role !== 'supervisor' ? person.team_manager_id === userId || person.id === userId : true
      return true
    })

    const baseQueues: SearchResultQueue[] = QUEUE_RESULTS
      .filter((queue) => queue.roles.includes(role))
      .filter((queue) => `${queue.label} ${queue.description}`.toLowerCase().includes(qLower))
      .map((queue) => ({ ...queue, kind: 'queue' as const }))

    const starterNames = new Set(getStarterViewNamesForRole(profile.role ?? null))
    const savedViewQueues: SearchResultQueue[] = (savedViewsResult.views ?? [])
      .filter((view) => !starterNames.has(view.name))
      .filter((view) => `${view.name} ${view.description ?? ''}`.toLowerCase().includes(qLower))
      .map((view) => ({
        id: `saved-view:${view.id}`,
        label: view.name,
        description: view.description ?? 'Saved view',
        href: `/dashboard?savedView=${encodeURIComponent(view.id)}`,
        kind: 'saved_view' as const,
      }))

    const queues = [...baseQueues, ...savedViewQueues].slice(0, 6)

    return new Response(JSON.stringify({ clients: clients ?? [], staff, queues }), {
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Internal error'
    return new Response(JSON.stringify({ error: msg }), { status: 500 })
  }
}
