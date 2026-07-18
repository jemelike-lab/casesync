'use client'

// components/ComposeEmailModal.tsx
// Compose + schedule dialogs for /admin/pilot (mocks approved 2026-07-18).
// Rendered only for the email-send allowlist (server passes canSend).
// Recipients resolve server-side by user id \u2014 the browser never supplies
// a raw address. POST /api/admin/email does the send / schedule.

import { useCallback, useEffect, useMemo, useState } from 'react'
import { PILOT_EMAIL_DRAFTS } from '@/lib/pilot-email-drafts'

interface DirectoryUser {
  id: string
  full_name: string | null
  role: string | null
}

const S = {
  overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px 12px' } as React.CSSProperties,
  modal: { width: 560, maxWidth: '100%', maxHeight: '92vh', overflow: 'auto', background: '#111113', border: '1px solid #1e1e22', borderRadius: 12, fontFamily: "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif" } as React.CSSProperties,
  head: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: '1px solid #222226', background: '#0f0f11', position: 'sticky' as const, top: 0, zIndex: 2 },
  headTitle: { display: 'flex', alignItems: 'center', gap: 10 } as React.CSSProperties,
  titleText: { fontSize: 15, fontWeight: 500, color: '#f5f5f7' } as React.CSSProperties,
  badge: { fontSize: 11, color: '#8ab4ff', background: 'rgba(0,122,255,0.12)', border: '1px solid rgba(0,122,255,0.25)', padding: '2px 8px', borderRadius: 6 } as React.CSSProperties,
  close: { fontSize: 18, color: '#86868b', cursor: 'pointer', background: 'none', border: 'none', lineHeight: 1 } as React.CSSProperties,
  label: { fontSize: 12, color: '#86868b' } as React.CSSProperties,
  row: { display: 'flex', alignItems: 'center', gap: 8, padding: '8px 0', borderBottom: '1px solid #1c1c20' } as React.CSSProperties,
  chip: { display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#8ab4ff', background: 'rgba(0,122,255,0.14)', border: '1px solid rgba(0,122,255,0.3)', padding: '4px 8px', borderRadius: 6 } as React.CSSProperties,
  input: { flex: 1, background: 'transparent', border: 'none', color: '#f5f5f7', fontSize: 13, padding: '2px 0', outline: 'none' } as React.CSSProperties,
  boxInput: { width: '100%', boxSizing: 'border-box' as const, background: '#0a0a0c', border: '1px solid #2a2a2f', borderRadius: 8, padding: '9px 11px', color: '#f5f5f7', fontSize: 13, outline: 'none' },
  foot: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 20px', borderTop: '1px solid #222226', background: '#0f0f11', position: 'sticky' as const, bottom: 0 },
  guard: { display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11, color: '#66666e' } as React.CSSProperties,
  cancelBtn: { fontSize: 13, color: '#b0b0b8', border: '1px solid #333', background: 'transparent', borderRadius: 8, padding: '7px 14px', cursor: 'pointer' } as React.CSSProperties,
  primaryBtn: { display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 500, color: '#fff', background: '#007aff', border: 'none', borderRadius: 8, padding: '8px 16px', cursor: 'pointer' } as React.CSSProperties,
}

function Guardrail() {
  return <span style={S.guard}>{'\ud83d\udd12'} Owner + admin only {'\u00b7'} audit-logged {'\u00b7'} replies to you</span>
}

// ---------- Compose (single recipient) ----------

