'use client'

// Visits and SPM — Option A build (Megan 07-31 spec, mock approved).
// The consolidated visit/waiver module: last contact type, completed visits
// (neutral EventRows), the derived next 3-month visit, SPM next due, and the
// SP-waiver line as an explicit checkbox + status pill + upload shortcut.
// A live waiver suppresses the derived next-visit deadline (Batch 1 rule).
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Box, Text } from '@mantine/core'
import { Phone, Calendar, ClipboardCheck, Check } from 'lucide-react'
import SectionPaper from '../SectionPaper'
import { TextRow, DateRow, EventRow } from '../Row'
import QuickLog from '@/components/QuickLog'
import type { Client } from '@/lib/types'
import { nextThreeMonthVisitDue, waiverRenewalDate, isWaiverValid, formatDate } from '@/lib/types'
import { spmNextDueAfterCompletionStr , mdhSpmShadowDateStr } from '@/lib/business-date'

function scrollToFiles() {
  document.getElementById('cs-sec-files')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

export default function ContactDetails({ client }: { client: Client }) {
  const router = useRouter()
  const [spmSaving, setSpmSaving] = useState(false)
  const [spmError, setSpmError] = useState<string | null>(null)
  const c = client as Client & {
    last_contact_type?: string | null
    three_month_visit_date?: string | null
  }

  // Mark SPM complete inline (Megan 08-05: logging must work from the client
  // screen). Same audited PATCH path as the edit form; spm_next_due advances
  // to the 15th of the following month (shipped 6c1f471 rule).
  async function markSpmComplete() {
    if (spmSaving) return
    setSpmSaving(true)
    setSpmError(null)
    try {
      const r = await fetch(`/api/clients/${client.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ spm_completed: true, spm_next_due: spmNextDueAfterCompletionStr() }),
      })
      if (!r.ok) {
        const d = await r.json().catch(() => ({}))
        setSpmError(d.error || 'Could not mark SPM complete')
        setSpmSaving(false)
        return
      }
      router.refresh()
      setSpmSaving(false)
    } catch {
      setSpmError('Network error \u2014 try again')
      setSpmSaving(false)
    }
  }

  const hasType  = !!c.last_contact_type
  const hasDrop  = !!c.drop_in_visit_date
  const hasThree = !!c.three_month_visit_date
  const hasSpm   = !!client.spm_next_due
  const mdhShadow = mdhSpmShadowDateStr(client.spm_next_due)

  const waiverSigned  = c.quarterly_waiver_date
  const waiverActive  = isWaiverValid(waiverSigned)
  const waiverRenewal = waiverRenewalDate(waiverSigned)
  const hasWaiver     = !!waiverSigned

  const nextVisit = waiverActive ? null : nextThreeMonthVisitDue(c.three_month_visit_date)
  const hasNext   = !!nextVisit

  const count = (hasType ? 1 : 0) + (hasDrop ? 1 : 0) + (hasThree ? 1 : 0)
    + (hasNext ? 1 : 0) + (hasSpm ? 1 : 0) + (hasWaiver ? 1 : 0)

  // 08-05: this section ALWAYS renders. Returning null when empty removed the
  // only visible logging affordance from the client screen (Megan's report).

  const last =
    hasSpm    ? 'spm'   :
    hasNext   ? 'next'  :
    hasThree  ? 'three' :
    hasDrop   ? 'drop'  : 'type'

  return (
    <SectionPaper
      title="Visits and SPM"
      subtitle={count === 0 ? 'No entries yet' : `${count} ${count === 1 ? 'entry' : 'entries'}`}
      action={
        <QuickLog
          clientId={client.id}
          clientName={`${client.first_name ?? ''} ${client.last_name ?? ''}`.trim() || client.client_id}
          contextLine={c.last_contact_type ? `Last contact: ${c.last_contact_type}` : 'No contact on record'}
          variant="row"
          onLogged={() => router.refresh()}
        />
      }
    >
      <Box style={{ borderTop: '0.5px solid var(--v2-border-soft)' }}>
        {hasType && (
          <TextRow
            Icon={Phone} color="#16A34A"
            label="Last contact type" value={c.last_contact_type}
            isLast={false}
          />
        )}
        {hasDrop && (
          <EventRow
            Icon={Calendar} color="#4338CA"
            label="Drop-in visit" value={c.drop_in_visit_date}
            isLast={false}
          />
        )}
        {hasThree && (
          <EventRow
            Icon={Calendar} color="#0891B2"
            label="3-month visit completed" value={c.three_month_visit_date}
            isLast={false}
          />
        )}
        {hasNext && (
          <DateRow
            Icon={Calendar} color="#7C3AED"
            label="Next 3-month visit due" value={nextVisit}
            isLast={last === 'next'}
          />
        )}
        {hasSpm && (
          <DateRow
            Icon={ClipboardCheck} color="#DB2777"
            label="SPM next due" value={client.spm_next_due}
            isLast={last === 'spm'}
          />
        )}
        {hasSpm && mdhShadow && (
          <Box style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '2px 0 8px 27px' }}>
            <Text fz={11.5} c="var(--v2-text-muted)">
              MDH 30-day shadow: {formatDate(mdhShadow)} — BLH 15th-of-month rule governs
            </Text>
          </Box>
        )}
        <Box style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 0' }}>
          <ClipboardCheck size={17} style={{ color: '#DB2777', flexShrink: 0 }} strokeWidth={2.25} />
          <Text fz={13} fw={600} c="var(--v2-text-muted)">
            {client.spm_completed ? 'SPM logged for this cycle' : 'SPM contact for this cycle'}
          </Text>
          <button
            onClick={markSpmComplete}
            disabled={spmSaving}
            style={{
              marginLeft: 'auto', background: 'transparent', border: '1px solid var(--v2-border-soft)',
              borderRadius: 8, color: 'var(--v2-text)', padding: '4px 12px', fontSize: 12, fontWeight: 600,
              cursor: spmSaving ? 'default' : 'pointer', opacity: spmSaving ? 0.6 : 1,
            }}
          >
            {spmSaving ? 'Saving\u2026' : 'Mark SPM complete'}
          </button>
          {spmError && <Text fz={12} c="#E24B4A">{spmError}</Text>}
        </Box>
      </Box>
      <Box
        style={{
          borderTop: '0.5px solid var(--v2-border-soft)', marginTop: 2, paddingTop: 12,
          display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
        }}
      >
        <Box
          style={{
            width: 16, height: 16, borderRadius: 4, flexShrink: 0,
            border: hasWaiver ? 'none' : '1.5px solid var(--v2-border-soft)',
            background: hasWaiver ? '#1E7CFF' : 'transparent',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          {hasWaiver && <Check size={12} color="#fff" strokeWidth={3} />}
        </Box>
        <Text fz={13} fw={600} c="var(--v2-text)">
          Client declined visit {'\u2014'} SP waiver on file
        </Text>
        {hasWaiver && (
          <Text
            fz={12} fw={600}
            style={{
              background: waiverActive ? '#E1F5EE' : '#FCEBEB',
              color: waiverActive ? '#085041' : '#791F1F',
              borderRadius: 6, padding: '3px 10px',
            }}
          >
            {waiverActive
              ? `Signed ${formatDate(waiverSigned)} \u00b7 renews ${formatDate(waiverRenewal)}`
              : `Signed ${formatDate(waiverSigned)} \u00b7 lapsed ${formatDate(waiverRenewal)}`}
          </Text>
        )}
        <button
          onClick={scrollToFiles}
          style={{
            background: 'transparent', border: '1px solid var(--v2-border-soft)', borderRadius: 8,
            color: 'var(--v2-text-muted)', padding: '4px 10px', fontSize: 12, cursor: 'pointer',
          }}
        >
          Upload waiver
        </button>
      </Box>
    </SectionPaper>
  )
}
