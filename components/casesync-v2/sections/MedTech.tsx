'use client'

// Med Tech — Phase A Batch 1 extracted section.
// Single field: med_tech_status.
import { Box } from '@mantine/core'
import { Stethoscope } from 'lucide-react'
import SectionPaper from '../SectionPaper'
import { TextRow } from '../Row'
import type { Client } from '@/lib/types'

export default function MedTech({ client }: { client: Client }) {
  const hasStatus = !!client.med_tech_status
  const count = hasStatus ? 1 : 0

  if (count === 0) return null

  return (
    <SectionPaper
      title="Med tech"
      subtitle={`${count} ${count === 1 ? 'entry' : 'entries'}`}
    >
      <Box style={{ borderTop: '0.5px solid var(--v2-border-soft)' }}>
        {hasStatus && (
          <TextRow
            Icon={Stethoscope} color="#D97706"
            label="Med/tech status" value={client.med_tech_status}
            isLast
          />
        )}
      </Box>
    </SectionPaper>
  )
}
