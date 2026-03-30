import { createClient } from '@/lib/supabase/server'
import { Client } from '@/lib/types'
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

  let query = supabase
    .from('clients')
    .select('*, profiles!clients_assigned_to_fkey(id, full_name, role)')
    .order('last_name')

  // RLS handles filtering but we can also filter client-side
  const { data: clients, error } = await query

  if (error) {
    console.error('Error fetching clients:', error)
  }

  return (
    <DashboardClient
      clients={(clients as Client[]) ?? []}
      profile={profile}
      currentUserId={user.id}
    />
  )
}
