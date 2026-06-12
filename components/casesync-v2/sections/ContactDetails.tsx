'use client'

// Contact & visits — Phase A extracted section
import { Box } from '@mantine/core'
import { Phone, Calendar } from 'lucide-react'
import SectionPaper from '../SectionPaper'
import { TextRow, DateRow } from '../Row'
import type { Client } from '@/lib/types'

export default function ContactDetails({ client }: { client: Client }) {
  const c = client as Client & {
    last_contact_type?: string | null
    three_month_visit_date?: string | null
  }

  const hasType  = !!c.last_contact_type
  const hasDrop  = !!c.drop_in_visit_date
  const hasThree = !!c.three_month_visit_date
  const count = (hasType ? 1 : 0) + (hasDrop ? 1 : 0) + (hasThree ? 1 : 0)

  if (count === 0) return null

  const last = hasThree ? 'three' : hasDrop ? 'drop' : 'type'

  return (
    <SectionPaper
      title="Contact & visits"
      subtitle={`${count} ${count === 1 ? 'entry' : 'entries'}`}
    >
      <Box style={{ borderTop: '0.5px solid var(--v2-border-soft)' }}>
        {hasType && (
          <TextRow
            Icon={Phone} color="#16A34A"
            label="Last contact type" value={c.last_contact_type}
            isLast={last === 'type'}
          />
        )}
        {hasDrop && (
          <DateRow
            Icon={Calendar} color="#4338CA"
            label="Drop-in visit" value={c.drop_in_visit_date}
            isLast={last === 'drop'}
          />
        )}
        {hasThree && (
          <DateRow
            Icon={Calendar} color="#0891B2"
            label="3-month visit" value={c.three_month_visit_date}
            isLast={last === 'three'}
          />
        )}
      </Box>
    </SectionPaper>
  )
}
