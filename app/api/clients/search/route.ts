import { isSupervisorLike, canManageTeam, getRoleLabel, getRoleColor } from '@/lib/roles'
import { createClient as createSupabaseJsClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url)
    const q = (searchParams.get('q') ?? '').trim()
    const assignedTo = searchParams.get('assignedTo') ?? ''
    const limit = Math.min(Math.max(parseInt(searchParams.get('limit') ?? '8', 10), 1), 20)

    if (!q) {
      return new Response(JSON.stringify({ clients: [] }), {
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

    let query = admin
      .from('clients')
      .select('id, client_id, last_name, first_name, assigned_to, profiles!clients_assigned_to_fkey(id, full_name, role, team_manager_id)')
      .eq('is_active', true)
      .or(`last_name.ilike.%${q}%,first_name.ilike.%${q}%,client_id.ilike.%${q}%`)
      .order('last_name')
      .limit(limit)

    if (role === 'supports_planner') {
      query = query.eq('assigned_to', userId)
    } else if ((role === 'team_manager' || isSupervisorLike(role)) && assignedTo) {
      query = query.eq('assigned_to', assignedTo)
    }

    const { data, error } = await query

    if (error) {
      return new Response(JSON.stringify({ error: error.message }), { status: 500 })
    }

    return new Response(JSON.stringify({ clients: data ?? [] }), {
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Internal error'
    return new Response(JSON.stringify({ error: msg }), { status: 500 })
  }
}
