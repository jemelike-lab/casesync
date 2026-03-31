'use client'

import { useState, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Client, Profile, ClientNote, ActivityLog, getDateStatus, formatDate, getDaysSinceContact } from '@/lib/types'
import StatusDot from '@/components/StatusDot'
import Link from 'next/link'
import ClientDocuments from '@/components/ClientDocuments'
import { useSearchParams } from 'next/navigation'
import { sendAssignmentEmail } from '@/app/actions/notifications'
import EligibilityCodeSelect from '@/components/EligibilityCodeSelect'
import { getEligibilityDescription } from '@/lib/eligibility-codes'

type EditableClient = Omit<Client, 'id' | 'client_id' | 'last_name' | 'first_name' | 'category' | 'assigned_to' | 'created_at' | 'updated_at' | 'profiles'>

interface ClientEditFormProps {
  client: Client
  currentUserId: string
  currentProfile: Profile
  planners?: Profile[]
}

const inputStyle: React.CSSProperties = {
  background: '#1c1c1e',
  border: '1px solid #333336',
  borderRadius: 6,
  color: '#f5f5f7',
  padding: '6px 10px',
  fontSize: 13,
  colorScheme: 'dark' as any,
  width: '100%',
  boxSizing: 'border-box',
}

const selectStyle: React.CSSProperties = {
  background: '#1c1c1e',
  border: '1px solid #333336',
  borderRadius: 6,
  color: '#f5f5f7',
  padding: '6px 10px',
  fontSize: 13,
  width: '100%',
  cursor: 'pointer',
  appearance: 'auto',
}

function Section({ title, children, id }: { title: string; children: React.ReactNode; id?: string }) {
  return (
    <div className="card" style={{ marginBottom: 16 }} id={id}>
      <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 16, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
        {title}
      </h3>
      {children}
    </div>
  )
}

type SelectOption = { value: string; label: string }

function SelectField({ field, value, options, onChange }: {
  field: string; value: string | null | undefined; options: SelectOption[];
  onChange: (field: string, value: string | null) => void
}) {
  return (
    <select value={value ?? ''} onChange={e => onChange(field, e.target.value || null)} style={selectStyle}>
      <option value="">— Select —</option>
      {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  )
}

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

function FieldRow({ label, field, value, type, editing, onChange, dateStatus, selectOptions, extra, highlighted }: {
  label: string; field: string; value: string | boolean | number | null | undefined;
  type: 'date' | 'text' | 'boolean' | 'number' | 'select'; editing: boolean;
  onChange: (field: string, value: string | boolean | number | null) => void;
  dateStatus?: 'green' | 'yellow' | 'orange' | 'red' | 'none';
  selectOptions?: SelectOption[]; extra?: React.ReactNode;
  highlighted?: boolean
}) {
  if (!editing && (value === null || value === undefined || value === '')) return null

  let displayValue: string
  if (typeof value === 'boolean') displayValue = value ? '✓ Yes' : '✗ No'
  else if (value === null || value === undefined) displayValue = '—'
  else if (type === 'date') displayValue = formatDate(String(value).split('T')[0])
  else displayValue = String(value)

  const isOverdueField = !editing && type === 'date' && dateStatus === 'red'
  const isDueSoonField = !editing && type === 'date' && dateStatus === 'orange'

  return (
    <div
      id={highlighted ? `field-${field}` : undefined}
      style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: '10px 0', borderBottom: '1px solid var(--border)', gap: 12,
        borderLeft: isOverdueField ? '3px solid rgba(255,69,58,0.6)' : isDueSoonField ? '3px solid rgba(255,159,10,0.5)' : '3px solid transparent',
        paddingLeft: (isOverdueField || isDueSoonField) ? 8 : 0,
        background: isOverdueField ? 'rgba(255,69,58,0.04)' : isDueSoonField ? 'rgba(255,159,10,0.03)' : 'transparent',
        borderRadius: (isOverdueField || isDueSoonField) ? 4 : 0,
        boxShadow: highlighted ? '0 0 0 2px rgba(255,69,58,0.4)' : undefined,
        transition: 'box-shadow 0.5s ease',
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
            <SelectField field={field} value={value as string | null} options={selectOptions}
              onChange={(f, v) => onChange(f, v)} />
          )}
        </div>
      ) : (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 1, justifyContent: 'flex-end' }}>
          <span style={{
            fontSize: 13, fontWeight: 500,
            color: dateStatus ? `var(--${dateStatus === 'none' ? 'text-secondary' : dateStatus})` : 'var(--text)',
            textAlign: 'right',
          }}>
            {dateStatus && dateStatus !== 'none' && <StatusDot status={dateStatus} style={{ marginRight: 6 }} />}
            {displayValue}
          </span>
          {isOverdueField && (
            <span style={{
              background: 'rgba(255,69,58,0.2)',
              border: '1px solid rgba(255,69,58,0.4)',
              color: '#ff453a',
              fontSize: 9,
              fontWeight: 800,
              padding: '1px 6px',
              borderRadius: 4,
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
              flexShrink: 0,
            }}>
              OVERDUE
            </span>
          )}
          {isDueSoonField && (
            <span style={{
              background: 'rgba(255,159,10,0.2)',
              border: '1px solid rgba(255,159,10,0.4)',
              color: '#ff9f0a',
              fontSize: 9,
              fontWeight: 800,
              padding: '1px 6px',
              borderRadius: 4,
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
              flexShrink: 0,
            }}>
              DUE SOON
            </span>
          )}
        </div>
      )}
    </div>
  )
}

