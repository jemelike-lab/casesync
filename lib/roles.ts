import type { Role } from '@/lib/types'

// Org-wide, PHI-bearing access (all clients, reports, dashboards, case-AI).
// IT is deliberately NOT here: IT administers the system, not client data
// (HIPAA minimum-necessary). IT's panel access is gated by canAccessAdmin below.
export function isSupervisorLike(role?: string | null): role is Role {
  return role === 'supervisor' || role === 'administrator'
}

// System administration surfaces (admin panel, audit log, ops status).
// Includes IT — this is the access IT legitimately needs.
export function canAccessAdmin(role?: string | null): role is Role {
  return role === 'supervisor' || role === 'administrator' || role === 'it'
}

export function canManageTeam(role?: string | null): role is Role {
  return role === 'team_manager' || role === 'supervisor' || role === 'administrator'
}

export function getRoleLabel(role?: string | null): string {
  if (role === 'support_planner' || role === 'supports_planner') return 'Support Planner'
  if (role === 'team_manager') return 'Team Manager'
  if (role === 'supervisor') return 'Supervisor'
  if (role === 'administrator') return 'Administrator'
  if (role === 'it') return 'IT'
  if (role === 'admin_assistant') return 'Administrative Assistant'
  return (role ?? '').replace(/_/g, ' ')
}

export function getRoleColor(role?: string | null): string {
  if (role === 'support_planner' || role === 'supports_planner') return '#30d158'
  if (role === 'team_manager') return '#007aff'
  if (role === 'supervisor') return '#ff453a'
  if (role === 'administrator') return '#ff9f0a'
  if (role === 'it') return '#bf5af2'
  if (role === 'admin_assistant') return '#5e5ce6'
  return '#98989d'
}
