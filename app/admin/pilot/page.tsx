// /admin/pilot \u2014 Pilot Scoreboard (supervisor-like).
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { isSupervisorLike } from '@/lib/roles'
import PilotScoreboardClient from '@/components/PilotScoreboardClient'

export const dynamic = 'force-dynamic'

export default async function PilotScoreboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (!isSupervisorLike(String(profile?.role ?? '').toLowerCase())) redirect('/dashboard')
  return <PilotScoreboardClient />
}
