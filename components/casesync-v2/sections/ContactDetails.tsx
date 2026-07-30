'use client'

// Contact & visits — Phase A extracted section
import { Box } from '@mantine/core'
import { Phone, Calendar, FileText } from 'lucide-react'
import SectionPaper from '../SectionPaper'
import { TextRow, DateRow, EventRow } from '../Row'
import type { Client } from '@/lib/types'
import { nextThreeMonthVisitDue, waiverRenewalDate, isWaiverValid } from '@/lib/types'

export default function ContactDetails({ client }: { client: Client }) {
  const c = client as Client & {
    last_contact_type?: string | null
    three_month_visit_date?: string | null
  }

  const hasType  = !!c.last_contact_type
  const hasDrop  = !!c.drop_in_visit_date
  const hasThree = !!c.three_month_visit_date

  const waiverSigned  = c.quarterly_waiver_date
  const waiverActive  = isWaiverValid(waiverSigned)
  const waiverRenewal = waiverRenewalDate(waiverSigned)
  const hasWaiver     = !!waiverSigned

  const nextVisit = waiverActive ? null : nextThreeMonthVisitDue(c.three_month_visit_date)
  const hasNext   = !!nextVisit

  const count = (hasType ? 1 : 0) + (hasDrop ? 1 : 0) + (hasThree ? 1 : 0)
    + (hasNext ? 1 : 0) + (hasWaiver ? 1 : 0)

  if (count === 0) return null

  const last =
    hasWaiver ? 'waiver' :
    hasNext   ? 'next'   :
    hasThree  ? 'three'  :
    hasDrop   ? 'drop'   : 'type'

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
          <EventRow
            Icon={Calendar} color="#4338CA"
            label="Drop-in visit" value={c.drop_in_visit_date}
            isLast={last === 'drop'}
          />
        )}
        {hasThree && (
          <EventRow
            Icon={Calendar} color="#0891B2"
            label="3-month visit completed" value={c.three_month_visit_date}
            isLast={last === 'three'}
          />
        )}
        {hasNext && (
          <DateRow
            Icon={Calendar} color="#7C3AED"
            label="Next 3-month visit due" value={nextVisit}
            isLast={last === 'next'}
          />
        )}
        {hasWaiver && (
          waiverActive && waiverRenewal ? (
            <DateRow
              Icon={FileText} color="#0891B2"
              label="SP waiver renewal" value={waiverRenewal}
              isLast={last === 'waiver'}
            />
          ) : (
            <EventRow
              Icon={FileText} color="#0891B2"
              label="SP waiver signed" value={waiverSigned}
              isLast={last === 'waiver'}
            />
          )
        )}
      </Box>
    </SectionPaper>
  )
}
