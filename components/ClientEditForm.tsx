'use client'

import { isSupervisorLike } from '@/lib/roles'
import { useState, useEffect, useRef, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Client, Profile, ClientNote, ActivityLog, getDateStatus, formatDate, getDaysSinceContact, StatusLevel, URGENCY_COLORS_RGB, URGENCY_LABELS } from '@/lib/types'
import StatusDot from '@/components/StatusDot'
import Link from 'next/link'
import ClientDocuments from '@/components/ClientDocuments'
import ClientFiles from '@/components/ClientFiles'
import { useSearchParams } from 'next/navigation'
import { sendAssignmentEmail } from '@/app/actions/notifications'
import EligibilityCodeSelect from '@/components/EligibilityCodeSelect'
import { getEligibilityDescription } from '@/lib/eligibility-codes'
import HealthScoreRing from '@/components/HealthScoreRing'
import {
  AlertTriangle, Clock, FileText, Phone, Edit3, Printer, Save, X,
  ChevronDown, ChevronRight, MessageCircle, Activity, Shield, Users,
  Zap, Brain, RefreshCw, Send, Calendar, Info, ExternalLink,
} from 'lucide-react'

type EditableClient = Omit<Client, 'id' | 'client_id' | 'last_name' | 'first_name' | 'category' | 'assigned_to' | 'created_at' | 'updated_at' | 'profiles'>

interface ClientEditFormProps {
  client: Client
  currentUserId: string
  currentProfile: Profile
  planners?: Profile[]
  /** When true, suppresses the legacy KEY DEADLINES block so the v2 Deadlines section can render in its place. */
  hideDeadlines?: boolean
  /** When true, suppresses the legacy Contact & Visit Details block. */
  hideContactDetails?: boolean
  /** When true, suppresses the legacy Plans & Assessments block. */
  hidePlansAssessments?: boolean
  /** When true, suppresses the legacy CO Details block. */
  hideCoDetails?: boolean
  /** When true, suppresses the legacy Med Tech block. */
  hideMedTech?: boolean
  /** When true, suppresses the legacy Forms & Signatures block. */
  hideFormsSignatures?: boolean
  /** When true, suppresses the legacy Authorizations block. */
  hideAuthorizations?: boolean
  /** When true, suppresses the legacy Reporting & Reviews block. */
  hideReportingReviews?: boolean
  /** When true, suppresses the legacy Client Info + Reassign sidebar card. */
  hideClientInfo?: boolean
  /** When true, suppresses the legacy SharePoint Documents card. */
  hideClientDocuments?: boolean
  /** When true, suppresses the legacy NotesSection (v2 owns it). */
  hideNotes?: boolean
  /** When true, suppresses the legacy ActivitySection (v2 owns it). */
  hideActivity?: boolean
  /** When true, suppresses the legacy Back/Print row + blue-gradient hero. */
  hideHero?: boolean
}

/* ═══════════════════════════════════════════════════════════════════
   STYLES
   ═══════════════════════════════════════════════════════════════════ */

const inputStyle: React.CSSProperties = {
  background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)',
  borderRadius: 10, color: '#f5f5f7', padding: '8px 12px', fontSize: 13,
  colorScheme: 'dark' as any, width: '100%', boxSizing: 'border-box', outline: 'none',
}
const selectStyle: React.CSSProperties = { ...inputStyle, cursor: 'pointer', appearance: 'auto' }
const glassCard: React.CSSProperties = {
  borderRadius: 18, border: '1px solid rgba(255,255,255,0.06)',
  background: 'linear-gradient(135deg, rgba(255,255,255,0.025) 0%, rgba(255,255,255,0.008) 100%)',
}

/* ═══════════════════════════════════════════════════════════════════
   HOVER POPOVER — appears on mouse-over for date tiles
   ═══════════════════════════════════════════════════════════════════ */

