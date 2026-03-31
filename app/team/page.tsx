import { createClient } from '@/lib/supabase/server'
import { Client, Profile } from '@/lib/types'
import { redirect } from 'next/navigation'
import SupervisorDashboardClient from '@/components/SupervisorDashboardClient'

export const revalidate = 60

export default async function TeamPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single()

  if (!profile || (profile.role !== 'team_manager' && profile.role !== 'supervisor')) {
    redirect('/dashboard')
  }

  // For team manager: only their assigned supports planners
  let plannerQuery = supabase.from('profiles').select('*').eq('role', 'supports_planner').order('full_name')
  if (profile.role === 'team_manager') {
    plannerQuery = plannerQuery.eq('team_manager_id', user.id)
  }
  const { data: planners } = await plannerQuery

  // Get all clients for those planners
  const plannerIds = (planners ?? []).map((p: any) => p.id)
  let clients: Client[] = []
  if (plannerIds.length > 0) {
    const { data } = await supabase
      .from('clients')
      .select('*, profiles!clients_assigned_to_fkey(id, full_name, role)')
      .in('assigned_to', plannerIds)
      .order('last_name')
    clients = (data as Client[]) ?? []
  }

  return (
    <SupervisorDashboardClient
      clients={clients}
      planners={(planners as Profile[]) ?? []}
      mode="team_manager"
    />
  )
}
