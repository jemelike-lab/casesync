'use client'

// =========================================================================
// Deadlines — Phase A section
//
// Replaces the legacy DateTile grid in ClientEditForm with a table-style
// SectionPaper layout. Per-row hover popover preserved from the legacy
// (dark gradient bubble with CRITICAL/DUE SOON/ON TRACK label, big days
// count, label · formatted date, and a red "Action needed" line when
// the deadline is overdue).
//
// Filters out deadlines with no date set so the section only shows what
// has actually been entered for this client.
// =========================================================================

import { useState } from 'react'
import { Box, Stack, Text } from '@mantine/core'
import {
  Calendar, Clock, FileText, Shield, Phone, Briefcase, FileCheck,
  type LucideIcon,
} from 'lucide-react'
import SectionPaper from '../SectionPaper'
import {
  type Client,
  type StatusLevel,
  getDateStatus,
  formatDate,
  URGENCY_LABELS,
  URGENCY_COLORS_RGB,
} from '@/lib/types'

// -------------------------------------------------------------------------
// Chip palette — soft fill + dark text from the same hue family.
// These don't flip in dark mode; status meaning is uniform across modes.
// -------------------------------------------------------------------------
const CHIP: Record<StatusLevel, { bg: string; fg: string }> = {
  critical: { bg: '#FCEBEB', fg: '#791F1F' },
  red:      { bg: '#FCEBEB', fg: '#791F1F' },
  orange:   { bg: '#FAEEDA', fg: '#633806' },
  yellow:   { bg: '#FEF3C7', fg: '#92400E' },
  green:    { bg: '#EAF3DE', fg: '#27500A' },
  none:     { bg: '#F1F5F9', fg: '#475569' },
}

// -------------------------------------------------------------------------
// Tracked deadlines (CFC). Order = visual order. Each gets an icon
// hint so the row reads at a glance.
// -------------------------------------------------------------------------
const FIELDS: Array<{ field: keyof Client; label: string; Icon: LucideIcon }> = [
  { field: 'eligibility_end_date',    label: 'Eligibility ends',   Icon: Shield },
  { field: 'three_month_visit_due',   label: '3-month visit',      Icon: Calendar },
  { field: 'quarterly_waiver_date',   label: 'Quarterly waiver',   Icon: FileText },
  { field: 'med_tech_redet_date',     label: 'Med-tech redet.',    Icon: Clock },
  { field: 'pos_deadline',            label: 'POS deadline',       Icon: FileText },
  { field: 'assessment_due',          label: 'Assessment due',     Icon: FileCheck },
  { field: 'doc_mdh_date',            label: 'Doc to MDH (45d)',   Icon: FileText },
  { field: 'spm_next_due',            label: 'SPM next due',       Icon: Calendar },
  { field: 'thirty_day_letter_date',  label: '30-day letter',      Icon: FileText },
  { field: 'last_contact_date',       label: 'Last contact',       Icon: Phone },
  { field: 'co_financial_redet_date', label: 'CO financial redet.', Icon: Briefcase },
  { field: 'co_app_date',             label: 'CO application',     Icon: Briefcase },
  { field: 'mfp_consent_date',        label: 'MFP consent',        Icon: FileText },
  { field: 'two57_date',              label: '257 form',           Icon: FileText },
  { field: 'poc_date',                label: 'POC',                Icon: FileText },
  { field: 'loc_date',                label: 'LOC',                Icon: FileText },
  { field: 'drop_in_visit_date',      label: 'Drop-in visit',      Icon: Calendar },
]

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

// -------------------------------------------------------------------------
// DeadlineRow — one row in the table. Hovering shows the dark popover.
// -------------------------------------------------------------------------
interface DeadlineRowProps {
  label: string
  date: string
  Icon: LucideIcon
  isLast: boolean
}

function DeadlineRow({ label, date, Icon, isLast }: DeadlineRowProps) {
  const [hovered, setHovered] = useState(false)
  const status = getDateStatus(date)
  const chip = CHIP[status]
  const days = daysFromToday(date)
  const isOverdue = status === 'critical' || status === 'red'

  return (
    <Box
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'grid',
        gridTemplateColumns: '18px 1fr auto auto',
        gap: 12,
        alignItems: 'center',
        padding: '10px 0',
        borderBottom: isLast ? 'none' : '0.5px solid var(--v2-border-soft)',
        position: 'relative',
      }}
    >
      <Icon size={14} style={{ color: 'var(--v2-text-muted)' }} />
      <Text fz={13} c="var(--v2-text)">{label}</Text>
      <Text fz={12} c="var(--v2-text-muted)" style={{ fontVariantNumeric: 'tabular-nums' }}>
        {formatDate(date.split('T')[0])}
      </Text>
      <Box
        style={{
          background: chip.bg,
          color: chip.fg,
          fontSize: 10,
          fontWeight: 500,
          padding: '2px 7px',
          borderRadius: 4,
          minWidth: 62,
          textAlign: 'center',
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {shortDaysText(days)}
      </Box>

      {hovered && (
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
          <Text
            fz={11}
            fw={500}
            c={`rgb(${URGENCY_COLORS_RGB[status]})`}
            style={{ textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}
          >
            {URGENCY_LABELS[status]}
          </Text>
          <Text fz={20} fw={500} c="#fff" style={{ letterSpacing: '-0.02em' }}>
            {longDaysText(days)}
          </Text>
          <Text fz={11} c="rgba(200,210,230,0.5)" mt={4}>
            {label} {'·'} {formatDate(date.split('T')[0])}
          </Text>
          {isOverdue && (
            <Text fz={11} c="#ff453a" fw={500} mt={8}>
              {'⚡'} Action needed — update this date
            </Text>
          )}
        </Box>
      )}
    </Box>
  )
}

// -------------------------------------------------------------------------
// Public section
// -------------------------------------------------------------------------
export default function Deadlines({ client }: { client: Client }) {
  const rows = FIELDS
    .map(f => ({ ...f, date: client[f.field] as string | null | undefined }))
    .filter((r): r is typeof r & { date: string } => Boolean(r.date))

  const overdueCount = rows.filter(r => {
    const s = getDateStatus(r.date)
    return s === 'critical' || s === 'red'
  }).length

  const subtitle = rows.length === 0
    ? 'None set'
    : `${rows.length} tracked${overdueCount > 0 ? ` · ${overdueCount} overdue` : ''}`

  return (
    <SectionPaper title="Key deadlines" subtitle={subtitle}>
      {rows.length === 0 ? (
        <Stack align="center" py={20}>
          <Text fz={13} c="var(--v2-text-muted)">No deadlines have been entered for this client.</Text>
        </Stack>
      ) : (
        <Box style={{ borderTop: '0.5px solid var(--v2-border-soft)' }}>
          {rows.map((r, i) => (
            <DeadlineRow
              key={String(r.field)}
              label={r.label}
              date={r.date}
              Icon={r.Icon}
              isLast={i === rows.length - 1}
            />
          ))}
        </Box>
      )}
    </SectionPaper>
  )
}
