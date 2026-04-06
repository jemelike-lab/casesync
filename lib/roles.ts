import type { Role } from '@/lib/types'

export function isSupervisorLike(role?: string | null): role is Role {
  return role === 'supervisor' || role === 'it'
}

export function canManageTeam(role?: string | null): role is Role {
  return role === 'team_manager' || role === 'supervisor' || role === 'it'
}

export function getRoleLabel(role?: string | null): string {
  if (role === 'supports_planner') return 'Supports Planner'
  if (role === 'team_manager') return 'Team Manager'
  if (role === 'supervisor') return 'Supervisor'
  if (role === 'it') return 'IT'
  return (role ?? '').replace(/_/g, ' ')
}

export function getRoleColor(role?: string | null): string {
  if (role === 'supports_planner') return '#30d158'
  if (role === 'team_manager') return '#007aff'
  if (role === 'supervisor') return '#ff453a'
  if (role === 'it') return '#bf5af2'
  return '#98989d'
}
