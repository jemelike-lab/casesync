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
import { type Client, getDateStatus, isWaiverValid, waiverRenewalDate, focExpiryDate, locRenewalDate, isAppealGatingActive, APPEAL_GATED_FIELDS } from '@/lib/types'

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

  // FOC is completed annually, so the tracked deadline is signature + 12 months
  // (Josh 08-07). Same derived-row treatment as the SP waiver renewal.
  const focRenewal = focExpiryDate(client.foc_date)

  const derived: Array<{ field: keyof Client; label: string; Icon: typeof FileText; color: string; date: string }> = []
  if (waiverRenewal) {
    derived.push({
      field: 'quarterly_waiver_date' as keyof Client,
      label: 'SP waiver renewal',
      Icon: FileText,
      color: '#0891B2',
      date: waiverRenewal,
    })
  }
  if (focRenewal) {
    derived.push({
      field: 'foc_date' as keyof Client,
      label: 'FOC renewal',
      Icon: FileCheck,
      color: '#0F766E',
      date: focRenewal,
    })
  }

  // LOC renewals (Megan 08-16): NF and CPAS each carry annual validity; the
  // tracked deadline is the effective date + 12 months, same derived-row
  // treatment as the SP waiver / FOC renewals. foc_submission_date is the
  // audit-timeliness record of when FOC was submitted.
  const nfLocRenewal = locRenewalDate(client.nf_loc_date)
  const cpasLocRenewal = locRenewalDate(client.cpas_loc_date)
  if (nfLocRenewal) {
    derived.push({ field: 'nf_loc_date' as keyof Client, label: 'LOC renewal (NF)', Icon: FileText, color: '#0E7490', date: nfLocRenewal })
  }
  if (cpasLocRenewal) {
    derived.push({ field: 'cpas_loc_date' as keyof Client, label: 'LOC renewal (CPAS)', Icon: FileText, color: '#0E7490', date: cpasLocRenewal })
  }
  if (client.foc_submission_date) {
    derived.push({ field: 'foc_submission_date' as keyof Client, label: 'FOC submitted', Icon: FileCheck, color: '#0F766E', date: client.foc_submission_date })
  }

  const rows = [...baseRows, ...derived]

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
