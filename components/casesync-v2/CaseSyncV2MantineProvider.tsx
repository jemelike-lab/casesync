'use client';

// CaseSync v2 — Mantine provider for /dashboard-v2 (and future v2 routes).
// Mirrors components/workryn/WorkrynMantineProvider.tsx. We force light mode
// because the CaseFox-inspired visual language is light-mode-first; dark mode
// support is a later pass once the look is locked.

import { MantineProvider, ColorSchemeScript } from '@mantine/core';
import { casesyncV2Theme } from '@/lib/casesync-v2/theme';
import '@mantine/core/styles.css';
import '@mantine/charts/styles.css';

interface Props {
  children: React.ReactNode;
}

export default function CaseSyncV2MantineProvider({ children }: Props) {
  return (
    <>
      <ColorSchemeScript forceColorScheme="light" />
      <MantineProvider theme={casesyncV2Theme} forceColorScheme="light">
        {children}
      </MantineProvider>
    </>
  );
}
