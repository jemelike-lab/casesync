'use client'

// =========================================================================
// SectionPaper
//
// v2 primitive — the standard chrome for an extracted client-detail section.
// White surface, soft border, sentence-case title, optional muted subtitle,
// optional right-aligned action slot (e.g. "View all", "Add note").
//
// Surface tokens flip in dark mode automatically.
// =========================================================================

import { Paper, Group, Stack, Text } from '@mantine/core'
import type { ReactNode } from 'react'

interface SectionPaperProps {
  title: string
  subtitle?: string
  action?: ReactNode
  children: ReactNode
  /** drop the standard inner padding (rare — for sections that own their own padding) */
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
          <Text fz={15} fw={500} c="var(--v2-text)" style={{ letterSpacing: '-0.01em' }}>
            {title}
          </Text>
          {subtitle && (
            <Text fz={12} c="var(--v2-text-muted)">
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
