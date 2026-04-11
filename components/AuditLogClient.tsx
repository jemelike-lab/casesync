'use client'

import { useState, useMemo } from 'react'
import Link from 'next/link'
import { Profile } from '@/lib/types'
import { User } from '@supabase/supabase-js'

interface AuditEntry {
  id: string
  client_id: string | null
  user_id: string
  action: string
  field_name: string | null
  old_value: string | null
  new_value: string | null
  created_at: string
  profiles?: { full_name: string | null } | null
  clients?: { first_name: string | null; last_name: string; client_id: string } | null
}

interface Props {
  logs: AuditEntry[]
  users: { id: string; full_name: string | null }[]
  currentUser: User
  profile: Profile
}

function formatDateTime(d: string) {
  return new Date(d).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })
}

function truncate(s: string | null, n = 40) {
  if (!s) return '—'
  return s.length > n ? s.slice(0, n) + '…' : s
}

function isRecommendedRebalanceMove(action: string) {
  return /Recommended rebalance move/i.test(action)
}

function formatPlannerValue(value: string | null) {
  if (!value) return 'Unassigned'
  return value
}

function getActionTone(action: string) {
  if (/undone/i.test(action)) {
    return { background: 'rgba(255,159,10,0.15)', color: '#ff9f0a' }
  }
  if (isRecommendedRebalanceMove(action)) {
    return { background: 'rgba(191,90,242,0.16)', color: '#bf5af2' }
  }
  if (action === 'delete') {
    return { background: 'rgba(255,69,58,0.15)', color: '#ff453a' }
  }
  if (action === 'create') {
    return { background: 'rgba(48,209,88,0.15)', color: '#30d158' }
  }
  return { background: 'rgba(0,122,255,0.12)', color: '#007aff' }
}

