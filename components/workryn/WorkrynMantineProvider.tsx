'use client'

import { MantineProvider } from '@mantine/core'
import { Notifications } from '@mantine/notifications'
import { workrynTheme } from '@/lib/workryn/theme'
import { useTheme } from './ThemeProvider'

/**
 * Client-side provider for Mantine inside the (workryn) route group.
 *
 * Scope: only mounts on /w/* routes because it's imported by
 * app/(workryn)/layout.tsx. CaseSync routes are completely unaffected.
 *
 * Mode: bound to the ThemeProvider's resolved theme so Mantine's
 * built-in semantic colors (c="dimmed", default Title/Text colors,
 * Card surface, etc.) match the user's chosen light/dark mode. Without
 * this, every Mantine component renders with dark-mode colors regardless
 * of data-theme — which is why stat-card labels, panel headers, and
 * subtitles were invisible on light mode.
 */
export default function WorkrynMantineProvider({
  children,
}: {
  children: React.ReactNode
}) {
  const { resolved } = useTheme()

  return (
    <MantineProvider
      theme={workrynTheme}
      defaultColorScheme={resolved}
      forceColorScheme={resolved}
    >
      <Notifications position="top-right" />
      {children}
    </MantineProvider>
  )
}
