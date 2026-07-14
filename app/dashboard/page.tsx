import { isSupervisorLike, canManageTeam, getRoleLabel, getRoleColor } from '@/lib/roles'
import { Profile, SavedViewRecord } from '@/lib/types'
import { createClient as createSupabaseJsClient } from '@supabase/supabase-js'
import DashboardClient from '@/components/DashboardClient'
import SupervisorControlPanelClient from '@/components/SupervisorControlPanelClient'
import TeamManagerControlPanelClient from '@/components/TeamManagerControlPanelClient'
import SupportPlannerControlPanelClient from '@/components/SupportPlannerControlPanelClient'
import PilotChecklistCard from '@/components/PilotChecklistCard'
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
        profile={profile ?? null}
      />
    )
  }

  if (profile?.role === 'team_manager' && profile && full !== '1') {
    const myPlanners = planners.filter((p) => p.team_manager_id === profile.id)
    const summaryMap = await getAssigneeSummaryMap(myPlanners.map((p) => p.id))

    return (
      <>
        <PilotChecklistCard />
        <TeamManagerControlPanelClient
          profile={profile as Profile}
          planners={myPlanners}
          summaryByAssignee={Object.fromEntries(summaryMap)}
        />
      </>
    )
  }

  if (profile?.role === 'supports_planner' && profile && full !== '1') {
    // Resolve the SP's team manager.
    //
    // Fix 2026-06-11: use the service-role admin client for this single
    // profile lookup. The user-session-scoped supabase client is subject to
    // RLS, which prevents an SP from reading other profile rows — including
    // their own TM — so the previous implementation always returned null and
    // the My TM card fell to the "Not yet assigned" empty state even when
    // team_manager_id was set. Mirrors the /api/clients pattern: trusted
    // server-side lookup of a single known-id row via the service role.
    let myTeamManager: Profile | null = null
    if (profile.team_manager_id) {
      const admin = createSupabaseJsClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
      )
      const { data } = await admin
        .from('profiles')
        .select('*')
        .eq('id', profile.team_manager_id)
        .single()
      myTeamManager = (data as Profile | null) ?? null
    }

    const summaryMap = await getAssigneeSummaryMap([profile.id])
    const mySummary = summaryMap.get(profile.id) ?? null

    return (
      <>
        <PilotChecklistCard />
        <SupportPlannerControlPanelClient
          profile={profile as Profile}
          myTeamManager={myTeamManager}
          mySummary={mySummary}
        />
      </>
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
