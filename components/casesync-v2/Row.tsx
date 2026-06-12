'use client'

// =========================================================================
// Row primitives — shared building blocks for v2 SectionPaper sections.
//
// Four flavors (TextRow / DateRow / BooleanRow / PercentRow), all sharing
// the same colorized icon+label visual pattern: distinct identity color on
// both the icon and the label, semibold weight, right-aligned value.
// =========================================================================

import { Box, Text } from '@mantine/core'
import type { LucideIcon } from 'lucide-react'
import { type StatusLevel, getDateStatus, formatDate } from '@/lib/types'

// Chip palette — same as Deadlines (soft fill + dark text from same hue).
const CHIP: Record<StatusLevel, { bg: string; fg: string }> = {
  critical: { bg: '#FCEBEB', fg: '#791F1F' },
  red:      { bg: '#FCEBEB', fg: '#791F1F' },
  orange:   { bg: '#FAEEDA', fg: '#633806' },
  yellow:   { bg: '#FEF3C7', fg: '#92400E' },
  green:    { bg: '#EAF3DE', fg: '#27500A' },
  none:     { bg: '#F1F5F9', fg: '#475569' },
}

function daysFromToday(dateStr: string): number {
  const [y, m, d] = dateStr.split('T')[0].split('-').map(Number)
  const target = new Date(y, m - 1, d).getTime()
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  return Math.round((target - today) / 86_400_000)
}

function shortDaysText(n: number): string {
  if (n < 0)  return `${Math.abs(n)}d over`
  if (n === 0) return 'today'
  return `${n}d left`
}

function baseStyle(isLast: boolean): React.CSSProperties {
  return {
    display: 'grid',
    gap: 12,
    alignItems: 'center',
    padding: '12px 0',
    borderBottom: isLast ? 'none' : '0.5px solid var(--v2-border-soft)',
  }
}

interface BaseProps {
  Icon: LucideIcon
  color: string
  label: string
  isLast?: boolean
}

// -------------------------------------------------------------------------
// TextRow — for select / freeform-text fields (e.g. "Phone", "Pending")
// -------------------------------------------------------------------------
export function TextRow({ Icon, color, label, value, isLast = false }: BaseProps & { value: string | null | undefined }) {
  if (!value) return null
  return (
    <Box style={{ ...baseStyle(isLast), gridTemplateColumns: '20px 1fr auto' }}>
      <Icon size={17} style={{ color, flexShrink: 0 }} strokeWidth={2.25} />
      <Text fz={14} fw={600} style={{ color, letterSpacing: '-0.005em' }}>{label}</Text>
      <Text fz={13} fw={600} c="var(--v2-text)">{value}</Text>
    </Box>
  )
}

// -------------------------------------------------------------------------
// DateRow — same look as Deadlines rows: date with urgency color + chip
// -------------------------------------------------------------------------
export function DateRow({ Icon, color, label, value, isLast = false }: BaseProps & { value: string | null | undefined }) {
  if (!value) return null
  const status = getDateStatus(value)
  const chip = CHIP[status]
  const days = daysFromToday(value)
  const isUrgent = status === 'critical' || status === 'red' || status === 'orange'
  const dateColor = isUrgent ? '#DC2626' : '#16A34A'

  return (
    <Box style={{ ...baseStyle(isLast), gridTemplateColumns: '20px 1fr auto auto' }}>
      <Icon size={17} style={{ color, flexShrink: 0 }} strokeWidth={2.25} />
      <Text fz={14} fw={600} style={{ color, letterSpacing: '-0.005em' }}>{label}</Text>
      <Text fz={12} fw={600} style={{ color: dateColor, fontVariantNumeric: 'tabular-nums' }}>
        {formatDate(value.split('T')[0])}
      </Text>
      <Box style={{
        background: chip.bg,
        color: chip.fg,
        fontSize: 10,
        fontWeight: 600,
        padding: '3px 8px',
        borderRadius: 4,
        minWidth: 64,
        textAlign: 'center',
        fontVariantNumeric: 'tabular-nums',
        letterSpacing: '0.01em',
      }}>
        {shortDaysText(days)}
      </Box>
    </Box>
  )
}

// -------------------------------------------------------------------------
// BooleanRow — Yes/No pill (green / gray)
// -------------------------------------------------------------------------
export function BooleanRow({ Icon, color, label, value, isLast = false }: BaseProps & { value: boolean | null | undefined }) {
  if (value === null || value === undefined) return null
  const pill = value
    ? { bg: '#EAF3DE', fg: '#27500A', text: 'Yes' }
    : { bg: '#F1F5F9', fg: '#475569', text: 'No' }
  return (
    <Box style={{ ...baseStyle(isLast), gridTemplateColumns: '20px 1fr auto' }}>
      <Icon size={17} style={{ color, flexShrink: 0 }} strokeWidth={2.25} />
      <Text fz={14} fw={600} style={{ color, letterSpacing: '-0.005em' }}>{label}</Text>
      <Box style={{
        background: pill.bg,
        color: pill.fg,
        fontSize: 11,
        fontWeight: 600,
        padding: '3px 10px',
        borderRadius: 4,
        letterSpacing: '0.02em',
      }}>
        {pill.text}
      </Box>
    </Box>
  )
}

// -------------------------------------------------------------------------
// PercentRow — bold percentage colored by threshold (red / amber / green)
// -------------------------------------------------------------------------
export function PercentRow({ Icon, color, label, value, isLast = false }: BaseProps & { value: number | null | undefined }) {
  if (value === null || value === undefined) return null
  const pctColor = value >= 80 ? '#16A34A' : value >= 50 ? '#D97706' : '#DC2626'
  return (
    <Box style={{ ...baseStyle(isLast), gridTemplateColumns: '20px 1fr auto' }}>
      <Icon size={17} style={{ color, flexShrink: 0 }} strokeWidth={2.25} />
      <Text fz={14} fw={600} style={{ color, letterSpacing: '-0.005em' }}>{label}</Text>
      <Text fz={14} fw={700} style={{ color: pctColor, fontVariantNumeric: 'tabular-nums' }}>
        {value}%
      </Text>
    </Box>
  )
}
