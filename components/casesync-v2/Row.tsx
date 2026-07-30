'use client'

// =========================================================================
// Row primitives — shared building blocks for v2 SectionPaper sections.
//
// Four row flavors (TextRow / DateRow / BooleanRow / PercentRow) sharing
// one HoverPopover. Every row colorizes its icon+label with an identity
// hue, and reveals a dark popover on hover with row-appropriate context:
//   - DateRow:    urgency status + big "Nd overdue/left" + action prompt
//   - TextRow:    "ON RECORD" label + value
//   - BooleanRow: "COMPLETED"/"PENDING" + Yes/No + action prompt if pending
//   - PercentRow: "ON TRACK"/"MID RANGE"/"NEEDS ATTENTION" + % + prompt
//
// This is the standard "what's the status of this field?" surface — used
// for Deadlines, Contact & visits, Plans & assessments, and every future
// extracted section.
// =========================================================================

import { useState } from 'react'
import { Box, Text } from '@mantine/core'
import type { LucideIcon } from 'lucide-react'
import { type StatusLevel, getDateStatus, formatDate, isNeverExpires, URGENCY_LABELS, URGENCY_COLORS_RGB } from '@/lib/types'

// -------------------------------------------------------------------------
// Chip palette (status chip in the row body, same as Deadlines).
// -------------------------------------------------------------------------
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

function longDaysText(n: number): string {
  if (n < 0)  return `${Math.abs(n)}d overdue`
  if (n === 0) return 'Due today'
  return `${n}d left`
}

function shortDaysText(n: number): string {
  if (n < 0)  return `${Math.abs(n)}d over`
  if (n === 0) return 'today'
  return `${n}d left`
}

function baseStyle(isLast: boolean, columns: string): React.CSSProperties {
  return {
    display: 'grid',
    gridTemplateColumns: columns,
    gap: 12,
    alignItems: 'center',
    padding: '12px 0',
    borderBottom: isLast ? 'none' : '0.5px solid var(--v2-border-soft)',
    position: 'relative',
  }
}

// -------------------------------------------------------------------------
// HoverPopover — shared dark-bubble tooltip used by every row type.
// -------------------------------------------------------------------------
interface HoverPopoverProps {
  visible: boolean
  kindLabel: string
  kindColor: string
  bigText: string
  subtitle: string
  cta?: string
  ctaColor?: string
}