// Notes section
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
    if (!error && data) {
      setNotes(prev => [data as ClientNote, ...prev])
      setNewNote('')
    }
    setSaving(false)
  }

  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 16, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
        Notes
      </h3>
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <textarea
          value={newNote}
          onChange={e => setNewNote(e.target.value)}
          placeholder="Add a note…"
          style={{ flex: 1, minHeight: 72, resize: 'vertical', fontSize: 13 }}
        />
        <button
          className="btn-primary"
          onClick={addNote}
          disabled={saving || !newNote.trim()}
          style={{ alignSelf: 'flex-start', whiteSpace: 'nowrap' }}
        >
          {saving ? 'Saving…' : 'Add Note'}
        </button>
      </div>
      {notes.length === 0 && (
        <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>No notes yet.</p>
      )}
      {notes.map(note => (
        <div key={note.id} style={{
          borderTop: '1px solid var(--border)', paddingTop: 12, marginTop: 12
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--accent)' }}>
              {note.profiles?.full_name ?? 'Unknown'}
            </span>
            <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
              {new Date(note.created_at).toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
            </span>
          </div>
          <p style={{ fontSize: 13, margin: 0, color: 'var(--text)', whiteSpace: 'pre-wrap' }}>{note.content}</p>
        </div>
      ))}
    </div>
  )
}

// Activity log section
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
    <div className="card" style={{ marginBottom: 16 }}>
      <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 16, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
        Activity Log
      </h3>
      {logs.map(log => (
        <div key={log.id} style={{ borderBottom: '1px solid var(--border)', padding: '8px 0', fontSize: 12 }}>
          <span style={{ color: 'var(--accent)', fontWeight: 600 }}>{log.profiles?.full_name ?? 'Someone'}</span>
          {' '}
          {log.field_name ? (
            <>changed <strong style={{ color: 'var(--text)' }}>{log.field_name.replace(/_/g, ' ')}</strong>{' '}
              {log.old_value && <>from <span style={{ color: 'var(--red)' }}>{log.old_value}</span>{' '}</>}
              {log.new_value && <>to <span style={{ color: 'var(--green)' }}>{log.new_value}</span></>}
            </>
          ) : (
            <span style={{ color: 'var(--text)' }}>{log.action}</span>
          )}
          {' '}
          <span style={{ color: 'var(--text-secondary)' }}>
            on {new Date(log.created_at).toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' })}
          </span>
        </div>
      ))}
    </div>
  )
}

