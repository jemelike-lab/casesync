import type {
  Role,
  SavedViewFilter,
  SavedViewOwnershipScope,
  SavedViewRecord,
} from '@/lib/types'
import { createClient } from '@/lib/supabase/server'
import { isSupervisorLike } from '@/lib/roles'

const SAVED_VIEW_FIELDS = `
  id,
  name,
  description,
  owner_user_id,
  visibility_type,
  allowed_roles,
  entity_type,
  filter_definition,
  sort_definition,
  is_favorite_default,
  created_at,
  updated_at
`

export function getStarterViewNamesForRole(role?: Role | null): string[] {
  if (role === 'supports_planner') return ['My Clients', 'My Overdue', 'My Due This Week']
  if (role === 'team_manager') return ['Team Overdue', 'Team Due Next 14 Days', 'Unassigned']
  if (role === 'supervisor' || role === 'it') return ['Org Overdue', 'Org Due Next 14 Days', 'Unassigned']
  return []
}

export function normalizeSavedViewFilter(filter: SavedViewFilter): SavedViewFilter {
  const normalized: SavedViewFilter = {}

  if (filter.ownershipScope) normalized.ownershipScope = filter.ownershipScope
  if (filter.assignedToUserId) normalized.assignedToUserId = filter.assignedToUserId
  if (filter.teamManagerId) normalized.teamManagerId = filter.teamManagerId
  if (Array.isArray(filter.dueStates) && filter.dueStates.length > 0) normalized.dueStates = [...new Set(filter.dueStates)]
  if (Array.isArray(filter.categories) && filter.categories.length > 0) normalized.categories = [...new Set(filter.categories)]
  if (Array.isArray(filter.clientStatuses) && filter.clientStatuses.length > 0) normalized.clientStatuses = [...new Set(filter.clientStatuses)]
  if (Array.isArray(filter.documentationStates) && filter.documentationStates.length > 0) normalized.documentationStates = [...new Set(filter.documentationStates)]
  if (Array.isArray(filter.assignmentStates) && filter.assignmentStates.length > 0) normalized.assignmentStates = [...new Set(filter.assignmentStates)]
  if (Array.isArray(filter.clientClassifications) && filter.clientClassifications.length > 0) normalized.clientClassifications = [...new Set(filter.clientClassifications)]
  if (typeof filter.recentActivityDays === 'number' && Number.isFinite(filter.recentActivityDays) && filter.recentActivityDays > 0) {
    normalized.recentActivityDays = Math.floor(filter.recentActivityDays)
  }
  if (typeof filter.searchTerm === 'string' && filter.searchTerm.trim()) normalized.searchTerm = filter.searchTerm.trim()
  if (typeof filter.includeInactive === 'boolean') normalized.includeInactive = filter.includeInactive

  return normalized
}

export function canUseOwnershipScope(role: Role, scope?: SavedViewOwnershipScope): boolean {
  if (!scope) return true
  if (scope === 'me') return true
  if (scope === 'my_team') return role === 'team_manager' || isSupervisorLike(role)
  if (scope === 'org') return role === 'team_manager' || isSupervisorLike(role)
  if (scope === 'specific_planner') return role === 'team_manager' || isSupervisorLike(role)
  if (scope === 'specific_team_manager') return isSupervisorLike(role)
  return false
}

export function validateSavedViewFilterForRole(role: Role, filter: SavedViewFilter) {
  const normalized = normalizeSavedViewFilter(filter)

  if (!canUseOwnershipScope(role, normalized.ownershipScope)) {
    throw new Error(`Role ${role} cannot use ownership scope ${normalized.ownershipScope}`)
  }

  if (normalized.assignedToUserId && !(role === 'team_manager' || isSupervisorLike(role))) {
    throw new Error('Only team managers, supervisors, and IT can target a specific planner')
  }

  if (normalized.teamManagerId && !isSupervisorLike(role)) {
    throw new Error('Only supervisors and IT can target a specific team manager')
  }

  return normalized
}

export async function listSavedViewsForCurrentUser() {
  const supabase = await createClient()
  const { data: auth } = await supabase.auth.getUser()
  const user = auth.user
  if (!user) return { profile: null, views: [] as SavedViewRecord[] }

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, role, team_manager_id')
    .eq('id', user.id)
    .single()

  if (!profile?.role) return { profile: null, views: [] as SavedViewRecord[] }

  const { data, error } = await supabase
    .from('saved_views')
    .select(SAVED_VIEW_FIELDS)
    .eq('entity_type', 'clients')
    .order('is_favorite_default', { ascending: false })
    .order('name', { ascending: true })

  if (error) throw error

  return {
    profile,
    views: (data ?? []) as SavedViewRecord[],
  }
}
