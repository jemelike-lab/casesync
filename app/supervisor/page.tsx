import { Profile } from '@/lib/types'
import { redirect } from 'next/navigation'
import SupervisorControlPanelClient from '@/components/SupervisorControlPanelClient'
import { getCurrentUserAndProfile, getPlanners, getTeamManagers } from '@/lib/queries'
import { getAssigneeSummaryMap, getGlobalSummary } from '@/lib/dashboard-summary'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export default async function SupervisorPage() {
  const { supabase, user, profile } = await getCurrentUserAndProfile()
  if (!user) redirect('/login')
  if (!(profile?.role === 'supervisor' || profile?.role === 'it')) redirect('/dashboard')

  const [planners, teamManagers] = await Promise.all([
    getPlanners(supabase),
    getTeamManagers(supabase),
  ])

  const [summaryMap, globalSummary] = await Promise.all([
    getAssigneeSummaryMap(planners.map(planner => planner.id)),
    getGlobalSummary(),
  ])

  return (
    <SupervisorControlPanelClient
      planners={(planners as Profile[]) ?? []}
      teamManagers={(teamManagers as Profile[]) ?? []}
      summaryByAssignee={Object.fromEntries(summaryMap)}
      globalSummary={globalSummary}
    />
  )
}
