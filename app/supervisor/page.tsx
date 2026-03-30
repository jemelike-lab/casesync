import { createClient } from '@/lib/supabase/server'
import { Client, Profile } from '@/lib/types'
import { redirect } from 'next/navigation'
import SupervisorDashboardClient from '@/components/SupervisorDashboardClient'

export const dynamic = 'force-dynamic'

export default async function SupervisorPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single()

  if (profile?.role !== 'supervisor') redirect('/dashboard')

  const { data: clients } = await supabase
    .from('clients')
    .select('*, profiles!clients_assigned_to_fkey(id, full_name, role)')
    .order('last_name')

  const { data: planners } = await supabase
    .from('profiles')
    .select('*')
    .eq('role', 'supports_planner')
    .order('full_name')

  return (
    <SupervisorDashboardClient
      clients={(clients as Client[]) ?? []}
      planners={(planners as Profile[]) ?? []}
      mode="supervisor"
    />
  )
}
