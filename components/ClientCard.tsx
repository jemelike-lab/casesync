'use client'

import Link from 'next/link'
import { Client, getDateStatus, getDaysSinceContact, StatusLevel } from '@/lib/types'
import StatusDot from './StatusDot'

interface Props {
  client: Client
  isPinned: boolean
  onTogglePin: (id: string) => void
}

function DateBadge({ label, date }: { label: string; date: string | null }) {
  const status = getDateStatus(date)
  if (!date || status === 'none') return null

  const labels: Record<StatusLevel, string> = {
    red: 'Overdue',
    orange: '< 7d',
    yellow: '< 30d',
    green: 'On track',
    none: '',
  }

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: 5,
      fontSize: 11,
      padding: '3px 8px',
      borderRadius: 6,
      background: `rgba(${status === 'red' ? '255,69,58' : status === 'orange' ? '255,159,10' : status === 'yellow' ? '255,214,10' : '48,209,88'}, 0.12)`,
    }}>
      <StatusDot status={status} size={6} />
      <span style={{ color: 'var(--text-secondary)' }}>{label}:</span>
      <span style={{ color: `var(--${status})`, fontWeight: 500 }}>
        {new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
      </span>
      <span style={{ color: 'var(--text-secondary)' }}>· {labels[status]}</span>
    </div>
  )
}

function worstStatus(client: Client): StatusLevel {
  const dates = [
    client.eligibility_end_date,
    client.three_month_visit_due,
    client.quarterly_waiver_date,
    client.med_tech_redet_date,
    client.pos_deadline,
    client.assessment_due,
    client.thirty_day_letter_date,
    client.co_financial_redet_date,
  ]
  const statuses = dates.map(d => getDateStatus(d))
  if (statuses.includes('red')) return 'red'
  if (statuses.includes('orange')) return 'orange'
  if (statuses.includes('yellow')) return 'yellow'
  if (statuses.includes('green')) return 'green'
  return 'none'
}

export default function ClientCard({ client: c, isPinned, onTogglePin }: Props) {
  const status = worstStatus(c)
  const daysSince = getDaysSinceContact(c.last_contact_date)
  const noContact = daysSince !== null && daysSince >= 7

  const borderColor: Record<StatusLevel, string> = {
    red: 'rgba(255,69,58,0.4)',
    orange: 'rgba(255,159,10,0.4)',
    yellow: 'rgba(255,214,10,0.4)',
    green: 'rgba(48,209,88,0.2)',
    none: 'var(--border)',
  }

  return (
    <div
      className="card fade-in"
      style={{
        borderColor: borderColor[status],
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
        transition: 'border-color 0.2s',
      }}
    >
      {/* Pin button */}
      <button
        onClick={() => onTogglePin(c.id)}
        style={{
          position: 'absolute',
          top: 10,
          right: 10,
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          fontSize: 14,
          opacity: isPinned ? 1 : 0.3,
          transition: 'opacity 0.15s',
        }}
        title={isPinned ? 'Unpin client' : 'Pin client'}
      >
        📌
      </button>

      {/* Header */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingRight: 24 }}>
          <StatusDot status={status} size={10} />
          <Link href={`/clients/${c.id}`} style={{
            fontSize: 16,
            fontWeight: 700,
            color: 'var(--text)',
            textDecoration: 'none',
          }}>
            {c.last_name}, {c.first_name}
          </Link>
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 4, alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{c.client_id}</span>
          <span style={{
            fontSize: 10,
            fontWeight: 700,
            padding: '1px 7px',
            borderRadius: 10,
            background: 'var(--surface-2)',
            color: 'var(--text-secondary)',
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
          }}>
            {c.category}
          </span>
          {c.eligibility_code && (
            <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{c.eligibility_code}</span>
          )}
        </div>
      </div>

      {/* Key dates */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
        <DateBadge label="Elig" date={c.eligibility_end_date} />
        <DateBadge label="3mo" date={c.three_month_visit_due} />
        <DateBadge label="Waiver" date={c.quarterly_waiver_date} />
        <DateBadge label="MedTech" date={c.med_tech_redet_date} />
        <DateBadge label="POS" date={c.pos_deadline} />
        <DateBadge label="Assess" date={c.assessment_due} />
      </div>

      {/* Contact + goal */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ fontSize: 11, color: noContact ? 'var(--orange)' : 'var(--text-secondary)' }}>
          {daysSince !== null
            ? `Last contact ${daysSince}d ago${noContact ? ' ⚠️' : ''}`
            : 'No contact recorded'}
          {c.last_contact_type && (
            <span style={{ marginLeft: 4, color: 'var(--text-secondary)' }}>({c.last_contact_type})</span>
          )}
        </div>
        <div style={{
          fontSize: 13,
          fontWeight: 700,
          color: c.goal_pct >= 80 ? 'var(--green)' : c.goal_pct >= 50 ? 'var(--yellow)' : 'var(--red)',
        }}>
          {c.goal_pct}%
        </div>
      </div>

      {/* Assigned */}
      {c.profiles?.full_name && (
        <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
          👤 {c.profiles.full_name}
        </div>
      )}
    </div>
  )
}
