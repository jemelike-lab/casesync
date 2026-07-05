'use client'

import Link from 'next/link'
import { useState, useRef, useCallback } from 'react'
import { Client, getDateStatus, getDaysSinceContact, getSpmDateStatus, StatusLevel, formatDate, getRiskLevel, getOverdueCount, getClientHealthScore, URGENCY_COLORS_RGB } from '@/lib/types'
import { getEligibilityDescription } from '@/lib/eligibility-codes'
import { businessTodayStr } from '@/lib/business-date'
import StatusDot from './StatusDot'
import HealthScoreRing from './HealthScoreRing'

interface Props {
  client: Client
  isPinned: boolean
  onTogglePin: (id: string) => void
  selected?: boolean
  onToggleSelect?: (id: string) => void
  showSelect?: boolean
  onContactLogged?: (clientId: string, date: string, type: string, note: string) => void
}

/* ─── Compact Date Pill ──────────────────────────────────────────── */

function DatePill({ label, date }: { label: string; date: string | null }) {
  const status = getDateStatus(date)
  if (!date || status === 'none' || status === 'green') return null

  const rgb = URGENCY_COLORS_RGB[status]
  const isCritical = status === 'critical'

  return (
    <span className={isCritical ? 'pulse-subtle' : undefined} style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: 4,
      fontSize: 10,
      fontWeight: 600,
      padding: '2px 7px',
      borderRadius: 20,
      background: `rgba(${rgb}, ${isCritical ? '0.18' : '0.10'})`,
      border: `1px solid rgba(${rgb}, ${isCritical ? '0.35' : '0.18'})`,
      lineHeight: 1.3,
      whiteSpace: 'nowrap',
    }}>
      <StatusDot status={status} size={5} />
      <span style={{ color: 'var(--text-secondary)' }}>{label}</span>
      <span style={{ color: `rgb(${rgb})`, fontWeight: 700 }}>
        {formatDate(date)}
      </span>
    </span>
  )
}

function SpmPill({ date }: { date: string | null }) {
  if (!date) return null
  const status = getSpmDateStatus(date)
  if (status === 'none' || status === 'green') return null

  const rgb = URGENCY_COLORS_RGB[status]
  const isCritical = status === 'critical'

  return (
    <span className={isCritical ? 'pulse-subtle' : undefined} style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: 4,
      fontSize: 10,
      fontWeight: 600,
      padding: '2px 7px',
      borderRadius: 20,
      background: `rgba(${rgb}, ${isCritical ? '0.18' : '0.10'})`,
      border: `1px solid rgba(${rgb}, ${isCritical ? '0.35' : '0.18'})`,
      lineHeight: 1.3,
      whiteSpace: 'nowrap',
    }}>
      <StatusDot status={status} size={5} />
      <span style={{ color: 'var(--text-secondary)' }}>SPM</span>
      <span style={{ color: `rgb(${rgb})`, fontWeight: 700 }}>
        {formatDate(date)}
      </span>
    </span>
  )
}

/* ─── Worst Status ───────────────────────────────────────────────── */

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
  if (statuses.includes('critical')) return 'critical'
  if (statuses.includes('red')) return 'red'
  if (statuses.includes('orange')) return 'orange'
  if (statuses.includes('yellow')) return 'yellow'
  if (statuses.includes('green')) return 'green'
  return 'none'
}

/* ─── Contact Modal ──────────────────────────────────────────────── */

function ContactModal({ onClose, onSave }: {
  clientId: string
  onClose: () => void
  onSave: (date: string, type: string, note: string) => void
}) {
  const [date, setDate] = useState(businessTodayStr())
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
            <button className="btn-primary" style={{ flex: 1 }} disabled={saving}
              onClick={async () => { setSaving(true); await onSave(date, type, note); setSaving(false) }}>
              {saving ? 'Saving…' : 'Log Contact'}
            </button>
            <button className="btn-secondary" onClick={onClose}>Cancel</button>
          </div>
        </div>
      </div>
    </div>
  )
}

/* ─── Color Maps ─────────────────────────────────────────────────── */

