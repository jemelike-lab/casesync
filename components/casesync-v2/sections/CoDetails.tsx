'use client'

// CO Details — Phase A Batch 1 extracted section.
// Dates (co_financial_redet_date, co_app_date, mfp_consent_date, two57_date)
// remain in the Deadlines section above; this section owns the standalone
// non-date "request_letter" field only.
import { Box } from '@mantine/core'
import { Briefcase } from 'lucide-react'
import SectionPaper from '../SectionPaper'
import { TextRow } from '../Row'
import type { Client } from '@/lib/types'

export default function CoDetails({ client }: { client: Client }) {
  const hasRequest = !!client.request_letter
  const count = hasRequest ? 1 : 0

  if (count === 0) return null

  return (
    <SectionPaper
      title="CO details"
      subtitle={`${count} ${count === 1 ? 'entry' : 'entries'}`}
    >
      <Box style={{ borderTop: '0.5px solid var(--v2-border-soft)' }}>
        {hasRequest && (
          <TextRow
            Icon={Briefcase} color="#EA580C"
            label="Request letter" value={client.request_letter}
            isLast
          />
        )}
      </Box>
    </SectionPaper>
  )
}
