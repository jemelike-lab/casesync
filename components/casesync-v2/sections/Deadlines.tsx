'use client'

// =========================================================================
// Deadlines — Phase A section (colorized iteration)
//
// Each tracked deadline has its own saturated identity color applied to
// its icon and label. Label weight is bumped to 600 for visual pop while
// staying readable. Chip stays as the per-row status indicator (overdue
// /soon/ontrack) so urgency is still encoded separately from identity.
//
// Hover popover preserved exactly from the legacy DateTile.
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
// Status chip palette (soft fill + dark text from the same hue family).
// Encodes "how urgent" — independent of the row's identity color.
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
// Per-row identity colors. Each tracked deadline gets a saturated 600-level
// hue (Tailwind palette references) so it reads bold and clear on white.
// Hues chosen to be visually distinct neighbor-to-neighbor.
// -------------------------------------------------------------------------
const FIELDS: Array<{
  field: keyof Client
  label: string
  Icon: LucideIcon
  color: string
}> = [
  { field: 'eligibility_end_date',    label: 'Eligibility ends',    Icon: Shield,     color: '#2563EB' }, // blue-600
  { field: 'three_month_visit_due',   label: '3-month visit',       Icon: Calendar,   color: '#7C3AED' }, // violet-600
  { field: 'quarterly_waiver_date',   label: 'Quarterly waiver',    Icon: FileText,   color: '#0891B2' }, // cyan-600
  { field: 'med_tech_redet_date',     label: 'Med-tech redet.',     Icon: Clock,      color: '#0D9488' }, // teal-600
  { field: 'pos_deadline',            label: 'POS deadline',        Icon: FileText,   color: '#D97706' }, // amber-600
  { field: 'assessment_due',          label: 'Assessment due',      Icon: FileCheck,  color: '#059669' }, // emerald-600
  { field: 'doc_mdh_date',            label: 'Doc to MDH (45d)',    Icon: FileText,   color: '#4F46E5' }, // indigo-600
  { field: 'spm_next_due',            label: 'SPM next due',        Icon: Calendar,   color: '#DB2777' }, // pink-600
  { field: 'thirty_day_letter_date',  label: '30-day letter',       Icon: FileText,   color: '#DC2626' }, // red-600
  { field: 'last_contact_date',       label: 'Last contact',        Icon: Phone,      color: '#16A34A' }, // green-600
  { field: 'co_financial_redet_date', label: 'CO financial redet.', Icon: Briefcase,  color: '#EA580C' }, // orange-600
  { field: 'co_app_date',             label: 'CO application',      Icon: Briefcase,  color: '#C026D3' }, // fuchsia-600
  { field: 'mfp_consent_date',        label: 'MFP consent',         Icon: FileText,   color: '#0284C7' }, // sky-600
  { field: 'two57_date',              label: '257 form',            Icon: FileText,   color: '#BE185D' }, // pink-700
  { field: 'poc_date',                label: 'POC',                 Icon: FileText,   color: '#9333EA' }, // purple-600
  { field: 'loc_date',                label: 'LOC',                 Icon: FileText,   color: '#0E7490' }, // cyan-700
  { field: 'drop_in_visit_date',      label: 'Drop-in visit',       Icon: Calendar,   color: '#4338CA' }, // indigo-700
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

interface DeadlineRowProps {
  label: string
  date: string
  Icon: LucideIcon
  color: string
  isLast: boolean
}

function DeadlineRow({ label, date, Icon, color, isLast }: DeadlineRowProps) {
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
        gridTemplateColumns: '20px 1fr auto auto',
        gap: 12,
        alignItems: 'center',
        padding: '12px 0',
        borderBottom: isLast ? 'none' : '0.5px solid var(--v2-border-soft)',
        position: 'relative',
      }}
    >
      <Icon size={17} style={{ color, flexShrink: 0 }} strokeWidth={2.25} />
      <Text fz={14} fw={600} style={{ color, letterSpacing: '-0.005em' }}>{label}</Text>
      <Text
        fz={12}
        fw={600}
        style={{
          // Two-color date readout: urgent (overdue or due within 7d) -> red-600,
          // safe (further out, or no urgency) -> green-600. Bolder weight so the
          // color carries on a white card.
          color:
            status === 'critical' || status === 'red' || status === 'orange'
              ? '#DC2626'
              : '#16A34A',
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {formatDate(date.split('T')[0])}
      </Text>
      <Box
        style={{
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
            fw={600}
            c={`rgb(${URGENCY_COLORS_RGB[status]})`}
            style={{ textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}
          >
            {URGENCY_LABELS[status]}
          </Text>
          <Text fz={20} fw={600} c="#fff" style={{ letterSpacing: '-0.02em' }}>
            {longDaysText(days)}
          </Text>
          <Text fz={11} c="rgba(200,210,230,0.5)" mt={4}>
            {label} {'·'} {formatDate(date.split('T')[0])}
          </Text>
          {isOverdue && (
            <Text fz={11} c="#ff453a" fw={600} mt={8}>
              {'⚡'} Action needed — update this date
            </Text>
          )}
        </Box>
      )}
    </Box>
  )
}

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
              color={r.color}
              isLast={i === rows.length - 1}
            />
          ))}
        </Box>
      )}
    </SectionPaper>
  )
}
