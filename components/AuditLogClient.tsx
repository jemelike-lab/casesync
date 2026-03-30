'use client'

import { useState, useMemo } from 'react'
import Header from './Header'
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

export default function AuditLogClient({ logs, users, currentUser, profile }: Props) {
  const [filterUser, setFilterUser] = useState('')
  const [filterAction, setFilterAction] = useState('')
  const [filterFrom, setFilterFrom] = useState('')
  const [filterTo, setFilterTo] = useState('')

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
      return true
    })
  }, [logs, filterUser, filterAction, filterFrom, filterTo])

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
      <Header user={currentUser} profile={profile} />
      <main style={{ maxWidth: 1200, margin: '0 auto', padding: '24px 16px 100px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
          <div>
            <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 4 }}>🔍 HIPAA Audit Log</h1>
            <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
              {filtered.length} of {logs.length} records
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
          {(filterUser || filterAction || filterFrom || filterTo) && (
            <button onClick={() => { setFilterUser(''); setFilterAction(''); setFilterFrom(''); setFilterTo('') }}
              style={{ background: 'none', border: '1px solid var(--border)', borderRadius: 6, padding: '6px 12px', fontSize: 12, color: 'var(--text-secondary)', cursor: 'pointer', alignSelf: 'flex-end' }}>
              Clear
            </button>
          )}
        </div>

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
                        background: l.action === 'delete' ? 'rgba(255,69,58,0.15)' : l.action === 'create' ? 'rgba(48,209,88,0.15)' : 'rgba(0,122,255,0.12)',
                        color: l.action === 'delete' ? '#ff453a' : l.action === 'create' ? '#30d158' : '#007aff',
                        borderRadius: 4, padding: '1px 6px', fontWeight: 600, textTransform: 'capitalize',
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
                    <td style={{ padding: '8px 12px', fontFamily: 'monospace', color: '#ff9f0a' }}>{truncate(l.old_value)}</td>
                    <td style={{ padding: '8px 12px', fontFamily: 'monospace', color: '#30d158' }}>{truncate(l.new_value)}</td>
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