const GLOW: Record<StatusLevel, string> = {
  critical: 'rgba(255,69,58,0.25)',
  red: 'rgba(255,69,58,0.18)',
  orange: 'rgba(255,159,10,0.15)',
  yellow: 'rgba(255,214,10,0.12)',
  green: 'rgba(48,209,88,0.08)',
  none: 'rgba(100,100,100,0.05)',
}

const ACCENT: Record<StatusLevel, string> = {
  critical: '#ff453a', red: '#ff453a', orange: '#ff9f0a',
  yellow: '#ffd60a', green: '#30d158', none: 'var(--border)',
}

const TINT: Record<StatusLevel, string> = {
  critical: 'rgba(255,69,58,0.04)', red: 'rgba(255,69,58,0.03)',
  orange: 'rgba(255,159,10,0.02)', yellow: 'rgba(255,214,10,0.015)',
  green: 'rgba(48,209,88,0.01)', none: 'transparent',
}

const BORDER: Record<StatusLevel, string> = {
  critical: 'rgba(255,69,58,0.5)', red: 'rgba(255,69,58,0.35)',
  orange: 'rgba(255,159,10,0.3)', yellow: 'rgba(255,214,10,0.25)',
  green: 'rgba(48,209,88,0.15)', none: 'var(--border)',
}

/* ─── Main Component ─────────────────────────────────────────────── */

const SWIPE_THRESHOLD = 60

