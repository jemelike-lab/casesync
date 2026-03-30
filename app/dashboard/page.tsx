import { createClient } from '@/lib/supabase/server'
import { Client, Profile } from '@/lib/types'
import DashboardClient from '@/components/DashboardClient'

export const dynamic = 'force-dynamic'

export default async function DashboardPage() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single()

  const { data: clients, error } = await supabase
    .from('clients')
    .select('*, profiles!clients_assigned_to_fkey(id, full_name, role)')
    .order('last_name')

  if (error) {
    console.error('Error fetching clients:', error)
  }

  // Fetch supports planners for assignment dropdown
  let planners: Profile[] = []
  if (profile?.role === 'supervisor' || profile?.role === 'team_manager') {
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .eq('role', 'supports_planner')
      .order('full_name')
    planners = (data as Profile[]) ?? []
  }

  return (
    <DashboardClient
      clients={(clients as Client[]) ?? []}
      profile={profile as Profile}
      currentUserId={user.id}
      planners={planners}
    />
  )
}
