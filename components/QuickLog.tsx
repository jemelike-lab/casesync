'use client'

// ---------------------------------------------------------------------------
// QuickLog — the 5-second contact logger (Direction B, approved 2026-07-18).
//
// One canonical component reused on every surface: TodayCard focus rows,
// /clients index rows, and the client-detail hero (which also auto-opens it
// when the URL carries ?quicklog=1 — the digest deep-link / PWA entry).
//
// Renders its own trigger button plus, when open:
//   - a bottom sheet on narrow screens (< 1024px), built for phone-in-the-car
//   - a small anchored popover on desktop (>= 1024px)
//
// Write path is the Casey log_contact pattern VERBATIM (YourCaseAI
// applyProposal): PATCH /api/clients/[id] { last_contact_date,
// last_contact_type } under the user's own session (RLS + field whitelist +
// audit all apply), a read-back guard against silent whitelist drift, then a
// best-effort activity POST with the optional note folded into the action
// string. Nothing new server-side.
// ---------------------------------------------------------------------------

import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react'

const TYPES: Array<{ label: string; icon: string }> = [
  { label: 'Home Visit', icon: '\u{1F3E0}' },
  { label: 'Phone', icon: '\u{1F4DE}' },
  { label: 'Attempt', icon: '\u2709\uFE0F' },
]

