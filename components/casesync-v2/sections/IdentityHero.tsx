'use client'

// IdentityHero — Phase A Batch 2.5
//
// Lifts the bold blue-gradient hero block out of the legacy ClientEditForm
// and into the v2 cascade. Replaces the minimal v2 IdentityStrip at the
// top of the page.
//
// Edit + Print buttons intentionally omitted — they return as part of the
// Batch 3 "Actions" surface (alongside Reassign and Mark as Deceased).

import { Box } from '@mantine/core'
import type { Client } from '@/lib/types'
import HealthScoreRing from '@/components/HealthScoreRing'

interface Props {
  client: Client
}

// Deadline fields we walk to compute overdue / due-soon chip counts.
// Kept in sync with the wrapper's StatusRow + the legacy form.
const DEADLINE_FIELDS: Array<keyof Client> = [
  'eligibility_end_date',
  'three_month_visit_due',
  'quarterly_waiver_date',
  'med_tech_redet_date',
  'pos_deadline',
  'assessment_due',
  'doc_mdh_date',
  'spm_next_due',
  'thirty_day_letter_date',
  'last_contact_date',
  'co_financial_redet_date',
  'co_app_date',
  'mfp_consent_date',
  'two57_date',
  'poc_date',
  'loc_date',
  'drop_in_visit_date',
]

function daysFromNow(s: string): number {
  const t = new Date(s).getTime()
  if (isNaN(t)) return 0
  return Math.round((t - Date.now()) / 86_400_000)
}

function daysSinceContact(s: string | null | undefined): number | null {
  if (!s) return null
  const t = new Date(s).getTime()
  if (isNaN(t)) return null
  return Math.max(0, Math.round((Date.now() - t) / 86_400_000))
}

function countUrgency(client: Client): { overdue: number; dueSoon: number } {
  let overdue = 0
  let dueSoon = 0
  for (const field of DEADLINE_FIELDS) {
    const v = client[field] as string | null | undefined
    if (!v) continue
    const d = daysFromNow(v)
    if (d < 0) overdue++
    else if (d <= 7) dueSoon++
  }
  return { overdue, dueSoon }
}

export default function IdentityHero({ client }: Props) {
  const { overdue, dueSoon } = countUrgency(client)
  const dSince = daysSinceContact(client.last_contact_date)
  const noContact = dSince === null || dSince >= 30
  const goalPct = (client as { goal_pct?: number }).goal_pct ?? 0
  const lastContactType = (client as { last_contact_type?: string | null }).last_contact_type

  return (
    <Box
      style={{
        borderRadius: 22,
        overflow: 'hidden',
        marginBottom: 14,
        background: 'var(--v2-cobalt-grad)',
        border: '1px solid rgba(100,150,255,0.08)',
        padding: '24px 28px 20px',
        position: 'relative',
      }}
    >
      {/* Subtle radial glow accent */}
      <div
        style={{
          position: 'absolute', right: -40, top: -40,
          width: 200, height: 200, borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(0,122,255,0.08) 0%, transparent 70%)',
          pointerEvents: 'none',
        }}
      />
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          position: 'relative',
          zIndex: 1,
          gap: 16,
        }}
      >
        {/* Left: name + meta + status chips */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <h1
            style={{
              fontSize: 30,
              fontWeight: 900,
              margin: 0,
              letterSpacing: '-0.02em',
              color: '#fff',
            }}
          >
            {client.last_name}, {client.first_name}
          </h1>

          {/* Meta row: ID, program category, eligibility code, planner */}
          <div
            style={{
              display: 'flex',
              gap: 8,
              marginTop: 8,
              flexWrap: 'wrap',
              alignItems: 'center',
            }}
          >
            <span style={{ fontSize: 12, color: 'rgba(200,210,230,0.6)', fontWeight: 600 }}>
              ID: <strong style={{ color: 'rgba(200,210,230,0.9)' }}>{client.client_id}</strong>
            </span>
            <span
              style={{
                fontSize: 10,
                fontWeight: 700,
                padding: '2px 8px',
                borderRadius: 10,
                background: 'rgba(255,255,255,0.06)',
                border: '1px solid rgba(255,255,255,0.08)',
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
                color: 'rgba(200,210,230,0.7)',
              }}
            >
              {client.category}
            </span>
            {client.eligibility_code && (
              <span style={{ fontSize: 12, color: 'rgba(200,210,230,0.5)' }}>
                {client.eligibility_code}
              </span>
            )}
            {client.profiles?.full_name && (
              <span style={{ fontSize: 12, color: 'rgba(200,210,230,0.4)' }}>
                👤 {client.profiles.full_name}
              </span>
            )}
          </div>

          {/* Status chip row */}
          <div style={{ display: 'flex', gap: 6, marginTop: 12, flexWrap: 'wrap' }}>
            {overdue > 0 && (
              <span
                style={{
                  fontSize: 10,
                  fontWeight: 700,
                  padding: '3px 10px',
                  borderRadius: 20,
                  background: 'rgba(255,69,58,0.15)',
                  border: '1px solid rgba(255,69,58,0.3)',
                  color: '#ff453a',
                }}
              >
                🔴 {overdue} overdue
              </span>
            )}
            {dueSoon > 0 && (
              <span
                style={{
                  fontSize: 10,
                  fontWeight: 700,
                  padding: '3px 10px',
                  borderRadius: 20,
                  background: 'rgba(255,159,10,0.12)',
                  border: '1px solid rgba(255,159,10,0.25)',
                  color: '#ff9f0a',
                }}
              >
                🟠 {dueSoon} due soon
              </span>
            )}
            <span
              style={{
                fontSize: 10,
                fontWeight: 600,
                padding: '3px 10px',
                borderRadius: 20,
                background: noContact ? 'rgba(255,159,10,0.1)' : 'rgba(255,255,255,0.03)',
                border: noContact
                  ? '1px solid rgba(255,159,10,0.2)'
                  : '1px solid rgba(255,255,255,0.05)',
                color: noContact ? '#ff9f0a' : 'rgba(200,210,230,0.5)',
              }}
            >
              {dSince !== null ? `📞 ${dSince}d ago` : 'No contact'}
              {lastContactType ? ` · ${lastContactType}` : ''}
            </span>
          </div>
        </div>

        {/* Right: health ring */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'flex-end',
            gap: 10,
            flexShrink: 0,
          }}
        >
          <HealthScoreRing score={goalPct} size={64} strokeWidth={5} />
        </div>
      </div>
    </Box>
  )
}
