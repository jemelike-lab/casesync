import type {
  Role,
  SavedViewFilter,
  SavedViewOwnershipScope,
  SavedViewRecord,
  SavedViewSortDefinition,
  SavedViewVisibilityType,
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

const STARTER_SAVED_VIEWS: Array<Pick<SavedViewRecord, 'name' | 'description' | 'visibility_type' | 'allowed_roles' | 'entity_type' | 'filter_definition' | 'sort_definition' | 'is_favorite_default'>> = [
  {
    name: 'My Clients',
    description: 'Starter queue for supports planners to reopen their active assigned clients.',
    visibility_type: 'system',
    allowed_roles: ['supports_planner'],
    entity_type: 'clients',
    filter_definition: { ownershipScope: 'me' },
    sort_definition: { field: 'priority', dir: 'desc' },
    is_favorite_default: true,
  },
  {
    name: 'My Overdue',
    description: 'Starter queue for supports planners focused on overdue work.',
    visibility_type: 'system',
    allowed_roles: ['supports_planner'],
    entity_type: 'clients',
    filter_definition: { ownershipScope: 'me', dueStates: ['overdue'] },
    sort_definition: { field: 'priority', dir: 'desc' },
    is_favorite_default: true,
  },
  {
    name: 'My Due This Week',
    description: 'Starter queue for supports planners focused on work due soon.',
    visibility_type: 'system',
    allowed_roles: ['supports_planner'],
    entity_type: 'clients',
    filter_definition: { ownershipScope: 'me', dueStates: ['due_this_week'] },
    sort_definition: { field: 'priority', dir: 'desc' },
    is_favorite_default: true,
  },
  {
    name: 'Team Overdue',
    description: 'Starter queue for team managers focused on overdue team work.',
    visibility_type: 'system',
    allowed_roles: ['team_manager'],
    entity_type: 'clients',
    filter_definition: { ownershipScope: 'my_team', dueStates: ['overdue'] },
    sort_definition: { field: 'priority', dir: 'desc' },
    is_favorite_default: true,
  },
  {
    name: 'Team Due Next 14 Days',
    description: 'Starter queue for team managers to stay ahead of upcoming deadlines.',
    visibility_type: 'system',
    allowed_roles: ['team_manager'],
    entity_type: 'clients',
    filter_definition: { ownershipScope: 'my_team', dueStates: ['due_next_14_days'] },
    sort_definition: { field: 'priority', dir: 'desc' },
    is_favorite_default: true,
  },
  {
    name: 'Org Overdue',
    description: 'Starter operational queue for supervisors and IT focused on org-wide overdue work.',
    visibility_type: 'system',
    allowed_roles: ['supervisor', 'it'],
    entity_type: 'clients',
    filter_definition: { ownershipScope: 'org', dueStates: ['overdue'] },
    sort_definition: { field: 'priority', dir: 'desc' },
    is_favorite_default: true,
  },
  {
    name: 'Org Due Next 14 Days',
    description: 'Starter operational queue for supervisors and IT focused on upcoming due work.',
    visibility_type: 'system',
    allowed_roles: ['supervisor', 'it'],
    entity_type: 'clients',
    filter_definition: { ownershipScope: 'org', dueStates: ['due_next_14_days'] },
    sort_definition: { field: 'priority', dir: 'desc' },
    is_favorite_default: true,
  },
  {
    name: 'Unassigned',
    description: 'Starter queue for users allowed to work unassigned cases.',
    visibility_type: 'system',
    allowed_roles: ['team_manager', 'supervisor', 'it'],
    entity_type: 'clients',
    filter_definition: { ownershipScope: 'org', assignmentStates: ['unassigned'] },
    sort_definition: { field: 'priority', dir: 'desc' },
    is_favorite_default: true,
  },
]

function getFallbackSavedViewsForRole(role?: Role | null): SavedViewRecord[] {
  if (!role) return []
  return STARTER_SAVED_VIEWS
    .filter((view) => !view.allowed_roles || view.allowed_roles.includes(role))
    .map((view, index) => ({
      id: `fallback-${role}-${index}`,
      name: view.name,
      description: view.description ?? null,
      owner_user_id: null,
      visibility_type: view.visibility_type,
      allowed_roles: view.allowed_roles ?? null,
      entity_type: view.entity_type,
      filter_definition: view.filter_definition,
      sort_definition: view.sort_definition,
      is_favorite_default: view.is_favorite_default,
      created_at: '',
      updated_at: '',
    }))
}

export function isSavedViewsUnavailableError(error: { code?: string | null; message?: string | null } | null | undefined) {
  if (!error) return false
  return error.code === 'PGRST205' || /saved_views/i.test(error.message ?? '')
}

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

export interface SavedViewMutationInput {
  name: string
  description?: string | null
  filterDefinition: SavedViewFilter
  sortDefinition?: SavedViewSortDefinition | null
  visibilityType?: SavedViewVisibilityType
}

export function sanitizeSavedViewName(name: string): string {
  return name.trim().replace(/\s+/g, ' ').slice(0, 80)
}

export function sanitizeSavedViewDescription(description?: string | null): string | null {
  if (!description) return null
  const trimmed = description.trim().replace(/\s+/g, ' ')
  return trimmed ? trimmed.slice(0, 240) : null
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

  if (error) {
    if (isSavedViewsUnavailableError(error)) {
      return {
        profile,
        views: getFallbackSavedViewsForRole(profile.role as Role),
      }
    }
    throw error
  }

  const views = (data ?? []) as SavedViewRecord[]
  if (views.length === 0) {
    return {
      profile,
      views: getFallbackSavedViewsForRole(profile.role as Role),
    }
  }
 

  return {
    profile,
    views,
  }
}

export async function getCurrentSavedViewContext() {
  const supabase = await createClient()
  const { data: auth } = await supabase.auth.getUser()
  const user = auth.user
  if (!user) throw new Error('Unauthorized')

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, role, team_manager_id')
    .eq('id', user.id)
    .single()

  if (!profile?.role) throw new Error('Profile not found')

  return { supabase, user, profile: { id: profile.id, role: profile.role as Role, team_manager_id: profile.team_manager_id ?? null } }
}

export async function assertSavedViewEditable(savedViewId: string) {
  const { supabase, user } = await getCurrentSavedViewContext()
  const { data, error } = await supabase
    .from('saved_views')
    .select(SAVED_VIEW_FIELDS)
    .eq('id', savedViewId)
    .eq('owner_user_id', user.id)
    .eq('visibility_type', 'personal')
    .single()

  if (error || !data) throw new Error('Saved view not found or not editable')

  return { supabase, user, view: data as SavedViewRecord }
}
