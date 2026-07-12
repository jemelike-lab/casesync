/**
 * Centralized permission helpers for the Workryn role system.
 *
 * Role hierarchy (highest → lowest):
 * OWNER / SUPERVISOR  — full access, all features
 * ADMIN               — full admin, cannot create OWNER/SUPERVISOR
 * MANAGER / TEAM_MANAGER — manage team, see all staff, can invite SUPPORT_PLANNER
 * STAFF / SUPPORT_PLANNER — read-only own data, cannot invite
 *
 * CaseSync role mapping (see lib/workryn/auth.ts roleMap):
 *   supervisor       → SUPERVISOR
 *   it               → ADMIN
 *   team_manager     → TEAM_MANAGER (canonical) or MANAGER (legacy)
 *   supports_planner → STAFF (canonical) or SUPPORT_PLANNER (legacy)
 *   default          → STAFF
 */

export type Role =
  | 'OWNER'
  | 'ADMINISTRATOR'
  | 'SUPERVISOR'
  | 'IT'
  | 'ADMIN'
  | 'TEAM_MANAGER'
  | 'MANAGER'
  | 'ADMIN_ASSISTANT'
  | 'STAFF'
  | 'SUPPORT_PLANNER'

export const ROLES: Role[] = [
  'OWNER', 'ADMINISTRATOR', 'SUPERVISOR', 'IT', 'ADMIN', 'TEAM_MANAGER', 'MANAGER', 'ADMIN_ASSISTANT', 'STAFF', 'SUPPORT_PLANNER'
]

/** Numeric weight — higher = more privileged */
const ROLE_WEIGHT: Record<Role, number> = {
  OWNER:           9,
  ADMINISTRATOR:   8,
  SUPERVISOR:      7,
  IT:              6,
  ADMIN:           5,
  TEAM_MANAGER:    4,
  MANAGER:         4,
  ADMIN_ASSISTANT: 3,
  STAFF:           2,
  SUPPORT_PLANNER: 1,
}

export function isRole(value: unknown): value is Role {
  return typeof value === 'string' && (ROLES as string[]).includes(value)
}

export function isOwner(role: string | undefined | null): boolean {
  return role === 'OWNER'
}

export function isAdministratorOrAbove(role: string | undefined | null): boolean {
  return role === 'OWNER' || role === 'ADMINISTRATOR'
}

export function isSupervisorOrAbove(role: string | undefined | null): boolean {
  return role === 'OWNER' || role === 'ADMINISTRATOR' || role === 'SUPERVISOR'
}

export function isAdminOrAbove(role: string | undefined | null): boolean {
  return isSupervisorOrAbove(role) || role === 'IT' || role === 'ADMIN'
}

export function isManagerOrAbove(role: string | undefined | null): boolean {
  return isAdminOrAbove(role) || role === 'TEAM_MANAGER' || role === 'MANAGER'
}

export function isStaffOrAbove(role: string | undefined | null): boolean {
  return isManagerOrAbove(role) || role === 'ADMIN_ASSISTANT' || role === 'STAFF' || role === 'SUPPORT_PLANNER'
}

/**
 * Both planner-tier role spellings that exist in w_user rows. Historical
 * provisioning paths disagreed ('STAFF' via lib/workryn/auth.ts,
 * 'SUPPORT_PLANNER' via invite acceptance and the layout upsert), so every
 * planner-scoped query MUST match both — filtering on 'STAFF' alone made the
 * evaluation milestone sweep, milestones page, and training roster silently
 * skip every invited planner (2026-07-12 audit, P0-2).
 */
export const PLANNER_ROLES: string[] = ['STAFF', 'SUPPORT_PLANNER']

export function isPlannerRole(role: string | undefined | null): boolean {
  return role === 'STAFF' || role === 'SUPPORT_PLANNER'
}

/**
 * THE canonical CaseSync profile.role → Workryn role map. All provisioning
 * paths (lib/workryn/auth.ts, app/actions/invite.ts, app/(workryn)/layout.tsx)
 * import this — the three previously-divergent local maps dropped
 * 'administrator' to the default planner tier (2026-07-12 audit, P0-3).
 */
export function mapCaseSyncRoleToWorkryn(csRole?: string | null): Role {
  switch ((csRole ?? '').toLowerCase()) {
    case 'administrator':     return 'ADMINISTRATOR'
    case 'supervisor':        return 'SUPERVISOR'
    case 'it':                return 'IT'
    case 'admin':             return 'ADMIN'
    case 'team_manager':      return 'TEAM_MANAGER'
    case 'admin_assistant':   return 'ADMIN_ASSISTANT'
    case 'support_planner':
    case 'supports_planner':  return 'SUPPORT_PLANNER'
    default:                  return 'SUPPORT_PLANNER'
  }
}

/**
 * Effective hire date for milestone math: the admin-set hireDate when present,
 * else the account-creation date (legacy behavior). u is typed structurally so
 * it works with any Prisma selection that includes the two fields.
 */
