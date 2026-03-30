import { createClient } from '@/lib/supabase/server'
import { Client, Profile } from '@/lib/types'
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
  const canSeeAll = p.role === 'supervisor' || p.role === 'team_manager'

  let query = supabase
    .from('clients')
    .select('id, client_id, first_name, last_name, category, assigned_to, eligibility_end_date, three_month_visit_due, pos_deadline, assessment_due, thirty_day_letter_date, spm_next_due, co_financial_redet_date')
    .order('last_name')

  if (!canSeeAll) {
    query = query.eq('assigned_to', user.id)
  }

  const { data: clients } = await query

  return (
    <CalendarPageClient
      clients={(clients as Client[]) ?? []}
      userId={user.id}
      profile={p}
      canSeeAll={canSeeAll}
    />
  )
}