export function ComposeEmailModal({
  open,
  onClose,
  prefill,
}: {
  open: boolean
  onClose: () => void
  prefill?: { toUserId?: string; toName?: string; subject?: string; body?: string }
}) {
  const [users, setUsers] = useState<DirectoryUser[]>([])
  const [toUserId, setToUserId] = useState<string | null>(null)
  const [toName, setToName] = useState<string>('')
  const [query, setQuery] = useState('')
  const [subject, setSubject] = useState('')
  const [bodyText, setBodyText] = useState('')
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setToUserId(prefill?.toUserId ?? null)
    setToName(prefill?.toName ?? '')
    setSubject(prefill?.subject ?? '')
    setBodyText(prefill?.body ?? '')
    setQuery('')
    setStatus(null)
    fetch('/api/admin/email')
      .then(r => (r.ok ? r.json() : Promise.reject(r.status)))
      .then(d => setUsers(Array.isArray(d.users) ? d.users : []))
      .catch(() => setUsers([]))
  }, [open, prefill])

  const matches = useMemo(() => {
    if (!query.trim()) return []
    const q = query.trim().toLowerCase()
    return users.filter(u => (u.full_name ?? '').toLowerCase().includes(q)).slice(0, 6)
  }, [users, query])

  const send = useCallback(async () => {
    if (!toUserId || !subject.trim() || !bodyText.trim() || busy) return
    setBusy(true)
    setStatus(null)
    try {
      const res = await fetch('/api/admin/email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ toUserId, subject, body: bodyText }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(d?.error || `Send failed (${res.status})`)
      setStatus('Sent')
      setTimeout(onClose, 900)
    } catch (e) {
      setStatus(e instanceof Error ? e.message : 'Send failed')
    } finally {
      setBusy(false)
    }
  }, [toUserId, subject, bodyText, busy, onClose])

  if (!open) return null
  return (
    <div style={S.overlay} onClick={onClose}>
      <div style={S.modal} onClick={e => e.stopPropagation()}>
        <div style={S.head}>
          <div style={S.headTitle}>
            <span style={{ fontSize: 18, color: '#8ab4ff' }}>{'\u2709'}</span>
            <span style={S.titleText}>Compose email</span>
            <span style={S.badge}>Case<span style={{ color: '#007aff' }}>Sync</span></span>
          </div>
          <button style={S.close} onClick={onClose} aria-label="Close">{'\u00d7'}</button>
        </div>

        <div style={{ padding: '18px 20px 6px' }}>
          <div style={S.row}>
            <span style={{ ...S.label, width: 56 }}>From</span>
            <span style={{ fontSize: 13, color: '#cfcfd6' }}>Beatrice Loving Heart &lt;notifications@blhcasesync.com&gt;</span>
          </div>

          <div style={{ ...S.row, alignItems: 'flex-start', padding: '10px 0' }}>
            <span style={{ ...S.label, width: 56, marginTop: 6 }}>To</span>
            <div style={{ flex: 1 }}>
              {toUserId ? (
                <span style={S.chip}>
                  {toName || toUserId}
                  <button style={{ ...S.close, fontSize: 12, color: '#8ab4ff' }} onClick={() => { setToUserId(null); setToName('') }} aria-label="Remove recipient">{'\u00d7'}</button>
                </span>
              ) : null}
              {!toUserId ? (
                <div>
                  <input
                    style={S.boxInput}
                    placeholder={'Search any CaseSync user\u2026'}
                    value={query}
                    onChange={e => setQuery(e.target.value)}
                  />
                  {matches.length > 0 ? (
                    <div style={{ marginTop: 6, background: '#0a0a0c', border: '1px solid #2a2a2f', borderRadius: 8, overflow: 'hidden' }}>
                      {matches.map(u => (
                        <button
                          key={u.id}
                          onClick={() => { setToUserId(u.id); setToName(u.full_name ?? u.id); setQuery('') }}
                          style={{ display: 'block', width: '100%', textAlign: 'left', background: 'transparent', border: 'none', borderBottom: '1px solid #17171b', padding: '9px 12px', cursor: 'pointer', color: '#e6e6ea', fontSize: 13 }}
                        >
                          {u.full_name ?? u.id}
                          <span style={{ fontSize: 11, color: '#66666e', marginLeft: 8 }}>{(u.role ?? '').replace(/_/g, ' ')}</span>
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>
          </div>

          <div style={{ ...S.row, padding: '10px 0' }}>
            <span style={{ ...S.label, width: 56 }}>Subject</span>
            <input style={S.input} value={subject} onChange={e => setSubject(e.target.value)} placeholder="Subject" />
          </div>

          <div style={{ padding: '12px 0 4px' }}>
            <textarea
              style={{ ...S.boxInput, height: 220, resize: 'vertical', lineHeight: 1.6, color: '#d4d4db', fontFamily: 'inherit' }}
              value={bodyText}
              onChange={e => setBodyText(e.target.value)}
              placeholder={'Write your message\u2026'}
            />
          </div>
          {status ? <div style={{ fontSize: 12, color: status === 'Sent' ? '#5fae7f' : '#e07a7a', padding: '2px 0 8px' }}>{status}</div> : null}
        </div>

        <div style={S.foot}>
          <Guardrail />
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <button style={S.cancelBtn} onClick={onClose}>Cancel</button>
            <button style={{ ...S.primaryBtn, opacity: !toUserId || !subject.trim() || !bodyText.trim() || busy ? 0.5 : 1 }} onClick={send} disabled={!toUserId || !subject.trim() || !bodyText.trim() || busy}>
              {busy ? 'Sending\u2026' : 'Send email'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ---------- Schedule pilot emails (batch) ----------

function nextMonday(): string {
  const now = new Date()
  const et = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }))
  const day = et.getDay()
  let add = (8 - day) % 7
  if (add === 0) add = 7
  et.setDate(et.getDate() + add)
  const y = et.getFullYear()
  const m = String(et.getMonth() + 1).padStart(2, '0')
  const d = String(et.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

// Convert an ET wall-clock date+time to a UTC ISO string, DST-correct.
function etToUtcIso(dateStr: string, timeStr: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr) || !/^\d{2}:\d{2}$/.test(timeStr)) return null
  for (const offset of ['-04:00', '-05:00']) {
    const guess = new Date(`${dateStr}T${timeStr}:00${offset}`)
    if (Number.isNaN(guess.getTime())) continue
    const back = guess.toLocaleString('sv-SE', { timeZone: 'America/New_York' })
    if (back.startsWith(`${dateStr} ${timeStr}`)) return guess.toISOString()
  }
  return null
}

export function SchedulePilotEmailsModal({
  open,
  onClose,
  memberIds,
}: {
  open: boolean
  onClose: () => void
  memberIds: string[]
}) {
  const [dateStr, setDateStr] = useState(nextMonday())
  const [timeStr, setTimeStr] = useState('09:30')
  const [busy, setBusy] = useState(false)
  const [results, setResults] = useState<Record<string, string>>({})

  useEffect(() => {
    if (open) { setResults({}); setDateStr(nextMonday()); setTimeStr('09:30') }
  }, [open])

  const drafts = useMemo(
    () => PILOT_EMAIL_DRAFTS.filter(d => memberIds.includes(d.userId)),
    [memberIds]
  )
  const utcIso = etToUtcIso(dateStr, timeStr)
  const utcLabel = utcIso ? `${utcIso.slice(11, 16)} UTC` : 'invalid time'

  const scheduleAll = useCallback(async () => {
    if (!utcIso || busy || drafts.length === 0) return
    setBusy(true)
    const res: Record<string, string> = {}
    for (const d of drafts) {
      try {
        const r = await fetch('/api/admin/email', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ toUserId: d.userId, subject: d.subject, body: d.body, scheduledAt: utcIso }),
        })
        const j = await r.json().catch(() => ({}))
        res[d.userId] = r.ok ? 'Scheduled' : (j?.error || `Failed (${r.status})`)
      } catch {
        res[d.userId] = 'Failed'
      }
      setResults({ ...res })
    }
    setBusy(false)
  }, [utcIso, busy, drafts])

  if (!open) return null
  const allDone = drafts.length > 0 && drafts.every(d => results[d.userId] === 'Scheduled')
  return (
    <div style={S.overlay} onClick={onClose}>
      <div style={S.modal} onClick={e => e.stopPropagation()}>
        <div style={S.head}>
          <div style={S.headTitle}>
            <span style={{ fontSize: 18, color: '#8ab4ff' }}>{'\ud83d\udcc5'}</span>
            <span style={S.titleText}>Schedule pilot emails</span>
            <span style={S.badge}>Case<span style={{ color: '#007aff' }}>Sync</span></span>
          </div>
          <button style={S.close} onClick={onClose} aria-label="Close">{'\u00d7'}</button>
        </div>

        <div style={{ padding: '18px 20px' }}>
          <span style={S.label}>Send at</span>
          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <input type="date" style={{ ...S.boxInput, flex: 1.4, colorScheme: 'dark' }} value={dateStr} onChange={e => setDateStr(e.target.value)} />
            <input type="time" style={{ ...S.boxInput, flex: 1, colorScheme: 'dark' }} value={timeStr} onChange={e => setTimeStr(e.target.value)} />
            <div style={{ ...S.boxInput, flex: 0.6, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#f5f5f7' }}>ET</div>
          </div>
          <span style={{ display: 'block', marginTop: 7, fontSize: 11, color: '#66666e' }}>
            {utcLabel} {'\u00b7'} anchored to America/New_York (handles daylight time) {'\u00b7'} cancelable until it sends
          </span>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 18, marginBottom: 8 }}>
            <span style={S.label}>Recipients</span>
            <span style={{ fontSize: 11, color: '#5fae7f' }}>{drafts.length} drafts ready {'\u00b7'} seeded</span>
          </div>

          <div style={{ background: '#0a0a0c', border: '1px solid #1f1f24', borderRadius: 8, overflow: 'hidden' }}>
            {drafts.map((d, i) => (
              <div key={d.userId} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderBottom: i < drafts.length - 1 ? '1px solid #17171b' : 'none' }}>
                <span style={{ fontSize: 15, color: '#8ab4ff' }}>{'\u2709'}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ fontSize: 13, color: '#e6e6ea' }}>{d.name}</span>
                  <span style={{ display: 'block', fontSize: 11, color: '#66666e', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{d.subject}</span>
                </div>
                {results[d.userId] ? (
                  <span style={{ fontSize: 11, color: results[d.userId] === 'Scheduled' ? '#5fae7f' : '#e07a7a' }}>{results[d.userId]}</span>
                ) : null}
              </div>
            ))}
            {drafts.length === 0 ? (
              <div style={{ padding: '12px', fontSize: 12, color: '#66666e' }}>No seeded drafts match the current roster.</div>
            ) : null}
          </div>
        </div>

        <div style={S.foot}>
          <Guardrail />
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <button style={S.cancelBtn} onClick={onClose}>{allDone ? 'Close' : 'Cancel'}</button>
            {!allDone ? (
              <button style={{ ...S.primaryBtn, opacity: !utcIso || busy || drafts.length === 0 ? 0.5 : 1 }} onClick={scheduleAll} disabled={!utcIso || busy || drafts.length === 0}>
                {busy ? 'Scheduling\u2026' : `Schedule ${drafts.length} emails`}
              </button>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  )
}
