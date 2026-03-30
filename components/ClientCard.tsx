'use client'

import Link from 'next/link'
import { useState } from 'react'
import { Client, getDateStatus, getDaysSinceContact, getSpmDateStatus, StatusLevel, formatDate } from '@/lib/types'
import StatusDot from './StatusDot'

interface Props {
  client: Client
  isPinned: boolean
  onTogglePin: (id: string) => void
  selected?: boolean
  onToggleSelect?: (id: string) => void
  showSelect?: boolean
  onContactLogged?: (clientId: string, date: string, type: string, note: string) => void
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
        {formatDate(date)}
      </span>
      <span style={{ color: 'var(--text-secondary)' }}>· {labels[status]}</span>
    </div>
  )
}

function SpmDueBadge({ date }: { date: string | null }) {
  if (!date) return null
  const status = getSpmDateStatus(date)
  if (status === 'none') return null

  const colorMap: Record<StatusLevel, string> = {
    green: '48,209,88',
    yellow: '255,214,10',
    orange: '255,159,10',
    red: '255,69,58',
    none: '150,150,150',
  }

  const labelMap: Record<StatusLevel, string> = {
    green: 'On track',
    yellow: '7-14d',
    orange: '< 7d',
    red: 'Overdue',
    none: '',
  }

  const rgb = colorMap[status]

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: 5,
      fontSize: 11,
      padding: '3px 8px',
      borderRadius: 6,
      background: `rgba(${rgb}, 0.12)`,
    }}>
      <StatusDot status={status} size={6} />
      <span style={{ color: 'var(--text-secondary)' }}>SPM due:</span>
      <span style={{ color: `var(--${status})`, fontWeight: 500 }}>
        {formatDate(date)}
      </span>
      <span style={{ color: 'var(--text-secondary)' }}>· {labelMap[status]}</span>
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

interface ContactModalProps {
  clientId: string
  onClose: () => void
  onSave: (date: string, type: string, note: string) => void
}

function ContactModal({ onClose, onSave }: ContactModalProps) {
  const [date, setDate] = useState(new Date().toISOString().split('T')[0])
  const [type, setType] = useState('Phone')
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)

  const contactTypes = ['Phone', 'Home Visit', 'Email', 'Office Visit']

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 1000,
      background: 'rgba(0,0,0,0.7)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 20,
    }} onClick={onClose}>
      <div className="card" style={{ width: '100%', maxWidth: 400 }} onClick={e => e.stopPropagation()}>
        <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 16 }}>📞 Log Contact</h3>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <label style={{ display: 'block', fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4 }}>Date</label>
            <input type="date" value={date} onChange={e => setDate(e.target.value)} style={{ width: '100%' }} />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4 }}>Contact Type</label>
            <select value={type} onChange={e => setType(e.target.value)} style={{ width: '100%' }}>
              {contactTypes.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4 }}>Note (optional)</label>
            <textarea
              value={note}
              onChange={e => setNote(e.target.value)}
              placeholder="Brief note about the contact..."
              style={{ width: '100%', minHeight: 80, resize: 'vertical' }}
            />
          </div>

          <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
            <button
              className="btn-primary"
              style={{ flex: 1 }}
              disabled={saving}
              onClick={async () => {
                setSaving(true)
                await onSave(date, type, note)
                setSaving(false)
              }}
            >
              {saving ? 'Saving…' : 'Log Contact'}
            </button>
            <button className="btn-secondary" onClick={onClose}>Cancel</button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function ClientCard({ client: c, isPinned, onTogglePin, selected, onToggleSelect, showSelect, onContactLogged }: Props) {
  const status = worstStatus(c)
  const daysSince = getDaysSinceContact(c.last_contact_date)
  const noContact = daysSince !== null && daysSince >= 7
  const [showModal, setShowModal] = useState(false)

  const borderColor: Record<StatusLevel, string> = {
    red: 'rgba(255,69,58,0.4)',
    orange: 'rgba(255,159,10,0.4)',
    yellow: 'rgba(255,214,10,0.4)',
    green: 'rgba(48,209,88,0.2)',
    none: 'var(--border)',
  }

  const handleContactSave = async (date: string, type: string, note: string) => {
    if (onContactLogged) {
      await onContactLogged(c.id, date, type, note)
    }
    setShowModal(false)
  }

  return (
    <>
      {showModal && (
        <ContactModal
          clientId={c.id}
          onClose={() => setShowModal(false)}
          onSave={handleContactSave}
        />
      )}
      <div
        className="card fade-in"
        style={{
          borderColor: selected ? 'var(--accent)' : borderColor[status],
          position: 'relative',
          display: 'flex',
          flexDirection: 'column',
          gap: 10,
          transition: 'border-color 0.2s',
        }}
      >
        {/* Top row: select + pin */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {showSelect && (
              <input
                type="checkbox"
                checked={selected ?? false}
                onChange={() => onToggleSelect?.(c.id)}
                style={{ width: 16, height: 16, cursor: 'pointer', flexShrink: 0 }}
              />
            )}
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
          <button
            onClick={() => onTogglePin(c.id)}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              fontSize: 14,
              opacity: isPinned ? 1 : 0.3,
              transition: 'opacity 0.15s',
              padding: 4,
              minWidth: 28,
              minHeight: 28,
            }}
            title={isPinned ? 'Unpin client' : 'Pin client'}
          >
            📌
          </button>
        </div>

        {/* Meta info */}
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
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

        {/* Key dates */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
          <DateBadge label="Elig" date={c.eligibility_end_date} />
          <DateBadge label="3mo" date={c.three_month_visit_due} />
          <DateBadge label="Waiver" date={c.quarterly_waiver_date} />
          <DateBadge label="MedTech" date={c.med_tech_redet_date} />
          <DateBadge label="POS" date={c.pos_deadline} />
          <DateBadge label="Assess" date={c.assessment_due} />
          <SpmDueBadge date={c.spm_next_due ?? null} />
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

        {/* Assigned planner */}
        {c.profiles?.full_name && (
          <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
            👤 {c.profiles.full_name}
          </div>
        )}

        {/* Log Contact button */}
        <button
          onClick={() => setShowModal(true)}
          style={{
            background: 'var(--surface-2)',
            border: '1px solid var(--border)',
            borderRadius: 6,
            color: 'var(--text-secondary)',
            fontSize: 11,
            padding: '5px 10px',
            cursor: 'pointer',
            alignSelf: 'flex-start',
            minHeight: 28,
            transition: 'color 0.15s',
          }}
        >
          📞 Log Contact
        </button>
      </div>
    </>
  )
}
