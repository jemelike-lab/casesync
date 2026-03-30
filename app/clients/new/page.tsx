import { createClient } from '@/lib/supabase/server'
import { Profile } from '@/lib/types'
import ClientIntakeForm from '@/components/ClientIntakeForm'
import { redirect } from 'next/navigation'

export const dynamic = 'force-dynamic'

export default async function NewClientPage() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single()

  // Only team_manager and supervisor can add clients
  if (profile?.role !== 'team_manager' && profile?.role !== 'supervisor') {
    redirect('/dashboard')
  }

  // Fetch supports planners for assignment
  const { data: planners } = await supabase
    .from('profiles')
    .select('*')
    .eq('role', 'supports_planner')
    .order('full_name')

  return (
    <ClientIntakeForm
      planners={(planners as Profile[]) ?? []}
      currentUserId={user.id}
    />
  )
}
