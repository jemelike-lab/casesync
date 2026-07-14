// lib/monitor-access.ts
// Activity Monitor access control (2026-07-13).
//
// The monitor is intentionally NOT role-gated: the org's "owner and
// administrator" (Josh, Bianca) both carry system role `supervisor`, and the
// only `administrator`-role profile is unrelated to this surface. Access is
// an explicit allowlist of profile IDs. DB-level RLS on user_presence keeps
// supervisor/administrator as the outer bound; this list is the tight gate.

export const MONITOR_ALLOWED_IDS: ReadonlySet<string> = new Set([
  'ced7dfd5-23c3-4609-b573-c69ac2bca689', // Josh Evans (owner)
  'f8d3d0d1-ed36-4936-b6a7-66264e61e854', // Bianca Parker (administrator)
])

export function canViewActivityMonitor(userId?: string | null): boolean {
  return Boolean(userId && MONITOR_ALLOWED_IDS.has(userId))
}
