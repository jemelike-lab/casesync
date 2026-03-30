import { createClient } from '@/lib/supabase/server'
import { Profile } from '@/lib/types'
import { redirect } from 'next/navigation'
import AdminClient from '@/components/AdminClient'

export const dynamic = 'force-dynamic'

export default async function AdminPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single()

  if (profile?.role !== 'supervisor') redirect('/dashboard')

  const { data: users } = await supabase
    .from('profiles')
    .select('*')
    .order('full_name')

  // Fetch team managers for assignment
  const teamManagers = (users ?? []).filter((u: any) => u.role === 'team_manager') as Profile[]

  return (
    <AdminClient
      users={(users as Profile[]) ?? []}
      teamManagers={teamManagers}
      currentUserId={user.id}
    />
  )
}
