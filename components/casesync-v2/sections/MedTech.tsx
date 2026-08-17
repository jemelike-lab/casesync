'use client'

// Med Tech — Megan 08-16: due date (redet) foregrounded, editable status
// (Completed / In progress / Not started) with inline audited save via the
// same PATCH path as the SPM control, and the last-completed date demoted to a
// muted line. Appeal-aware paused tag preserved.
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Box, Text } from '@mantine/core'
import { Clock } from 'lucide-react'
import SectionPaper, { SectionEmpty } from '../SectionPaper'
import type { Client } from '@/lib/types'
import { isAppealGatingActive, getDateStatus, formatDate } from '@/lib/types'

const MED_TECH_STATUSES = ['Completed', 'In progress', 'Not started']

export default function MedTech({ client }: { client: Client }) {
  const router = useRouter()
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const hasStatus = !!client.med_tech_status
  const hasDate = !!client.med_tech_date
  const hasRedet = !!client.med_tech_redet_date
  const count = [hasStatus, hasDate, hasRedet].filter(Boolean).length
  const isEmpty = count === 0
  const appealActive = isAppealGatingActive(client)

  const cur = client.med_tech_status ?? ''
  const options = cur && !MED_TECH_STATUSES.includes(cur) ? [cur, ...MED_TECH_STATUSES] : MED_TECH_STATUSES

  async function saveStatus(value: string) {
    if (saving) return
    setSaving(true)
    setError(null)
    try {
      const r = await fetch(`/api/clients/${client.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ med_tech_status: value || null }),
      })
      if (!r.ok) {
        const d = await r.json().catch(() => ({}))
        setError(d.error || 'Could not update status')
        setSaving(false)
        return
      }
      router.refresh()
      setSaving(false)
    } catch {
      setError('Network error \u2014 try again')
      setSaving(false)
    }
  }

  const redetStatus = hasRedet && !appealActive ? getDateStatus(client.med_tech_redet_date) : null
  const redetColor = redetStatus === 'critical' || redetStatus === 'red' ? '#E24B4A' : 'var(--v2-text)'

  return (
    <SectionPaper
      title="Med tech"
      subtitle={isEmpty ? 'None on file' : `${count} ${count === 1 ? 'entry' : 'entries'}`}
      action={appealActive && hasRedet ? (
        <Text
          fz={12} fw={600}
          style={{ background: '#FAEEDA', color: '#633806', borderRadius: 999, padding: '3px 12px', whiteSpace: 'nowrap' }}
        >
          Paused {'\u2014'} appeal active
        </Text>
      ) : undefined}
    >
      {isEmpty && <SectionEmpty text={'No med-tech details on file yet.'} />}
      {!isEmpty && (
        <Box style={{ borderTop: '0.5px solid var(--v2-border-soft)', paddingTop: 14 }}>
          <Box style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
            <Clock size={17} style={{ color: '#0D9488', flexShrink: 0 }} strokeWidth={2.25} />
            <Text fz={12} c="var(--v2-text-muted)">{appealActive ? 'Due date (paused)' : 'Due date'}</Text>
            <Text fz={20} fw={600} style={{ color: appealActive ? 'var(--v2-text)' : redetColor }}>
              {hasRedet ? formatDate(client.med_tech_redet_date) : 'Not set'}
            </Text>
          </Box>
          <Box style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
            <Text fz={12} c="var(--v2-text-muted)" style={{ minWidth: 56 }}>Status</Text>
            <select
              value={cur}
              disabled={saving}
              onChange={(e) => saveStatus(e.target.value)}
              style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid var(--v2-border-soft)', color: 'var(--v2-text)', fontSize: 13, cursor: saving ? 'default' : 'pointer', opacity: saving ? 0.6 : 1 }}
            >
              <option value="">{'\u2014'} Set status {'\u2014'}</option>
              {options.map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
            {saving && <Text fz={12} c="var(--v2-text-muted)">Saving{'\u2026'}</Text>}
            {error && <Text fz={12} c="#E24B4A">{error}</Text>}
          </Box>
          <Box style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Text fz={12} c="var(--v2-text-muted)" style={{ minWidth: 56 }}>Last done</Text>
            <Text fz={13} c="var(--v2-text-muted)">{hasDate ? formatDate(client.med_tech_date) : '\u2014'}</Text>
          </Box>
        </Box>
      )}
    </SectionPaper>
  )
}