function Popover({ children, content, visible }: { children: React.ReactNode; content: React.ReactNode; visible: boolean }) {
  return (
    <div style={{ position: 'relative', display: 'inline-block' }}>
      {children}
      {visible && (
        <div style={{
          position: 'absolute', bottom: 'calc(100% + 8px)', left: '50%', transform: 'translateX(-50%)',
          background: 'linear-gradient(135deg, #1a1e2e, #141824)', border: '1px solid rgba(255,255,255,0.12)',
          borderRadius: 14, padding: '12px 16px', minWidth: 220, maxWidth: 300,
          boxShadow: '0 12px 40px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.05)',
          zIndex: 100, animation: 'popIn 0.15s ease',
          pointerEvents: 'none',
        }}>
          {content}
          {/* Arrow */}
          <div style={{
            position: 'absolute', bottom: -6, left: '50%', transform: 'translateX(-50%) rotate(45deg)',
            width: 12, height: 12, background: '#1a1e2e',
            border: '1px solid rgba(255,255,255,0.12)',
            borderTop: 'none', borderLeft: 'none',
          }} />
        </div>
      )}
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════════
   DATE TILE — Interactive card with hover popup
   ═══════════════════════════════════════════════════════════════════ */

function DateTile({ label, field, date, editing, onChange, highlighted, icon }: {
  label: string; field: string; date: string | null | undefined;
  editing: boolean; onChange: (f: string, v: string | null) => void;
  highlighted?: boolean; icon?: React.ReactNode
}) {
  const [hovered, setHovered] = useState(false)
  const status = getDateStatus((date as string) ?? null)
  const rgb = status !== 'none' ? URGENCY_COLORS_RGB[status] : '150,150,150'
  const isOverdue = status === 'red' || status === 'critical'
  const isDueSoon = status === 'orange'

  let daysText = ''
  let daysNum = 0
  if (date) {
    const [y, m, d] = String(date).split('T')[0].split('-').map(Number)
    const dt = new Date(y, m - 1, d)
    const now = new Date()
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    daysNum = Math.round((dt.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
    if (daysNum < 0) daysText = `${Math.abs(daysNum)}d overdue`
    else if (daysNum === 0) daysText = 'Due today'
    else daysText = `${daysNum}d left`
  }

  if (!date && !editing) return null

  return (
    <div
      id={highlighted ? `field-${field}` : undefined}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        position: 'relative',
        borderRadius: 14, padding: editing ? '10px 14px' : '14px 16px',
        border: `1px solid rgba(${rgb}, ${isOverdue ? '0.25' : isDueSoon ? '0.18' : '0.08'})`,
        background: `linear-gradient(135deg, rgba(${rgb}, ${hovered ? '0.08' : '0.04'}) 0%, rgba(${rgb}, 0.01) 100%)`,
        transition: 'all 0.2s ease',
        transform: hovered && !editing ? 'translateY(-2px)' : 'translateY(0)',
        boxShadow: hovered && !editing
          ? `0 8px 24px rgba(${rgb}, 0.15), 0 0 0 1px rgba(${rgb}, 0.1)`
          : highlighted ? `0 0 0 2px rgba(255,69,58,0.4)` : 'none',
        cursor: editing ? 'default' : 'default',
      }}
    >
      {/* Popover on hover — below tile */}
      {hovered && !editing && date && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 10px)', left: '50%', transform: 'translateX(-50%)',
          background: 'linear-gradient(135deg, #1a1e2e, #141824)', border: '1px solid rgba(255,255,255,0.12)',
          borderRadius: 14, padding: '14px 18px', minWidth: 200, maxWidth: 280,
          boxShadow: '0 12px 40px rgba(0,0,0,0.5)', zIndex: 200, animation: 'popIn 0.15s ease',
        }}>
          {/* Arrow pointing up */}
          <div style={{
            position: 'absolute', top: -6, left: '50%', transform: 'translateX(-50%) rotate(45deg)',
            width: 10, height: 10, background: '#1a1e2e',
            border: '1px solid rgba(255,255,255,0.12)', borderBottom: 'none', borderRight: 'none',
          }} />
          <div style={{ fontSize: 11, fontWeight: 700, color: `rgb(${rgb})`, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>
            {URGENCY_LABELS[status]}
          </div>
          <div style={{ fontSize: 20, fontWeight: 900, color: '#fff', letterSpacing: '-0.02em' }}>
            {daysText}
          </div>
          <div style={{ fontSize: 11, color: 'rgba(200,210,230,0.5)', marginTop: 4 }}>
            {label} · {formatDate(String(date).split('T')[0])}
          </div>
          {isOverdue && (
            <div style={{ fontSize: 11, color: '#ff453a', marginTop: 8, fontWeight: 600 }}>
              ⚡ Action needed — update this date
            </div>
          )}
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1 }}>
          {icon && <span style={{ color: `rgb(${rgb})`, opacity: 0.7, flexShrink: 0 }}>{icon}</span>}
          <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)' }}>{label}</span>
        </div>
        {!editing && date && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
            {daysText && (
              <span style={{
                fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 20,
                background: `rgba(${rgb}, 0.12)`, color: `rgb(${rgb})`,
              }}>{daysText}</span>
            )}
            <StatusDot status={status} size={7} />
            <span style={{ fontSize: 13, fontWeight: 600, color: `rgb(${rgb})` }}>
              {formatDate(String(date).split('T')[0])}
            </span>
          </div>
        )}
      </div>
      {editing && (
        <input type="date" value={date ? String(date).split('T')[0] : ''}
          onChange={e => onChange(field, e.target.value || null)}
          style={{ ...inputStyle, marginTop: 8 }} />
      )}
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════════
   INLINE FIELD — For non-date fields in sidebar cards
   ═══════════════════════════════════════════════════════════════════ */

type SelectOption = { value: string; label: string }