// Alert banner for client detail view
function ClientAlertBanner({ formData, onScrollToOverdue }: {
  formData: Partial<EditableClient>
  onScrollToOverdue: () => void
}) {
  const DATE_FIELDS: Array<{ key: keyof typeof formData; label: string }> = [
    { key: 'eligibility_end_date', label: 'Eligibility End' },
    { key: 'three_month_visit_due', label: '3-Month Visit' },
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

  let overdueCount = 0
  let dueThisWeekCount = 0
  let dueThisMonthCount = 0

  for (const { key } of DATE_FIELDS) {
    const d = formData[key] as string | null | undefined
    const status = getDateStatus(d ?? null)
    if (status === 'red') overdueCount++
    else if (status === 'orange') dueThisWeekCount++
    else if (status === 'yellow') dueThisMonthCount++
  }

  const allCurrent = overdueCount === 0 && dueThisWeekCount === 0 && dueThisMonthCount === 0

  let bg: string, border: string, textColor: string, icon: string
  if (overdueCount > 0) {
    bg = 'rgba(255,69,58,0.1)'
    border = 'rgba(255,69,58,0.35)'
    textColor = '#ff453a'
    icon = '⚠️'
  } else if (dueThisWeekCount > 0) {
    bg = 'rgba(255,159,10,0.1)'
    border = 'rgba(255,159,10,0.35)'
    textColor = '#ff9f0a'
    icon = '🔔'
  } else if (dueThisMonthCount > 0) {
    bg = 'rgba(255,214,10,0.08)'
    border = 'rgba(255,214,10,0.3)'
    textColor = '#ffd60a'
    icon = '📅'
  } else {
    bg = 'rgba(48,209,88,0.08)'
    border = 'rgba(48,209,88,0.25)'
    textColor = '#30d158'
    icon = '✅'
  }

  return (
    <div className="slide-in-up" style={{
      background: bg,
      border: `1px solid ${border}`,
      borderRadius: 10,
      padding: '12px 16px',
      marginBottom: 16,
      display: 'flex',
      flexDirection: 'column',
      gap: 8,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: 16 }}>{icon}</span>
        <span style={{ fontSize: 13, fontWeight: 600, color: textColor }}>
          {allCurrent
            ? 'All items current'
            : [
                overdueCount > 0 ? `${overdueCount} item${overdueCount !== 1 ? 's' : ''} overdue` : null,
                dueThisWeekCount > 0 ? `${dueThisWeekCount} due this week` : null,
                dueThisMonthCount > 0 ? `${dueThisMonthCount} due this month` : null,
              ].filter(Boolean).join(' · ')
          }
        </span>
      </div>
      {!allCurrent && overdueCount > 0 && (
        <button
          onClick={onScrollToOverdue}
          style={{
            background: 'none',
            border: 'none',
            color: textColor,
            fontSize: 12,
            cursor: 'pointer',
            padding: 0,
            textDecoration: 'underline',
            alignSelf: 'flex-start',
          }}
        >
          View overdue items ↓
        </button>
      )}
    </div>
  )
}


// Smart "What to do next" suggestion
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

  // Find most overdue item
  let mostOverdueField: { label: string; date: string } | null = null
  let mostOverdueDays = 0
  for (const { key, label } of DATE_FIELDS) {
    const d = formData[key] as string | null | undefined
    if (!d) continue
    const status = getDateStatus(d)
    if (status === 'red') {
      const date = new Date(d)
      const now = new Date()
      const days = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24))
      if (days > mostOverdueDays) {
        mostOverdueDays = days
        mostOverdueField = { label, date: d }
      }
    }
  }

  if (mostOverdueField) {
    return (
      <div style={{
        background: 'rgba(255,69,58,0.06)',
        border: '1px solid rgba(255,69,58,0.2)',
        borderRadius: 8,
        padding: '10px 14px',
        marginBottom: 16,
        display: 'flex',
        alignItems: 'flex-start',
        gap: 8,
      }}>
        <span style={{ fontSize: 15, flexShrink: 0 }}>💡</span>
        <div>
          <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--red)' }}>Suggested next action: </span>
          <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
            Update <strong style={{ color: 'var(--text)' }}>{mostOverdueField.label}</strong> — overdue since {formatDate(mostOverdueField.date)} ({mostOverdueDays}d ago)
          </span>
        </div>
      </div>
    )
  }

  // No contact in 7+ days
  const daysSince = getDaysSinceContact(client.last_contact_date)
  if (daysSince !== null && daysSince >= 7) {
    return (
      <div style={{
        background: 'rgba(0,122,255,0.06)',
        border: '1px solid rgba(0,122,255,0.2)',
        borderRadius: 8,
        padding: '10px 14px',
        marginBottom: 16,
        display: 'flex',
        alignItems: 'flex-start',
        gap: 8,
      }}>
        <span style={{ fontSize: 15, flexShrink: 0 }}>💡</span>
        <div>
          <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--accent)' }}>Suggested next action: </span>
          <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
            Log a contact — last contact was <strong style={{ color: 'var(--text)' }}>{daysSince} days ago</strong>
          </span>
        </div>
      </div>
    )
  }

  // SPM coming up
  const spmDue = formData.spm_next_due as string | null | undefined
  if (spmDue) {
    const status = getDateStatus(spmDue)
    if (status === 'orange' || status === 'yellow') {
      const date = new Date(spmDue)
      const now = new Date()
      const daysUntil = Math.ceil((date.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
      return (
        <div style={{
          background: 'rgba(0,122,255,0.06)',
          border: '1px solid rgba(0,122,255,0.2)',
          borderRadius: 8,
          padding: '10px 14px',
          marginBottom: 16,
          display: 'flex',
          alignItems: 'flex-start',
          gap: 8,
        }}>
          <span style={{ fontSize: 15, flexShrink: 0 }}>💡</span>
          <div>
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--accent)' }}>Suggested next action: </span>
            <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
              SPM due in <strong style={{ color: 'var(--text)' }}>{daysUntil} days</strong> — schedule now
            </span>
          </div>
        </div>
      )
    }
  }

  return (
    <div style={{
      background: 'rgba(48,209,88,0.06)',
      border: '1px solid rgba(48,209,88,0.2)',
      borderRadius: 8,
      padding: '10px 14px',
      marginBottom: 16,
      display: 'flex',
      alignItems: 'center',
      gap: 8,
    }}>
      <span style={{ fontSize: 15 }}>✅</span>
      <span style={{ fontSize: 12, color: 'var(--green)', fontWeight: 500 }}>No immediate actions needed</span>
    </div>
  )
}