export default function AuditLogClient({ logs, users, currentUser, profile }: Props) {
  const [filterUser, setFilterUser] = useState('')
  const [filterAction, setFilterAction] = useState('')
  const [filterFrom, setFilterFrom] = useState('')
  const [filterTo, setFilterTo] = useState('')
  const [rebalanceOnly, setRebalanceOnly] = useState(false)

  const selectStyle: React.CSSProperties = {
    background: '#1c1c1e', border: '1px solid #333336', borderRadius: 6, color: '#f5f5f7',
    padding: '6px 10px', fontSize: 12, cursor: 'pointer',
  }
  const inputStyle: React.CSSProperties = { ...selectStyle, cursor: 'auto' }

  const uniqueActions = useMemo(() => {
    const s = new Set(logs.map(l => l.action))
    return Array.from(s).sort()
  }, [logs])

  const filtered = useMemo(() => {
    return logs.filter(l => {
      if (filterUser && l.user_id !== filterUser) return false
      if (filterAction && l.action !== filterAction) return false
      if (filterFrom && l.created_at < filterFrom) return false
      if (filterTo && l.created_at > filterTo + 'T23:59:59') return false
      if (rebalanceOnly && !isRecommendedRebalanceMove(l.action)) return false
      return true
    })
  }, [logs, filterUser, filterAction, filterFrom, filterTo, rebalanceOnly])

  const rebalanceEntries = useMemo(() => filtered.filter(l => isRecommendedRebalanceMove(l.action)), [filtered])
  const rebalanceSummary = useMemo(() => {
    const appliedEntries = rebalanceEntries.filter(l => /applied/i.test(l.action))
    const undoneEntries = rebalanceEntries.filter(l => /undone/i.test(l.action))
    const applied = appliedEntries.length
    const undone = undoneEntries.length
    const uniqueClients = new Set(rebalanceEntries.map(l => l.client_id).filter(Boolean)).size
    const latest = rebalanceEntries[0] ?? null
    const netMoves = applied - undone
    const successRate = applied > 0 ? Math.round((netMoves / applied) * 100) : null
    const byDay = rebalanceEntries.reduce<Record<string, { applied: number, undone: number }>>((acc, entry) => {
      const day = entry.created_at.slice(0, 10)
      acc[day] ??= { applied: 0, undone: 0 }
      if (/undone/i.test(entry.action)) acc[day].undone += 1
      else if (/applied/i.test(entry.action)) acc[day].applied += 1
      return acc
    }, {})
    const trendDays = Object.entries(byDay)
      .sort((a, b) => a[0].localeCompare(b[0]))
      .slice(-7)
      .map(([day, counts]) => ({ day, ...counts, net: counts.applied - counts.undone }))
    return { applied, undone, uniqueClients, latest, netMoves, successRate, trendDays }
  }, [rebalanceEntries])

  function exportCSV() {
    const header = 'Timestamp,User,Action,Client,Field,Old Value,New Value'
    const rows = filtered.map(l => [
      l.created_at,
      l.profiles?.full_name ?? l.user_id,
      l.action,
      l.clients ? `${l.clients.last_name}, ${l.clients.first_name ?? ''} (${l.clients.client_id})` : l.client_id ?? '',
      l.field_name ?? '',
      (l.old_value ?? '').replace(/,/g, ';').replace(/"/g, '""'),
      (l.new_value ?? '').replace(/,/g, ';').replace(/"/g, '""'),
    ].map(v => `"${v}"`).join(','))
    const csv = [header, ...rows].join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `audit-log-${new Date().toISOString().split('T')[0]}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <>
      <main style={{ maxWidth: 1200, margin: '0 auto', padding: '24px 16px 100px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
          <div>
            <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 4 }}>🔍 HIPAA Audit Log</h1>
            <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
              {filtered.length} of {logs.length} records
              {rebalanceOnly ? ' • recommended rebalance moves only' : ''}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <Link href="/admin" style={{ fontSize: 13, color: 'var(--text-secondary)', textDecoration: 'none' }}>← Back to Admin</Link>
            <button onClick={exportCSV} className="btn-secondary" style={{ fontSize: 12 }}>
              ↓ Export CSV
            </button>
          </div>
        </div>

        {/* Filters */}
        <div className="card" style={{ marginBottom: 20, display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div>
            <label style={{ fontSize: 11, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>User</label>
            <select value={filterUser} onChange={e => setFilterUser(e.target.value)} style={selectStyle}>
              <option value="">All Users</option>
              {users.map(u => <option key={u.id} value={u.id}>{u.full_name ?? u.id}</option>)}
            </select>
          </div>
          <div>
            <label style={{ fontSize: 11, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>Action</label>
            <select value={filterAction} onChange={e => setFilterAction(e.target.value)} style={selectStyle}>
              <option value="">All Actions</option>
              {uniqueActions.map(a => <option key={a} value={a}>{a}</option>)}
            </select>
          </div>
          <div>
            <label style={{ fontSize: 11, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>From</label>
            <input type="date" value={filterFrom} onChange={e => setFilterFrom(e.target.value)} style={inputStyle} />
          </div>
          <div>
            <label style={{ fontSize: 11, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>To</label>
            <input type="date" value={filterTo} onChange={e => setFilterTo(e.target.value)} style={inputStyle} />
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--text)', alignSelf: 'flex-end', paddingBottom: 6, cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={rebalanceOnly}
              onChange={e => setRebalanceOnly(e.target.checked)}
              style={{ accentColor: '#bf5af2' }}
            />
            Recommended rebalance moves only
          </label>
          {(filterUser || filterAction || filterFrom || filterTo || rebalanceOnly) && (
            <button onClick={() => { setFilterUser(''); setFilterAction(''); setFilterFrom(''); setFilterTo(''); setRebalanceOnly(false) }}
              style={{ background: 'none', border: '1px solid var(--border)', borderRadius: 6, padding: '6px 12px', fontSize: 12, color: 'var(--text-secondary)', cursor: 'pointer', alignSelf: 'flex-end' }}>
              Clear
            </button>
          )}
        </div>

        {rebalanceEntries.length > 0 && (
          <div className="card" style={{ marginBottom: 20, display: 'grid', gap: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>🔁 Recommended move history</div>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 6, lineHeight: 1.6 }}>
                  {rebalanceSummary.applied} applied • {rebalanceSummary.undone} undone • {rebalanceSummary.uniqueClients} client{rebalanceSummary.uniqueClients !== 1 ? 's' : ''} touched
                </div>
              </div>
              {rebalanceSummary.latest && (
                <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6, maxWidth: 520 }}>
                  Latest: <strong style={{ color: 'var(--text)' }}>{rebalanceSummary.latest.action}</strong>
                  {rebalanceSummary.latest.clients ? (
                    <>
                      {' '}for <Link href={`/clients/${rebalanceSummary.latest.client_id}`} style={{ color: 'var(--accent)', textDecoration: 'none' }}>
                        {rebalanceSummary.latest.clients.last_name}, {rebalanceSummary.latest.clients.first_name ?? ''} ({rebalanceSummary.latest.clients.client_id})
                      </Link>
                    </>
                  ) : null}
                  {' '}on {formatDateTime(rebalanceSummary.latest.created_at)}
                </div>
              )}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
              <div style={{ border: '1px solid var(--border)', borderRadius: 10, padding: '10px 12px', background: 'var(--surface-2)' }}>
                <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>Net kept moves</div>
                <div style={{ fontSize: 22, fontWeight: 700, color: rebalanceSummary.netMoves >= 0 ? '#30d158' : '#ff453a', marginTop: 4 }}>
                  {rebalanceSummary.netMoves >= 0 ? '+' : ''}{rebalanceSummary.netMoves}
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 4 }}>Applied minus undone in current view</div>
              </div>
              <div style={{ border: '1px solid var(--border)', borderRadius: 10, padding: '10px 12px', background: 'var(--surface-2)' }}>
                <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>Kept move rate</div>
                <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--text)', marginTop: 4 }}>
                  {rebalanceSummary.successRate !== null ? `${rebalanceSummary.successRate}%` : '—'}
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 4 }}>Percent of applied moves not later undone</div>
              </div>
            </div>

            {rebalanceSummary.trendDays.length > 0 && (
              <div>
                <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)', marginBottom: 8 }}>Last 7 active days</div>
                <div style={{ display: 'grid', gap: 8 }}>
                  {rebalanceSummary.trendDays.map(day => (
                    <div key={day.day} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 10px', background: 'var(--surface-2)' }}>
                      <div style={{ fontSize: 12, color: 'var(--text)' }}>{day.day}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                        {day.applied} applied • {day.undone} undone • <strong style={{ color: day.net >= 0 ? '#30d158' : '#ff453a' }}>net {day.net >= 0 ? '+' : ''}{day.net}</strong>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Table */}
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)' }}>
                {['Timestamp', 'User', 'Action', 'Client', 'Field', 'Old Value', 'New Value'].map(h => (
                  <th key={h} style={{ padding: '8px 12px', textAlign: 'left', color: 'var(--text-secondary)', fontWeight: 600, whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ padding: 24, textAlign: 'center', color: 'var(--text-secondary)' }}>No records found</td>
                </tr>
              ) : (
                filtered.map(l => (
                  <tr key={l.id} style={{ borderBottom: '1px solid var(--border)' }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface)')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                  >
                    <td style={{ padding: '8px 12px', whiteSpace: 'nowrap', color: 'var(--text-secondary)' }}>{formatDateTime(l.created_at)}</td>
                    <td style={{ padding: '8px 12px', whiteSpace: 'nowrap' }}>{l.profiles?.full_name ?? '—'}</td>
                    <td style={{ padding: '8px 12px' }}>
                      <span style={{
                        ...getActionTone(l.action),
                        borderRadius: 4,
                        padding: '1px 6px',
                        fontWeight: 600,
                      }}>
                        {l.action}
                      </span>
                    </td>
                    <td style={{ padding: '8px 12px' }}>
                      {l.clients ? (
                        <Link href={`/clients/${l.client_id}`} style={{ color: 'var(--accent)', textDecoration: 'none' }}>
                          {l.clients.last_name}, {l.clients.first_name ?? ''} ({l.clients.client_id})
                        </Link>
                      ) : '—'}
                    </td>
                    <td style={{ padding: '8px 12px', color: 'var(--text-secondary)' }}>{l.field_name ?? '—'}</td>
                    <td style={{ padding: '8px 12px', fontFamily: 'monospace', color: '#ff9f0a' }}>
                      {l.field_name === 'assigned_to' ? formatPlannerValue(l.old_value) : truncate(l.old_value)}
                    </td>
                    <td style={{ padding: '8px 12px', fontFamily: 'monospace', color: '#30d158' }}>
                      {l.field_name === 'assigned_to' ? formatPlannerValue(l.new_value) : truncate(l.new_value)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </main>
    </>
  )
}
