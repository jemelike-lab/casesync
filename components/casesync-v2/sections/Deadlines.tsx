'use client'

// =========================================================================
// Deadlines — Phase A section
//
// Uses the shared DateRow primitive from ../Row so the hover popover, the
// two-color date, and the chip stay in lockstep with every other extracted
// section (Contact & visits, Plans & assessments, future sections).
// =========================================================================

import { Box, Stack, Text } from '@mantine/core'
import {
  Calendar, Clock, FileText, Shield, Phone, Briefcase, FileCheck,
  type LucideIcon,
} from 'lucide-react'
import SectionPaper from '../SectionPaper'
import { DateRow, EventRow } from '../Row'
import { type Client, getDateStatus, isWaiverValid, waiverRenewalDate, isAppealGatingActive, APPEAL_GATED_FIELDS } from '@/lib/types'

// Per-row identity colors (17 distinct hues, 600/700-level Tailwind).
const FIELDS: Array<{
  field: keyof Client
  label: string
  Icon: LucideIcon
  color: string
}> = [
  { field: 'eligibility_end_date',    label: 'Eligibility ends',    Icon: Shield,     color: '#2563EB' },
  { field: 'three_month_visit_due',   label: '3-month visit',       Icon: Calendar,   color: '#7C3AED' },
  { field: 'med_tech_redet_date',     label: 'Med-tech redet.',     Icon: Clock,      color: '#0D9488' },
  { field: 'pos_deadline',            label: 'POS deadline',        Icon: FileText,   color: '#D97706' },
  { field: 'assessment_due',          label: 'Assessment due',      Icon: FileCheck,  color: '#059669' },
  { field: 'doc_mdh_date',            label: 'Doc to MDH (45d)',    Icon: FileText,   color: '#4F46E5' },
  { field: 'thirty_day_letter_date',  label: '30-day letter',       Icon: FileText,   color: '#DC2626' },
  { field: 'last_contact_date',       label: 'Last contact',        Icon: Phone,      color: '#16A34A' },
  { field: 'mfp_consent_date',        label: 'MFP consent',         Icon: FileText,   color: '#0284C7' },
  { field: 'two57_date',              label: '257 form',            Icon: FileText,   color: '#BE185D' },
  { field: 'poc_date',                label: 'POC',                 Icon: FileText,   color: '#9333EA' },
  { field: 'loc_date',                label: 'LOC',                 Icon: FileText,   color: '#0E7490' },
]

export default function Deadlines({ client }: { client: Client }) {
  const waiverActive = isWaiverValid(client.quarterly_waiver_date)
  const waiverRenewal = waiverRenewalDate(client.quarterly_waiver_date)
  // 08-05: while an appeal is active, gated deadlines render neutral with a
  // "(paused)" label — visible and tracked, never critical/overdue.
  const appealActive = isAppealGatingActive(client)

  const baseRows = FIELDS
    .map(f => ({ ...f, date: client[f.field] as string | null | undefined }))
    .filter((r): r is typeof r & { date: string } => Boolean(r.date))
    .filter(r => !(r.field === 'three_month_visit_due' && waiverActive))

  const rows = waiverRenewal
    ? [...baseRows, {
        field: 'quarterly_waiver_date' as keyof Client,
        label: 'SP waiver renewal',
        Icon: FileText,
        color: '#0891B2',
        date: waiverRenewal,
      }]
    : baseRows

  const overdueCount = rows.filter(r => {
    if (appealActive && APPEAL_GATED_FIELDS.has(String(r.field))) return false
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
            appealActive && APPEAL_GATED_FIELDS.has(String(r.field)) ? (
              <EventRow
                key={String(r.field)}
                Icon={r.Icon}
                color={r.color}
                label={`${r.label} (paused \u2014 appeal)`}
                value={r.date}
                isLast={i === rows.length - 1}
              />
            ) : (
              <DateRow
                key={String(r.field)}
                Icon={r.Icon}
                color={r.color}
                label={r.label}
                value={r.date}
                isLast={i === rows.length - 1}
              />
            )
          ))}
        </Box>
      )}
    </SectionPaper>
  )
}