export function effectiveHireDate(u: { hireDate?: Date | string | null; createdAt: Date | string }): Date {
  const h = (u as { hireDate?: Date | string | null }).hireDate
  return new Date(h ?? u.createdAt)
}

/** True if actor outranks target */
export function outranks(
  actor: string | undefined | null,
  target: string | undefined | null
): boolean {
  if (!isRole(actor) || !isRole(target)) return false
  return ROLE_WEIGHT[actor] > ROLE_WEIGHT[target]
}

/**
 * Roles that the given actor can assign when inviting/creating users.
 * You can only assign roles strictly below your own weight.
 */
export function assignableRoles(actorRole: string | undefined | null): Role[] {
  switch (actorRole) {
    case 'OWNER':
      return ['OWNER', 'ADMINISTRATOR', 'SUPERVISOR', 'IT', 'TEAM_MANAGER', 'MANAGER', 'ADMIN_ASSISTANT', 'STAFF', 'SUPPORT_PLANNER']
    case 'ADMINISTRATOR':
      return ['SUPERVISOR', 'IT', 'TEAM_MANAGER', 'MANAGER', 'ADMIN_ASSISTANT', 'STAFF', 'SUPPORT_PLANNER']
    case 'SUPERVISOR':
      return ['IT', 'TEAM_MANAGER', 'MANAGER', 'ADMIN_ASSISTANT', 'STAFF', 'SUPPORT_PLANNER']
    case 'IT':
    case 'ADMIN':
      return ['TEAM_MANAGER', 'MANAGER', 'ADMIN_ASSISTANT', 'STAFF', 'SUPPORT_PLANNER']
    case 'TEAM_MANAGER':
    case 'MANAGER':
      return ['STAFF', 'SUPPORT_PLANNER']
    default:
      return []
  }
}

export function canCreateRole(
  actorRole: string | undefined | null,
  targetRole: string
): boolean {
  return assignableRoles(actorRole).includes(targetRole as Role)
}

export function canManageUser(
  actorRole: string | undefined | null,
  targetRole: string | undefined | null
): boolean {
  if (!isRole(actorRole) || !isRole(targetRole)) return false
  if (actorRole === 'OWNER') return true
  if (actorRole === 'ADMINISTRATOR') return targetRole !== 'OWNER' && targetRole !== 'ADMINISTRATOR'
  if (actorRole === 'SUPERVISOR') return targetRole !== 'OWNER' && targetRole !== 'ADMINISTRATOR'
  if (actorRole === 'IT' || actorRole === 'ADMIN') {
    return targetRole === 'TEAM_MANAGER'
      || targetRole === 'MANAGER'
      || targetRole === 'ADMIN_ASSISTANT'
      || targetRole === 'STAFF'
      || targetRole === 'SUPPORT_PLANNER'
  }
  if (actorRole === 'TEAM_MANAGER' || actorRole === 'MANAGER') {
    return targetRole === 'STAFF' || targetRole === 'SUPPORT_PLANNER'
  }
  return false
}

export function canSeeAllDepartments(role: string | undefined | null): boolean {
  return isManagerOrAbove(role) || role === 'ADMIN_ASSISTANT'
}

export function isIT(role: string | undefined | null): boolean {
  return role === 'IT' || role === 'ADMIN'
}

export function isAdminAssistant(role: string | undefined | null): boolean {
  return role === 'ADMIN_ASSISTANT'
}

export function canManageDepartments(role: string | undefined | null): boolean {
  return isSupervisorOrAbove(role)
}

export function canViewEvaluations(role: string | undefined | null): boolean {
  return isManagerOrAbove(role) && !isIT(role) && role !== 'ADMIN_ASSISTANT'
}

export function canManageEvaluations(role: string | undefined | null): boolean {
  return isAdminOrAbove(role) && !isIT(role)
}

export function canManageSettings(role: string | undefined | null): boolean {
  return isAdministratorOrAbove(role) || isIT(role)
}

export function canManageTickets(role: string | undefined | null): boolean {
  return isAdministratorOrAbove(role) || isIT(role)
}

export function canTriageTickets(role: string | undefined | null): boolean {
  return isManagerOrAbove(role) || role === 'ADMIN_ASSISTANT'
}

export function canMaintainSchedule(role: string | undefined | null): boolean {
  return isManagerOrAbove(role) || role === 'ADMIN_ASSISTANT'
}

/** Human-readable label for a role */
export function getRoleLabel(role: string | undefined | null): string {
  const map: Record<string, string> = {
    OWNER:           'Owner',
    ADMINISTRATOR:   'Administrator',
    IT:              'IT',
    ADMIN_ASSISTANT: 'Administrative Assistant',
    SUPERVISOR:      'Supervisor',
    ADMIN:           'Admin',
    TEAM_MANAGER:    'Team Manager',
    MANAGER:         'Manager',
    STAFF:           'Staff',
    SUPPORT_PLANNER: 'Support Planner',
  }
  return map[role ?? ''] ?? (role ?? 'Unknown')
}
