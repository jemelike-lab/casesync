'use client'

// Activity Monitor - Option A "Pulse Board" (mock approved 2026-07-13).
// Three panels: presence roster / live activity feed / session history.
// Polls /api/admin/activity every 30s. Click a person to filter their trail.

import { useCallback, useEffect, useMemo, useState } from 'react'

interface OnlineRow { user_id: string; last_seen_at: string; session_started_at: string; current_path: string | null; full_name: string | null; role: string | null }
interface SessionRow { user_id: string | null; user_email: string | null; details: Record<string, unknown> | null; ip_address: string | null; user_agent: string | null; created_at: string }
interface FeedRow { user_id: string | null; user_email: string | null; action: string; resource_type: string | null; resource_id: string | null; details: Record<string, unknown> | null; created_at: string; full_name: string | null }

const FILTERS = ['All', 'Views', 'Updates', 'Logins', 'Notes'] as const
type Filter = typeof FILTERS[number]

function actClass(action: string): { cls: string; bucket: Filter | 'Other' } {
  if (action.startsWith('auth.')) return { cls: 'a-login', bucket: 'Logins' }
  if (action.startsWith('note.')) return { cls: 'a-note', bucket: 'Notes' }
  if (action === 'client.view' || action === 'client.bulk_access') return { cls: 'a-view', bucket: 'Views' }
  if (action.startsWith('client.')) return { cls: 'a-update', bucket: 'Updates' }
  return { cls: 'a-other', bucket: 'Other' }
}

