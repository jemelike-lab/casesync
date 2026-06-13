'use client'

// Forms & Signatures — Phase A Batch 1 extracted section.
// Four fields: foc, provider_forms, signatures_needed (text), schedule_docs (boolean).
// schedule_docs is boolean-not-null (DB default false); count only when true so
// a client with no real data doesn't surface a phantom "Schedule docs: No" row.
import { Box } from '@mantine/core'
import { FileText, Building2, PenLine, CalendarCheck } from 'lucide-react'
import SectionPaper from '../SectionPaper'
import { TextRow, BooleanRow } from '../Row'
import type { Client } from '@/lib/types'

export default function FormsSignatures({ client }: { client: Client }) {
  const hasFoc      = !!client.foc
  const hasProvider = !!client.provider_forms
  const hasSigs     = !!client.signatures_needed
  const hasSchedule = client.schedule_docs === true
  const count = [hasFoc, hasProvider, hasSigs, hasSchedule].filter(Boolean).length

  if (count === 0) return null

  const last =
    hasSchedule ? 'schedule' :
    hasSigs     ? 'sigs'     :
    hasProvider ? 'provider' : 'foc'

  return (
    <SectionPaper
      title="Forms & signatures"
      subtitle={`${count} ${count === 1 ? 'entry' : 'entries'}`}
    >
      <Box style={{ borderTop: '0.5px solid var(--v2-border-soft)' }}>
        {hasFoc && (
          <TextRow
            Icon={FileText} color="#0891B2"
            label="FOC" value={client.foc}
            isLast={last === 'foc'}
          />
        )}
        {hasProvider && (
          <TextRow
            Icon={Building2} color="#7C3AED"
            label="Provider forms" value={client.provider_forms}
            isLast={last === 'provider'}
          />
        )}
        {hasSigs && (
          <TextRow
            Icon={PenLine} color="#DC2626"
            label="Signatures needed" value={client.signatures_needed}
            isLast={last === 'sigs'}
          />
        )}
        {hasSchedule && (
          <BooleanRow
            Icon={CalendarCheck} color="#16A34A"
            label="Schedule docs" value={client.schedule_docs}
            isLast={last === 'schedule'}
          />
        )}
      </Box>
    </SectionPaper>
  )
}
