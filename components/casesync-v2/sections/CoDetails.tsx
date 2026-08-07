'use client'

// CO details — Option A build (mock approved 07-31, FOC-date revision).
// Distinct amber-flagged section for CO clients: CO application, financial
// redetermination, annual POS effective date, and the annual FOC with its
// own signed/expiry dates cross-checked against the annual POS. CO clients
// are denied without a current FOC uploaded with the annual POS, so the
// cross-check renders as an explicit banner rather than a buried date.
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Box, Group, Stack, Text, Paper } from '@mantine/core'
import { Briefcase, Calendar, FileCheck, AlertTriangle, Check, Building2 } from 'lucide-react'
import { DateRow, TextRow } from '../Row'
import type { Client } from '@/lib/types'
import { focExpiryDate, formatDate, coEligibilityCodeIssue } from '@/lib/types'

function dayEpoch(d: string | null | undefined): number | null {
  if (!d) return null
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(d)
  if (!m) return null
  return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
}

export default function CoDetails({ client }: { client: Client }) {
  const router = useRouter()
  const [srcSaving, setSrcSaving] = useState(false)
  const c = client as Client & { pos_effective_date?: string | null; foc_date?: string | null }
  const isCo = client.category === 'co'

  // Pending-CO application source (Josh 08-05): community applicants need no
  // MA code while pending; nursing-facility applicants require an LTC code
  // (L01 / L98 / L99).
  const ltcIssue = coEligibilityCodeIssue(client)
  async function saveSource(value: string) {
    if (srcSaving) return
    setSrcSaving(true)
    try {
      await fetch(`/api/clients/${client.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ co_application_source: value || null }),
      })
      router.refresh()
    } finally {
      setSrcSaving(false)
    }
  }
  const hasAny = isCo || !!(
    client.co_app_date || client.co_financial_redet_date ||
    c.pos_effective_date || c.foc_date || client.request_letter
  )
  const isEmpty = !hasAny

  const posEff = c.pos_effective_date ?? null
  const focDate = c.foc_date ?? null
  const focExpiry = focExpiryDate(focDate)

  let banner: { tone: 'red' | 'green' | 'muted'; text: string } | null = null
  const focE = dayEpoch(focExpiry)
  const posE = dayEpoch(posEff)
  if (focE !== null && posE !== null) {
    if (focE < posE) {
      const gap = Math.round((posE - focE) / 86_400_000)
      banner = { tone: 'red', text: `FOC expires ${gap}d before the annual POS \u2014 renew and upload before ${formatDate(posEff)}` }
    } else {
      banner = { tone: 'green', text: `Covers the annual POS effective ${formatDate(posEff)}` }
    }
  } else if (focE !== null) {
    banner = { tone: 'muted', text: `Expires ${formatDate(focExpiry)} \u2014 no annual POS effective date on file` }
  } else if (isCo) {
    banner = { tone: 'red', text: 'No annual FOC date on file \u2014 CO clients are denied without a current FOC' }
  }

  const rows = [
    client.co_app_date ? 'app' : null,
    client.co_financial_redet_date ? 'redet' : null,
    posEff ? 'pos' : null,
    client.request_letter ? 'req' : null,
  ].filter(Boolean) as string[]
  const lastRow = rows[rows.length - 1]
  const count = rows.length + (focDate ? 1 : 0)

  const BANNER_STYLES: Record<'red' | 'green' | 'muted', { bg: string; fg: string }> = {
    red:   { bg: '#FCEBEB', fg: '#791F1F' },
    green: { bg: '#E1F5EE', fg: '#085041' },
    muted: { bg: '#F1F5F9', fg: '#475569' },
  }

  return (
    <Paper
      radius={0}
      style={{
        background: 'var(--v2-surface)',
        border: '0.5px solid var(--v2-border-soft)',
        borderLeft: '3px solid #BA7517',
        padding: '18px 20px',
        marginBottom: 14,
      }}
    >
      <Group justify="space-between" align="baseline" mb={14} wrap="nowrap">
        <Stack gap={2} style={{ minWidth: 0 }}>
          <Group gap={8} wrap="nowrap">
            {isCo && (
              <Text
                fz={11} fw={700}
                style={{ background: '#FAEEDA', color: '#633806', borderRadius: 6, padding: '2px 8px', letterSpacing: '0.02em' }}
              >
                CO client
              </Text>
            )}
            <Text fz={16} fw={600} c="var(--v2-text)" style={{ letterSpacing: '-0.015em' }}>
              CO details
            </Text>
          </Group>
          <Text fz={12} fw={500} c="var(--v2-text-muted)">
            {isEmpty ? 'None on file' : `${count} ${count === 1 ? 'entry' : 'entries'}`}
          </Text>
        </Stack>
      </Group>
      {isEmpty && (
        <Text fz={13} c="var(--v2-text-muted)" style={{ paddingTop: 2 }}>
          No CO details on file yet.
        </Text>
      )}
      <Box style={{ borderTop: isEmpty ? 'none' : '0.5px solid var(--v2-border-soft)' }}>
        {isCo && (
          <Box style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderBottom: '0.5px solid var(--v2-border-soft)' }}>
            <Building2 size={16} style={{ color: '#EA580C', flexShrink: 0 }} strokeWidth={2.25} />
            <Text fz={14} fw={600} style={{ color: '#EA580C', letterSpacing: '-0.005em' }}>Application source</Text>
            <select
              value={client.co_application_source ?? ''}
              disabled={srcSaving}
              onChange={e => saveSource(e.target.value)}
              style={{
                marginLeft: 'auto', maxWidth: 200, fontSize: 13, padding: '5px 8px',
                background: 'transparent', color: 'var(--v2-text)',
                border: '1px solid var(--v2-border-soft)', borderRadius: 8,
              }}
            >
              <option value="">Not set</option>
              <option value="community">Community</option>
              <option value="nursing_facility">Nursing facility</option>
            </select>
          </Box>
        )}
        {isCo && ltcIssue && (
          <Box style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 0', borderBottom: '0.5px solid var(--v2-border-soft)' }}>
            <AlertTriangle size={15} style={{ color: '#A32D2D', flexShrink: 0 }} />
            <Text fz={12.5} fw={600} style={{ background: '#FCEBEB', color: '#791F1F', borderRadius: 6, padding: '3px 10px' }}>
              {ltcIssue}
            </Text>
          </Box>
        )}
        {isCo && client.co_application_source === 'community' && !client.eligibility_code && (
          <Box style={{ padding: '8px 0', borderBottom: '0.5px solid var(--v2-border-soft)' }}>
            <Text fz={12.5} c="var(--v2-text-muted)">
              No eligibility code expected while pending {'\u2014'} the MA code arrives at enrollment.
            </Text>
          </Box>
        )}
        {client.co_app_date && (
          <DateRow Icon={Briefcase} color="#C026D3" label="CO application" value={client.co_app_date} isLast={lastRow === 'app' && !focDate} />
        )}
        {client.co_financial_redet_date && (
          <DateRow Icon={Briefcase} color="#EA580C" label="CO financial redet." value={client.co_financial_redet_date} isLast={lastRow === 'redet' && !focDate} />
        )}
        {posEff && (
          <DateRow Icon={Calendar} color="#0891B2" label="Annual POS effective" value={posEff} isLast={lastRow === 'pos' && !focDate} />
        )}
        {client.request_letter && (
          <TextRow Icon={Briefcase} color="#EA580C" label="Request letter" value={client.request_letter} isLast={lastRow === 'req' && !focDate} />
        )}
        {focDate && (
          <Box
            style={{
              display: 'grid', gridTemplateColumns: '20px 1fr auto', gap: 12,
              alignItems: 'center', padding: '10px 0', borderBottom: 'none',
            }}
          >
            <FileCheck size={16} style={{ color: '#854F0B' }} />
            <Text fz={14} fw={600} style={{ color: '#854F0B', letterSpacing: '-0.005em' }}>Annual FOC</Text>
            <Text fz={13} fw={600} c="var(--v2-text)">
              Signed {formatDate(focDate)}{' '}
              <Text component="span" fz={13} c="var(--v2-text-muted)">{'\u00b7'} expires {formatDate(focExpiry)}</Text>
            </Text>
          </Box>
        )}
      </Box>
      {banner && (
        <Box
          style={{
            marginTop: 8, background: BANNER_STYLES[banner.tone].bg, borderRadius: 8,
            padding: '6px 10px', display: 'flex', alignItems: 'center', gap: 6,
          }}
        >
          {banner.tone === 'green'
            ? <Check size={15} style={{ color: BANNER_STYLES.green.fg, flexShrink: 0 }} />
            : <AlertTriangle size={15} style={{ color: BANNER_STYLES[banner.tone].fg, flexShrink: 0 }} />}
          <Text fz={12.5} fw={600} style={{ color: BANNER_STYLES[banner.tone].fg }}>
            {banner.text}
          </Text>
        </Box>
      )}
    </Paper>
  )
}
