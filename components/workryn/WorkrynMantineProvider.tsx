'use client'

import { MantineProvider } from '@mantine/core'
import { Notifications } from '@mantine/notifications'
import { workrynTheme } from '@/lib/workryn/theme'

/**
 * Client-side provider for Mantine inside the (workryn) route group.
 *
 * Scope: only mounts on /w/* routes because it's imported by
 * app/(workryn)/layout.tsx. CaseSync routes are completely unaffected.
 *
 * Mode: forced dark to match the deep-navy aesthetic and the rest of the
 * Workryn shell (--bg #0f0f11 in globals.css). Theme switching can be added
 * later if needed.
 */
export default function WorkrynMantineProvider({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <MantineProvider
      theme={workrynTheme}
      defaultColorScheme="dark"
      forceColorScheme="dark"
    >
      <Notifications position="top-right" />
      {children}
    </MantineProvider>
  )
}
