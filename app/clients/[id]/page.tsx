import { isSupervisorLike, canManageTeam, getRoleLabel, getRoleColor } from '@/lib/roles'
import { createClient } from '@/lib/supabase/server'
import { Client, Profile } from '@/lib/types'
import ClientEditForm from '@/components/ClientEditForm'
import { notFound } from 'next/navigation'
import { getPlanners } from '@/lib/queries'

export const dynamic = 'force-dynamic'

export default async function ClientDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, full_name, role, created_at, team_manager_id')
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

  // Defense-in-depth: explicit application-layer scope check that mirrors
  // the RLS policy on public.clients. Even though RLS already restricts
  // these rows, an explicit check here makes the access rule visible
  // alongside the page logic and guards against future policy regressions.
  const callerRole = profile?.role
  if (callerRole === 'supports_planner') {
    if (client.assigned_to !== user.id) notFound()
  } else if (callerRole === 'team_manager') {
    const { data: teamPlanners } = await supabase
      .from('profiles')
      .select('id')
      .eq('team_manager_id', user.id)
      .eq('role', 'supports_planner')
    const teamPlannerIds = new Set((teamPlanners ?? []).map((p) => p.id))
    if (!client.assigned_to || !teamPlannerIds.has(client.assigned_to)) notFound()
  } else if (callerRole !== 'supervisor' && callerRole !== 'it') {
    notFound()
  }

  // Fetch all supports planners for reassignment (team_manager and supervisor only)
  let planners: Profile[] = []
  if (isSupervisorLike(profile?.role) || profile?.role === 'team_manager') {
    planners = await getPlanners(supabase)
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