export default function ClientCard({ client: c, isPinned, onTogglePin, selected, onToggleSelect, showSelect, onContactLogged }: Props) {
  const status = worstStatus(c)
  const daysSince = getDaysSinceContact(c.last_contact_date)
  const noContact = daysSince !== null && daysSince >= 7
  const [showModal, setShowModal] = useState(false)
  const [hovered, setHovered] = useState(false)
  const overdueCount = getOverdueCount(c)
  const isOverdueCard = status === 'red' || status === 'critical'
  const healthScore = getClientHealthScore(c)
  const risk = getRiskLevel(c)

  const touchStartX = useRef<number>(0)
  const touchStartY = useRef<number>(0)
  const [swipeOffset, setSwipeOffset] = useState(0)
  const [swipeAction, setSwipeAction] = useState<'contact' | 'pin' | null>(null)

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX
    touchStartY.current = e.touches[0].clientY
  }, [])

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    const dx = e.touches[0].clientX - touchStartX.current
    const dy = e.touches[0].clientY - touchStartY.current
    if (Math.abs(dx) < Math.abs(dy)) return
    const clamped = Math.max(-100, Math.min(100, dx))
    setSwipeOffset(clamped)
    if (clamped > SWIPE_THRESHOLD) setSwipeAction('contact')
    else if (clamped < -SWIPE_THRESHOLD) setSwipeAction('pin')
    else setSwipeAction(null)
  }, [])

  const handleTouchEnd = useCallback(() => {
    if (swipeAction === 'contact') setShowModal(true)
    else if (swipeAction === 'pin') onTogglePin(c.id)
    setSwipeOffset(0)
    setSwipeAction(null)
  }, [swipeAction, c.id, onTogglePin])

  const handleContactSave = async (date: string, type: string, note: string) => {
    if (onContactLogged) await onContactLogged(c.id, date, type, note)
    setShowModal(false)
  }

  const hasDates = [
    c.eligibility_end_date, c.three_month_visit_due, c.quarterly_waiver_date,
    c.med_tech_redet_date, c.pos_deadline, c.assessment_due,
  ].some(d => { const s = getDateStatus(d); return s !== 'none' && s !== 'green' })
    || (c.spm_next_due && getSpmDateStatus(c.spm_next_due) !== 'none' && getSpmDateStatus(c.spm_next_due) !== 'green')

  return (
    <>
      {showModal && (
        <ContactModal clientId={c.id} onClose={() => setShowModal(false)} onSave={handleContactSave} />
      )}

      <div style={{ position: 'relative', overflow: 'hidden', borderRadius: 16 }}>
        {/* Swipe reveals */}
        {swipeOffset > 0 && (
          <div style={{
            position: 'absolute', left: 0, top: 0, bottom: 0, width: '100%',
            display: 'flex', alignItems: 'center', paddingLeft: 20,
            background: 'linear-gradient(90deg, rgba(48,209,88,0.2) 0%, rgba(48,209,88,0.06) 100%)',
            opacity: Math.min(1, swipeOffset / SWIPE_THRESHOLD), borderRadius: 16,
          }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: '#30d158' }}>📞 Log Contact</span>
          </div>
        )}
        {swipeOffset < 0 && (
          <div style={{
            position: 'absolute', right: 0, top: 0, bottom: 0, width: '100%',
            display: 'flex', alignItems: 'center', justifyContent: 'flex-end', paddingRight: 20,
            background: 'linear-gradient(270deg, rgba(0,122,255,0.2) 0%, rgba(0,122,255,0.06) 100%)',
            opacity: Math.min(1, Math.abs(swipeOffset) / SWIPE_THRESHOLD), borderRadius: 16,
          }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: '#007aff' }}>📌 {isPinned ? 'Unpin' : 'Pin'}</span>
          </div>
        )}

        <div
          className="fade-in"
          onMouseEnter={() => setHovered(true)}
          onMouseLeave={() => setHovered(false)}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          style={{
            position: 'relative',
            borderRadius: 16,
            border: selected ? '1.5px solid var(--accent)' : `1px solid ${BORDER[status]}`,
            borderLeft: `3.5px solid ${selected ? 'var(--accent)' : ACCENT[status]}`,
            background: `linear-gradient(135deg, var(--surface) 0%, ${TINT[status]} 100%)`,
            padding: '14px 16px 12px',
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
            transition: swipeOffset === 0
              ? 'transform 0.25s cubic-bezier(0.4,0,0.2,1), box-shadow 0.25s ease, border-color 0.2s'
              : 'border-color 0.2s',
            transform: swipeOffset !== 0
              ? `translateX(${swipeOffset}px)`
              : hovered ? 'translateY(-2px)' : 'translateY(0)',
            boxShadow: hovered
              ? `0 8px 24px ${GLOW[status]}, 0 2px 8px rgba(0,0,0,0.12)`
              : '0 1px 3px rgba(0,0,0,0.08)',
          }}
        >
          {/* OVERDUE badge */}
          {overdueCount >= 3 && (
            <span style={{
              position: 'absolute', top: -1, right: 56,
              background: 'linear-gradient(135deg, #ff453a, #d4322c)',
              color: '#fff', fontSize: 9, fontWeight: 800,
              letterSpacing: '0.08em', padding: '2px 8px',
              borderRadius: '0 0 8px 8px', textTransform: 'uppercase',
              zIndex: 2, boxShadow: '0 2px 6px rgba(255,69,58,0.3)',
            }}>
              {overdueCount} OVERDUE
            </span>
          )}

          {/* Pulsing dot */}
          {isOverdueCard && overdueCount < 3 && (
            <span className="pulse-dot" style={{
              position: 'absolute', top: 12, right: 58,
              width: 8, height: 8, borderRadius: '50%',
              background: '#ff453a', zIndex: 1,
            }} />
          )}

          {/* Health Ring */}
          <div style={{ position: 'absolute', top: 12, right: 12, zIndex: 3 }}>
            <HealthScoreRing score={healthScore} size={42} />
          </div>

          {/* Row 1: Name */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingRight: 52 }}>
            {showSelect && (
              <input type="checkbox" checked={selected ?? false}
                onChange={() => onToggleSelect?.(c.id)}
                style={{ width: 16, height: 16, cursor: 'pointer', flexShrink: 0, accentColor: 'var(--accent)' }}
              />
            )}
            <StatusDot status={status} size={9} />
            <Link href={`/clients/${c.id}`} style={{
              fontSize: 15, fontWeight: 800, color: 'var(--text)',
              textDecoration: 'none', lineHeight: 1.2, letterSpacing: '-0.01em',
            }}>
              {c.last_name}, {c.first_name}
            </Link>
            {risk === 'high' && (
              <span style={{
                fontSize: 9, fontWeight: 800, padding: '1px 6px', borderRadius: 10,
                background: 'rgba(255,69,58,0.15)', border: '1px solid rgba(255,69,58,0.25)',
                color: '#ff453a', textTransform: 'uppercase', letterSpacing: '0.06em', lineHeight: 1.4,
              }}>HIGH</span>
            )}
            {risk === 'medium' && (
              <span style={{
                fontSize: 9, fontWeight: 700, padding: '1px 6px', borderRadius: 10,
                background: 'rgba(255,159,10,0.12)', border: '1px solid rgba(255,159,10,0.2)',
                color: '#ff9f0a', textTransform: 'uppercase', letterSpacing: '0.06em', lineHeight: 1.4,
              }}>MED</span>
            )}
            <button onClick={() => onTogglePin(c.id)} style={{
              background: 'none', border: 'none', cursor: 'pointer', fontSize: 13,
              opacity: isPinned ? 1 : 0.25, transition: 'opacity 0.15s, transform 0.15s',
              transform: isPinned ? 'scale(1.1)' : 'scale(1)',
              padding: 2, minWidth: 24, minHeight: 24, marginLeft: 'auto', flexShrink: 0,
            }} title={isPinned ? 'Unpin client' : 'Pin client'}>📌</button>
          </div>

          {/* Row 2: Meta */}
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
            <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', fontVariantNumeric: 'tabular-nums' }}>
              {c.client_id}
            </span>
            <span style={{
              fontSize: 9, fontWeight: 700, padding: '1px 6px', borderRadius: 10,
              background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.08)',
              color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.08em',
            }}>{c.category}</span>
            {c.eligibility_code && (
              <span style={{ fontSize: 10, color: 'var(--text-secondary)', fontWeight: 500 }}>
                {c.eligibility_code}
                {getEligibilityDescription(c.eligibility_code) && (
                  <span style={{ marginLeft: 3, opacity: 0.6 }}>
                    · {getEligibilityDescription(c.eligibility_code).length > 28
                      ? getEligibilityDescription(c.eligibility_code).slice(0, 28) + '…'
                      : getEligibilityDescription(c.eligibility_code)}
                  </span>
                )}
              </span>
            )}
            {c.profiles?.full_name && (
              <span style={{ fontSize: 10, color: 'var(--text-secondary)', fontWeight: 500 }}>
                👤 {c.profiles.full_name}
              </span>
            )}
          </div>

          {/* Row 3: Date pills */}
          {hasDates && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: -2 }}>
              <DatePill label="Elig" date={c.eligibility_end_date} />
              <DatePill label="3mo" date={c.three_month_visit_due} />
              <DatePill label="Waiver" date={c.quarterly_waiver_date} />
              <DatePill label="MedTech" date={c.med_tech_redet_date} />
              <DatePill label="POS" date={c.pos_deadline} />
              <DatePill label="Assess" date={c.assessment_due} />
              <SpmPill date={c.spm_next_due ?? null} />
            </div>
          )}

          {/* Row 4: Footer */}
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            gap: 8, marginTop: 2, paddingTop: 8,
            borderTop: '1px solid rgba(255,255,255,0.04)',
          }}>
            <span style={{
              fontSize: 11, fontWeight: 500,
              color: noContact ? '#ff9f0a' : 'var(--text-secondary)',
            }}>
              {daysSince !== null
                ? `${daysSince}d ago${noContact ? ' ⚠️' : ''}`
                : 'No contact'}
              {c.last_contact_type && (
                <span style={{ opacity: 0.6 }}> · {c.last_contact_type}</span>
              )}
            </span>
            <span style={{
              fontSize: 12, fontWeight: 800,
              color: c.goal_pct >= 80 ? '#30d158' : c.goal_pct >= 50 ? '#ffd60a' : '#ff453a',
              fontVariantNumeric: 'tabular-nums', minWidth: 32, textAlign: 'right',
            }}>{c.goal_pct}%</span>
            <button onClick={() => setShowModal(true)} style={{
              background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: 8, color: 'var(--text-secondary)', fontSize: 11, fontWeight: 600,
              padding: '4px 10px', cursor: 'pointer', minHeight: 26,
              transition: 'all 0.15s', flexShrink: 0,
            }}>📞 Log</button>
          </div>
        </div>
      </div>
    </>
  )
}
