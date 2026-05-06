'use client'

import { isSupervisorLike } from '@/lib/roles'
import { useState, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Client, Profile, ClientNote, ActivityLog, getDateStatus, formatDate, getDaysSinceContact, StatusLevel, URGENCY_COLORS_RGB, URGENCY_LABELS } from '@/lib/types'
import StatusDot from '@/components/StatusDot'
import Link from 'next/link'
import ClientDocuments from '@/components/ClientDocuments'
import { useSearchParams } from 'next/navigation'
import { sendAssignmentEmail } from '@/app/actions/notifications'
import EligibilityCodeSelect from '@/components/EligibilityCodeSelect'
import { getEligibilityDescription } from '@/lib/eligibility-codes'
import HealthScoreRing from '@/components/HealthScoreRing'
import {
  AlertTriangle, Clock, FileText, Phone, Edit3, Printer, Save, X,
  ChevronDown, ChevronRight, MessageCircle, Activity, Paperclip,
  Shield, Users, Zap, Brain, RefreshCw, Send, Calendar,
} from 'lucide-react'

type EditableClient = Omit<Client, 'id' | 'client_id' | 'last_name' | 'first_name' | 'category' | 'assigned_to' | 'created_at' | 'updated_at' | 'profiles'>

interface ClientEditFormProps {
  client: Client
  currentUserId: string
  currentProfile: Profile
  planners?: Profile[]
}

/* ═══════════════════════════════════════════════════════════════════
   STYLES
   ═══════════════════════════════════════════════════════════════════ */

const inputStyle: React.CSSProperties = {
  background: 'rgba(255,255,255,0.04)',
  border: '1px solid rgba(255,255,255,0.1)',
  borderRadius: 10,
  color: '#f5f5f7',
  padding: '8px 12px',
  fontSize: 13,
  colorScheme: 'dark' as any,
  width: '100%',
  boxSizing: 'border-box',
  transition: 'border-color 0.2s, box-shadow 0.2s',
  outline: 'none',
}

const selectStyle: React.CSSProperties = {
  ...inputStyle,
  cursor: 'pointer',
  appearance: 'auto',
}

/* ═══════════════════════════════════════════════════════════════════
   GLASS SECTION CARD
   ═══════════════════════════════════════════════════════════════════ */

function GlassSection({ title, icon, children, id, defaultOpen = true, accentColor }: {
  title: string; icon: React.ReactNode; children: React.ReactNode;
  id?: string; defaultOpen?: boolean; accentColor?: string
}) {
  const [open, setOpen] = useState(defaultOpen)

  return (
    <div id={id} style={{
      marginBottom: 14,
      borderRadius: 18,
      border: '1px solid rgba(255,255,255,0.06)',
      background: 'linear-gradient(135deg, rgba(255,255,255,0.025) 0%, rgba(255,255,255,0.01) 100%)',
      overflow: 'hidden',
      transition: 'box-shadow 0.3s',
    }}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', gap: 10,
          padding: '14px 18px',
          background: open ? 'rgba(255,255,255,0.02)' : 'transparent',
          border: 'none', borderBottom: open ? '1px solid rgba(255,255,255,0.04)' : 'none',
          cursor: 'pointer', color: 'var(--text)',
          transition: 'background 0.2s',
        }}
      >
        <div style={{
          width: 30, height: 30, borderRadius: 10,
          background: accentColor ? `${accentColor}15` : 'rgba(0,122,255,0.08)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: accentColor ?? 'var(--accent)', flexShrink: 0,
        }}>
          {icon}
        </div>
        <span style={{
          fontSize: 13, fontWeight: 700, letterSpacing: '0.04em',
          textTransform: 'uppercase', color: 'var(--text-secondary)', flex: 1, textAlign: 'left',
        }}>
          {title}
        </span>
        {open ? <ChevronDown size={16} style={{ opacity: 0.4 }} /> : <ChevronRight size={16} style={{ opacity: 0.4 }} />}
      </button>
      {open && (
        <div style={{ padding: '4px 18px 14px' }}>
          {children}
        </div>
      )}
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════════
   SELECT OPTIONS
   ═══════════════════════════════════════════════════════════════════ */

type SelectOption = { value: string; label: string }

const POS_STATUS_OPTIONS: SelectOption[] = [
  { value: 'Pending', label: 'Pending' },
  { value: 'In-Progress', label: 'In-Progress' },
  { value: 'Completed', label: 'Completed' },
]
const MED_TECH_STATUS_OPTIONS: SelectOption[] = [
  { value: 'Active', label: 'Active' },
  { value: 'Pending', label: 'Pending' },
  { value: 'Expired', label: 'Expired' },
  { value: 'Not Applicable', label: 'Not Applicable' },
]
const ATP_OPTIONS: SelectOption[] = [
  { value: 'Pending', label: 'Pending' },
  { value: 'Approved', label: 'Approved' },
  { value: 'Expired', label: 'Expired' },
  { value: 'Not Applicable', label: 'Not Applicable' },
]
const AUDIT_REVIEW_OPTIONS: SelectOption[] = [
  { value: 'Not Started', label: 'Not Started' },
  { value: 'Pending', label: 'Pending' },
  { value: 'Passed', label: 'Passed' },
  { value: 'Failed', label: 'Failed' },
]
const QA_REVIEW_OPTIONS: SelectOption[] = [
  { value: 'Not Started', label: 'Not Started' },
  { value: 'Pending', label: 'Pending' },
  { value: 'Passed', label: 'Passed' },
  { value: 'Failed', label: 'Failed' },
]
const LAST_CONTACT_TYPE_OPTIONS: SelectOption[] = [
  { value: 'Phone', label: 'Phone' },
  { value: 'Home Visit', label: 'Home Visit' },
  { value: 'Email', label: 'Email' },
  { value: 'Office Visit', label: 'Office Visit' },
]

/* ═══════════════════════════════════════════════════════════════════
   FIELD ROW — Interactive with hover tooltip on dates
   ═══════════════════════════════════════════════════════════════════ */

