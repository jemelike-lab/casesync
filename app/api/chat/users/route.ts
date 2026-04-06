import { isSupervisorLike } from '@/lib/roles'
import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function GET() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: myProfile } = await supabase
      .from('profiles')
      .select('id, full_name, role, team_manager_id')
      .eq('id', user.id)
      .single()

    if (!myProfile) return NextResponse.json({ error: 'Profile not found' }, { status: 404 })

    if (isSupervisorLike(myProfile.role)) {
      const { data: all } = await supabase
        .from('profiles')
        .select('id, full_name, role')
        .neq('id', user.id)
        .order('full_name')
      return NextResponse.json({ users: all ?? [] })
    }

    if (myProfile.role === 'team_manager') {
      const { data: planners } = await supabase
        .from('profiles')
        .select('id, full_name, role')
        .eq('team_manager_id', user.id)
        .order('full_name')

      const { data: supervisors } = await supabase
        .from('profiles')
        .select('id, full_name, role')
        .in('role', ['supervisor', 'it'])
        .order('full_name')

      const combined = [...(planners ?? []), ...(supervisors ?? [])]
      const unique = combined.filter((u, i, arr) => arr.findIndex(x => x.id === u.id) === i)
      return NextResponse.json({ users: unique })
    }

    const managers = myProfile.team_manager_id ? [myProfile.team_manager_id] : []

    const { data: supervisors } = await supabase
      .from('profiles')
      .select('id, full_name, role')
      .in('role', ['supervisor', 'it'])
      .order('full_name')

    let managerProfiles: any[] = []
    if (managers.length > 0) {
      const { data: mp } = await supabase
        .from('profiles')
        .select('id, full_name, role')
        .in('id', managers)
      managerProfiles = mp ?? []
    }

    const combined = [...managerProfiles, ...(supervisors ?? [])]
    const unique = combined.filter((u, i, arr) => arr.findIndex(x => x.id === u.id) === i)
    return NextResponse.json({ users: unique })
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