function HoverPopover({ visible, kindLabel, kindColor, bigText, subtitle, cta, ctaColor }: HoverPopoverProps) {
  if (!visible) return null
  return (
    <Box
      style={{
        position: 'absolute',
        top: 'calc(100% + 6px)',
        left: 16,
        background: 'linear-gradient(135deg, #1a1e2e, #141824)',
        border: '1px solid rgba(255,255,255,0.12)',
        borderRadius: 12,
        padding: '12px 16px',
        minWidth: 220,
        maxWidth: 300,
        boxShadow: '0 12px 40px rgba(0,0,0,0.5)',
        zIndex: 200,
        pointerEvents: 'none',
      }}
    >
      <Box style={{
        position: 'absolute',
        top: -5,
        left: 24,
        width: 10,
        height: 10,
        background: '#1a1e2e',
        border: '1px solid rgba(255,255,255,0.12)',
        borderBottom: 'none',
        borderRight: 'none',
        transform: 'rotate(45deg)',
      }} />
      <Text fz={11} fw={600} c={kindColor} style={{ textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>
        {kindLabel}
      </Text>
      <Text fz={20} fw={600} c="#fff" style={{ letterSpacing: '-0.02em' }}>
        {bigText}
      </Text>
      <Text fz={11} c="rgba(200,210,230,0.5)" mt={4}>
        {subtitle}
      </Text>
      {cta && (
        <Text fz={11} c={ctaColor || '#ff453a'} fw={600} mt={8}>
          {cta}
        </Text>
      )}
    </Box>
  )
}

interface BaseProps {
  Icon: LucideIcon
  color: string
  label: string
  isLast?: boolean
}

// -------------------------------------------------------------------------
// TextRow
// -------------------------------------------------------------------------
export function TextRow({ Icon, color, label, value, isLast = false }: BaseProps & { value: string | null | undefined }) {
  const [hovered, setHovered] = useState(false)
  if (!value) return null
  return (
    <Box
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={baseStyle(isLast, '20px 1fr auto')}
    >
      <Icon size={17} style={{ color, flexShrink: 0 }} strokeWidth={2.25} />
      <Text fz={14} fw={600} style={{ color, letterSpacing: '-0.005em' }}>{label}</Text>
      <Text fz={13} fw={600} c="var(--v2-text)">{value}</Text>
      <HoverPopover
        visible={hovered}
        kindLabel="On record"
        kindColor="#60a5fa"
        bigText={value}
        subtitle={label}
      />
    </Box>
  )
}

// -------------------------------------------------------------------------
// DateRow — same look + popover as legacy Deadlines DateTile.
// -------------------------------------------------------------------------
export function DateRow({ Icon, color, label, value, isLast = false }: BaseProps & { value: string | null | undefined }) {
  const [hovered, setHovered] = useState(false)
  if (!value) return null
  const status = getDateStatus(value)
  const chip = CHIP[status]
  const days = daysFromToday(value)
  const isUrgent = status === 'critical' || status === 'red' || status === 'orange'
  const isOverdue = status === 'critical' || status === 'red'
  const dateColor = isUrgent ? '#DC2626' : '#16A34A'

  return (
    <Box
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={baseStyle(isLast, '20px 1fr auto auto')}
    >
      <Icon size={17} style={{ color, flexShrink: 0 }} strokeWidth={2.25} />
      <Text fz={14} fw={600} style={{ color, letterSpacing: '-0.005em' }}>{label}</Text>
      <Text fz={12} fw={600} style={{ color: dateColor, fontVariantNumeric: 'tabular-nums' }}>
        {formatDate(value.split('T')[0])}
      </Text>
      <Box style={{
        background: chip.bg, color: chip.fg,
        fontSize: 10, fontWeight: 600,
        padding: '3px 8px', borderRadius: 4,
        minWidth: 64, textAlign: 'center',
        fontVariantNumeric: 'tabular-nums', letterSpacing: '0.01em',
      }}>
        {isNeverExpires(value) ? 'No end date' : shortDaysText(days)}
      </Box>
      <HoverPopover
        visible={hovered}
        kindLabel={isNeverExpires(value) ? 'No end date' : URGENCY_LABELS[status]}
        kindColor={`rgb(${URGENCY_COLORS_RGB[status]})`}
        bigText={isNeverExpires(value) ? 'No end date' : longDaysText(days)}
        subtitle={`${label} ${'·'} ${formatDate(value.split('T')[0])}`}
        cta={isOverdue ? '⚡ Action needed — update this date' : undefined}
      />
    </Box>
  )
}

// -------------------------------------------------------------------------
// EventRow — a date describing something that ALREADY HAPPENED (a completed
// visit, a signed form). Never scored as a deadline; always renders neutral.
// DateRow stays for dates that are genuinely due.
// -------------------------------------------------------------------------
export function EventRow({ Icon, color, label, value, isLast = false }: BaseProps & { value: string | null | undefined }) {
  const [hovered, setHovered] = useState(false)
  if (!value) return null
  const days = daysFromToday(value)
  const agoText = days === 0 ? 'today' : days < 0 ? `${Math.abs(days)}d ago` : `in ${days}d`

  return (
    <Box
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={baseStyle(isLast, '20px 1fr auto auto')}
    >
      <Icon size={17} style={{ color, flexShrink: 0 }} strokeWidth={2.25} />
      <Text fz={14} fw={600} style={{ color, letterSpacing: '-0.005em' }}>{label}</Text>
      <Text fz={12} fw={600} style={{ color: '#475569', fontVariantNumeric: 'tabular-nums' }}>
        {formatDate(value.split('T')[0])}
      </Text>
      <Box style={{
        background: CHIP.none.bg, color: CHIP.none.fg,
        fontSize: 10, fontWeight: 600,
        padding: '3px 8px', borderRadius: 4,
        minWidth: 64, textAlign: 'center',
        fontVariantNumeric: 'tabular-nums', letterSpacing: '0.01em',
      }}>
        {agoText}
      </Box>
      <HoverPopover
        visible={hovered}
        kindLabel="On record"
        kindColor="rgb(99,115,129)"
        bigText={agoText}
        subtitle={`${label} · ${formatDate(value.split('T')[0])}`}
      />
    </Box>
  )
}

// -------------------------------------------------------------------------
// BooleanRow
// -------------------------------------------------------------------------
export function BooleanRow({ Icon, color, label, value, isLast = false }: BaseProps & { value: boolean | null | undefined }) {
  const [hovered, setHovered] = useState(false)
  if (value === null || value === undefined) return null
  const pill = value
    ? { bg: '#EAF3DE', fg: '#27500A', text: 'Yes' }
    : { bg: '#F1F5F9', fg: '#475569', text: 'No' }
  const kindLabel = value ? 'Completed' : 'Pending'
  const kindColor = value ? 'rgb(48,209,88)' : 'rgb(255,159,10)'

  return (
    <Box
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={baseStyle(isLast, '20px 1fr auto')}
    >
      <Icon size={17} style={{ color, flexShrink: 0 }} strokeWidth={2.25} />
      <Text fz={14} fw={600} style={{ color, letterSpacing: '-0.005em' }}>{label}</Text>
      <Box style={{
        background: pill.bg, color: pill.fg,
        fontSize: 11, fontWeight: 600,
        padding: '3px 10px', borderRadius: 4,
        letterSpacing: '0.02em',
      }}>
        {pill.text}
      </Box>
      <HoverPopover
        visible={hovered}
        kindLabel={kindLabel}
        kindColor={kindColor}
        bigText={value ? 'Yes' : 'No'}
        subtitle={label}
        cta={!value ? '⚠ Mark complete when finished' : undefined}
        ctaColor={!value ? '#ff9f0a' : undefined}
      />
    </Box>
  )
}

// -------------------------------------------------------------------------
// PercentRow
// -------------------------------------------------------------------------
export function PercentRow({ Icon, color, label, value, isLast = false }: BaseProps & { value: number | null | undefined }) {
  const [hovered, setHovered] = useState(false)
  if (value === null || value === undefined) return null
  const pctColor = value >= 80 ? '#16A34A' : value >= 50 ? '#D97706' : '#DC2626'
  const kindLabel = value >= 80 ? 'On track' : value >= 50 ? 'Mid range' : 'Needs attention'
  const kindRgb   = value >= 80 ? '48,209,88' : value >= 50 ? '255,159,10' : '255,69,58'
  const lowGoal   = value < 50

  return (
    <Box
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={baseStyle(isLast, '20px 1fr auto')}
    >
      <Icon size={17} style={{ color, flexShrink: 0 }} strokeWidth={2.25} />
      <Text fz={14} fw={600} style={{ color, letterSpacing: '-0.005em' }}>{label}</Text>
      <Text fz={14} fw={700} style={{ color: pctColor, fontVariantNumeric: 'tabular-nums' }}>
        {value}%
      </Text>
      <HoverPopover
        visible={hovered}
        kindLabel={kindLabel}
        kindColor={`rgb(${kindRgb})`}
        bigText={`${value}%`}
        subtitle={label}
        cta={lowGoal ? '⚡ Action needed — review progress' : undefined}
      />
    </Box>
  )
}