// AI Summary component
function AISummary({ clientId }: { clientId: string }) {
  const [summary, setSummary] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const generate = async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/client-summary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to generate summary')
      setSummary(data.summary)
    } catch (err: any) {
      setError(err.message || 'Failed to generate summary')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ marginBottom: 12 }}>
      <button
        onClick={generate}
        disabled={loading}
        style={{
          background: 'rgba(191,90,242,0.12)',
          border: '1px solid rgba(191,90,242,0.3)',
          borderRadius: 8,
          color: '#bf5af2',
          fontSize: 12,
          fontWeight: 600,
          padding: '6px 12px',
          cursor: loading ? 'not-allowed' : 'pointer',
          opacity: loading ? 0.7 : 1,
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          transition: 'background 0.15s',
        }}
      >
        {loading ? (
          <>
            <span style={{ display: 'inline-block', animation: 'spin 1s linear infinite', fontSize: 14 }}>⟳</span>
            Generating…
          </>
        ) : '✨ AI Summary'}
      </button>

      {error && (
        <div style={{ marginTop: 8, fontSize: 12, color: 'var(--red)' }}>⚠️ {error}</div>
      )}

      {summary && (
        <div style={{
          marginTop: 10,
          background: 'rgba(191,90,242,0.06)',
          border: '1px solid rgba(191,90,242,0.2)',
          borderRadius: 8,
          padding: '12px 14px',
          fontSize: 13,
          color: 'var(--text)',
          lineHeight: 1.5,
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
            <span>{summary}</span>
            <button
              onClick={generate}
              disabled={loading}
              style={{
                background: 'none', border: 'none', cursor: 'pointer',
                color: 'var(--text-secondary)', fontSize: 11, padding: '2px 4px', flexShrink: 0,
              }}
              title="Regenerate"
            >
              🔄
            </button>
          </div>
        </div>
      )}

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </div>
  )
}