function hhmm(iso: string) {
  const d = new Date(iso)
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

function uaShort(ua: string | null): string {
  if (!ua) return ''
  const b = /Edg\//.test(ua) ? 'Edge' : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : /Firefox\//.test(ua) ? 'Firefox' : 'Browser'
  const os = /iPhone|iPad/.test(ua) ? 'iOS' : /Android/.test(ua) ? 'Android' : /Mac OS X/.test(ua) ? 'macOS' : /Windows/.test(ua) ? 'Windows' : /Linux/.test(ua) ? 'Linux' : ''
  return os ? `${b} / ${os}` : b
}

function initials(name: string) {
  return name.split(' ').map(x => x[0]).filter(Boolean).slice(0, 2).join('').toUpperCase()
}

const ACT_STYLES: Record<string, { bg: string; fg: string }> = {
  'a-view': { bg: '#EFF6FF', fg: '#1D4ED8' },
  'a-update': { bg: '#FFF7ED', fg: '#C2410C' },
  'a-login': { bg: '#F0FDF4', fg: '#15803D' },
  'a-note': { bg: '#F5F3FF', fg: '#6D28D9' },
  'a-other': { bg: '#F1F5F9', fg: '#475569' },
}

export default function ActivityMonitorClient() {
  const [online, setOnline] = useState<OnlineRow[]>([])
  const [sessions, setSessions] = useState<SessionRow[]>([])
  const [feed, setFeed] = useState<FeedRow[]>([])
  const [now, setNow] = useState<number>(Date.now())
  const [sel, setSel] = useState<string | null>(null)
  const [filter, setFilter] = useState<Filter>('All')
  const [err, setErr] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/activity')
      if (!res.ok) { setErr(`Feed unavailable (${res.status})`); return }
      const d = await res.json()
      setOnline(Array.isArray(d.online) ? d.online : [])
      setSessions(Array.isArray(d.sessions) ? d.sessions : [])
      setFeed(Array.isArray(d.feed) ? d.feed : [])
      setNow(new Date(d.now ?? Date.now()).getTime())
      setErr(null)
    } catch { setErr('Feed unavailable') }
  }, [])

  useEffect(() => {
    load()
    const t = setInterval(load, 30_000)
    return () => clearInterval(t)
  }, [load])

  const withStatus = useMemo(() => online.map(o => {
    const ageMs = now - new Date(o.last_seen_at).getTime()
    // Measurement fix (handoff \u00a73): 'on' means currently online per the
    // SERVER's clock (online_now), not merely a recent last-known presence row;
    // the age check remains as a fallback for older payload shapes.
    const status: 'on' | 'idle' | 'off' = ((o as { online_now?: boolean }).online_now === true || ageMs < 2 * 60_000) ? 'on' : ageMs < 15 * 60_000 ? 'idle' : 'off'
    const mins = Math.max(0, Math.round(ageMs / 60_000))
    const meta = status === 'on'
      ? `online${o.current_path ? ' on ' + o.current_path : ''}`
      : status === 'idle' ? `idle ${mins} min` : `last seen ${mins < 120 ? mins + ' min' : Math.round(mins / 60) + 'h'} ago`
    return { ...o, status, meta }
  }), [online, now])

  const onlineCount = withStatus.filter(o => o.status === 'on').length
  const dotColor = { on: '#22C55E', idle: '#F59E0B', off: '#CBD5E1' } as const

  const nameFor = (r: { full_name?: string | null; user_email?: string | null }) => r.full_name || r.user_email || 'Unknown'

  const feedRows = feed.filter(f => {
    const { bucket } = actClass(f.action)
    if (filter !== 'All' && bucket !== filter) return false
    if (sel && f.user_id !== sel) return false
    return true
  })
  const sessionRows = sessions.filter(s => !sel || s.user_id === sel)

  return (
    <div style={{ maxWidth: 1220, margin: '0 auto', padding: '20px' }}>
      {/* Hero */}
      <div style={{ background: 'linear-gradient(135deg, #1E7CFF 0%, #2D8BFF 50%, #1A6FEB 100%)', borderRadius: '16px 16px 0 0', padding: '16px 20px', color: '#fff', display: 'flex', alignItems: 'center', gap: 14 }}>
        <h1 style={{ margin: 0, fontSize: 17, fontWeight: 800 }}>Activity Monitor</h1>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 7, background: 'rgba(255,255,255,.16)', border: '1px solid rgba(255,255,255,.35)', borderRadius: 999, padding: '5px 13px', fontSize: 12, fontWeight: 700 }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#4ADE80', boxShadow: '0 0 6px #4ADE80' }} />
          <span>{onlineCount} online now</span>
        </div>
      </div>

      {err ? (
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderTop: 'none', borderRadius: '0 0 16px 16px', padding: 24, fontSize: 13, color: 'var(--text-secondary)' }}>{err}</div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: '280px 1fr 300px', background: 'var(--surface)', border: '1px solid var(--border)', borderTop: 'none', borderRadius: '0 0 16px 16px', overflow: 'hidden', minHeight: 480 }}>

          {/* Presence */}
          <div style={{ padding: 16, borderRight: '1px solid var(--border)' }}>
            <h2 style={{ fontSize: 11, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--text-secondary)', fontWeight: 800, margin: '0 0 12px' }}>Presence</h2>
            {withStatus.length === 0 ? <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>No presence data yet</div> : withStatus.map(p => (
              <div key={p.user_id} onClick={() => setSel(s => s === p.user_id ? null : p.user_id)}
                style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 10px', borderRadius: 10, cursor: 'pointer', border: '1px solid ' + (sel === p.user_id ? '#B9D8FF' : 'transparent'), background: sel === p.user_id ? '#EAF3FF' : 'transparent' }}>
                <div style={{ width: 34, height: 34, borderRadius: '50%', background: 'linear-gradient(135deg,#1E7CFF,#7C3AED)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 13, position: 'relative', flex: '0 0 34px' }}>
                  {initials(p.full_name || '?')}
                  <span style={{ position: 'absolute', bottom: -1, right: -1, width: 11, height: 11, borderRadius: '50%', border: '2px solid var(--surface)', background: dotColor[p.status] }} />
                </div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.full_name || 'Unknown'}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-secondary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{(p.role || '')} {p.role ? '\u00b7' : ''} {p.meta}</div>
                </div>
              </div>
            ))}
          </div>

          {/* Feed */}
          <div style={{ padding: 16, borderRight: '1px solid var(--border)' }}>
            <h2 style={{ fontSize: 11, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--text-secondary)', fontWeight: 800, margin: '0 0 12px' }}>Live activity</h2>
            <div style={{ display: 'flex', gap: 6, marginBottom: 10, flexWrap: 'wrap' }}>
              {FILTERS.map(f => (
                <span key={f} onClick={() => setFilter(f)}
                  style={{ fontSize: 11, fontWeight: 700, borderRadius: 999, padding: '4px 11px', cursor: 'pointer', border: '1px solid ' + (filter === f ? 'transparent' : 'var(--border)'), background: filter === f ? 'linear-gradient(135deg,#1E7CFF,#1A6FEB)' : 'var(--surface)', color: filter === f ? '#fff' : 'var(--text-secondary)' }}>{f}</span>
              ))}
            </div>
            {feedRows.length === 0 ? <div style={{ color: 'var(--text-secondary)', fontSize: 12, padding: '20px 0' }}>No matching activity</div> : feedRows.map((f, i) => {
              const { cls } = actClass(f.action)
              const st = ACT_STYLES[cls]
              const detail = f.resource_id ? `${f.resource_type ?? ''} ${f.resource_id}`.trim() : (f.details ? Object.entries(f.details).slice(0, 2).map(([k, v]) => `${k}: ${String(v).slice(0, 40)}`).join(', ') : '')
              return (
                <div key={i} style={{ display: 'flex', gap: 10, padding: '9px 4px', borderBottom: '1px dashed var(--border)', fontSize: 12.5, alignItems: 'baseline' }}>
                  <span style={{ color: 'var(--text-secondary)', fontSize: 11, whiteSpace: 'nowrap', width: 52 }}>{hhmm(f.created_at)}</span>
                  <span style={{ fontWeight: 700, padding: '1px 8px', borderRadius: 999, fontSize: 10.5, whiteSpace: 'nowrap', background: st.bg, color: st.fg }}>{f.action}</span>
                  <span style={{ color: 'var(--text)', minWidth: 0 }}><b>{nameFor(f)}</b>{detail ? ' \u00b7 ' + detail : ''}</span>
                </div>
              )
            })}
          </div>

          {/* Sessions */}
          <div style={{ padding: 16 }}>
            <h2 style={{ fontSize: 11, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--text-secondary)', fontWeight: 800, margin: '0 0 12px' }}>Session history</h2>
            {sessionRows.length === 0 ? <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>No sessions recorded yet</div> : sessionRows.map((s, i) => (
              <div key={i} style={{ padding: '9px 4px', borderBottom: '1px dashed var(--border)', fontSize: 12 }}>
                <b style={{ fontSize: 12.5, color: 'var(--text)' }}>{s.user_email || 'Unknown'}</b>
                <div style={{ color: 'var(--text-secondary)', fontSize: 11, marginTop: 2 }}>
                  {new Date(s.created_at).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                  {uaShort(s.user_agent) ? ' \u00b7 ' + uaShort(s.user_agent) : ''}
                  {s.ip_address && s.ip_address !== 'unknown' ? ' \u00b7 ' + s.ip_address : ''}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