function InlineField({ label, field, value, type, editing, onChange, selectOptions, extra }: {
  label: string; field: string; value: string | boolean | number | null | undefined;
  type: 'date' | 'text' | 'boolean' | 'number' | 'select'; editing: boolean;
  onChange: (f: string, v: string | boolean | number | null) => void;
  selectOptions?: SelectOption[]; extra?: React.ReactNode;
}) {
  if (!editing && (value === null || value === undefined || value === '')) return null
  let displayValue: string
  if (typeof value === 'boolean') displayValue = value ? '✓ Yes' : '✗ No'
  else if (value === null || value === undefined) displayValue = '—'
  else if (type === 'date') displayValue = formatDate(String(value).split('T')[0])
  else displayValue = String(value)

  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', gap: 10, borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
      <span style={{ fontSize: 12, color: 'var(--text-secondary)', flex: '0 0 auto' }}>{label}</span>
      {editing ? (
        <div style={{ flex: 1, maxWidth: 200 }}>
          {type === 'text' && <input type="text" value={value != null ? String(value) : ''} onChange={e => onChange(field, e.target.value || null)} style={{ ...inputStyle, fontSize: 12 }} />}
          {type === 'number' && <input type="number" min={0} max={100} value={value != null ? Number(value) : ''} onChange={e => onChange(field, e.target.value ? Number(e.target.value) : null)} style={{ ...inputStyle, fontSize: 12 }} />}
          {type === 'date' && <input type="date" value={value ? String(value).split('T')[0] : ''} onChange={e => onChange(field, e.target.value || null)} style={{ ...inputStyle, fontSize: 12 }} />}
          {type === 'boolean' && (
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
              <input type="checkbox" checked={Boolean(value)} onChange={e => onChange(field, e.target.checked)} style={{ width: 14, height: 14, accentColor: '#007aff' }} />
              <span style={{ fontSize: 12, color: 'var(--text)' }}>{value ? 'Yes' : 'No'}</span>
              {extra}
            </label>
          )}
          {type === 'select' && selectOptions && (
            <select value={(value as string) ?? ''} onChange={e => onChange(field, e.target.value || null)} style={{ ...selectStyle, fontSize: 12 }}>
              <option value="">—</option>
              {selectOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          )}
        </div>
      ) : (
        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', textAlign: 'right' }}>{displayValue}</span>
      )}
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════════
   SELECT OPTIONS
   ═══════════════════════════════════════════════════════════════════ */

const POS_STATUS_OPTIONS: SelectOption[] = [{ value: 'Pending', label: 'Pending' }, { value: 'In-Progress', label: 'In-Progress' }, { value: 'Completed', label: 'Completed' }]
const MED_TECH_STATUS_OPTIONS: SelectOption[] = [{ value: 'Active', label: 'Active' }, { value: 'Pending', label: 'Pending' }, { value: 'Expired', label: 'Expired' }, { value: 'Not Applicable', label: 'N/A' }]
const ATP_OPTIONS: SelectOption[] = [{ value: 'Pending', label: 'Pending' }, { value: 'Approved', label: 'Approved' }, { value: 'Expired', label: 'Expired' }, { value: 'Not Applicable', label: 'N/A' }]
const AUDIT_OPTIONS: SelectOption[] = [{ value: 'Not Started', label: 'Not Started' }, { value: 'Pending', label: 'Pending' }, { value: 'Passed', label: 'Passed' }, { value: 'Failed', label: 'Failed' }]
const QA_OPTIONS: SelectOption[] = [{ value: 'Not Started', label: 'Not Started' }, { value: 'Pending', label: 'Pending' }, { value: 'Passed', label: 'Passed' }, { value: 'Failed', label: 'Failed' }]
const CONTACT_TYPE_OPTIONS: SelectOption[] = [{ value: 'Phone', label: 'Phone' }, { value: 'Home Visit', label: 'Home Visit' }, { value: 'Email', label: 'Email' }, { value: 'Office Visit', label: 'Office Visit' }]

/* ═══════════════════════════════════════════════════════════════════
   COLLAPSIBLE SECTION (for secondary areas)
   ═══════════════════════════════════════════════════════════════════ */

function CollapsibleSection({ title, icon, children, defaultOpen = false, accentColor }: {
  title: string; icon: React.ReactNode; children: React.ReactNode;
  defaultOpen?: boolean; accentColor?: string
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div style={{ ...glassCard, marginBottom: 12 }}>
      <button type="button" onClick={() => setOpen(o => !o)} style={{
        width: '100%', display: 'flex', alignItems: 'center', gap: 10,
        padding: '12px 16px', background: 'transparent', border: 'none',
        cursor: 'pointer', color: 'var(--text)', transition: 'background 0.2s',
        borderBottom: open ? '1px solid rgba(255,255,255,0.04)' : 'none',
      }}>
        <div style={{ width: 28, height: 28, borderRadius: 8, background: accentColor ? `${accentColor}12` : 'rgba(0,122,255,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: accentColor ?? 'var(--accent)', flexShrink: 0 }}>
          {icon}
        </div>
        <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', color: 'var(--text-secondary)', flex: 1, textAlign: 'left' }}>{title}</span>
        {open ? <ChevronDown size={14} style={{ opacity: 0.4 }} /> : <ChevronRight size={14} style={{ opacity: 0.4 }} />}
      </button>
      {open && <div style={{ padding: '8px 16px 14px' }}>{children}</div>}
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
    setLoading(true); setError(null); setAnswer(null)
    try {
      let res = await fetch('/api/blhbot/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ id: clientId, question: question.trim() }),
      })

      // Auto-retry on 401: refresh the session token and try once more
      if (res.status === 401) {
        const { createClient } = await import('@/lib/supabase/client')
        const supabase = createClient()
        const { error: refreshErr } = await supabase.auth.refreshSession()
        if (!refreshErr) {
          res = await fetch('/api/blhbot/ask', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'same-origin',
            body: JSON.stringify({ id: clientId, question: question.trim() }),
          })
        }
      }

      if (res.status === 401) {
        throw new Error('Session expired \u2014 please refresh the page and sign in again')
      }

      if (res.status === 429) {
        throw new Error('BLH Bot is busy \u2014 please wait a moment and try again')
      }

      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed')
      setAnswer(data.answer)
    } catch (err: any) { setError(err.message) } finally { setLoading(false) }
  }
  return (
    <div>
      <div style={{ display: 'flex', gap: 6 }}>
        <input value={question} onChange={e => setQuestion(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') ask() }}
          placeholder="Ask about this client…" style={{ ...inputStyle, flex: 1, fontSize: 12, borderColor: 'rgba(191,90,242,0.2)' }} />
        <button onClick={ask} disabled={loading || !question.trim()} style={{
          background: 'rgba(191,90,242,0.1)', border: '1px solid rgba(191,90,242,0.2)', borderRadius: 10,
          color: '#bf5af2', fontSize: 11, fontWeight: 600, padding: '6px 10px', cursor: 'pointer',
          display: 'flex', alignItems: 'center', gap: 4, opacity: loading ? 0.6 : 1, whiteSpace: 'nowrap',
        }}>{loading ? <><RefreshCw size={12} style={{ animation: 'spin 1s linear infinite' }} /> …</> : <><Brain size={12} /> Ask</>}</button>
      </div>
      {error && <div style={{ marginTop: 6, fontSize: 11, color: '#ff453a' }}>⚠️ {error}</div>}
      {answer && <div style={{ marginTop: 8, background: 'rgba(191,90,242,0.04)', border: '1px solid rgba(191,90,242,0.12)', borderRadius: 10, padding: '10px 12px', fontSize: 12, color: 'var(--text)', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{answer}</div>}
      <style>{`@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}`}</style>
    </div>
  )
}

function AISummary({ clientId }: { clientId: string }) {
  const [summary, setSummary] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const generate = async () => {
    setLoading(true); setError(null); setSummary(null)
    try {
      let res = await fetch('/api/client-summary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ clientId }),
      })

      // Auto-retry on 401: refresh the session token and try once more
      if (res.status === 401) {
        const { createClient } = await import('@/lib/supabase/client')
        const supabase = createClient()
        const { error: refreshErr } = await supabase.auth.refreshSession()
        if (!refreshErr) {
          res = await fetch('/api/client-summary', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'same-origin',
            body: JSON.stringify({ clientId }),
          })
        }
      }

      if (res.status === 401) {
        throw new Error('Session expired \u2014 please refresh the page and sign in again')
      }

      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed')
      setSummary(data.summary)
    } catch (err: any) { setError(err.message) } finally { setLoading(false) }
  }
  return (
    <div style={{ marginTop: 8 }}>
      <button onClick={generate} disabled={loading} style={{
        background: 'rgba(191,90,242,0.08)', border: '1px solid rgba(191,90,242,0.15)', borderRadius: 8,
        color: '#bf5af2', fontSize: 11, fontWeight: 600, padding: '6px 10px', cursor: 'pointer',
        display: 'flex', alignItems: 'center', gap: 4, opacity: loading ? 0.6 : 1,
      }}>{loading ? <><RefreshCw size={12} style={{ animation: 'spin 1s linear infinite' }} /> …</> : <><Zap size={12} /> AI Summary</>}</button>
      {error && <div style={{ marginTop: 6, fontSize: 11, color: '#ff453a' }}>⚠️ {error}</div>}
      {summary && <div style={{ marginTop: 8, background: 'rgba(191,90,242,0.04)', border: '1px solid rgba(191,90,242,0.12)', borderRadius: 10, padding: '10px 12px', fontSize: 12, lineHeight: 1.6, color: 'var(--text)' }}>{summary}</div>}
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
    supabase.from('client_notes').select('*, profiles(full_name)').eq('client_id', clientId).order('created_at', { ascending: false })
      .then(({ data }) => { if (data) setNotes(data as ClientNote[]) })
  }, [clientId])
  const addNote = async () => {
    if (!newNote.trim()) return
    setSaving(true)
    const supabase = createClient()
    const { data, error } = await supabase.from('client_notes').insert({ client_id: clientId, author_id: currentUserId, content: newNote.trim() }).select('*, profiles(full_name)').single()
    if (!error && data) { setNotes(prev => [data as ClientNote, ...prev]); setNewNote('') }
    setSaving(false)
  }
  const getInitials = (n: string | null | undefined) => { if (!n) return '?'; const p = n.trim().split(' '); return p.length >= 2 ? (p[0][0] + p[p.length-1][0]).toUpperCase() : p[0][0]?.toUpperCase() ?? '?' }

  return (
    <div style={{ ...glassCard, padding: '16px 18px', marginBottom: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <MessageCircle size={16} style={{ color: '#007aff' }} />
        <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Notes</span>
      </div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
        <textarea value={newNote} onChange={e => setNewNote(e.target.value)} placeholder="Add a note…"
          style={{ ...inputStyle, flex: 1, minHeight: 50, resize: 'vertical', borderRadius: 12, fontSize: 12 }} />
        <button onClick={addNote} disabled={saving || !newNote.trim()} style={{
          background: 'rgba(0,122,255,0.1)', border: '1px solid rgba(0,122,255,0.2)', borderRadius: 10,
          color: '#007aff', fontSize: 11, fontWeight: 600, padding: '8px 10px', cursor: 'pointer',
          alignSelf: 'flex-end', display: 'flex', alignItems: 'center', gap: 4, opacity: saving || !newNote.trim() ? 0.4 : 1,
        }}><Send size={12} /> Add</button>
      </div>
      {notes.length === 0 && <p style={{ fontSize: 11, color: 'var(--text-secondary)', margin: 0 }}>No notes yet.</p>}
      {notes.map(note => {
        const hue = (note.profiles?.full_name ?? '').split('').reduce((a, c) => a + c.charCodeAt(0), 0) % 360
        return (
          <div key={note.id} style={{ display: 'flex', gap: 8, padding: '8px 0', borderTop: '1px solid rgba(255,255,255,0.03)' }}>
            <div style={{ width: 28, height: 28, borderRadius: 8, flexShrink: 0, background: `linear-gradient(135deg, hsl(${hue},60%,25%), hsl(${hue},60%,18%))`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 800, color: `hsl(${hue},70%,75%)` }}>{getInitials(note.profiles?.full_name)}</div>
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--accent)' }}>{note.profiles?.full_name ?? 'Unknown'}</span>
                <span style={{ fontSize: 10, color: 'var(--text-secondary)' }}>{new Date(note.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
              </div>
              <p style={{ fontSize: 12, margin: 0, color: 'var(--text)', whiteSpace: 'pre-wrap', lineHeight: 1.5, background: 'rgba(255,255,255,0.02)', borderRadius: 10, padding: '6px 10px', border: '1px solid rgba(255,255,255,0.03)' }}>{note.content}</p>
            </div>
          </div>
        )
      })}
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════════
   ACTIVITY LOG — Timeline
   ═══════════════════════════════════════════════════════════════════ */

function ActivitySection({ clientId }: { clientId: string }) {
  const [logs, setLogs] = useState<ActivityLog[]>([])
  const [open, setOpen] = useState(false)
  useEffect(() => {
    const supabase = createClient()
    supabase.from('activity_log').select('*, profiles(full_name)').eq('client_id', clientId).order('created_at', { ascending: false }).limit(20)
      .then(({ data }) => { if (data) setLogs(data as ActivityLog[]) })
  }, [clientId])
  if (logs.length === 0) return null
  return (
    <div style={{ ...glassCard, marginBottom: 12 }}>
      <button type="button" onClick={() => setOpen(o => !o)} style={{
        width: '100%', display: 'flex', alignItems: 'center', gap: 8, padding: '12px 16px',
        background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text)',
        borderBottom: open ? '1px solid rgba(255,255,255,0.04)' : 'none',
      }}>
        <Activity size={14} style={{ color: '#30d158' }} />
        <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em', flex: 1, textAlign: 'left' }}>Activity Log ({logs.length})</span>
        {open ? <ChevronDown size={14} style={{ opacity: 0.4 }} /> : <ChevronRight size={14} style={{ opacity: 0.4 }} />}
      </button>
      {open && (
        <div style={{ padding: '8px 16px 14px 32px', position: 'relative' }}>
          <div style={{ position: 'absolute', left: 22, top: 4, bottom: 4, width: 2, background: 'rgba(255,255,255,0.05)', borderRadius: 1 }} />
          {logs.map(log => (
            <div key={log.id} style={{ position: 'relative', padding: '6px 0 10px', fontSize: 11 }}>
              <div style={{ position: 'absolute', left: -14, top: 10, width: 6, height: 6, borderRadius: '50%', background: log.field_name ? '#007aff' : 'var(--text-secondary)' }} />
              <span style={{ color: 'var(--accent)', fontWeight: 700 }}>{log.profiles?.full_name ?? 'Someone'}</span>{' '}
              {log.field_name ? (
                <>changed <strong style={{ color: 'var(--text)' }}>{log.field_name.replace(/_/g, ' ')}</strong>{' '}
                  {log.old_value && <>from <span style={{ color: '#ff453a', padding: '0 3px', background: 'rgba(255,69,58,0.06)', borderRadius: 3 }}>{log.old_value}</span>{' '}</>}
                  {log.new_value && <>to <span style={{ color: '#30d158', padding: '0 3px', background: 'rgba(48,209,88,0.06)', borderRadius: 3 }}>{log.new_value}</span></>}
                </>
              ) : <span style={{ color: 'var(--text)' }}>{log.action}</span>}
              <div style={{ fontSize: 10, color: 'var(--text-secondary)', marginTop: 2 }}>
                {new Date(log.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════════
   MAIN COMPONENT
   ═══════════════════════════════════════════════════════════════════ */

export default function ClientEditForm({
  client,
  currentUserId,
  currentProfile,
  planners = [],
  hideDeadlines = false,
  hideContactDetails = false,
  hidePlansAssessments = false,
  hideCoDetails = false,
  hideMedTech = false,
  hideFormsSignatures = false,
  hideAuthorizations = false,
  hideReportingReviews = false,
  hideClientInfo = false,
  hideClientDocuments = false,
  hideNotes = false,
  hideActivity = false,
  hideHero = false,
}: ClientEditFormProps) {
  const searchParams = useSearchParams()
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null)
  const [assignedTo, setAssignedTo] = useState(client.assigned_to ?? '')
  const [plannerSearch, setPlannerSearch] = useState('')
  const [reassignReason, setReassignReason] = useState('')
  const [highlightedField, setHighlightedField] = useState<string | null>(null)
  const [assignSaving, setAssignSaving] = useState(false)
  const [deactivating, setDeactivating] = useState(false)

  useEffect(() => { if (searchParams.get('created') === '1') { setToast({ type: 'success', message: 'Client created!' }); setTimeout(() => setToast(null), 4000) } }, [])

  const [formData, setFormData] = useState<Partial<EditableClient>>({
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

  const canReassign = currentProfile.role === 'supervisor' || currentProfile.role === 'it' || currentProfile.role === 'team_manager'
  const filteredPlanners = planners.filter(p => { const q = plannerSearch.trim().toLowerCase(); return !q || (p.full_name ?? '').toLowerCase().includes(q) })

  const handleChange = (field: string, value: string | boolean | number | null) => {
    if (field === 'spm_completed') {
      const checked = Boolean(value)
      if (checked) { const d = new Date(); d.setDate(d.getDate() + 30); setFormData(prev => ({ ...prev, spm_completed: true, spm_next_due: d.toISOString().split('T')[0] })) }
      else setFormData(prev => ({ ...prev, spm_completed: false }))
      return
    }
    setFormData(prev => ({ ...prev, [field]: value }))
  }

  const handleSave = async () => {
    setSaving(true); setToast(null)
    try {
      const supabase = createClient()
      const changes: Array<{ field: string; old: string | null; new: string | null }> = []
      for (const field of ['pos_status', 'eligibility_end_date', 'last_contact_date', 'assessment_due', 'goal_pct', 'med_tech_status', 'atp', 'spm_completed', 'pos_deadline'] as (keyof typeof formData)[]) {
        const oldVal = client[field as keyof Client]; const newVal = formData[field]
        if (String(oldVal ?? '') !== String(newVal ?? '')) changes.push({ field: field as string, old: oldVal != null ? String(oldVal) : null, new: newVal != null ? String(newVal) : null })
      }
      const { error } = await supabase.from('clients').update(formData).eq('id', client.id)
      if (error) throw error
      if (changes.length > 0) await supabase.from('activity_log').insert(changes.map(c => ({ client_id: client.id, user_id: currentUserId, action: `Changed ${c.field.replace(/_/g, ' ')}`, field_name: c.field, old_value: c.old, new_value: c.new })))
      setEditing(false); setToast({ type: 'success', message: 'Saved!' }); setTimeout(() => setToast(null), 3000)
    } catch (err: any) { setToast({ type: 'error', message: err?.message || 'Failed.' }) } finally { setSaving(false) }
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
    try {
      const res = await fetch(`/api/clients/${client.id}/reassign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          new_planner_id: assignedTo,
          reason: reassignReason.trim() || null,
        }),
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        throw new Error(j.error ?? `Reassign failed (${res.status})`)
      }
      // The RPC writes to client_assignment_history (audited). For
      // backwards-compat, also append to activity_log so the existing
      // timeline UI keeps showing reassignments.
      const supabase = createClient()
      await supabase.from('activity_log').insert({
        client_id: client.id,
        user_id: currentUserId,
        action: 'Reassigned client',
        field_name: 'assigned_to',
        old_value: client.assigned_to,
        new_value: assignedTo,
      })
      sendAssignmentEmail(client.id, assignedTo).catch(() => {})
      setReassignReason('')
      setToast({ type: 'success', message: 'Reassigned.' })
      setTimeout(() => setToast(null), 3000)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Reassign failed'
      setToast({ type: 'error', message: msg })
      setTimeout(() => setToast(null), 4000)
    } finally {
      setAssignSaving(false)
    }
  }

  const handleMarkDeceased = async () => {
    if (!(isSupervisorLike(currentProfile.role) || currentProfile.role === 'team_manager')) return
    if (!confirm(`Mark ${client.last_name}${client.first_name ? `, ${client.first_name}` : ''} as deceased?`)) return
    setDeactivating(true)
    const supabase = createClient()
    const { error } = await supabase.from('clients').update({ is_active: false, deactivation_reason: 'deceased', deactivated_at: new Date().toISOString(), deactivated_by: currentUserId }).eq('id', client.id)
    if (!error) { await supabase.from('activity_log').insert({ client_id: client.id, user_id: currentUserId, action: 'Deactivated client', field_name: 'deactivation_reason', old_value: null, new_value: 'deceased' }); window.location.href = '/dashboard'; return }
    setToast({ type: 'error', message: error.message }); setTimeout(() => setToast(null), 3000); setDeactivating(false)
  }

  const f = formData
  const daysSince = getDaysSinceContact(f.last_contact_date as string | null)
  const noContact = daysSince !== null && daysSince >= 7

  // Count urgency for hero
  const urgencyCounts = { critical: 0, overdue: 0, dueSoon: 0, onTrack: 0 }
  const dateKeys = ['eligibility_end_date', 'three_month_visit_due', 'quarterly_waiver_date', 'med_tech_redet_date', 'pos_deadline', 'assessment_due', 'thirty_day_letter_date', 'co_financial_redet_date', 'doc_mdh_date', 'spm_next_due'] as const
  for (const k of dateKeys) {
    const s = getDateStatus((f[k] as string) ?? null)
    if (s === 'critical') urgencyCounts.critical++
    else if (s === 'red') urgencyCounts.overdue++
    else if (s === 'orange') urgencyCounts.dueSoon++
    else if (s === 'green' || s === 'yellow') urgencyCounts.onTrack++
  }
  const totalOverdue = urgencyCounts.critical + urgencyCounts.overdue

  const spmNote = editing && f.spm_completed && f.spm_next_due ? (
    <span style={{ fontSize: 11, color: 'var(--text-secondary)', display: 'block', marginTop: 4 }}>Next due: <strong>{formatDate(f.spm_next_due as string)}</strong></span>
  ) : null

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', paddingBottom: 100 }}>
      {/* Toast */}
      {toast && (
        <div className="slide-in-up" style={{
          position: 'fixed', top: 20, right: 20, zIndex: 9999,
          background: toast.type === 'success' ? 'rgba(48,209,88,0.12)' : 'rgba(255,69,58,0.12)',
          border: `1px solid ${toast.type === 'success' ? 'rgba(48,209,88,0.3)' : 'rgba(255,69,58,0.3)'}`,
          borderRadius: 14, padding: '10px 16px', color: toast.type === 'success' ? '#30d158' : '#ff453a',
          fontSize: 13, fontWeight: 600, backdropFilter: 'blur(12px)', boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
        }}>{toast.type === 'success' ? '✓' : '✗'} {toast.message}</div>
      )}

      {/* Popover animation */}
      <style>{`@keyframes popIn{from{opacity:0;transform:translateX(-50%) translateY(-4px)}to{opacity:1;transform:translateX(-50%) translateY(0)}}`}</style>

      {/* Back — v2 hides this row (Breadcrumb covers ← Dashboard) */}
      {!hideHero && (
      <div style={{ display: 'flex', gap: 8, marginBottom: 14, alignItems: 'center' }}>
        <Link href="/dashboard" style={{ color: 'var(--accent)', textDecoration: 'none', fontSize: 13, fontWeight: 600 }}>← Dashboard</Link>
        <Link href={`/clients/${client.id}/print`} target="_blank" style={{ color: 'var(--text-secondary)', textDecoration: 'none', fontSize: 12, padding: '4px 10px', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 8 }}><Printer size={12} style={{ marginRight: 4 }} />Print</Link>
      </div>
      )}

      {/* ═══ HERO HEADER ═══ — v2 IdentityHero owns this when hideHero is set */}
      {!hideHero && (
      <div style={{
        borderRadius: 22, overflow: 'hidden', marginBottom: 16,
        background: 'var(--v2-cobalt-grad)',
        border: '1px solid rgba(100,150,255,0.08)', padding: '24px 28px 20px', position: 'relative',
      }}>
        <div style={{ position: 'absolute', right: -40, top: -40, width: 200, height: 200, borderRadius: '50%', background: 'radial-gradient(circle, rgba(0,122,255,0.08) 0%, transparent 70%)', pointerEvents: 'none' }} />
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', position: 'relative', zIndex: 1, gap: 16 }}>
          <div style={{ flex: 1 }}>
            <h1 style={{ fontSize: 30, fontWeight: 900, margin: 0, letterSpacing: '-0.02em', color: '#fff' }}>
              {client.last_name}, {client.first_name}
            </h1>
            <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              <span style={{ fontSize: 12, color: 'rgba(200,210,230,0.6)', fontWeight: 600 }}>ID: <strong style={{ color: 'rgba(200,210,230,0.9)' }}>{client.client_id}</strong></span>
              <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 10, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.08)', textTransform: 'uppercase', letterSpacing: '0.06em', color: 'rgba(200,210,230,0.7)' }}>{client.category}</span>
              {f.eligibility_code && <span style={{ fontSize: 12, color: 'rgba(200,210,230,0.5)' }}>{f.eligibility_code as string}</span>}
              {client.profiles?.full_name && <span style={{ fontSize: 12, color: 'rgba(200,210,230,0.4)' }}>👤 {client.profiles.full_name}</span>}
            </div>
            {/* Status chips */}
            <div style={{ display: 'flex', gap: 6, marginTop: 12, flexWrap: 'wrap' }}>
              {totalOverdue > 0 && <span style={{ fontSize: 10, fontWeight: 700, padding: '3px 10px', borderRadius: 20, background: 'rgba(255,69,58,0.15)', border: '1px solid rgba(255,69,58,0.3)', color: '#ff453a' }}>🔴 {totalOverdue} overdue</span>}
              {urgencyCounts.dueSoon > 0 && <span style={{ fontSize: 10, fontWeight: 700, padding: '3px 10px', borderRadius: 20, background: 'rgba(255,159,10,0.12)', border: '1px solid rgba(255,159,10,0.25)', color: '#ff9f0a' }}>🟠 {urgencyCounts.dueSoon} due soon</span>}
              <span style={{ fontSize: 10, fontWeight: 600, padding: '3px 10px', borderRadius: 20, background: noContact ? 'rgba(255,159,10,0.1)' : 'rgba(255,255,255,0.03)', border: noContact ? '1px solid rgba(255,159,10,0.2)' : '1px solid rgba(255,255,255,0.05)', color: noContact ? '#ff9f0a' : 'rgba(200,210,230,0.5)' }}>
                {daysSince !== null ? `📞 ${daysSince}d ago` : 'No contact'}{f.last_contact_type ? ` · ${f.last_contact_type}` : ''}
              </span>
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 10, flexShrink: 0 }}>
            <HealthScoreRing score={f.goal_pct as number ?? 0} size={64} strokeWidth={5} />
            <div style={{ display: 'flex', gap: 6 }}>
              {editing ? (
                <>
                  <button onClick={handleSave} disabled={saving} style={{ background: 'linear-gradient(135deg, #007aff, #0055cc)', color: '#fff', border: 'none', borderRadius: 10, padding: '8px 14px', fontSize: 12, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, boxShadow: '0 4px 12px rgba(0,122,255,0.3)' }}><Save size={13} /> {saving ? '…' : 'Save'}</button>
                  <button onClick={handleCancel} style={{ background: 'rgba(255,255,255,0.06)', color: 'rgba(200,210,230,0.8)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, padding: '8px 14px', fontSize: 12, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}><X size={13} /> Cancel</button>
                </>
              ) : (
                <button onClick={() => setEditing(true)} style={{ background: 'rgba(255,255,255,0.06)', color: 'rgba(200,210,230,0.9)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, padding: '8px 14px', fontSize: 12, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}><Edit3 size={13} /> Edit</button>
              )}
            </div>
          </div>
        </div>
      </div>
      )}

      {/* ═══ TWO-COLUMN LAYOUT ═══ */}
      <div className="client-detail-grid" style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 16, alignItems: 'start' }}>

        {/* ── LEFT COLUMN: Deadline tiles + data sections ── */}
        <div>
          {/* Key Deadlines — v2 hides this block when extracted */}
          {!hideDeadlines && (
          <div style={{ ...glassCard, padding: '16px 18px', marginBottom: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
              <AlertTriangle size={16} style={{ color: '#ff453a' }} />
              <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Key Deadlines</span>
              <span style={{ fontSize: 10, color: 'var(--text-secondary)', marginLeft: 'auto' }}>Hover for details</span>
            </div>
            <div className="deadline-tile-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>
              <DateTile label="Eligibility End" field="eligibility_end_date" date={f.eligibility_end_date} editing={editing} onChange={handleChange} highlighted={highlightedField === 'eligibility_end_date'} icon={<Shield size={13} />} />
              <DateTile label="3-Month Visit Due" field="three_month_visit_due" date={f.three_month_visit_due} editing={editing} onChange={handleChange} highlighted={highlightedField === 'three_month_visit_due'} icon={<Calendar size={13} />} />
              <DateTile label="Quarterly Waiver" field="quarterly_waiver_date" date={f.quarterly_waiver_date} editing={editing} onChange={handleChange} highlighted={highlightedField === 'quarterly_waiver_date'} icon={<FileText size={13} />} />
              <DateTile label="Med-Tech Redet" field="med_tech_redet_date" date={f.med_tech_redet_date} editing={editing} onChange={handleChange} highlighted={highlightedField === 'med_tech_redet_date'} icon={<Clock size={13} />} />
              <DateTile label="POS Deadline" field="pos_deadline" date={f.pos_deadline} editing={editing} onChange={handleChange} highlighted={highlightedField === 'pos_deadline'} icon={<FileText size={13} />} />
              <DateTile label="Assessment Due" field="assessment_due" date={f.assessment_due} editing={editing} onChange={handleChange} highlighted={highlightedField === 'assessment_due'} icon={<Clock size={13} />} />
              <DateTile label="Doc MDH (45d)" field="doc_mdh_date" date={f.doc_mdh_date} editing={editing} onChange={handleChange} highlighted={highlightedField === 'doc_mdh_date'} icon={<FileText size={13} />} />
              <DateTile label="SPM Next Due" field="spm_next_due" date={f.spm_next_due} editing={editing} onChange={handleChange} highlighted={highlightedField === 'spm_next_due'} icon={<Calendar size={13} />} />
              <DateTile label="30-Day Letter" field="thirty_day_letter_date" date={f.thirty_day_letter_date} editing={editing} onChange={handleChange} highlighted={highlightedField === 'thirty_day_letter_date'} icon={<FileText size={13} />} />
              <DateTile label="Last Contact" field="last_contact_date" date={f.last_contact_date} editing={editing} onChange={handleChange} highlighted={highlightedField === 'last_contact_date'} icon={<Phone size={13} />} />
            </div>
          </div>
          )}

          {/* Contact & Visits details — v2 hides this block when extracted */}
          {!hideContactDetails && (
          <CollapsibleSection title="Contact & Visit Details" icon={<Phone size={14} />} accentColor="#30d158" defaultOpen={true}>
            <InlineField label="Last Contact Type" field="last_contact_type" value={f.last_contact_type} type={editing ? 'select' : 'text'} editing={editing} onChange={handleChange} selectOptions={CONTACT_TYPE_OPTIONS} />
            <InlineField label="Drop-in Visit Date" field="drop_in_visit_date" value={f.drop_in_visit_date} type="date" editing={editing} onChange={handleChange} />
            <InlineField label="3-Month Visit Date" field="three_month_visit_date" value={f.three_month_visit_date} type="date" editing={editing} onChange={handleChange} />
          </CollapsibleSection>
          )}

          {/* Plans & Assessments — v2 hides this block when extracted */}
          {!hidePlansAssessments && (
          <CollapsibleSection title="Plans & Assessments" icon={<Clock size={14} />} accentColor="#ff453a" defaultOpen={true}>
            <InlineField label="POC Date" field="poc_date" value={f.poc_date} type="date" editing={editing} onChange={handleChange} />
            <InlineField label="LOC Date" field="loc_date" value={f.loc_date} type="date" editing={editing} onChange={handleChange} />
            <InlineField label="POS Status" field="pos_status" value={f.pos_status} type={editing ? 'select' : 'text'} editing={editing} onChange={handleChange} selectOptions={POS_STATUS_OPTIONS} />
            <InlineField label="SPM Completed" field="spm_completed" value={f.spm_completed} type="boolean" editing={editing} onChange={handleChange} extra={spmNote} />
            {editing && <InlineField label="Goal Progress (%)" field="goal_pct" value={f.goal_pct} type="number" editing={editing} onChange={handleChange} />}
          </CollapsibleSection>
          )}

          {/* CO Details — v2 hides this block when extracted */}
          {!hideCoDetails && (
          <CollapsibleSection title="CO Details" icon={<FileText size={14} />} accentColor="#ff9f0a">
            <DateTile label="CO Financial Redet" field="co_financial_redet_date" date={f.co_financial_redet_date} editing={editing} onChange={handleChange} highlighted={highlightedField === 'co_financial_redet_date'} />
            <div style={{ height: 6 }} />
            <DateTile label="CO Application" field="co_app_date" date={f.co_app_date} editing={editing} onChange={handleChange} highlighted={highlightedField === 'co_app_date'} />
            <div style={{ height: 6 }} />
            <DateTile label="MFP Consent" field="mfp_consent_date" date={f.mfp_consent_date} editing={editing} onChange={handleChange} highlighted={highlightedField === 'mfp_consent_date'} />
            <div style={{ height: 6 }} />
            <DateTile label="257 Date" field="two57_date" date={f.two57_date} editing={editing} onChange={handleChange} highlighted={highlightedField === 'two57_date'} />
            <InlineField label="Request Letter" field="request_letter" value={f.request_letter} type="text" editing={editing} onChange={handleChange} />
          </CollapsibleSection>
          )}

          {/* Notes — v2 hides this block when extracted */}
          {!hideNotes && (
          <NotesSection clientId={client.id} currentUserId={currentUserId} />
          )}

          {/* Activity — v2 hides this block when extracted */}
          {!hideActivity && (
          <ActivitySection clientId={client.id} />
          )}
        </div>

        {/* ── SIDEBAR ROW: side-by-side cards under main column ── */}
        <div className="client-detail-sidebar-row" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16, alignItems: 'start' }}>
          {/* AI Intelligence */}
          {!editing && (
            <div style={{ ...glassCard, padding: '14px 16px', marginBottom: 12, borderColor: 'rgba(191,90,242,0.1)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
                <Brain size={14} style={{ color: '#bf5af2' }} />
                <span style={{ fontSize: 12, fontWeight: 700, color: '#bf5af2', textTransform: 'uppercase', letterSpacing: '0.04em' }}>AI Intelligence</span>
              </div>
              <AIAskClient clientId={client.id} />
              <AISummary clientId={client.id} />
            </div>
          )}

          {/* Client Info — v2 hides this card (Reassign returns in Batch 3 as Actions) */}
          {!hideClientInfo && (
          <div style={{ ...glassCard, padding: '14px 16px', marginBottom: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
              <Users size={14} style={{ color: '#007aff' }} />
              <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Client Info</span>
            </div>
            <InlineField label="Assigned To" field="" value={client.profiles?.full_name ?? 'Unassigned'} type="text" editing={false} onChange={() => {}} />
            <InlineField label="Category" field="" value={client.category.toUpperCase()} type="text" editing={false} onChange={() => {}} />
            <InlineField label="Goal %" field="" value={`${f.goal_pct}%`} type="text" editing={false} onChange={() => {}} />
            {editing && (
              <div style={{ marginTop: 6 }}>
                <EligibilityCodeSelect value={f.eligibility_code} onChange={v => handleChange('eligibility_code', v)} editing={true} />
              </div>
            )}
            {!editing && f.eligibility_code && getEligibilityDescription(f.eligibility_code as string) && (
              <div style={{ fontSize: 11, color: 'var(--text-secondary)', padding: '6px 0' }}>
                <span style={{ fontWeight: 600 }}>{f.eligibility_code as string}</span> · {getEligibilityDescription(f.eligibility_code as string)}
              </div>
            )}
            <InlineField label="Created" field="" value={client.created_at ? formatDate(client.created_at.split('T')[0]) : null} type="text" editing={false} onChange={() => {}} />
            <InlineField label="Updated" field="" value={client.updated_at ? formatDate(client.updated_at.split('T')[0]) : null} type="text" editing={false} onChange={() => {}} />

            {/* Reassign */}
            {canReassign && planners.length > 0 && (
              <div style={{ marginTop: 10, borderTop: '1px solid rgba(255,255,255,0.04)', paddingTop: 10 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Reassign</div>
                <input type="text" value={plannerSearch} onChange={e => setPlannerSearch(e.target.value)} placeholder="Search…" style={{ ...inputStyle, fontSize: 11, marginBottom: 6 }} />
                <select value={assignedTo} onChange={e => setAssignedTo(e.target.value)} style={{ ...selectStyle, fontSize: 11, marginBottom: 6 }}>
                  <option value="">— Select —</option>
                  {filteredPlanners.map(p => <option key={p.id} value={p.id}>{p.full_name}</option>)}
                </select>
                <textarea
                  value={reassignReason}
                  onChange={e => setReassignReason(e.target.value)}
                  placeholder="Reason (optional, recorded in audit history)"
                  rows={2}
                  style={{ ...inputStyle, fontSize: 11, marginBottom: 6, resize: 'vertical', fontFamily: 'inherit' }}
                />
                <button onClick={handleReassign} disabled={!assignedTo || assignSaving || assignedTo === client.assigned_to}
                  style={{ background: 'rgba(0,122,255,0.1)', border: '1px solid rgba(0,122,255,0.2)', borderRadius: 8, color: '#007aff', fontSize: 11, fontWeight: 600, padding: '6px 10px', cursor: 'pointer', width: '100%', opacity: (!assignedTo || assignSaving) ? 0.4 : 1 }}>
                  {assignSaving ? 'Saving…' : 'Reassign'}
                </button>
              </div>
            )}
          </div>
          )}

          {/* Med Tech — v2 hides this block when extracted */}
          {!hideMedTech && (
          <CollapsibleSection title="Med Tech" icon={<Shield size={14} />} accentColor="#ff9f0a">
            <InlineField label="Med/Tech Status" field="med_tech_status" value={f.med_tech_status} type={editing ? 'select' : 'text'} editing={editing} onChange={handleChange} selectOptions={MED_TECH_STATUS_OPTIONS} />
          </CollapsibleSection>
          )}

          {/* Forms & Signatures — v2 hides this block when extracted */}
          {!hideFormsSignatures && (
          <CollapsibleSection title="Forms & Signatures" icon={<FileText size={14} />} accentColor="#ffd60a">
            <InlineField label="FOC" field="foc" value={f.foc} type="text" editing={editing} onChange={handleChange} />
            <InlineField label="Provider Forms" field="provider_forms" value={f.provider_forms} type="text" editing={editing} onChange={handleChange} />
            <InlineField label="Signatures Needed" field="signatures_needed" value={f.signatures_needed} type="text" editing={editing} onChange={handleChange} />
            <InlineField label="Schedule Docs" field="schedule_docs" value={f.schedule_docs} type="boolean" editing={editing} onChange={handleChange} />
          </CollapsibleSection>
          )}

          {/* Authorizations — v2 hides this block when extracted */}
          {!hideAuthorizations && (
          <CollapsibleSection title="Authorizations" icon={<Shield size={14} />} accentColor="#bf5af2">
            <InlineField label="ATP" field="atp" value={f.atp} type={editing ? 'select' : 'text'} editing={editing} onChange={handleChange} selectOptions={ATP_OPTIONS} />
            <InlineField label="SNFs" field="snfs" value={f.snfs} type="text" editing={editing} onChange={handleChange} />
            <InlineField label="Lease" field="lease" value={f.lease} type="text" editing={editing} onChange={handleChange} />
          </CollapsibleSection>
          )}

          {/* Reporting & Reviews — v2 hides this block when extracted */}
          {!hideReportingReviews && (
          <CollapsibleSection title="Reporting & Reviews" icon={<AlertTriangle size={14} />} accentColor="#ffd60a">
            <InlineField label="Reportable Events" field="reportable_events" value={f.reportable_events} type="text" editing={editing} onChange={handleChange} />
            <InlineField label="Appeals" field="appeals" value={f.appeals} type="text" editing={editing} onChange={handleChange} />
            <InlineField label="Audit Review" field="audit_review" value={f.audit_review} type={editing ? 'select' : 'text'} editing={editing} onChange={handleChange} selectOptions={AUDIT_OPTIONS} />
            <InlineField label="QA Review" field="qa_review" value={f.qa_review} type={editing ? 'select' : 'text'} editing={editing} onChange={handleChange} selectOptions={QA_OPTIONS} />
          </CollapsibleSection>
          )}

          {/* Files (new, Supabase-native, in-portal viewer) */}
          <ClientFiles clientId={client.id} currentUserId={currentUserId} currentProfile={currentProfile} />

          {/* Documents (legacy — SharePoint) — v2 hides until SharePoint workflow returns */}
          {!hideClientDocuments && (
          <ClientDocuments clientId={client.id} currentUserId={currentUserId} currentProfile={currentProfile} />
          )}
        </div>
      </div>

      {/* Status Actions (full width below grid) */}
      {(isSupervisorLike(currentProfile.role) || currentProfile.role === 'team_manager') && (client.is_active ?? true) && !editing && (
        <div style={{ marginTop: 14, borderRadius: 16, padding: '14px 18px', border: '1px solid rgba(255,69,58,0.1)', background: 'rgba(255,69,58,0.02)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700 }}>Status Actions</div>
              <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 3 }}>Use only when a client is deceased.</div>
            </div>
            <button onClick={handleMarkDeceased} disabled={deactivating} style={{
              background: 'transparent', color: 'rgba(255,69,58,0.8)', border: '1px solid rgba(255,69,58,0.2)',
              borderRadius: 10, padding: '8px 14px', fontSize: 12, fontWeight: 700, cursor: 'pointer', opacity: deactivating ? 0.6 : 1,
            }}>{deactivating ? 'Saving…' : 'Mark as Deceased'}</button>
          </div>
        </div>
      )}

      {/* Responsive: stack on mobile */}
      <style>{`@media(max-width:768px){.client-detail-grid{grid-template-columns:1fr!important}.deadline-tile-grid{grid-template-columns:1fr!important}}`}</style>
    </div>
  )
}
