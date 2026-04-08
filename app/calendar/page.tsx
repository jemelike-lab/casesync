import { isSupervisorLike, canManageTeam, getRoleLabel, getRoleColor } from '@/lib/roles'
import { createClient } from '@/lib/supabase/server'
import { Profile } from '@/lib/types'
import { redirect } from 'next/navigation'
import CalendarPageClient from './CalendarPageClient'

export const dynamic = 'force-dynamic'

export default async function CalendarPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single()

  if (!profile) redirect('/login')

  const p = profile as Profile
  const canSeeAll = isSupervisorLike(p.role)

  return (
    <CalendarPageClient
      userId={user.id}
      profile={p}
      canSeeAll={canSeeAll}
    />
  )
}