export default function ClientEditForm({ client, currentUserId, currentProfile, planners = [] }: ClientEditFormProps) {
  const searchParams = useSearchParams()
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null)
  const [assignedTo, setAssignedTo] = useState(client.assigned_to ?? '')
  const [highlightedField, setHighlightedField] = useState<string | null>(null)

  // Show success toast when client is newly created
  useEffect(() => {
    if (searchParams.get('created') === '1') {
      setToast({ type: 'success', message: 'Client created successfully!' })
      setTimeout(() => setToast(null), 4000)
    }
  }, [])
  const [assignSaving, setAssignSaving] = useState(false)
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

  const canReassign = currentProfile.role === 'supervisor' || currentProfile.role === 'team_manager'

  const handleChange = (field: string, value: string | boolean | number | null) => {
    if (field === 'spm_completed') {
      const checked = Boolean(value)
      if (checked) {
        const nextDue = new Date()
        nextDue.setDate(nextDue.getDate() + 30)
        const nextDueStr = nextDue.toISOString().split('T')[0]
        setFormData(prev => ({ ...prev, spm_completed: true, spm_next_due: nextDueStr }))
      } else {
        setFormData(prev => ({ ...prev, spm_completed: false }))
      }
      return
    }
    setFormData(prev => ({ ...prev, [field]: value }))
  }

  const handleSave = async () => {
    setSaving(true)
    setToast(null)
    try {
      const supabase = createClient()

      // Detect changes for activity log
      const changes: Array<{ field: string; old: string | null; new: string | null }> = []
      const watchFields: (keyof typeof formData)[] = [
        'pos_status', 'eligibility_end_date', 'last_contact_date', 'assessment_due',
        'goal_pct', 'med_tech_status', 'atp', 'spm_completed', 'pos_deadline',
      ]
      for (const field of watchFields) {
        const oldVal = client[field as keyof Client]
        const newVal = formData[field]
        if (String(oldVal ?? '') !== String(newVal ?? '')) {
          changes.push({
            field: field as string,
            old: oldVal !== null && oldVal !== undefined ? String(oldVal) : null,
            new: newVal !== null && newVal !== undefined ? String(newVal) : null,
          })
        }
      }

      const { error } = await supabase.from('clients').update(formData).eq('id', client.id)
      if (error) throw error

      // Write activity log
      if (changes.length > 0) {
        await supabase.from('activity_log').insert(
          changes.map(c => ({
            client_id: client.id,
            user_id: currentUserId,
            action: `Changed ${c.field.replace(/_/g, ' ')}`,
            field_name: c.field,
            old_value: c.old,
            new_value: c.new,
          }))
        )
      }

      setEditing(false)
      setToast({ type: 'success', message: 'Changes saved successfully!' })
      setTimeout(() => setToast(null), 3000)
    } catch (err: any) {
      setToast({ type: 'error', message: err?.message || 'Failed to save changes.' })
    } finally {
      setSaving(false)
    }
  }

  const handleCancel = () => {
    setFormData({
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
    setEditing(false)
  }

  const handleReassign = async () => {
    if (!assignedTo) return
    setAssignSaving(true)
    const supabase = createClient()
    const { error } = await supabase.from('clients').update({ assigned_to: assignedTo }).eq('id', client.id)
    if (!error) {
      await supabase.from('activity_log').insert({
        client_id: client.id,
        user_id: currentUserId,
        action: 'Reassigned client',
        field_name: 'assigned_to',
        old_value: client.assigned_to,
        new_value: assignedTo,
      })
      // Send assignment email notification (fire-and-forget)
      sendAssignmentEmail(client.id, assignedTo).catch(err =>
        console.error('[ClientEditForm] Assignment email error:', err)
      )
      setToast({ type: 'success', message: 'Client reassigned.' })
      setTimeout(() => setToast(null), 3000)
    }
    setAssignSaving(false)
  }

  // Scroll to first overdue field
  const handleScrollToOverdue = () => {
    const OVERDUE_DATE_FIELDS = [
      'eligibility_end_date', 'three_month_visit_due', 'quarterly_waiver_date',
      'med_tech_redet_date', 'pos_deadline', 'assessment_due', 'thirty_day_letter_date',
      'co_financial_redet_date', 'co_app_date', 'mfp_consent_date', 'two57_date', 'doc_mdh_date', 'spm_next_due',
    ]
    for (const field of OVERDUE_DATE_FIELDS) {
      const d = formData[field as keyof typeof formData] as string | null | undefined
      if (getDateStatus(d ?? null) === 'red') {
        const el = document.getElementById(`field-${field}`)
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' })
          setHighlightedField(field)
          setTimeout(() => setHighlightedField(null), 3000)
          return
        }
      }
    }
  }

  const f = formData
  const spmNextDueNote = editing && f.spm_completed && f.spm_next_due ? (
    <span style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4, display: 'block' }}>
      Next due: <strong style={{ color: '#f5f5f7' }}>{formatDate(f.spm_next_due)}</strong>
    </span>
  ) : null

  return (
    <div style={{ maxWidth: 800, margin: '0 auto', paddingBottom: 80 }}>
      {/* Toast */}
      {toast && (
        <div style={{
          position: 'fixed', top: 20, right: 20, zIndex: 9999,
          background: toast.type === 'success' ? '#1a3a1a' : '#3a1a1a',
          border: `1px solid ${toast.type === 'success' ? '#34c759' : '#ff3b30'}`,
          borderRadius: 10, padding: '12px 18px',
          color: toast.type === 'success' ? '#34c759' : '#ff3b30',
          fontSize: 14, fontWeight: 500,
          boxShadow: '0 4px 20px rgba(0,0,0,0.4)', maxWidth: 320,
        }}>
          {toast.type === 'success' ? '✓ ' : '✗ '}{toast.message}
        </div>
      )}

      {/* Back */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 24, alignItems: 'center' }}>
        <Link href="/dashboard" style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          color: 'var(--accent)', textDecoration: 'none', fontSize: 14,
        }}>
          ← Dashboard
        </Link>
        <Link href={`/clients/${client.id}/print`} target="_blank" style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          color: 'var(--text-secondary)', textDecoration: 'none', fontSize: 13,
          padding: '4px 10px', border: '1px solid var(--border)', borderRadius: 6,
        }}>
          🖨️ Print
        </Link>
      </div>

      {/* Alert banner - only in view mode */}
      {!editing && (
        <ClientAlertBanner formData={f} onScrollToOverdue={handleScrollToOverdue} />
      )}

      {/* Smart suggestion - view mode only */}
      {!editing && (
        <SmartSuggestion formData={f} client={client} />
      )}

      {/* Header */}
      <div className="card" style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 700, margin: 0 }}>
            {client.last_name}, {client.first_name}
          </h1>
          <div style={{ display: 'flex', gap: 12, marginTop: 8, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>ID: <strong>{client.client_id}</strong></span>
            <span style={{
              fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 12,
              background: 'var(--surface-2)', textTransform: 'uppercase', letterSpacing: '0.05em',
            }}>
              {client.category}
            </span>
            {f.eligibility_code && (
              <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Eligibility: <strong>{f.eligibility_code}</strong></span>
            )}
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {!editing && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8 }}>
              <div style={{
                fontSize: 24, fontWeight: 700,
                color: (f.goal_pct ?? 0) >= 80 ? 'var(--green)' : (f.goal_pct ?? 0) >= 50 ? 'var(--yellow)' : 'var(--red)',
              }}>
                {f.goal_pct}%
              </div>
            </div>
          )}
          {editing ? (
            <>
              <button onClick={handleSave} disabled={saving} style={{
                background: '#007aff', color: '#fff', border: 'none', borderRadius: 8,
                padding: '8px 18px', fontSize: 14, fontWeight: 600,
                cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1,
              }}>
                {saving ? 'Saving…' : 'Save'}
              </button>
              <button onClick={handleCancel} disabled={saving} style={{
                background: 'var(--surface-2)', color: 'var(--text)',
                border: '1px solid var(--border)', borderRadius: 8,
                padding: '8px 18px', fontSize: 14, fontWeight: 600, cursor: 'pointer',
              }}>
                Cancel
              </button>
            </>
          ) : (
            <button onClick={() => setEditing(true)} style={{
              background: 'var(--surface-2)', color: 'var(--accent)',
              border: '1px solid var(--border)', borderRadius: 8,
              padding: '8px 18px', fontSize: 14, fontWeight: 600, cursor: 'pointer',
            }}>
              Edit
            </button>
          )}
        </div>
      </div>

      {/* AI Summary - view mode only */}
      {!editing && (
        <div className="card" style={{ marginBottom: 16 }}>
          <AISummary clientId={client.id} />
        </div>
      )}

      {/* Eligibility */}
      <Section title="Eligibility">
        {editing ? (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', padding: '10px 0', borderBottom: '1px solid var(--border)', gap: 12 }}>
            <span style={{ fontSize: 13, color: 'var(--text-secondary)', flex: '0 0 200px' }}>Eligibility Code</span>
            <div style={{ flex: 1 }}>
              <EligibilityCodeSelect
                value={f.eligibility_code}
                onChange={v => handleChange('eligibility_code', v)}
                editing={true}
              />
            </div>
          </div>
        ) : f.eligibility_code ? (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', padding: '10px 0', borderBottom: '1px solid var(--border)', gap: 12 }}>
            <span style={{ fontSize: 13, color: 'var(--text-secondary)', flex: '0 0 200px' }}>Eligibility Code</span>
            <div style={{ textAlign: 'right' }}>
              <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text)' }}>{f.eligibility_code}</span>
              {getEligibilityDescription(f.eligibility_code as string) && (
                <div style={{ fontSize: 11, color: '#98989d', marginTop: 2 }}>{getEligibilityDescription(f.eligibility_code as string)}</div>
              )}
            </div>
          </div>
        ) : null}
        <FieldRow label="Eligibility End Date" field="eligibility_end_date" value={f.eligibility_end_date} type="date" editing={editing} onChange={handleChange} dateStatus={getDateStatus(f.eligibility_end_date as string | null)} highlighted={highlightedField === 'eligibility_end_date'} />
      </Section>

      {/* Contact & Visits */}
      <Section title="Contact & Visits">
        <FieldRow label="Last Contact Date" field="last_contact_date" value={f.last_contact_date} type="date" editing={editing} onChange={handleChange} dateStatus={getDateStatus(f.last_contact_date as string | null)} highlighted={highlightedField === 'last_contact_date'} />
        <FieldRow label="Last Contact Type" field="last_contact_type" value={f.last_contact_type} type={editing ? 'select' : 'text'} editing={editing} onChange={handleChange} selectOptions={LAST_CONTACT_TYPE_OPTIONS} />
        <FieldRow label="Drop-in Visit Date" field="drop_in_visit_date" value={f.drop_in_visit_date} type="date" editing={editing} onChange={handleChange} dateStatus={getDateStatus(f.drop_in_visit_date as string | null)} highlighted={highlightedField === 'drop_in_visit_date'} />
        <FieldRow label="30-Day Letter Date" field="thirty_day_letter_date" value={f.thirty_day_letter_date} type="date" editing={editing} onChange={handleChange} dateStatus={getDateStatus(f.thirty_day_letter_date as string | null)} highlighted={highlightedField === 'thirty_day_letter_date'} />
        <FieldRow label="3-Month Visit Date" field="three_month_visit_date" value={f.three_month_visit_date} type="date" editing={editing} onChange={handleChange} />
        <FieldRow label="3-Month Visit Due" field="three_month_visit_due" value={f.three_month_visit_due} type="date" editing={editing} onChange={handleChange} dateStatus={getDateStatus(f.three_month_visit_due as string | null)} highlighted={highlightedField === 'three_month_visit_due'} />
        <FieldRow label="Quarterly Visit Waiver Date" field="quarterly_waiver_date" value={f.quarterly_waiver_date} type="date" editing={editing} onChange={handleChange} dateStatus={getDateStatus(f.quarterly_waiver_date as string | null)} highlighted={highlightedField === 'quarterly_waiver_date'} />
      </Section>

      {/* Med Tech */}
      <Section title="Med Tech">
        <FieldRow label="Med-Tech Redet Date" field="med_tech_redet_date" value={f.med_tech_redet_date} type="date" editing={editing} onChange={handleChange} dateStatus={getDateStatus(f.med_tech_redet_date as string | null)} highlighted={highlightedField === 'med_tech_redet_date'} />
        <FieldRow label="Med/Tech Status" field="med_tech_status" value={f.med_tech_status} type={editing ? 'select' : 'text'} editing={editing} onChange={handleChange} selectOptions={MED_TECH_STATUS_OPTIONS} />
      </Section>

      {/* Plans & Assessments */}
      <Section title="Plans & Assessments">
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
      </Section>

      {/* Forms & Signatures */}
      <Section title="Forms & Signatures">
        <FieldRow label="FOC" field="foc" value={f.foc} type="text" editing={editing} onChange={handleChange} />
        <FieldRow label="Provider Forms" field="provider_forms" value={f.provider_forms} type="text" editing={editing} onChange={handleChange} />
        <FieldRow label="Signatures Needed" field="signatures_needed" value={f.signatures_needed} type="text" editing={editing} onChange={handleChange} />
        <FieldRow label="Schedule/Supporting Documents Attached?" field="schedule_docs" value={f.schedule_docs} type="boolean" editing={editing} onChange={handleChange} />
      </Section>

      {/* Authorizations */}
      <Section title="Authorizations & Services">
        <FieldRow label="ATP" field="atp" value={f.atp} type={editing ? 'select' : 'text'} editing={editing} onChange={handleChange} selectOptions={ATP_OPTIONS} />
        <FieldRow label="SNFs" field="snfs" value={f.snfs} type="text" editing={editing} onChange={handleChange} />
        <FieldRow label="Lease" field="lease" value={f.lease} type="text" editing={editing} onChange={handleChange} />
      </Section>

      {/* CO Details */}
      <Section title="CO Details">
        <FieldRow label="CO Financial Redetermination Due Date" field="co_financial_redet_date" value={f.co_financial_redet_date} type="date" editing={editing} onChange={handleChange} dateStatus={getDateStatus(f.co_financial_redet_date as string | null)} highlighted={highlightedField === 'co_financial_redet_date'} />
        <FieldRow label="CO Application Date" field="co_app_date" value={f.co_app_date} type="date" editing={editing} onChange={handleChange} dateStatus={getDateStatus(f.co_app_date as string | null)} highlighted={highlightedField === 'co_app_date'} />
        <FieldRow label="Request Letter" field="request_letter" value={f.request_letter} type="text" editing={editing} onChange={handleChange} />
        <FieldRow label="MFP Consent Form Date" field="mfp_consent_date" value={f.mfp_consent_date} type="date" editing={editing} onChange={handleChange} dateStatus={getDateStatus(f.mfp_consent_date as string | null)} highlighted={highlightedField === 'mfp_consent_date'} />
        <FieldRow label="257 Date" field="two57_date" value={f.two57_date} type="date" editing={editing} onChange={handleChange} dateStatus={getDateStatus(f.two57_date as string | null)} highlighted={highlightedField === 'two57_date'} />
      </Section>

      {/* Reporting */}
      <Section title="Reporting & Reviews">
        <FieldRow label="Reportable Events" field="reportable_events" value={f.reportable_events} type="text" editing={editing} onChange={handleChange} />
        <FieldRow label="Appeals" field="appeals" value={f.appeals} type="text" editing={editing} onChange={handleChange} />
        <FieldRow label="Audit Team Review" field="audit_review" value={f.audit_review} type={editing ? 'select' : 'text'} editing={editing} onChange={handleChange} selectOptions={AUDIT_REVIEW_OPTIONS} />
        <FieldRow label="QA Team Review" field="qa_review" value={f.qa_review} type={editing ? 'select' : 'text'} editing={editing} onChange={handleChange} selectOptions={QA_REVIEW_OPTIONS} />
      </Section>

      {/* Assignment */}
      <Section title="Assignment">
        <FieldRow label="Assigned To" field="assigned_to" value={client.profiles?.full_name ?? 'Unassigned'} type="text" editing={false} onChange={handleChange} />
        <FieldRow label="Category" field="category" value={client.category.toUpperCase()} type="text" editing={false} onChange={handleChange} />
        <FieldRow label="Goal Progress" field="goal_pct" value={`${f.goal_pct}%`} type="text" editing={false} onChange={handleChange} />
        <FieldRow label="Created" field="created_at" value={client.created_at ? formatDate(client.created_at.split('T')[0]) : null} type="text" editing={false} onChange={handleChange} />
        <FieldRow label="Updated" field="updated_at" value={client.updated_at ? formatDate(client.updated_at.split('T')[0]) : null} type="text" editing={false} onChange={handleChange} />

        {/* Reassign UI */}
        {canReassign && planners.length > 0 && (
          <div style={{ marginTop: 12, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <select
              value={assignedTo}
              onChange={e => setAssignedTo(e.target.value)}
              style={{ minWidth: 200, fontSize: 13 }}
            >
              <option value="">— Reassign to planner —</option>
              {planners.map(p => (
                <option key={p.id} value={p.id}>{p.full_name}</option>
              ))}
            </select>
            <button
              className="btn-primary"
              style={{ fontSize: 13 }}
              disabled={!assignedTo || assignSaving || assignedTo === client.assigned_to}
              onClick={handleReassign}
            >
              {assignSaving ? 'Saving…' : 'Reassign'}
            </button>
          </div>
        )}
      </Section>

      {/* Notes */}
      <NotesSection clientId={client.id} currentUserId={currentUserId} />

      {/* Activity Log */}
      <ActivitySection clientId={client.id} />

      {/* Documents */}
      <ClientDocuments clientId={client.id} currentUserId={currentUserId} currentProfile={currentProfile} />
    </div>
  )
}
