/**
 * Aurora — Workryn's design system.
 *
 * Single source of truth for color tokens, per-route accents,
 * elevation, and motion primitives. Consumed both by Mantine theme
 * overrides (theme.ts) and by raw CSS via the variables emitted
 * into :root by `aurora.css`.
 */

export type AuroraAccent =
  | 'violet'
  | 'cyan'
  | 'coral'
  | 'orange'
  | 'fuchsia'
  | 'sky'
  | 'teal'
  | 'mint'
  | 'indigo'
  | 'slate'
  | 'amber'
  | 'rose'

export const AURORA_ACCENTS: Record<
  AuroraAccent,
  { hex: string; rgb: string; soft: string; bar: string }
> = {
  violet:  { hex: '#7C3AED', rgb: '124,58,237',  soft: 'rgba(124,58,237,0.18)',  bar: 'linear-gradient(90deg, #a855f7, #7C3AED)' },
  cyan:    { hex: '#06B6D4', rgb: '6,182,212',   soft: 'rgba(6,182,212,0.18)',   bar: 'linear-gradient(90deg, #22d3ee, #06B6D4)' },
  coral:   { hex: '#FB7185', rgb: '251,113,133', soft: 'rgba(251,113,133,0.18)', bar: 'linear-gradient(90deg, #fda4af, #FB7185)' },
  orange:  { hex: '#F59E0B', rgb: '245,158,11',  soft: 'rgba(245,158,11,0.18)',  bar: 'linear-gradient(90deg, #fcd34d, #F59E0B)' },
  fuchsia: { hex: '#D946EF', rgb: '217,70,239',  soft: 'rgba(217,70,239,0.18)',  bar: 'linear-gradient(90deg, #f0abfc, #D946EF)' },
  sky:     { hex: '#0EA5E9', rgb: '14,165,233',  soft: 'rgba(14,165,233,0.18)',  bar: 'linear-gradient(90deg, #38bdf8, #0EA5E9)' },
  teal:    { hex: '#14B8A6', rgb: '20,184,166',  soft: 'rgba(20,184,166,0.18)',  bar: 'linear-gradient(90deg, #5eead4, #14B8A6)' },
  mint:    { hex: '#34D399', rgb: '52,211,153',  soft: 'rgba(52,211,153,0.18)',  bar: 'linear-gradient(90deg, #6ee7b7, #10b981)' },
  indigo:  { hex: '#6366F1', rgb: '99,102,241',  soft: 'rgba(99,102,241,0.18)',  bar: 'linear-gradient(90deg, #a5b4fc, #6366F1)' },
  slate:   { hex: '#64748B', rgb: '100,116,139', soft: 'rgba(100,116,139,0.18)', bar: 'linear-gradient(90deg, #94a3b8, #64748B)' },
  amber:   { hex: '#F59E0B', rgb: '245,158,11',  soft: 'rgba(245,158,11,0.18)',  bar: 'linear-gradient(90deg, #fbbf24, #d97706)' },
  rose:    { hex: '#F43F5E', rgb: '244,63,94',   soft: 'rgba(244,63,94,0.18)',   bar: 'linear-gradient(90deg, #fb7185, #F43F5E)' },
}

/**
 * Route → accent mapping. Every Workryn page owns one color from the
 * palette so the Aurora background and active sidebar item can tint
 * to match the page the user is on.
 */
export const ROUTE_ACCENT: Record<string, AuroraAccent> = {
  '/w/dashboard':   'violet',
  '/w/time-clock':  'cyan',
  '/w/tasks':       'coral',
  '/w/tickets':     'orange',
  '/w/evaluations': 'fuchsia',
  '/w/schedule':    'sky',
  '/w/pto':         'teal',
  '/w/training':    'mint',
  '/w/departments': 'indigo',
  '/w/profile':     'violet',
  '/w/settings':    'slate',
  '/w/admin':       'amber',
  '/w/benefits':    'rose',
}

export function accentForPath(pathname: string | null | undefined): AuroraAccent {
  if (!pathname) return 'violet'
  // Match the longest prefix
  const match = Object.keys(ROUTE_ACCENT)
    .filter((p) => pathname === p || pathname.startsWith(p + '/'))
    .sort((a, b) => b.length - a.length)[0]
  return ROUTE_ACCENT[match ?? '/w/dashboard'] ?? 'violet'
}

/** Background canvas color — the base behind the Aurora glow. */
export const AURORA_CANVAS = '#070912'

/** Glass surface tokens. */
export const GLASS = {
  card:    'rgba(15, 23, 42, 0.55)',
  sidebar: 'rgba(11, 15, 30, 0.72)',
  topbar:  'rgba(11, 15, 30, 0.62)',
  hover:   'rgba(124, 58, 237, 0.08)',
  border:  'rgba(124, 58, 237, 0.18)',
  borderStrong: 'rgba(124, 58, 237, 0.35)',
}

/** Layered shadows for elevation. */
export const SHADOW = {
  card:   '0 14px 40px -16px rgba(0,0,0,0.7), 0 0 1px rgba(255,255,255,0.05) inset',
  raised: '0 24px 60px -20px rgba(124,58,237,0.45), 0 0 1px rgba(255,255,255,0.06) inset',
  pill:   '0 6px 18px rgba(124,58,237,0.40)',
}
