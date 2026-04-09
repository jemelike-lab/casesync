import { isSupervisorLike, canManageTeam, getRoleLabel, getRoleColor } from '@/lib/roles'
import { Profile, SavedViewRecord } from '@/lib/types'
import DashboardClient from '@/components/DashboardClient'
import SupervisorControlPanelClient from '@/components/SupervisorControlPanelClient'
import { getCurrentUserAndProfile, getPlanners, getTeamManagers } from '@/lib/queries'
import { getAssigneeSummaryMap, getGlobalSummary } from '@/lib/dashboard-summary'
import { listSavedViewsForCurrentUser } from '@/lib/saved-views'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ full?: string }> }) {
  const { full } = await searchParams
  const { supabase, user, profile } = await getCurrentUserAndProfile()
  if (!user) return null

  let planners: Profile[] = []
  let teamManagers: Profile[] = []
  let savedViews: SavedViewRecord[] = []

  try {
    const savedViewsPromise = listSavedViewsForCurrentUser().then(result => result.views)

    if (isSupervisorLike(profile?.role)) {
      ;[planners, teamManagers, savedViews] = await Promise.all([
        getPlanners(supabase),
        getTeamManagers(supabase),
        savedViewsPromise,
      ])
    } else if (profile?.role === 'team_manager') {
      ;[planners, savedViews] = await Promise.all([
        getPlanners(supabase),
        savedViewsPromise,
      ])
    } else {
      savedViews = await savedViewsPromise
    }
  } catch (error) {
    console.error('Error fetching dashboard data:', error)
  }

  if (isSupervisorLike(profile?.role) && full !== '1') {
    const [summaryMap, globalSummary] = await Promise.all([
      getAssigneeSummaryMap(planners.map(planner => planner.id)),
      getGlobalSummary(),
    ])

    return (
      <SupervisorControlPanelClient
        planners={planners}
        teamManagers={teamManagers}
        summaryByAssignee={Object.fromEntries(summaryMap)}
        globalSummary={globalSummary}
      />
    )
  }

  return (
    <DashboardClient
      profile={(profile as Profile) ?? null}
      currentUserId={user.id}
      planners={planners}
      teamManagers={teamManagers}
      savedViews={savedViews}
      hasProfile={Boolean(profile)}
    />
  )
}
