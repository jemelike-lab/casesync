/**
 * Centralized permission helpers for the role system.
 *
 * Role hierarchy (highest → lowest):
 *   OWNER   — top-level, can do everything including create/promote owners
 *   ADMIN   — full admin access, but cannot create OWNER accounts
 *   MANAGER — supervisor; can only create STAFF accounts
 *   STAFF   — regular agent; cannot create accounts
 */

export type Role = 'OWNER' | 'ADMIN' | 'MANAGER' | 'STAFF'

export const ROLES: Role[] = ['OWNER', 'ADMIN', 'MANAGER', 'STAFF']

/** Numeric weight for comparison (higher = more privileged). */
const ROLE_WEIGHT: Record<Role, number> = {
  OWNER: 4,
  ADMIN: 3,
  MANAGER: 2,
  STAFF: 1,
}

export function isRole(value: unknown): value is Role {
  return typeof value === 'string' && (ROLES as string[]).includes(value)
}

export function isOwner(role: string | undefined | null): boolean {
  return role === 'OWNER'
}

export function isAdminOrAbove(role: string | undefined | null): boolean {
  return role === 'OWNER' || role === 'ADMIN'
}

export function isManagerOrAbove(role: string | undefined | null): boolean {
  return role === 'OWNER' || role === 'ADMIN' || role === 'MANAGER'
}

/** True if `actor` outranks `target`. Used for edits/deletes. */
export function outranks(actor: string | undefined | null, target: string | undefined | null): boolean {
  if (!isRole(actor) || !isRole(target)) return false
  return ROLE_WEIGHT[actor] > ROLE_WEIGHT[target]
}

/**
 * Returns the list of roles that `actor` is allowed to assign when creating
 * or inviting another user.
 *
 *   OWNER   → OWNER, ADMIN, MANAGER, STAFF
 *   ADMIN   → ADMIN, MANAGER, STAFF
 *   MANAGER → STAFF
 *   STAFF   → []
 */
export function assignableRoles(actorRole: string | undefined | null): Role[] {
  switch (actorRole) {
    case 'OWNER':
      return ['OWNER', 'ADMIN', 'MANAGER', 'STAFF']
    case 'ADMIN':
      return ['ADMIN', 'MANAGER', 'STAFF']
    case 'MANAGER':
      return ['STAFF']
    default:
      return []
  }
}

/** Server-side check before creating/inviting a user with a given role. */
export function canCreateRole(actorRole: string | undefined | null, targetRole: string): boolean {
  return assignableRoles(actorRole).includes(targetRole as Role)
}

/** Whether the actor can manage (edit/delete/disable) the target user. */
export function canManageUser(actorRole: string | undefined | null, targetRole: string | undefined | null): boolean {
  if (!isRole(actorRole) || !isRole(targetRole)) return false
  // OWNER can manage anyone (including other owners — guarded separately for last-owner protection)
  if (actorRole === 'OWNER') return true
  // ADMIN can manage anyone except OWNER
  if (actorRole === 'ADMIN') return targetRole !== 'OWNER'
  // MANAGER can only manage STAFF
  if (actorRole === 'MANAGER') return targetRole === 'STAFF'
  return false
}

/** Whether the user can see all department workspaces (vs only their own). */
export function canSeeAllDepartments(role: string | undefined | null): boolean {
  return isManagerOrAbove(role)
}
