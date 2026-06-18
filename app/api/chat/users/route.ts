import { isSupervisorLike } from '@/lib/roles'
import { createClient } from '@/lib/supabase/server'
import { isAzureConfigured, withRlsContext } from '@/lib/db/azure'
import { NextResponse } from 'next/server'

export async function GET() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    if (isAzureConfigured()) {
      return await withRlsContext(user.id, async (sql) => {
        const myRows = await sql`SELECT id, full_name, role, team_manager_id FROM profiles WHERE id = ${user.id} LIMIT 1`
        const myProfile = myRows[0] as { id: string; full_name: string; role: string; team_manager_id: string | null } | undefined
        if (!myProfile) return NextResponse.json({ error: 'Profile not found' }, { status: 404 })

        if (isSupervisorLike(myProfile.role)) {
          const all = await sql`SELECT id, full_name, role FROM profiles WHERE id <> ${user.id} ORDER BY full_name`
          return NextResponse.json({ users: all })
        }

        if (myProfile.role === 'team_manager') {
          const planners = await sql`SELECT id, full_name, role FROM profiles WHERE team_manager_id = ${user.id} ORDER BY full_name`
          const supervisors = await sql`SELECT id, full_name, role FROM profiles WHERE role IN ('supervisor', 'it') ORDER BY full_name`
          const combined = [...planners, ...supervisors]
          const unique = combined.filter((u, i, arr) => arr.findIndex((x) => x.id === u.id) === i)
          return NextResponse.json({ users: unique })
        }

        const managers = myProfile.team_manager_id ? [myProfile.team_manager_id] : []
        const supervisors = await sql`SELECT id, full_name, role FROM profiles WHERE role IN ('supervisor', 'it') ORDER BY full_name`
        let managerProfiles: Array<{ id: string }> = []
        if (managers.length > 0) {
          managerProfiles = await sql`SELECT id, full_name, role FROM profiles WHERE id = ANY(${managers}::uuid[])`
        }
        const combined = [...managerProfiles, ...supervisors] as Array<{ id: string }>
        const unique = combined.filter((u, i, arr) => arr.findIndex((x) => x.id === u.id) === i)
        return NextResponse.json({ users: unique })
      })
    }

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
