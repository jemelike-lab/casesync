'use client'

// Med Tech — Phase A Batch 1 extracted section.
// 08-05 (Megan): + med_tech_date (last completed training) and the redet date
// with an appeal-aware paused tag — visible, flagged, never critical while an
// appeal is active.
import { Box, Text } from '@mantine/core'
import { Stethoscope, CalendarCheck, Clock } from 'lucide-react'
import SectionPaper from '../SectionPaper'
import { TextRow, EventRow, DateRow } from '../Row'
import type { Client } from '@/lib/types'
import { isAppealActive } from '@/lib/types'

export default function MedTech({ client }: { client: Client }) {
  const hasStatus = !!client.med_tech_status
  const hasDate = !!client.med_tech_date
  const hasRedet = !!client.med_tech_redet_date
  const count = [hasStatus, hasDate, hasRedet].filter(Boolean).length

  if (count === 0) return null

  const appealActive = isAppealActive(client)
  const last = hasRedet ? 'redet' : hasDate ? 'date' : 'status'

  return (
    <SectionPaper
      title="Med tech"
      subtitle={`${count} ${count === 1 ? 'entry' : 'entries'}`}
      action={appealActive && hasRedet ? (
        <Text
          fz={12} fw={600}
          style={{ background: '#FAEEDA', color: '#633806', borderRadius: 999, padding: '3px 12px', whiteSpace: 'nowrap' }}
        >
          Paused {'\u2014'} appeal active
        </Text>
      ) : undefined}
    >
      <Box style={{ borderTop: '0.5px solid var(--v2-border-soft)' }}>
        {hasStatus && (
          <TextRow
            Icon={Stethoscope} color="#D97706"
            label="Med/tech status" value={client.med_tech_status}
            isLast={last === 'status'}
          />
        )}
        {hasDate && (
          <EventRow
            Icon={CalendarCheck} color="#D97706"
            label="Last completed" value={client.med_tech_date}
            isLast={last === 'date'}
          />
        )}
        {hasRedet && (appealActive ? (
          <EventRow
            Icon={Clock} color="#D97706"
            label="Redet due (paused)" value={client.med_tech_redet_date}
            isLast
          />
        ) : (
          <DateRow
            Icon={Clock} color="#D97706"
            label="Redet due" value={client.med_tech_redet_date}
            isLast
          />
        ))}
      </Box>
    </SectionPaper>
  )
}
