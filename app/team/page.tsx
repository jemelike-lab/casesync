import { isSupervisorLike, canManageTeam } from '@/lib/roles'
import { Client, Profile, SavedViewRecord, isOverdue, isDueToday, isDueThisWeek, isDueNext14Days, getDaysSinceContact } from '@/lib/types'
import { redirect } from 'next/navigation'
import SupervisorDashboardClient from '@/components/SupervisorDashboardClient'
import TransferBoardClient from '@/components/TransferBoardClient'
import PlannerAssignmentBoardClient from '@/components/PlannerAssignmentBoardClient'
import RebalanceHistoryClient from '@/components/RebalanceHistoryClient'
import TeamQueuesClient from '@/components/TeamQueuesClient'
import { getActiveClients, getCurrentUserAndProfile, getPlanners, getTeamManagers } from '@/lib/queries'
import { listSavedViewsForCurrentUser } from '@/lib/saved-views'

export const revalidate = 60

export default async function TeamPage({ searchParams }: { searchParams: Promise<{ view?: string; filter?: string; category?: string; full?: string; planner?: string | string[] }> }) {
  const { view, filter, category, full, planner } = await searchParams
  const { supabase, user, profile } = await getCurrentUserAndProfile()
  if (!user) redirect('/login')

  if (!profile || !canManageTeam(profile.role)) {
    redirect('/dashboard')
  }

  const [{ views: savedViews }, plannerResults, teamManagerResults] = await Promise.all([
    listSavedViewsForCurrentUser(),
    getPlanners(supabase, profile.role === 'team_manager' ? user.id : undefined),
    getTeamManagers(supabase),
  ])

  const planners = Array.isArray(plannerResults) ? plannerResults : []
  const teamManagers = Array.isArray(teamManagerResults) ? teamManagerResults : []

  const activeSavedView = view && view !== 'transfer' && view !== 'assign-planners'
    ? (savedViews.find(savedView => savedView.id === view) ?? null)
    : null

  const derivedFilter = activeSavedView
    ? (activeSavedView.filter_definition?.dueStates?.includes('overdue')
        ? 'overdue'
        : activeSavedView.filter_definition?.dueStates?.includes('due_today')
          ? 'due_today'
          : activeSavedView.filter_definition?.dueStates?.includes('due_this_week')
            ? 'due_this_week'
            : activeSavedView.filter_definition?.dueStates?.includes('due_next_14_days')
              ? 'due_next_14_days'
              : activeSavedView.filter_definition?.categories?.[0] ?? filter)
    : filter

  const derivedCategory = activeSavedView?.filter_definition?.categories?.[0] ?? category
  const derivedPlanner = activeSavedView?.filter_definition?.assignedToUserId ?? planner

  const plannerIds = planners.map(planner => planner.id).filter(Boolean)
  let clients: Client[] = []

  if (isSupervisorLike(profile.role) && view === 'transfer') {
    clients = await getActiveClients(supabase)
  } else if (plannerIds.length > 0) {
    clients = await getActiveClients(supabase, plannerIds)
  }

  const plannerFilters = Array.isArray(derivedPlanner) ? derivedPlanner.filter(Boolean) : derivedPlanner ? [derivedPlanner] : []

  if (plannerFilters.length > 0) {
    const plannerFilterSet = new Set(plannerFilters)
    clients = clients.filter(client => client.assigned_to && plannerFilterSet.has(client.assigned_to))
  }

  // Keep unfiltered clients for accurate stat card counts
  const allScopedClients = clients

  if (derivedFilter === 'overdue') {
    clients = clients.filter(client => {
      const categoryOk = !derivedCategory || client.category === derivedCategory
      return categoryOk && isOverdue(client)
    })
  } else if (derivedFilter === 'due_today') {
    clients = clients.filter(client => {
      const categoryOk = !derivedCategory || client.category === derivedCategory
      return categoryOk && isDueToday(client)
    })
  } else if (derivedFilter === 'due_this_week') {
    clients = clients.filter(client => {
      const categoryOk = !derivedCategory || client.category === derivedCategory
      return categoryOk && isDueThisWeek(client)
    })
  } else if (derivedFilter === 'no_contact_7') {
    clients = clients.filter(client => {
      const categoryOk = !derivedCategory || client.category === derivedCategory
      const days = getDaysSinceContact(client.last_contact_date)
      return categoryOk && days !== null && days >= 7
    })
  } else if (derivedFilter === 'due_next_14_days') {
    clients = clients.filter(client => {
      const categoryOk = !derivedCategory || client.category === derivedCategory
      return categoryOk && isDueNext14Days(client)
    })
  } else if (derivedFilter === 'all') {
    if (derivedCategory) clients = clients.filter(client => client.category === derivedCategory)
  }

  if (isSupervisorLike(profile.role) && view === 'transfer') {
    return (
      <TransferBoardClient
        clients={clients}
        planners={(planners as Profile[]) ?? []}
      />
    )
  }

  if (isSupervisorLike(profile.role) && view === 'assign-planners') {
    return (
      <PlannerAssignmentBoardClient
        planners={(planners as Profile[]) ?? []}
        teamManagers={(teamManagers as Profile[]) ?? []}
      />
    )
  }

  if ((isSupervisorLike(profile.role) || profile.role === 'team_manager') && view === 'history') {
    const { data: historyLogs } = await supabase
      .from('activity_log')
      .select('*, profiles!activity_log_user_id_fkey(full_name), clients!activity_log_client_id_fkey(first_name, last_name, client_id)')
      .ilike('action', 'Recommended rebalance move%')
      .order('created_at', { ascending: false })
      .limit(500)

    return <RebalanceHistoryClient logs={(historyLogs as any[]) ?? []} />
  }

  if ((isSupervisorLike(profile.role) || profile.role === 'team_manager') && view === 'queues') {
    return (
      <TeamQueuesClient
        clients={clients}
        planners={(planners as Profile[]) ?? []}
        mode={isSupervisorLike(profile.role) ? 'supervisor' : 'team_manager'}
      />
    )
  }

  const fullFilterBaseLabel = activeSavedView
    ? activeSavedView.name
    : derivedFilter === 'overdue'
      ? derivedCategory ? `Overdue (${String(derivedCategory).toUpperCase()})` : 'Overdue'
      : derivedFilter === 'due_today'
        ? 'Due Today'
        : derivedFilter === 'due_this_week'
          ? 'Due This Week'
          : derivedFilter === 'no_contact_7'
            ? 'No Contact 7+ Days'
            : derivedFilter === 'due_next_14_days'
              ? 'Due Next 14 Days'
              : derivedFilter === 'all'
              ? derivedCategory ? `All Active Clients (${String(derivedCategory).toUpperCase()})` : 'All Active Clients'
              : 'Filtered Results'

  const plannerScopeLabel = plannerFilters.length > 0
    ? (() => {
        const scopedPlannerNames = planners
          .filter(p => plannerFilters.includes(p.id))
          .map(p => p.full_name)
          .filter(Boolean)

        if (scopedPlannerNames.length === 1) return ` · ${scopedPlannerNames[0]}`
        if (scopedPlannerNames.length > 1) return ` · ${scopedPlannerNames.length} planners`
        return ''
      })()
    : ''

  const fullFilterLabel = full === '1'
    ? `${fullFilterBaseLabel}${plannerScopeLabel}`
    : null

  return (
    <SupervisorDashboardClient
      clients={clients}
      allScopedClients={allScopedClients}
      planners={(planners as Profile[]) ?? []}
      mode={isSupervisorLike(profile.role) ? 'supervisor' : 'team_manager'}
      fullFilterLabel={fullFilterLabel}
      currentFilter={derivedFilter === 'overdue' || derivedFilter === 'due_today' || derivedFilter === 'due_this_week' || derivedFilter === 'due_next_14_days' || derivedFilter === 'no_contact_7' || derivedFilter === 'all' ? derivedFilter : null}
      plannerFilters={plannerFilters}
      category={derivedCategory ?? null}
      savedViews={savedViews as SavedViewRecord[]}
      activeSavedViewId={activeSavedView?.id ?? null}
    />
  )
}
