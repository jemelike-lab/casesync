import { createClient } from '@/lib/supabase/server'
import { Client, Profile } from '@/lib/types'
import ClientEditForm from '@/components/ClientEditForm'
import { notFound } from 'next/navigation'

export const dynamic = 'force-dynamic'

export default async function ClientDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single()

  const { data: client, error } = await supabase
    .from('clients')
    .select('*, profiles!clients_assigned_to_fkey(id, full_name, role)')
    .eq('id', id)
    .single()

  if (error || !client) {
    notFound()
  }

  // Fetch all supports planners for reassignment (team_manager and supervisor only)
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
    <ClientEditForm
      client={client as Client}
      currentUserId={user.id}
      currentProfile={profile as Profile}
      planners={planners}
    />
  )
}
