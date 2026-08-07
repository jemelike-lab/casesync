'use client'

// =========================================================================
// SectionPaper — v2 primitive (bolder title revision)
// =========================================================================

import { Paper, Group, Stack, Text } from '@mantine/core'
import type { ReactNode } from 'react'

interface SectionPaperProps {
  title: string
  subtitle?: string
  action?: ReactNode
  children: ReactNode
  bare?: boolean
}

export default function SectionPaper({ title, subtitle, action, children, bare = false }: SectionPaperProps) {
  return (
    <Paper
      radius={12}
      style={{
        background: 'var(--v2-surface)',
        border: '0.5px solid var(--v2-border-soft)',
        padding: bare ? 0 : '18px 20px',
        marginBottom: 14,
      }}
    >
      <Group justify="space-between" align="baseline" mb={subtitle ? 14 : 12} wrap="nowrap">
        <Stack gap={2} style={{ minWidth: 0 }}>
          <Text fz={16} fw={600} c="var(--v2-text)" style={{ letterSpacing: '-0.015em' }}>
            {title}
          </Text>
          {subtitle && (
            <Text fz={12} fw={500} c="var(--v2-text-muted)">
              {subtitle}
            </Text>
          )}
        </Stack>
        {action && <div style={{ flexShrink: 0 }}>{action}</div>}
      </Group>
      {children}
    </Paper>
  )
}

/**
 * SectionEmpty — the one-line body an otherwise-empty section renders instead
 * of disappearing (Josh 08-07, option 1A). Sections used to `return null`
 * when they had no data, so on sparse clients the page simply ended early and
 * planners reported "the rest of the sections aren't viewable". Every section
 * now always renders; this is what an empty one shows.
 */
export function SectionEmpty({ text }: { text: string }) {
  return (
    <Text fz={13} c="var(--v2-text-muted)" style={{ paddingTop: 2 }}>
      {text}
    </Text>
  )
}
