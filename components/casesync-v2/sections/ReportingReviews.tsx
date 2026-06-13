'use client'

// Reporting & Reviews — Phase A Batch 1 extracted section.
// Four fields: reportable_events, appeals (text), audit_review, qa_review (select-as-text).
import { Box } from '@mantine/core'
import { AlertTriangle, Gavel, Search, BadgeCheck } from 'lucide-react'
import SectionPaper from '../SectionPaper'
import { TextRow } from '../Row'
import type { Client } from '@/lib/types'

export default function ReportingReviews({ client }: { client: Client }) {
  const hasEvents = !!client.reportable_events
  const hasAppeal = !!client.appeals
  const hasAudit  = !!client.audit_review
  const hasQa     = !!client.qa_review
  const count = [hasEvents, hasAppeal, hasAudit, hasQa].filter(Boolean).length

  if (count === 0) return null

  const last =
    hasQa     ? 'qa'     :
    hasAudit  ? 'audit'  :
    hasAppeal ? 'appeal' : 'events'

  return (
    <SectionPaper
      title="Reporting & reviews"
      subtitle={`${count} ${count === 1 ? 'entry' : 'entries'}`}
    >
      <Box style={{ borderTop: '0.5px solid var(--v2-border-soft)' }}>
        {hasEvents && (
          <TextRow
            Icon={AlertTriangle} color="#DC2626"
            label="Reportable events" value={client.reportable_events}
            isLast={last === 'events'}
          />
        )}
        {hasAppeal && (
          <TextRow
            Icon={Gavel} color="#D97706"
            label="Appeals" value={client.appeals}
            isLast={last === 'appeal'}
          />
        )}
        {hasAudit && (
          <TextRow
            Icon={Search} color="#0D9488"
            label="Audit review" value={client.audit_review}
            isLast={last === 'audit'}
          />
        )}
        {hasQa && (
          <TextRow
            Icon={BadgeCheck} color="#16A34A"
            label="QA review" value={client.qa_review}
            isLast={last === 'qa'}
          />
        )}
      </Box>
    </SectionPaper>
  )
}
