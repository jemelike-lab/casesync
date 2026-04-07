import { isSupervisorLike, canManageTeam, getRoleLabel, getRoleColor } from '@/lib/roles'
import { Client, Profile, isOverdue, isDueThisWeek, getDaysSinceContact } from '@/lib/types'
import { redirect } from 'next/navigation'
import SupervisorDashboardClient from '@/components/SupervisorDashboardClient'
import TransferBoardClient from '@/components/TransferBoardClient'
import PlannerAssignmentBoardClient from '@/components/PlannerAssignmentBoardClient'
import { getActiveClients, getCurrentUserAndProfile, getPlanners, getTeamManagers } from '@/lib/queries'

export const revalidate = 60

export default async function TeamPage({ searchParams }: { searchParams: Promise<{ view?: string; filter?: string; category?: string; full?: string; planner?: string }> }) {
  const { view, filter, category, full, planner } = await searchParams
  const { supabase, user, profile } = await getCurrentUserAndProfile()
  if (!user) redirect('/login')

  if (!profile || !canManageTeam(profile.role)) {
    redirect('/dashboard')
  }

  const [planners, teamManagers] = await Promise.all([
    getPlanners(supabase, profile.role === 'team_manager' ? user.id : undefined),
    getTeamManagers(supabase),
  ])

  const plannerIds = planners.map(planner => planner.id)
  let clients: Client[] = []

  if (isSupervisorLike(profile.role) && view === 'transfer') {
    clients = await getActiveClients(supabase)
  } else if (plannerIds.length > 0) {
    clients = await getActiveClients(supabase, plannerIds)
  }

  if (planner) {
    clients = clients.filter(client => client.assigned_to === planner)
  }

  if (filter === 'overdue') {
    clients = clients.filter(client => {
      const categoryOk = !category || client.category === category
      return categoryOk && isOverdue(client)
    })
  } else if (filter === 'due_this_week') {
    clients = clients.filter(client => {
      const categoryOk = !category || client.category === category
      return categoryOk && isDueThisWeek(client)
    })
  } else if (filter === 'no_contact_7') {
    clients = clients.filter(client => {
      const categoryOk = !category || client.category === category
      const days = getDaysSinceContact(client.last_contact_date)
      return categoryOk && days !== null && days >= 7
    })
  } else if (filter === 'all') {
    if (category) clients = clients.filter(client => client.category === category)
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

  const fullFilterBaseLabel = filter === 'overdue'
    ? category ? `Overdue (${String(category).toUpperCase()})` : 'Overdue'
    : filter === 'due_this_week'
      ? 'Due This Week'
      : filter === 'no_contact_7'
        ? 'Quiet 7+ Days'
        : filter === 'all'
          ? category ? `All Active Clients (${String(category).toUpperCase()})` : 'All Active Clients'
          : 'Filtered Results'

  const plannerScopeLabel = planner
    ? (() => {
        const plannerProfile = planners.find(p => p.id === planner)
        return plannerProfile?.full_name ? ` · ${plannerProfile.full_name}` : ''
      })()
    : ''

  const fullFilterLabel = full === '1'
    ? `${fullFilterBaseLabel}${plannerScopeLabel}`
    : null

  return (
    <SupervisorDashboardClient
      clients={clients}
      planners={(planners as Profile[]) ?? []}
      mode={isSupervisorLike(profile.role) ? 'supervisor' : 'team_manager'}
      fullFilterLabel={fullFilterLabel}
    />
  )
}