function FieldRow({ label, field, value, type, editing, onChange, dateStatus, selectOptions, extra, highlighted }: {
  label: string; field: string; value: string | boolean | number | null | undefined;
  type: 'date' | 'text' | 'boolean' | 'number' | 'select'; editing: boolean;
  onChange: (field: string, value: string | boolean | number | null) => void;
  dateStatus?: StatusLevel;
  selectOptions?: SelectOption[]; extra?: React.ReactNode;
  highlighted?: boolean
}) {
  const [hovered, setHovered] = useState(false)
  if (!editing && (value === null || value === undefined || value === '')) return null

  let displayValue: string
  if (typeof value === 'boolean') displayValue = value ? '✓ Yes' : '✗ No'
  else if (value === null || value === undefined) displayValue = '—'
  else if (type === 'date') displayValue = formatDate(String(value).split('T')[0])
  else displayValue = String(value)

  const isCriticalField = !editing && type === 'date' && dateStatus === 'critical'
  const isOverdueField = !editing && type === 'date' && (dateStatus === 'red' || dateStatus === 'critical')
  const isDueSoonField = !editing && type === 'date' && dateStatus === 'orange'
  const isYellow = !editing && type === 'date' && dateStatus === 'yellow'
  const isGreen = !editing && type === 'date' && dateStatus === 'green'

  // Compute days for tooltip
  let daysText = ''
  if (type === 'date' && value && !editing) {
    const [y, m, d] = String(value).split('T')[0].split('-').map(Number)
    const date = new Date(y, m - 1, d)
    const now = new Date()
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const diff = Math.round((date.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
    if (diff < 0) daysText = `${Math.abs(diff)} day${Math.abs(diff) !== 1 ? 's' : ''} overdue`
    else if (diff === 0) daysText = 'Due today'
    else daysText = `Due in ${diff} day${diff !== 1 ? 's' : ''}`
  }

  const accentRgb = dateStatus && dateStatus !== 'none' ? URGENCY_COLORS_RGB[dateStatus] : null

  return (
    <div
      id={highlighted ? `field-${field}` : undefined}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: '10px 12px', gap: 12,
        borderRadius: 10,
        marginTop: 2,
        borderLeft: isOverdueField ? '3px solid rgba(255,69,58,0.6)'
          : isDueSoonField ? '3px solid rgba(255,159,10,0.5)'
          : '3px solid transparent',
        background: isOverdueField
          ? (hovered ? 'rgba(255,69,58,0.08)' : 'rgba(255,69,58,0.04)')
          : isDueSoonField
            ? (hovered ? 'rgba(255,159,10,0.06)' : 'rgba(255,159,10,0.03)')
            : (hovered ? 'rgba(255,255,255,0.03)' : 'transparent'),
        boxShadow: highlighted ? '0 0 0 2px rgba(255,69,58,0.4)' : undefined,
        transition: 'background 0.2s, box-shadow 0.5s ease',
      }}
    >
      <span style={{ fontSize: 13, color: 'var(--text-secondary)', flex: '0 0 200px' }}>{label}</span>
      {editing ? (
        <div style={{ flex: 1 }}>
          {type === 'date' && (
            <input type="date" value={value ? String(value).split('T')[0] : ''}
              onChange={e => onChange(field, e.target.value || null)} style={inputStyle} />
          )}
          {type === 'text' && (
            <input type="text" value={value !== null && value !== undefined ? String(value) : ''}
              onChange={e => onChange(field, e.target.value || null)} style={inputStyle} />
          )}
          {type === 'number' && (
            <input type="number" min={0} max={100} value={value !== null && value !== undefined ? Number(value) : ''}
              onChange={e => onChange(field, e.target.value ? Number(e.target.value) : null)} style={inputStyle} />
          )}
          {type === 'boolean' && (
            <div>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                <input type="checkbox" checked={Boolean(value)}
                  onChange={e => onChange(field, e.target.checked)}
                  style={{ width: 16, height: 16, accentColor: '#007aff', cursor: 'pointer' }} />
                <span style={{ fontSize: 13, color: 'var(--text)' }}>{value ? 'Yes' : 'No'}</span>
              </label>
              {extra}
            </div>
          )}
          {type === 'select' && selectOptions && (
            <select value={(value as string) ?? ''} onChange={e => onChange(field, e.target.value || null)} style={selectStyle}>
              <option value="">— Select —</option>
              {selectOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          )}
        </div>
      ) : (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 1, justifyContent: 'flex-end', position: 'relative' }}>
          {/* Date countdown chip on hover */}
          {hovered && daysText && accentRgb && (
            <span style={{
              fontSize: 10, fontWeight: 700, padding: '2px 8px',
              borderRadius: 20, background: `rgba(${accentRgb}, 0.15)`,
              border: `1px solid rgba(${accentRgb}, 0.25)`,
              color: `rgb(${accentRgb})`,
              whiteSpace: 'nowrap',
              animation: 'fadeIn 0.15s ease',
            }}>
              {daysText}
            </span>
          )}
          {/* Green dates show a subtle chip too */}
          {hovered && daysText && isGreen && (
            <span style={{
              fontSize: 10, fontWeight: 700, padding: '2px 8px',
              borderRadius: 20, background: 'rgba(48,209,88,0.1)',
              border: '1px solid rgba(48,209,88,0.2)',
              color: '#30d158', whiteSpace: 'nowrap',
              animation: 'fadeIn 0.15s ease',
            }}>
              {daysText}
            </span>
          )}
          <span style={{
            fontSize: 13, fontWeight: 500,
            color: dateStatus ? `var(--${dateStatus === 'none' ? 'text-secondary' : dateStatus === 'critical' ? 'red' : dateStatus})` : 'var(--text)',
            textAlign: 'right',
          }}>
            {dateStatus && dateStatus !== 'none' && <StatusDot status={dateStatus} style={{ marginRight: 6 }} />}
            {displayValue}
          </span>
          {isOverdueField && (
            <span className={isCriticalField ? 'pulse-subtle' : undefined} style={{
              background: isCriticalField ? 'rgba(255,69,58,0.3)' : 'rgba(255,69,58,0.2)',
              border: '1px solid rgba(255,69,58,0.4)',
              color: '#ff453a', fontSize: 9, fontWeight: 800,
              padding: '1px 6px', borderRadius: 6,
              textTransform: 'uppercase', letterSpacing: '0.08em', flexShrink: 0,
            }}>
              {isCriticalField ? 'CRITICAL' : 'OVERDUE'}
            </span>
          )}
          {isDueSoonField && (
            <span style={{
              background: 'rgba(255,159,10,0.2)',
              border: '1px solid rgba(255,159,10,0.4)',
              color: '#ff9f0a', fontSize: 9, fontWeight: 800,
              padding: '1px 6px', borderRadius: 6,
              textTransform: 'uppercase', letterSpacing: '0.08em', flexShrink: 0,
            }}>
              DUE SOON
            </span>
          )}
          {isYellow && (
            <span style={{
              background: 'rgba(255,214,10,0.12)',
              border: '1px solid rgba(255,214,10,0.25)',
              color: '#ffd60a', fontSize: 9, fontWeight: 700,
              padding: '1px 6px', borderRadius: 6,
              textTransform: 'uppercase', letterSpacing: '0.08em', flexShrink: 0,
            }}>
              UPCOMING
            </span>
          )}
        </div>
      )}
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════════
   URGENCY TIMELINE — Visual horizontal bar of all deadlines
   ═══════════════════════════════════════════════════════════════════ */

function UrgencyTimeline({ formData }: { formData: Partial<EditableClient> }) {
  const DATE_FIELDS: Array<{ key: string; label: string }> = [
    { key: 'eligibility_end_date', label: 'Eligibility' },
    { key: 'three_month_visit_due', label: '3-Mo Visit' },
    { key: 'quarterly_waiver_date', label: 'Qtrly Waiver' },
    { key: 'med_tech_redet_date', label: 'Med Tech' },
    { key: 'pos_deadline', label: 'POS' },
    { key: 'assessment_due', label: 'Assessment' },
    { key: 'thirty_day_letter_date', label: '30-Day' },
    { key: 'co_financial_redet_date', label: 'CO Fin Redet' },
    { key: 'doc_mdh_date', label: 'Doc MDH' },
    { key: 'spm_next_due', label: 'SPM' },
  ]

  const items = DATE_FIELDS.map(({ key, label }) => {
    const d = formData[key as keyof typeof formData] as string | null | undefined
    if (!d) return null
    const status = getDateStatus(d)
    return { label, date: d, status }
  }).filter(Boolean) as Array<{ label: string; date: string; status: StatusLevel }>

  // Sort: overdue first, then by date
  items.sort((a, b) => {
    const priority: Record<StatusLevel, number> = { critical: 0, red: 1, orange: 2, yellow: 3, green: 4, none: 5 }
    return priority[a.status] - priority[b.status]
  })

  const counts = { overdue: 0, dueSoon: 0, upcoming: 0, onTrack: 0 }
  for (const item of items) {
    if (item.status === 'critical' || item.status === 'red') counts.overdue++
    else if (item.status === 'orange') counts.dueSoon++
    else if (item.status === 'yellow') counts.upcoming++
    else counts.onTrack++
  }

  const total = items.length
  if (total === 0) return null

  return (
    <div style={{
      marginBottom: 14, borderRadius: 16, overflow: 'hidden',
      border: '1px solid rgba(255,255,255,0.06)',
      background: 'linear-gradient(135deg, rgba(255,255,255,0.025) 0%, rgba(255,255,255,0.008) 100%)',
    }}>
      {/* Segmented bar */}
      <div style={{ display: 'flex', height: 6, borderRadius: 3, overflow: 'hidden', margin: '14px 18px 8px' }}>
        {counts.overdue > 0 && <div style={{ flex: counts.overdue, background: '#ff453a', transition: 'flex 0.5s' }} />}
        {counts.dueSoon > 0 && <div style={{ flex: counts.dueSoon, background: '#ff9f0a', transition: 'flex 0.5s' }} />}
        {counts.upcoming > 0 && <div style={{ flex: counts.upcoming, background: '#ffd60a', transition: 'flex 0.5s' }} />}
        {counts.onTrack > 0 && <div style={{ flex: counts.onTrack, background: '#30d158', transition: 'flex 0.5s' }} />}
      </div>

      {/* Legend pills */}
      <div style={{ display: 'flex', gap: 8, padding: '4px 18px 12px', flexWrap: 'wrap' }}>
        {counts.overdue > 0 && (
          <span style={{ fontSize: 10, fontWeight: 700, color: '#ff453a', display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#ff453a', display: 'inline-block' }} />
            {counts.overdue} overdue
          </span>
        )}
        {counts.dueSoon > 0 && (
          <span style={{ fontSize: 10, fontWeight: 700, color: '#ff9f0a', display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#ff9f0a', display: 'inline-block' }} />
            {counts.dueSoon} due soon
          </span>
        )}
        {counts.upcoming > 0 && (
          <span style={{ fontSize: 10, fontWeight: 700, color: '#ffd60a', display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#ffd60a', display: 'inline-block' }} />
            {counts.upcoming} upcoming
          </span>
        )}
        {counts.onTrack > 0 && (
          <span style={{ fontSize: 10, fontWeight: 700, color: '#30d158', display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#30d158', display: 'inline-block' }} />
            {counts.onTrack} on track
          </span>
        )}
      </div>

      {/* Individual date chips — only overdue and due soon */}
      {(counts.overdue > 0 || counts.dueSoon > 0) && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, padding: '0 18px 14px' }}>
          {items.filter(i => i.status === 'critical' || i.status === 'red' || i.status === 'orange').map((item, idx) => {
            const rgb = URGENCY_COLORS_RGB[item.status]
            return (
              <span key={idx} style={{
                display: 'inline-flex', alignItems: 'center', gap: 4,
                fontSize: 10, fontWeight: 600, padding: '3px 8px',
                borderRadius: 20, background: `rgba(${rgb}, 0.1)`,
                border: `1px solid rgba(${rgb}, 0.2)`,
                color: `rgb(${rgb})`,
              }}>
                <StatusDot status={item.status} size={5} />
                {item.label} · {formatDate(item.date)}
              </span>
            )
          })}
        </div>
      )}
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════════
   SMART SUGGESTION
   ═══════════════════════════════════════════════════════════════════ */

function SmartSuggestion({ formData, client }: { formData: Partial<EditableClient>, client: Client }) {
  const DATE_FIELDS: Array<{ key: keyof typeof formData; label: string }> = [
    { key: 'eligibility_end_date', label: 'Eligibility End' },
    { key: 'three_month_visit_due', label: '3-Month Visit Due' },
    { key: 'quarterly_waiver_date', label: 'Quarterly Waiver' },
    { key: 'med_tech_redet_date', label: 'Med Tech Redet' },
    { key: 'pos_deadline', label: 'POS Deadline' },
    { key: 'assessment_due', label: 'Assessment Due' },
    { key: 'thirty_day_letter_date', label: '30-Day Letter' },
    { key: 'co_financial_redet_date', label: 'CO Financial Redet' },
    { key: 'co_app_date', label: 'CO App Date' },
    { key: 'mfp_consent_date', label: 'MFP Consent' },
    { key: 'two57_date', label: '257 Date' },
    { key: 'doc_mdh_date', label: 'Doc MDH' },
    { key: 'spm_next_due', label: 'SPM Next Due' },
  ]

  let mostOverdueField: { label: string; date: string } | null = null
  let mostOverdueDays = 0
  for (const { key, label } of DATE_FIELDS) {
    const d = formData[key] as string | null | undefined
    if (!d) continue
    const status = getDateStatus(d)
    if (status === 'red' || status === 'critical') {
      const [y, m, day] = d.split('-').map(Number)
      const date = new Date(y, m - 1, day)
      const now = new Date()
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
      const days = Math.round((today.getTime() - date.getTime()) / (1000 * 60 * 60 * 24))
      if (days > mostOverdueDays) {
        mostOverdueDays = days
        mostOverdueField = { label, date: d }
      }
    }
  }

  let icon: React.ReactNode
  let text: React.ReactNode
  let bg: string
  let borderC: string
  let iconColor: string

  if (mostOverdueField) {
    icon = <Zap size={16} />
    iconColor = '#ff453a'
    bg = 'rgba(255,69,58,0.06)'
    borderC = 'rgba(255,69,58,0.15)'
    text = <>Update <strong style={{ color: 'var(--text)' }}>{mostOverdueField.label}</strong> — overdue since {formatDate(mostOverdueField.date)} ({mostOverdueDays}d ago)</>
  } else {
    const daysSince = getDaysSinceContact(client.last_contact_date)
    if (daysSince !== null && daysSince >= 7) {
      icon = <Phone size={16} />
      iconColor = '#007aff'
      bg = 'rgba(0,122,255,0.06)'
      borderC = 'rgba(0,122,255,0.15)'
      text = <>Log a contact — last contact was <strong style={{ color: 'var(--text)' }}>{daysSince} days ago</strong></>
    } else {
      const spmDue = formData.spm_next_due as string | null | undefined
      if (spmDue) {
        const status = getDateStatus(spmDue)
        if (status === 'orange' || status === 'yellow') {
          const [y, m, d] = spmDue.split('-').map(Number)
          const date = new Date(y, m - 1, d)
          const now = new Date()
          const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
          const daysUntil = Math.round((date.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
          icon = <Calendar size={16} />
          iconColor = '#007aff'
          bg = 'rgba(0,122,255,0.06)'
          borderC = 'rgba(0,122,255,0.15)'
          text = <>SPM due in <strong style={{ color: 'var(--text)' }}>{daysUntil} days</strong> — schedule now</>
        } else {
          icon = <span style={{ fontSize: 14 }}>✅</span>
          iconColor = '#30d158'
          bg = 'rgba(48,209,88,0.06)'
          borderC = 'rgba(48,209,88,0.15)'
          text = <span style={{ color: '#30d158' }}>No immediate actions needed</span>
        }
      } else {
        icon = <span style={{ fontSize: 14 }}>✅</span>
        iconColor = '#30d158'
        bg = 'rgba(48,209,88,0.06)'
        borderC = 'rgba(48,209,88,0.15)'
        text = <span style={{ color: '#30d158' }}>No immediate actions needed</span>
      }
    }
  }

  return (
    <div style={{
      background: bg, border: `1px solid ${borderC}`, borderRadius: 14,
      padding: '12px 16px', marginBottom: 14,
      display: 'flex', alignItems: 'center', gap: 10,
    }}>
      <div style={{ color: iconColor, flexShrink: 0 }}>{icon}</div>
      <div>
        <span style={{ fontSize: 11, fontWeight: 600, color: iconColor, marginRight: 6 }}>Next action:</span>
        <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{text}</span>
      </div>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════════
   AI SECTION
   ═══════════════════════════════════════════════════════════════════ */

function AIAskClient({ clientId }: { clientId: string }) {
  const [question, setQuestion] = useState('')
  const [answer, setAnswer] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const ask = async () => {
    if (!question.trim()) return
    setLoading(true); setError(null)
    try {
      const res = await fetch('/api/blhbot/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: clientId, question: question.trim() }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to get answer')
      setAnswer(data.answer)
    } catch (err: any) { setError(err.message || 'Failed') }
    finally { setLoading(false) }
  }

  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <input value={question} onChange={e => setQuestion(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') ask() }}
          placeholder="Ask about this client…"
          style={{ ...inputStyle, flex: 1, minWidth: 220, borderColor: 'rgba(191,90,242,0.25)' }}
        />
        <button onClick={ask} disabled={loading || !question.trim()} style={{
          background: 'linear-gradient(135deg, rgba(191,90,242,0.15), rgba(191,90,242,0.08))',
          border: '1px solid rgba(191,90,242,0.25)', borderRadius: 10,
          color: '#bf5af2', fontSize: 12, fontWeight: 600,
          padding: '8px 14px', cursor: loading ? 'not-allowed' : 'pointer',
          opacity: loading ? 0.7 : 1, display: 'inline-flex', alignItems: 'center', gap: 6,
          transition: 'all 0.2s',
        }}>
          {loading ? <><RefreshCw size={14} style={{ animation: 'spin 1s linear infinite' }} /> Asking…</> : <><Brain size={14} /> Ask BLHBot</>}
        </button>
      </div>
      {error && <div style={{ marginTop: 8, fontSize: 12, color: 'var(--red)' }}>⚠️ {error}</div>}
      {answer && (
        <div style={{
          marginTop: 10, background: 'rgba(191,90,242,0.05)',
          border: '1px solid rgba(191,90,242,0.15)', borderRadius: 12,
          padding: '14px 16px', fontSize: 13, color: 'var(--text)',
          lineHeight: 1.6, whiteSpace: 'pre-wrap',
        }}>{answer}</div>
      )}
      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}

function AISummary({ clientId }: { clientId: string }) {
  const [summary, setSummary] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const generate = async () => {
    setLoading(true); setError(null)
    try {
      const res = await fetch('/api/client-summary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed')
      setSummary(data.summary)
    } catch (err: any) { setError(err.message || 'Failed') }
    finally { setLoading(false) }
  }

  return (
    <div>
      <button onClick={generate} disabled={loading} style={{
        background: 'linear-gradient(135deg, rgba(191,90,242,0.12), rgba(191,90,242,0.06))',
        border: '1px solid rgba(191,90,242,0.2)', borderRadius: 10,
        color: '#bf5af2', fontSize: 12, fontWeight: 600,
        padding: '8px 14px', cursor: loading ? 'not-allowed' : 'pointer',
        opacity: loading ? 0.7 : 1, display: 'inline-flex', alignItems: 'center', gap: 6,
        transition: 'all 0.2s',
      }}>
        {loading ? <><RefreshCw size={14} style={{ animation: 'spin 1s linear infinite' }} /> Generating…</> : <><Zap size={14} /> AI Summary</>}
      </button>
      {error && <div style={{ marginTop: 8, fontSize: 12, color: 'var(--red)' }}>⚠️ {error}</div>}
      {summary && (
        <div style={{
          marginTop: 10, background: 'rgba(191,90,242,0.05)',
          border: '1px solid rgba(191,90,242,0.15)', borderRadius: 12,
          padding: '14px 16px', fontSize: 13, color: 'var(--text)', lineHeight: 1.6,
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
            <span>{summary}</span>
            <button onClick={generate} disabled={loading} style={{
              background: 'none', border: 'none', cursor: 'pointer',
              color: 'var(--text-secondary)', fontSize: 11, padding: '2px 4px', flexShrink: 0,
            }} title="Regenerate">🔄</button>
          </div>
        </div>
      )}
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════════
   NOTES — Chat-bubble style
   ═══════════════════════════════════════════════════════════════════ */

function NotesSection({ clientId, currentUserId }: { clientId: string; currentUserId: string }) {
  const [notes, setNotes] = useState<ClientNote[]>([])
  const [newNote, setNewNote] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    const supabase = createClient()
    supabase.from('client_notes')
      .select('*, profiles(full_name)')
      .eq('client_id', clientId)
      .order('created_at', { ascending: false })
      .then(({ data }) => { if (data) setNotes(data as ClientNote[]) })
  }, [clientId])

  const addNote = async () => {
    if (!newNote.trim()) return
    setSaving(true)
    const supabase = createClient()
    const { data, error } = await supabase.from('client_notes').insert({
      client_id: clientId,
      author_id: currentUserId,
      content: newNote.trim(),
    }).select('*, profiles(full_name)').single()
    if (!error && data) { setNotes(prev => [data as ClientNote, ...prev]); setNewNote('') }
    setSaving(false)
  }

  // Get initials for avatar
  const getInitials = (name: string | null | undefined) => {
    if (!name) return '?'
    const parts = name.trim().split(' ')
    if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
    return parts[0][0]?.toUpperCase() ?? '?'
  }

  return (
    <GlassSection title="Notes" icon={<MessageCircle size={16} />} accentColor="#007aff">
      {/* Compose */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 12, marginTop: 8 }}>
        <textarea value={newNote} onChange={e => setNewNote(e.target.value)}
          placeholder="Add a note…"
          style={{ ...inputStyle, flex: 1, minHeight: 60, resize: 'vertical', borderRadius: 12 }}
        />
        <button onClick={addNote} disabled={saving || !newNote.trim()} style={{
          background: 'rgba(0,122,255,0.1)', border: '1px solid rgba(0,122,255,0.2)',
          borderRadius: 10, color: '#007aff', fontSize: 12, fontWeight: 600,
          padding: '8px 12px', cursor: saving ? 'not-allowed' : 'pointer',
          alignSelf: 'flex-end', display: 'flex', alignItems: 'center', gap: 5,
          opacity: saving || !newNote.trim() ? 0.5 : 1,
        }}>
          <Send size={14} /> {saving ? 'Saving…' : 'Add'}
        </button>
      </div>

      {notes.length === 0 && <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: '8px 0' }}>No notes yet.</p>}

      {notes.map(note => {
        const initials = getInitials(note.profiles?.full_name)
        const hue = (note.profiles?.full_name ?? '').split('').reduce((acc, c) => acc + c.charCodeAt(0), 0) % 360
        return (
          <div key={note.id} style={{
            display: 'flex', gap: 10, padding: '10px 0',
            borderTop: '1px solid rgba(255,255,255,0.04)',
          }}>
            <div style={{
              width: 32, height: 32, borderRadius: 10, flexShrink: 0,
              background: `linear-gradient(135deg, hsl(${hue}, 60%, 25%), hsl(${hue}, 60%, 18%))`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 11, fontWeight: 800, color: `hsl(${hue}, 70%, 75%)`,
            }}>{initials}</div>
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--accent)' }}>
                  {note.profiles?.full_name ?? 'Unknown'}
                </span>
                <span style={{ fontSize: 10, color: 'var(--text-secondary)' }}>
                  {new Date(note.created_at).toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
              <p style={{
                fontSize: 13, margin: 0, color: 'var(--text)', whiteSpace: 'pre-wrap',
                lineHeight: 1.5, background: 'rgba(255,255,255,0.02)',
                borderRadius: 10, padding: '8px 12px',
                border: '1px solid rgba(255,255,255,0.04)',
              }}>{note.content}</p>
            </div>
          </div>
        )
      })}
    </GlassSection>
  )
}

/* ═══════════════════════════════════════════════════════════════════
   ACTIVITY LOG — Timeline style
   ═══════════════════════════════════════════════════════════════════ */

function ActivitySection({ clientId }: { clientId: string }) {
  const [logs, setLogs] = useState<ActivityLog[]>([])

  useEffect(() => {
    const supabase = createClient()
    supabase.from('activity_log')
      .select('*, profiles(full_name)')
      .eq('client_id', clientId)
      .order('created_at', { ascending: false })
      .limit(20)
      .then(({ data }) => { if (data) setLogs(data as ActivityLog[]) })
  }, [clientId])

  if (logs.length === 0) return null

  return (
    <GlassSection title="Activity Log" icon={<Activity size={16} />} accentColor="#30d158" defaultOpen={false}>
      <div style={{ position: 'relative', paddingLeft: 20, marginTop: 8 }}>
        {/* Connecting line */}
        <div style={{
          position: 'absolute', left: 6, top: 4, bottom: 4, width: 2,
          background: 'linear-gradient(180deg, rgba(255,255,255,0.08) 0%, rgba(255,255,255,0.02) 100%)',
          borderRadius: 1,
        }} />

        {logs.map(log => (
          <div key={log.id} style={{
            position: 'relative', padding: '8px 0 12px', fontSize: 12,
          }}>
            {/* Dot */}
            <div style={{
              position: 'absolute', left: -17, top: 12,
              width: 8, height: 8, borderRadius: '50%',
              background: log.field_name ? 'var(--accent)' : 'var(--text-secondary)',
              border: '2px solid var(--bg)',
            }} />
            <div>
              <span style={{ color: 'var(--accent)', fontWeight: 700 }}>{log.profiles?.full_name ?? 'Someone'}</span>
              {' '}
              {log.field_name ? (
                <>changed <strong style={{ color: 'var(--text)' }}>{log.field_name.replace(/_/g, ' ')}</strong>{' '}
                  {log.old_value && <>from <span style={{ color: '#ff453a', padding: '0 3px', background: 'rgba(255,69,58,0.08)', borderRadius: 4 }}>{log.old_value}</span>{' '}</>}
                  {log.new_value && <>to <span style={{ color: '#30d158', padding: '0 3px', background: 'rgba(48,209,88,0.08)', borderRadius: 4 }}>{log.new_value}</span></>}
                </>
              ) : (
                <span style={{ color: 'var(--text)' }}>{log.action}</span>
              )}
              <div style={{ fontSize: 10, color: 'var(--text-secondary)', marginTop: 3 }}>
                {new Date(log.created_at).toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
              </div>
            </div>
          </div>
        ))}
      </div>
    </GlassSection>
  )
}

/* ═══════════════════════════════════════════════════════════════════
   MAIN COMPONENT
   ═══════════════════════════════════════════════════════════════════ */

export default function ClientEditForm({ client, currentUserId, currentProfile, planners = [] }: ClientEditFormProps) {
  const searchParams = useSearchParams()
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null)
  const [assignedTo, setAssignedTo] = useState(client.assigned_to ?? '')
  const [plannerSearch, setPlannerSearch] = useState('')
  const [highlightedField, setHighlightedField] = useState<string | null>(null)
  const [assignSaving, setAssignSaving] = useState(false)
  const [deactivating, setDeactivating] = useState(false)

  useEffect(() => {
    if (searchParams.get('created') === '1') {
      setToast({ type: 'success', message: 'Client created successfully!' })
      setTimeout(() => setToast(null), 4000)
    }
  }, [])

  const [formData, setFormData] = useState<Partial<EditableClient>>({
    eligibility_code: client.eligibility_code,
    eligibility_end_date: client.eligibility_end_date,
    last_contact_date: client.last_contact_date,
    last_contact_type: client.last_contact_type,
    three_month_visit_date: client.three_month_visit_date,
    three_month_visit_due: client.three_month_visit_due,
    quarterly_waiver_date: client.quarterly_waiver_date,
    med_tech_redet_date: client.med_tech_redet_date,
    med_tech_status: client.med_tech_status,
    poc_date: client.poc_date,
    loc_date: client.loc_date,
    doc_mdh_date: client.doc_mdh_date,
    pos_deadline: client.pos_deadline,
    pos_status: client.pos_status,
    assessment_due: client.assessment_due,
    spm_completed: client.spm_completed,
    spm_next_due: client.spm_next_due,
    foc: client.foc,
    provider_forms: client.provider_forms,
    signatures_needed: client.signatures_needed,
    schedule_docs: client.schedule_docs,
    atp: client.atp,
    snfs: client.snfs,
    lease: client.lease,
    co_financial_redet_date: client.co_financial_redet_date,
    co_app_date: client.co_app_date,
    request_letter: client.request_letter,
    mfp_consent_date: client.mfp_consent_date,
    two57_date: client.two57_date,
    reportable_events: client.reportable_events,
    appeals: client.appeals,
    thirty_day_letter_date: client.thirty_day_letter_date,
    drop_in_visit_date: client.drop_in_visit_date,
    audit_review: client.audit_review,
    qa_review: client.qa_review,
    goal_pct: client.goal_pct,
  })

  const canReassign = currentProfile.role === 'supervisor' || currentProfile.role === 'it' || currentProfile.role === 'team_manager'
  const filteredPlanners = planners.filter((p) => {
    const q = plannerSearch.trim().toLowerCase()
    if (!q) return true
    return (p.full_name ?? '').toLowerCase().includes(q)
  })

  const handleChange = (field: string, value: string | boolean | number | null) => {
    if (field === 'spm_completed') {
      const checked = Boolean(value)
      if (checked) {
        const nextDue = new Date()
        nextDue.setDate(nextDue.getDate() + 30)
        setFormData(prev => ({ ...prev, spm_completed: true, spm_next_due: nextDue.toISOString().split('T')[0] }))
      } else {
        setFormData(prev => ({ ...prev, spm_completed: false }))
      }
      return
    }
    setFormData(prev => ({ ...prev, [field]: value }))
  }

  const handleSave = async () => {
    setSaving(true); setToast(null)
    try {
      const supabase = createClient()
      const changes: Array<{ field: string; old: string | null; new: string | null }> = []
      const watchFields: (keyof typeof formData)[] = [
        'pos_status', 'eligibility_end_date', 'last_contact_date', 'assessment_due',
        'goal_pct', 'med_tech_status', 'atp', 'spm_completed', 'pos_deadline',
      ]
      for (const field of watchFields) {
        const oldVal = client[field as keyof Client]
        const newVal = formData[field]
        if (String(oldVal ?? '') !== String(newVal ?? '')) {
          changes.push({ field: field as string, old: oldVal != null ? String(oldVal) : null, new: newVal != null ? String(newVal) : null })
        }
      }
      const { error } = await supabase.from('clients').update(formData).eq('id', client.id)
      if (error) throw error
      if (changes.length > 0) {
        await supabase.from('activity_log').insert(
          changes.map(c => ({ client_id: client.id, user_id: currentUserId, action: `Changed ${c.field.replace(/_/g, ' ')}`, field_name: c.field, old_value: c.old, new_value: c.new }))
        )
      }
      setEditing(false)
      setToast({ type: 'success', message: 'Changes saved!' })
      setTimeout(() => setToast(null), 3000)
    } catch (err: any) {
      setToast({ type: 'error', message: err?.message || 'Failed to save.' })
    } finally { setSaving(false) }
  }

  const handleCancel = () => {
    setFormData({
      eligibility_code: client.eligibility_code, eligibility_end_date: client.eligibility_end_date,
      last_contact_date: client.last_contact_date, last_contact_type: client.last_contact_type,
      three_month_visit_date: client.three_month_visit_date, three_month_visit_due: client.three_month_visit_due,
      quarterly_waiver_date: client.quarterly_waiver_date, med_tech_redet_date: client.med_tech_redet_date,
      med_tech_status: client.med_tech_status, poc_date: client.poc_date, loc_date: client.loc_date,
      doc_mdh_date: client.doc_mdh_date, pos_deadline: client.pos_deadline, pos_status: client.pos_status,
      assessment_due: client.assessment_due, spm_completed: client.spm_completed, spm_next_due: client.spm_next_due,
      foc: client.foc, provider_forms: client.provider_forms, signatures_needed: client.signatures_needed,
      schedule_docs: client.schedule_docs, atp: client.atp, snfs: client.snfs, lease: client.lease,
      co_financial_redet_date: client.co_financial_redet_date, co_app_date: client.co_app_date,
      request_letter: client.request_letter, mfp_consent_date: client.mfp_consent_date,
      two57_date: client.two57_date, reportable_events: client.reportable_events, appeals: client.appeals,
      thirty_day_letter_date: client.thirty_day_letter_date, drop_in_visit_date: client.drop_in_visit_date,
      audit_review: client.audit_review, qa_review: client.qa_review, goal_pct: client.goal_pct,
    })
    setEditing(false)
  }

  const handleReassign = async () => {
    if (!assignedTo) return
    setAssignSaving(true)
    const supabase = createClient()
    const { error } = await supabase.from('clients').update({ assigned_to: assignedTo }).eq('id', client.id)
    if (!error) {
      await supabase.from('activity_log').insert({ client_id: client.id, user_id: currentUserId, action: 'Reassigned client', field_name: 'assigned_to', old_value: client.assigned_to, new_value: assignedTo })
      sendAssignmentEmail(client.id, assignedTo).catch(() => {})
      setToast({ type: 'success', message: 'Client reassigned.' })
      setTimeout(() => setToast(null), 3000)
    }
    setAssignSaving(false)
  }

  const handleMarkDeceased = async () => {
    if (!(isSupervisorLike(currentProfile.role) || currentProfile.role === 'team_manager')) return
    if (!confirm(`Mark ${client.last_name}${client.first_name ? `, ${client.first_name}` : ''} as deceased?`)) return
    setDeactivating(true)
    const supabase = createClient()
    const { error } = await supabase.from('clients')
      .update({ is_active: false, deactivation_reason: 'deceased', deactivated_at: new Date().toISOString(), deactivated_by: currentUserId })
      .eq('id', client.id)
    if (!error) {
      await supabase.from('activity_log').insert({ client_id: client.id, user_id: currentUserId, action: 'Deactivated client', field_name: 'deactivation_reason', old_value: null, new_value: 'deceased' })
      window.location.href = '/dashboard'
      return
    }
    setToast({ type: 'error', message: error.message })
    setTimeout(() => setToast(null), 3000)
    setDeactivating(false)
  }

  const handleScrollToOverdue = () => {
    const targets: Array<{ field: string; sectionId: string }> = [
      { field: 'eligibility_end_date', sectionId: 'section-eligibility' },
      { field: 'three_month_visit_due', sectionId: 'section-contact-visits' },
      { field: 'quarterly_waiver_date', sectionId: 'section-contact-visits' },
      { field: 'med_tech_redet_date', sectionId: 'section-med-tech' },
      { field: 'pos_deadline', sectionId: 'section-plans-assessments' },
      { field: 'assessment_due', sectionId: 'section-plans-assessments' },
      { field: 'thirty_day_letter_date', sectionId: 'section-contact-visits' },
      { field: 'co_financial_redet_date', sectionId: 'section-co-details' },
      { field: 'co_app_date', sectionId: 'section-co-details' },
      { field: 'mfp_consent_date', sectionId: 'section-co-details' },
      { field: 'two57_date', sectionId: 'section-co-details' },
      { field: 'doc_mdh_date', sectionId: 'section-plans-assessments' },
      { field: 'spm_next_due', sectionId: 'section-plans-assessments' },
    ]
    for (const { field, sectionId } of targets) {
      const d = formData[field as keyof typeof formData] as string | null | undefined
      if (getDateStatus(d ?? null) !== 'red' && getDateStatus(d ?? null) !== 'critical') continue
      const el = document.getElementById(`field-${field}`) ?? document.getElementById(sectionId)
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' })
        setHighlightedField(field)
        setTimeout(() => setHighlightedField(null), 3000)
        return
      }
    }
  }

  const f = formData
  const healthScore = (client as any).goal_pct ?? f.goal_pct ?? 0
  const daysSince = getDaysSinceContact(f.last_contact_date as string | null)
  const noContact = daysSince !== null && daysSince >= 7

  const spmNextDueNote = editing && f.spm_completed && f.spm_next_due ? (
    <span style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4, display: 'block' }}>
      Next due: <strong style={{ color: '#f5f5f7' }}>{formatDate(f.spm_next_due as string)}</strong>
    </span>
  ) : null

  return (
    <div style={{ maxWidth: 840, margin: '0 auto', paddingBottom: 100 }}>
      {/* Toast */}
      {toast && (
        <div className="slide-in-up" style={{
          position: 'fixed', top: 20, right: 20, zIndex: 9999,
          background: toast.type === 'success' ? 'rgba(48,209,88,0.12)' : 'rgba(255,69,58,0.12)',
          border: `1px solid ${toast.type === 'success' ? 'rgba(48,209,88,0.3)' : 'rgba(255,69,58,0.3)'}`,
          borderRadius: 14, padding: '12px 18px',
          color: toast.type === 'success' ? '#30d158' : '#ff453a',
          fontSize: 13, fontWeight: 600, backdropFilter: 'blur(12px)',
          boxShadow: '0 8px 32px rgba(0,0,0,0.3)', maxWidth: 320,
        }}>
          {toast.type === 'success' ? '✓ ' : '✗ '}{toast.message}
        </div>
      )}

      {/* Back + actions */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, alignItems: 'center', flexWrap: 'wrap' }}>
        <Link href="/dashboard" style={{
          display: 'inline-flex', alignItems: 'center', gap: 5,
          color: 'var(--accent)', textDecoration: 'none', fontSize: 13, fontWeight: 600,
        }}>← Dashboard</Link>
        <Link href={`/clients/${client.id}/print`} target="_blank" style={{
          display: 'inline-flex', alignItems: 'center', gap: 5,
          color: 'var(--text-secondary)', textDecoration: 'none', fontSize: 12,
          padding: '5px 10px', border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: 8, background: 'rgba(255,255,255,0.02)',
        }}><Printer size={13} /> Print</Link>
      </div>

      {/* ═══ HERO HEADER ═══ */}
      <div style={{
        borderRadius: 20, overflow: 'hidden', marginBottom: 14,
        background: 'linear-gradient(135deg, #0d1520 0%, #152238 50%, #0f1b2e 100%)',
        border: '1px solid rgba(100,150,255,0.08)',
        padding: '24px 24px 20px',
        position: 'relative',
      }}>
        {/* Decorative orb */}
        <div style={{
          position: 'absolute', right: -40, top: -40, width: 200, height: 200,
          borderRadius: '50%', background: 'radial-gradient(circle, rgba(0,122,255,0.08) 0%, transparent 70%)',
          pointerEvents: 'none',
        }} />

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', position: 'relative', zIndex: 1 }}>
          <div style={{ flex: 1 }}>
            <h1 style={{ fontSize: 28, fontWeight: 900, margin: 0, letterSpacing: '-0.02em', color: '#fff' }}>
              {client.last_name}, {client.first_name}
            </h1>
            <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap', alignItems: 'center' }}>
              <span style={{ fontSize: 12, color: 'rgba(200,210,230,0.6)', fontWeight: 600 }}>ID: <strong style={{ color: 'rgba(200,210,230,0.9)' }}>{client.client_id}</strong></span>
              <span style={{
                fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 10,
                background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.08)',
                textTransform: 'uppercase', letterSpacing: '0.06em', color: 'rgba(200,210,230,0.7)',
              }}>{client.category}</span>
              {f.eligibility_code && (
                <span style={{ fontSize: 12, color: 'rgba(200,210,230,0.6)' }}>
                  {f.eligibility_code}
                  {getEligibilityDescription(f.eligibility_code as string) && (
                    <span style={{ opacity: 0.5, marginLeft: 4 }}>· {getEligibilityDescription(f.eligibility_code as string).slice(0, 30)}</span>
                  )}
                </span>
              )}
              {client.profiles?.full_name && (
                <span style={{ fontSize: 12, color: 'rgba(200,210,230,0.5)' }}>👤 {client.profiles.full_name}</span>
              )}
            </div>

            {/* Contact info chip */}
            <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
              <span style={{
                fontSize: 11, fontWeight: 600, padding: '4px 10px', borderRadius: 20,
                background: noContact ? 'rgba(255,159,10,0.12)' : 'rgba(255,255,255,0.04)',
                border: noContact ? '1px solid rgba(255,159,10,0.25)' : '1px solid rgba(255,255,255,0.06)',
                color: noContact ? '#ff9f0a' : 'rgba(200,210,230,0.6)',
              }}>
                {daysSince !== null ? `Last contact: ${daysSince}d ago${noContact ? ' ⚠️' : ''}` : 'No contact recorded'}
                {f.last_contact_type && <span style={{ opacity: 0.6 }}> · {f.last_contact_type as string}</span>}
              </span>
            </div>
          </div>

          {/* Right side: Health ring + actions */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 12, flexShrink: 0 }}>
            <HealthScoreRing score={healthScore} size={64} strokeWidth={5} />

            <div style={{ display: 'flex', gap: 6 }}>
              {editing ? (
                <>
                  <button onClick={handleSave} disabled={saving} style={{
                    background: 'linear-gradient(135deg, #007aff, #0055cc)',
                    color: '#fff', border: 'none', borderRadius: 10,
                    padding: '8px 16px', fontSize: 13, fontWeight: 700,
                    cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1,
                    display: 'flex', alignItems: 'center', gap: 5,
                    boxShadow: '0 4px 12px rgba(0,122,255,0.3)',
                  }}><Save size={14} /> {saving ? 'Saving…' : 'Save'}</button>
                  <button onClick={handleCancel} disabled={saving} style={{
                    background: 'rgba(255,255,255,0.06)', color: 'rgba(200,210,230,0.8)',
                    border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10,
                    padding: '8px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer',
                    display: 'flex', alignItems: 'center', gap: 5,
                  }}><X size={14} /> Cancel</button>
                </>
              ) : (
                <button onClick={() => setEditing(true)} style={{
                  background: 'rgba(255,255,255,0.06)', color: 'rgba(200,210,230,0.9)',
                  border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10,
                  padding: '8px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer',
                  display: 'flex', alignItems: 'center', gap: 5,
                  transition: 'all 0.2s',
                }}><Edit3 size={14} /> Edit</button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Urgency Timeline + Smart Suggestion */}
      {!editing && (
        <>
          <UrgencyTimeline formData={f} />
          <SmartSuggestion formData={f} client={client} />
        </>
      )}

      {/* AI Section */}
      {!editing && (
        <GlassSection title="AI Intelligence" icon={<Brain size={16} />} accentColor="#bf5af2" defaultOpen={false}>
          <div style={{ marginTop: 8 }}>
            <AIAskClient clientId={client.id} />
            <AISummary clientId={client.id} />
          </div>
        </GlassSection>
      )}

      {/* ═══ DATA SECTIONS ═══ */}

      <GlassSection title="Eligibility" icon={<Shield size={16} />} id="section-eligibility" accentColor="#007aff">
        {editing ? (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', padding: '10px 0', gap: 12 }}>
            <span style={{ fontSize: 13, color: 'var(--text-secondary)', flex: '0 0 200px' }}>Eligibility Code</span>
            <div style={{ flex: 1 }}><EligibilityCodeSelect value={f.eligibility_code} onChange={v => handleChange('eligibility_code', v)} editing={true} /></div>
          </div>
        ) : f.eligibility_code ? (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', padding: '10px 12px', borderRadius: 10 }}>
            <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Eligibility Code</span>
            <div style={{ textAlign: 'right' }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{f.eligibility_code as string}</span>
              {getEligibilityDescription(f.eligibility_code as string) && (
                <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 2 }}>{getEligibilityDescription(f.eligibility_code as string)}</div>
              )}
            </div>
          </div>
        ) : null}
        <FieldRow label="Eligibility End Date" field="eligibility_end_date" value={f.eligibility_end_date} type="date" editing={editing} onChange={handleChange} dateStatus={getDateStatus(f.eligibility_end_date as string | null)} highlighted={highlightedField === 'eligibility_end_date'} />
      </GlassSection>

      <GlassSection title="Contact & Visits" icon={<Phone size={16} />} id="section-contact-visits" accentColor="#30d158">
        <FieldRow label="Last Contact Date" field="last_contact_date" value={f.last_contact_date} type="date" editing={editing} onChange={handleChange} dateStatus={getDateStatus(f.last_contact_date as string | null)} highlighted={highlightedField === 'last_contact_date'} />
        <FieldRow label="Last Contact Type" field="last_contact_type" value={f.last_contact_type} type={editing ? 'select' : 'text'} editing={editing} onChange={handleChange} selectOptions={LAST_CONTACT_TYPE_OPTIONS} />
        <FieldRow label="Drop-in Visit Date" field="drop_in_visit_date" value={f.drop_in_visit_date} type="date" editing={editing} onChange={handleChange} dateStatus={getDateStatus(f.drop_in_visit_date as string | null)} highlighted={highlightedField === 'drop_in_visit_date'} />
        <FieldRow label="30-Day Letter Date" field="thirty_day_letter_date" value={f.thirty_day_letter_date} type="date" editing={editing} onChange={handleChange} dateStatus={getDateStatus(f.thirty_day_letter_date as string | null)} highlighted={highlightedField === 'thirty_day_letter_date'} />
        <FieldRow label="3-Month Visit Date" field="three_month_visit_date" value={f.three_month_visit_date} type="date" editing={editing} onChange={handleChange} />
        <FieldRow label="3-Month Visit Due" field="three_month_visit_due" value={f.three_month_visit_due} type="date" editing={editing} onChange={handleChange} dateStatus={getDateStatus(f.three_month_visit_due as string | null)} highlighted={highlightedField === 'three_month_visit_due'} />
        <FieldRow label="Quarterly Visit Waiver Date" field="quarterly_waiver_date" value={f.quarterly_waiver_date} type="date" editing={editing} onChange={handleChange} dateStatus={getDateStatus(f.quarterly_waiver_date as string | null)} highlighted={highlightedField === 'quarterly_waiver_date'} />
      </GlassSection>

      <GlassSection title="Med Tech" icon={<FileText size={16} />} id="section-med-tech" accentColor="#ff9f0a">
        <FieldRow label="Med-Tech Redet Date" field="med_tech_redet_date" value={f.med_tech_redet_date} type="date" editing={editing} onChange={handleChange} dateStatus={getDateStatus(f.med_tech_redet_date as string | null)} highlighted={highlightedField === 'med_tech_redet_date'} />
        <FieldRow label="Med/Tech Status" field="med_tech_status" value={f.med_tech_status} type={editing ? 'select' : 'text'} editing={editing} onChange={handleChange} selectOptions={MED_TECH_STATUS_OPTIONS} />
      </GlassSection>

      <GlassSection title="Plans & Assessments" icon={<Clock size={16} />} id="section-plans-assessments" accentColor="#ff453a">
        <FieldRow label="POC Date" field="poc_date" value={f.poc_date} type="date" editing={editing} onChange={handleChange} />
        <FieldRow label="LOC Date (If Necessary)" field="loc_date" value={f.loc_date} type="date" editing={editing} onChange={handleChange} />
        <FieldRow label="Documentation MDH (45 days)" field="doc_mdh_date" value={f.doc_mdh_date} type="date" editing={editing} onChange={handleChange} dateStatus={getDateStatus(f.doc_mdh_date as string | null)} highlighted={highlightedField === 'doc_mdh_date'} />
        <FieldRow label="POS Deadline" field="pos_deadline" value={f.pos_deadline} type="date" editing={editing} onChange={handleChange} dateStatus={getDateStatus(f.pos_deadline as string | null)} highlighted={highlightedField === 'pos_deadline'} />
        <FieldRow label="POS Status" field="pos_status" value={f.pos_status} type={editing ? 'select' : 'text'} editing={editing} onChange={handleChange} selectOptions={POS_STATUS_OPTIONS} />
        <FieldRow label="Assessment Due Date" field="assessment_due" value={f.assessment_due} type="date" editing={editing} onChange={handleChange} dateStatus={getDateStatus(f.assessment_due as string | null)} highlighted={highlightedField === 'assessment_due'} />
        <FieldRow label="SPM Completed" field="spm_completed" value={f.spm_completed} type="boolean" editing={editing} onChange={handleChange} extra={spmNextDueNote} />
        {!editing && f.spm_next_due && (
          <FieldRow label="SPM Next Due" field="spm_next_due" value={f.spm_next_due} type="date" editing={false} onChange={handleChange} dateStatus={getDateStatus(f.spm_next_due as string | null)} highlighted={highlightedField === 'spm_next_due'} />
        )}
        {editing && (
          <FieldRow label="Goal Progress (%)" field="goal_pct" value={f.goal_pct} type="number" editing={editing} onChange={handleChange} />
        )}
      </GlassSection>

      <GlassSection title="Forms & Signatures" icon={<FileText size={16} />} accentColor="#ffd60a" defaultOpen={false}>
        <FieldRow label="FOC" field="foc" value={f.foc} type="text" editing={editing} onChange={handleChange} />
        <FieldRow label="Provider Forms" field="provider_forms" value={f.provider_forms} type="text" editing={editing} onChange={handleChange} />
        <FieldRow label="Signatures Needed" field="signatures_needed" value={f.signatures_needed} type="text" editing={editing} onChange={handleChange} />
        <FieldRow label="Schedule/Supporting Documents Attached?" field="schedule_docs" value={f.schedule_docs} type="boolean" editing={editing} onChange={handleChange} />
      </GlassSection>

      <GlassSection title="Authorizations & Services" icon={<Shield size={16} />} accentColor="#bf5af2" defaultOpen={false}>
        <FieldRow label="ATP" field="atp" value={f.atp} type={editing ? 'select' : 'text'} editing={editing} onChange={handleChange} selectOptions={ATP_OPTIONS} />
        <FieldRow label="SNFs" field="snfs" value={f.snfs} type="text" editing={editing} onChange={handleChange} />
        <FieldRow label="Lease" field="lease" value={f.lease} type="text" editing={editing} onChange={handleChange} />
      </GlassSection>

      <GlassSection title="CO Details" icon={<FileText size={16} />} id="section-co-details" accentColor="#ff9f0a" defaultOpen={false}>
        <FieldRow label="CO Financial Redetermination Due" field="co_financial_redet_date" value={f.co_financial_redet_date} type="date" editing={editing} onChange={handleChange} dateStatus={getDateStatus(f.co_financial_redet_date as string | null)} highlighted={highlightedField === 'co_financial_redet_date'} />
        <FieldRow label="CO Application Date" field="co_app_date" value={f.co_app_date} type="date" editing={editing} onChange={handleChange} dateStatus={getDateStatus(f.co_app_date as string | null)} highlighted={highlightedField === 'co_app_date'} />
        <FieldRow label="Request Letter" field="request_letter" value={f.request_letter} type="text" editing={editing} onChange={handleChange} />
        <FieldRow label="MFP Consent Form Date" field="mfp_consent_date" value={f.mfp_consent_date} type="date" editing={editing} onChange={handleChange} dateStatus={getDateStatus(f.mfp_consent_date as string | null)} highlighted={highlightedField === 'mfp_consent_date'} />
        <FieldRow label="257 Date" field="two57_date" value={f.two57_date} type="date" editing={editing} onChange={handleChange} dateStatus={getDateStatus(f.two57_date as string | null)} highlighted={highlightedField === 'two57_date'} />
      </GlassSection>

      <GlassSection title="Reporting & Reviews" icon={<AlertTriangle size={16} />} accentColor="#ffd60a" defaultOpen={false}>
        <FieldRow label="Reportable Events" field="reportable_events" value={f.reportable_events} type="text" editing={editing} onChange={handleChange} />
        <FieldRow label="Appeals" field="appeals" value={f.appeals} type="text" editing={editing} onChange={handleChange} />
        <FieldRow label="Audit Team Review" field="audit_review" value={f.audit_review} type={editing ? 'select' : 'text'} editing={editing} onChange={handleChange} selectOptions={AUDIT_REVIEW_OPTIONS} />
        <FieldRow label="QA Team Review" field="qa_review" value={f.qa_review} type={editing ? 'select' : 'text'} editing={editing} onChange={handleChange} selectOptions={QA_REVIEW_OPTIONS} />
      </GlassSection>

      <GlassSection title="Assignment" icon={<Users size={16} />} accentColor="#007aff">
        <FieldRow label="Assigned To" field="assigned_to" value={client.profiles?.full_name ?? 'Unassigned'} type="text" editing={false} onChange={handleChange} />
        <FieldRow label="Category" field="category" value={client.category.toUpperCase()} type="text" editing={false} onChange={handleChange} />
        <FieldRow label="Goal Progress" field="goal_pct" value={`${f.goal_pct}%`} type="text" editing={false} onChange={handleChange} />
        <FieldRow label="Created" field="created_at" value={client.created_at ? formatDate(client.created_at.split('T')[0]) : null} type="text" editing={false} onChange={handleChange} />
        <FieldRow label="Updated" field="updated_at" value={client.updated_at ? formatDate(client.updated_at.split('T')[0]) : null} type="text" editing={false} onChange={handleChange} />

        {canReassign && planners.length > 0 && (
          <div style={{ marginTop: 12, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', padding: '8px 0' }}>
            <input type="text" value={plannerSearch} onChange={e => setPlannerSearch(e.target.value)}
              placeholder="Search planner..." style={{ ...inputStyle, minWidth: 180, flex: '0 1 200px' }} />
            <select value={assignedTo} onChange={e => setAssignedTo(e.target.value)}
              style={{ ...selectStyle, minWidth: 220, flex: '0 1 240px' }}>
              <option value="">— Reassign —</option>
              {filteredPlanners.map(p => <option key={p.id} value={p.id}>{p.full_name}</option>)}
            </select>
            <button onClick={handleReassign}
              disabled={!assignedTo || assignSaving || assignedTo === client.assigned_to}
              style={{
                background: 'rgba(0,122,255,0.1)', border: '1px solid rgba(0,122,255,0.2)',
                borderRadius: 10, color: '#007aff', fontSize: 12, fontWeight: 600,
                padding: '8px 14px', cursor: 'pointer',
                opacity: (!assignedTo || assignSaving || assignedTo === client.assigned_to) ? 0.4 : 1,
              }}>
              {assignSaving ? 'Saving…' : 'Reassign'}
            </button>
          </div>
        )}
      </GlassSection>

      {/* Notes */}
      <NotesSection clientId={client.id} currentUserId={currentUserId} />

      {/* Activity Log */}
      <ActivitySection clientId={client.id} />

      {/* Documents */}
      <ClientDocuments clientId={client.id} currentUserId={currentUserId} currentProfile={currentProfile} />

      {/* Status actions */}
      {(isSupervisorLike(currentProfile.role) || currentProfile.role === 'team_manager') && (client.is_active ?? true) && !editing && (
        <div style={{
          marginTop: 14, borderRadius: 18, padding: '16px 18px',
          border: '1px solid rgba(255,69,58,0.12)',
          background: 'linear-gradient(135deg, rgba(255,69,58,0.03) 0%, rgba(255,69,58,0.01) 100%)',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>Status Actions</div>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4, lineHeight: 1.5 }}>
                Use only when a client record needs to be closed because the client is deceased.
              </div>
            </div>
            <button onClick={handleMarkDeceased} disabled={deactivating} style={{
              background: 'transparent', color: 'rgba(255,69,58,0.82)',
              border: '1px solid rgba(255,69,58,0.22)', borderRadius: 10,
              padding: '8px 14px', fontSize: 12, fontWeight: 700, cursor: 'pointer',
              opacity: deactivating ? 0.7 : 1,
            }}>
              {deactivating ? 'Saving…' : 'Mark as Deceased'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
