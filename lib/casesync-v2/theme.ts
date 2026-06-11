// CaseSync v2 — Mantine theme.
// Mirrors lib/workryn/theme.ts pattern so the same design tokens shape applies
// across both apps in the repo, but with CaseFox-inspired light-mode-first colors.
//
// Used only by routes under app/dashboard-v2 (and future v2 routes) via
// CaseSyncV2MantineProvider. Does NOT touch globals.css or affect legacy routes.

import { createTheme, type MantineColorsTuple } from '@mantine/core';

// ===== Color tuples =====
// Mantine expects 10-shade tuples (50, 100, ..., 900 roughly).
// Index 6 is the default "primary" shade used for buttons, links, etc.

// Vivid cobalt — the topbar, primary buttons, links, "Active Clients" KPI.
const cobalt: MantineColorsTuple = [
  '#EFF6FF', // 0
  '#DBEAFE', // 1
  '#BFDBFE', // 2
  '#93C5FD', // 3
  '#60A5FA', // 4
  '#3D8FFF', // 5
  '#1E7CFF', // 6  ← primary
  '#1A6FEB', // 7
  '#1659C7', // 8
  '#0F3F8F', // 9
];

// Coral — "Overdue" KPI, urgent rows, danger.
const coral: MantineColorsTuple = [
  '#FFF1F3',
  '#FFE0E5',
  '#FFC1CC',
  '#FF95A8',
  '#FF6680',
  '#FF4060',
  '#FF3B5C', // ← primary coral
  '#E63350',
  '#BF2942',
  '#8C1E30',
];

// Amber — "Due This Week" KPI, warning rows.
const amber: MantineColorsTuple = [
  '#FFF8EB',
  '#FFEFC9',
  '#FFE19A',
  '#FFD065',
  '#FFC03B',
  '#FFB121',
  '#FFA940', // ← primary amber (matches CaseFox amber tile)
  '#F59E0B',
  '#C97F08',
  '#8F5A05',
];

// Emerald — "On Track" / success KPI, completed audit rows.
const emerald: MantineColorsTuple = [
  '#ECFDF5',
  '#D1FAE5',
  '#A7F3D0',
  '#6EE7B7',
  '#34D399',
  '#1AC78A',
  '#10B981', // ← primary emerald
  '#059669',
  '#047857',
  '#064E3B',
];

// Mauve — borders, muted text, soft canvas tones (CaseFox lavender feel).
const mauve: MantineColorsTuple = [
  '#FAF7FD',
  '#F4ECFB',
  '#EDE5F6',
  '#E0D4ED',
  '#C9B8DC',
  '#A89AC0',
  '#8273A0',
  '#5D517E',
  '#3F365A',
  '#241E37',
];

// ===== Theme =====

export const casesyncV2Theme = createTheme({
  primaryColor: 'cobalt',
  primaryShade: { light: 6, dark: 5 },
  colors: {
    cobalt,
    coral,
    amber,
    emerald,
    mauve,
  },
  // Reuse the Geist sans already loaded by the root layout — keeps perceived
  // typography consistent with the rest of the app.
  fontFamily:
    'var(--font-geist-sans), -apple-system, BlinkMacSystemFont, system-ui, sans-serif',
  fontFamilyMonospace:
    'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace',
  headings: {
    fontFamily:
      'var(--font-geist-sans), -apple-system, BlinkMacSystemFont, system-ui, sans-serif',
    fontWeight: '700',
  },
  defaultRadius: 'md',
  cursorType: 'pointer',
  autoContrast: true,

  // Per-component defaults reproduce the CaseFox card language: clean white
  // surfaces, generous radius, no border — soft shadow does the separation.
  components: {
    Button: {
      defaultProps: {
        radius: 'md',
      },
    },
    Card: {
      defaultProps: {
        radius: 'lg', // 16px
        withBorder: false,
        shadow: 'sm',
      },
    },
    Paper: {
      defaultProps: {
        radius: 'lg',
        withBorder: false,
        shadow: 'sm',
      },
    },
    Badge: {
      defaultProps: {
        radius: 'sm',
      },
    },
  },

  // Surface tokens consumed by components via `var(--mantine-color-*)`.
  // Index 0 = lightest canvas, used as page background gradient base.
  other: {
    canvasGradient:
      'linear-gradient(160deg, #EEF2FC 0%, #F4ECFB 60%, #EDE9FB 100%)',
    surface: '#FFFFFF',
    surfaceMuted: '#F8FAFD',
    border: '#E5E7EB',
    textPrimary: '#0F172A',
    textSecondary: '#64748B',
    shadowSm: '0 1px 2px rgba(15,23,42,0.04), 0 2px 6px rgba(15,23,42,0.04)',
    shadowMd: '0 4px 12px rgba(15,23,42,0.06), 0 8px 24px rgba(15,23,42,0.06)',
    shadowVivid: '0 10px 30px -10px rgba(30,124,255,0.35)',
  },
});