function localDateStr(offsetDays = 0): string {
  const t = new Date(Date.now() + offsetDays * 86400000)
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`
}

interface Props {
  clientId: string
  clientName: string
  /** One-line context under the title (e.g. reasons, or "CFC · last contact 16d ago"). */
  contextLine?: string
  /** 'row' = ghost pill on list rows; 'hero' = white-ghost button on the blue hero. */
  variant?: 'row' | 'hero'
  /** Open immediately on mount (digest deep-link ?quicklog=1). */
  autoOpen?: boolean
  onLogged?: (date: string, type: string) => void
}

export default function QuickLog({ clientId, clientName, contextLine, variant = 'row', autoOpen = false, onLogged }: Props) {
  const [open, setOpen] = useState(false)
  const [desktop, setDesktop] = useState(false)
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)
  const [when, setWhen] = useState<'today' | 'yesterday' | 'pick'>('today')
  const [pickDate, setPickDate] = useState('')
  const [type, setType] = useState<string | null>(null)
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [hover, setHover] = useState(false)
  const triggerRef = useRef<HTMLButtonElement | null>(null)
  const autoOpened = useRef(false)

  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1024px)')
    const apply = () => setDesktop(mq.matches)
    apply()
    mq.addEventListener('change', apply)
    return () => mq.removeEventListener('change', apply)
  }, [])

  useEffect(() => {
    if (autoOpen && !autoOpened.current) {
      autoOpened.current = true
      setOpen(true)
    }
  }, [autoOpen])

  // Desktop popover anchoring — fixed position from the trigger rect so it
  // survives overflow:hidden/auto ancestors (TodayCard, the index table).
  const place = useCallback(() => {
    const r = triggerRef.current?.getBoundingClientRect()
    if (!r) return
    const width = 270
    const left = Math.max(8, Math.min(r.right - width, window.innerWidth - width - 8))
    setPos({ top: r.bottom + 8, left })
  }, [])

  useEffect(() => {
    if (!open || !desktop) return
    place()
    const onMove = () => place()
    window.addEventListener('scroll', onMove, true)
    window.addEventListener('resize', onMove)
    return () => {
      window.removeEventListener('scroll', onMove, true)
      window.removeEventListener('resize', onMove)
    }
  }, [open, desktop, place])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  const dateStr = when === 'today' ? localDateStr(0) : when === 'yesterday' ? localDateStr(-1) : pickDate
  const dateValid = /^\d{4}-\d{2}-\d{2}$/.test(dateStr) && dateStr <= localDateStr(0)
  const canSave = !!type && dateValid && !saving

  const reset = () => { setWhen('today'); setPickDate(''); setType(null); setNote(''); setError(null) }

  const save = async () => {
    if (!canSave || !type) return
    setSaving(true)
    setError(null)
    try {
      const H = { 'Content-Type': 'application/json' }
      const r = await fetch(`/api/clients/${clientId}`, {
        method: 'PATCH', headers: H,
        body: JSON.stringify({ last_contact_date: dateStr, last_contact_type: type }),
      })
      if (!r.ok) {
        const j = await r.json().catch(() => ({} as { error?: string }))
        throw new Error(j.error ?? `Failed (${r.status})`)
      }
      // Read-back guard (Casey pattern): validateUpdates silently ignores
      // unknown keys, so whitelist drift would otherwise report success with
      // no actual change. A failed read doesn't block; a wrong value does.
      const rb = await fetch(`/api/clients/${clientId}`, { cache: 'no-store' })
      if (rb.ok) {
        const j = await rb.json().catch(() => null) as Record<string, unknown> | null
        const c = (j && typeof j === 'object' && 'client' in j ? (j as { client?: Record<string, unknown> }).client : j) as Record<string, unknown> | null
        if (c && String(c.last_contact_date ?? '').slice(0, 10) !== dateStr) {
          throw new Error('The change did not save. Nothing was applied \u2014 please report this.')
        }
      }
      const noteBit = note.trim() ? ` \u2014 ${note.trim().slice(0, 400)}` : ''
      await fetch(`/api/clients/${clientId}/activity`, {
        method: 'POST', headers: H,
        body: JSON.stringify({ action: `Logged contact: ${type}${noteBit}`.slice(0, 500), field_name: 'last_contact_date', old_value: null, new_value: dateStr }),
      }).catch(() => {})
      const whenLabel = when === 'today' ? 'today' : when === 'yesterday' ? 'yesterday' : dateStr
      setToast(`Contact logged \u2014 ${type} \u00b7 ${whenLabel}`)
      setTimeout(() => setToast(null), 3000)
      setOpen(false)
      reset()
      onLogged?.(dateStr, type)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to log contact')
    } finally {
      setSaving(false)
    }
  }

  // ---- styles -------------------------------------------------------------
  const rowBtn: CSSProperties = {
    border: `1px solid ${hover ? 'var(--accent)' : 'var(--border)'}`, background: 'transparent',
    color: hover ? 'var(--accent)' : 'var(--text-secondary)', borderRadius: 999,
    fontSize: 11.5, fontWeight: 700, padding: '5px 12px', cursor: 'pointer',
    display: 'inline-flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap', flex: 'none',
  }
  const heroBtn: CSSProperties = {
    background: 'rgba(255,255,255,0.08)', color: '#fff', border: '1px solid rgba(255,255,255,0.18)',
    borderRadius: 10, padding: '7px 12px', fontSize: 12, fontWeight: 700, cursor: 'pointer',
    display: 'inline-flex', alignItems: 'center', gap: 5, whiteSpace: 'nowrap',
  }
  const lab: CSSProperties = {
    fontSize: 10.5, fontWeight: 800, letterSpacing: '0.07em', textTransform: 'uppercase',
    color: 'var(--text-secondary)', margin: '15px 0 7px',
  }
  const seg: CSSProperties = { display: 'flex', border: '1px solid var(--border)', borderRadius: 11, overflow: 'hidden' }
  const segItem = (on: boolean, last: boolean): CSSProperties => ({
    flex: 1, textAlign: 'center', fontSize: 12, fontWeight: 700, padding: '9px 4px', cursor: 'pointer',
    color: on ? '#fff' : 'var(--text-secondary)', background: on ? 'var(--accent)' : 'transparent',
    borderRight: last ? 'none' : '1px solid var(--border)', userSelect: 'none',
  })
  const noteStyle: CSSProperties = {
    width: '100%', border: '1px solid var(--border)', borderRadius: 11, background: 'var(--surface-2)',
    color: 'var(--text)', fontSize: 12.5, padding: '10px 13px', fontFamily: 'inherit', outline: 'none',
  }
  const saveStyle = (small: boolean): CSSProperties => ({
    width: '100%', marginTop: small ? 11 : 15, border: 'none', borderRadius: 13,
    background: 'var(--accent)', color: '#fff', fontSize: small ? 12.5 : 14, fontWeight: 800,
    padding: small ? 9 : 13, cursor: canSave ? 'pointer' : 'not-allowed', opacity: canSave ? 1 : 0.5,
  })
  const hint: CSSProperties = { textAlign: 'center', fontSize: 10.5, color: 'var(--text-secondary)', marginTop: 9 }
  const errStyle: CSSProperties = { fontSize: 12, fontWeight: 600, color: '#e0524a', marginTop: 10 }

  const whenSeg = (
    <div style={seg}>
      {(['today', 'yesterday', 'pick'] as const).map((w, i) => (
        <span key={w} onClick={() => setWhen(w)} style={segItem(when === w, i === 2)}>
          {w === 'today' ? 'Today' : w === 'yesterday' ? 'Yesterday' : 'Pick date'}
        </span>
      ))}
    </div>
  )
  const pickInput = when === 'pick' && (
    <input
      type="date" value={pickDate} max={localDateStr(0)}
      onChange={e => setPickDate(e.target.value)}
      style={{ ...noteStyle, marginTop: 8 }}
    />
  )

  const body = desktop ? (
    <div style={{ position: 'fixed', top: pos?.top ?? 0, left: pos?.left ?? 0, width: 270, zIndex: 71, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, boxShadow: '0 12px 38px rgba(0,0,0,0.35)', padding: '14px 16px', whiteSpace: 'normal', visibility: pos ? 'visible' : 'hidden' }}>
      <div style={{ ...lab, marginTop: 0 }}>When</div>
      {whenSeg}
      {pickInput}
      <div style={lab}>Type</div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {TYPES.map(t => {
          const on = type === t.label
          return (
            <button key={t.label} title={t.label} onClick={() => setType(t.label)} style={{
              border: `1px solid ${on ? 'var(--accent)' : 'var(--border)'}`,
              background: on ? 'rgba(0,122,255,0.12)' : 'var(--surface-2)',
              color: on ? 'var(--accent-hover)' : 'var(--text)',
              borderRadius: 999, fontSize: 12, fontWeight: 700, padding: '7px 14px', cursor: 'pointer',
            }}>{t.icon}</button>
          )
        })}
      </div>
      <div style={lab}>Note &middot; optional</div>
      <input value={note} maxLength={400} onChange={e => setNote(e.target.value)} placeholder={'One line\u2026'} style={noteStyle} />
      {error && <div style={errStyle}>{error}</div>}
      <button onClick={save} disabled={!canSave} style={saveStyle(true)}>{saving ? 'Logging\u2026' : 'Log contact'}</button>
      <div style={hint}>Writes last-contact + activity entry &middot; audited</div>
    </div>
  ) : (
    <div style={{ position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 71, background: 'var(--surface)', borderRadius: '22px 22px 0 0', borderTop: '1px solid var(--border)', padding: '10px 18px 22px', boxShadow: '0 -8px 30px rgba(0,0,0,0.35)', whiteSpace: 'normal' }}>
      <div style={{ width: 38, height: 4, borderRadius: 99, background: 'var(--border)', margin: '0 auto 12px' }} />
      <div style={{ fontSize: 15.5, fontWeight: 800, color: 'var(--text)' }}>Log contact &mdash; {clientName}</div>
      {contextLine ? <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 1 }}>{contextLine}</div> : null}
      <div style={lab}>When</div>
      {whenSeg}
      {pickInput}
      <div style={lab}>Type</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {TYPES.map(t => {
          const on = type === t.label
          return (
            <div key={t.label} onClick={() => setType(t.label)} style={{
              display: 'flex', alignItems: 'center', gap: 11, borderRadius: 13, padding: '12px 15px',
              fontSize: 13.5, fontWeight: 700, cursor: 'pointer',
              border: `1px solid ${on ? 'var(--accent)' : 'var(--border)'}`,
              background: on ? 'rgba(0,122,255,0.12)' : 'var(--surface-2)',
              color: on ? 'var(--accent-hover)' : 'var(--text)',
            }}>{t.icon} {t.label}</div>
          )
        })}
      </div>
      <div style={lab}>Note &middot; optional</div>
      <input value={note} maxLength={400} onChange={e => setNote(e.target.value)} placeholder="One line, e.g. 'Reviewed POS packet, mom signing Friday'" style={noteStyle} />
      {error && <div style={errStyle}>{error}</div>}
      <button onClick={save} disabled={!canSave} style={saveStyle(false)}>{saving ? 'Logging\u2026' : 'Log contact'}</button>
      <div style={hint}>Writes last-contact + activity entry &middot; audited</div>
    </div>
  )

  return (
    <>
      <button
        ref={triggerRef}
        onClick={e => { e.stopPropagation(); e.preventDefault(); setOpen(o => !o) }}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        aria-label={`Log contact for ${clientName}`}
        style={variant === 'hero' ? heroBtn : rowBtn}
      >
        {'\u{1F4DE}'} Log contact
      </button>
      {open && (
        <>
          <div onClick={() => setOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 70, background: desktop ? 'transparent' : 'rgba(0,0,0,0.45)' }} />
          {body}
        </>
      )}
      {toast && (
        <div style={{ position: 'fixed', bottom: 20, right: 20, zIndex: 80, background: '#0f5132', color: '#fff', padding: '10px 16px', borderRadius: 10, fontSize: 13, boxShadow: '0 8px 24px rgba(0,0,0,0.3)' }}>
          {toast}
        </div>
      )}
    </>
  )
}
