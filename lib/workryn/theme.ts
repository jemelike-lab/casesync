'use client'

import { createTheme, type MantineColorsTuple } from '@mantine/core'

/**
 * Workryn visual identity — "Energetic Product"
 * Distinct from CaseSync's clinical/utility palette.
 *
 *   Primary  : electric violet  #7C3AED (Mantine shade 6)
 *   Accent   : coral             #FB7185 (Mantine shade 5)
 *   Success  : mint              #34D399 (Mantine shade 5)
 *   Surface  : deep navy         #0F172A (handled via colorScheme="dark")
 *
 * Typography: Geist Sans throughout (loaded via `geist/font/sans` in the
 * Workryn route group; exposed as `--font-geist-sans`).
 */

const violet: MantineColorsTuple = [
  '#f3edff',
  '#ddd2ff',
  '#b8a3ff',
  '#9173ff',
  '#7048ff',
  '#5b2dfe',
  '#7C3AED', // 6 — primary
  '#5a18d4',
  '#4a0fb8',
  '#3c059e',
]

const coral: MantineColorsTuple = [
  '#fff0f3',
  '#ffdde2',
  '#ffb1bd',
  '#ff8196',
  '#FB7185', // 4 — accent
  '#f15068',
  '#e23a55',
  '#c82a48',
  '#a91f3c',
  '#8e1631',
]

const mint: MantineColorsTuple = [
  '#e6fff6',
  '#ccfaea',
  '#9bf2d3',
  '#65eaba',
  '#34D399', // 4 — success
  '#1ec183',
  '#10a36e',
  '#02855b',
  '#006c4a',
  '#005a3d',
]

export const workrynTheme = createTheme({
  primaryColor: 'violet',
  primaryShade: { light: 6, dark: 6 },
  colors: {
    violet,
    coral,
    mint,
  },
  fontFamily:
    'var(--font-geist-sans), -apple-system, BlinkMacSystemFont, system-ui, sans-serif',
  fontFamilyMonospace:
    'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace',
  headings: {
    fontFamily:
      'var(--font-geist-sans), -apple-system, BlinkMacSystemFont, system-ui, sans-serif',
    fontWeight: '600',
  },
  defaultRadius: 'md',
  cursorType: 'pointer',
  autoContrast: true,
  components: {
    Button: {
      defaultProps: {
        radius: 'md',
      },
    },
    Card: {
      defaultProps: {
        radius: 'lg',
        withBorder: true,
      },
    },
    Paper: {
      defaultProps: {
        radius: 'lg',
      },
    },
  },
})
