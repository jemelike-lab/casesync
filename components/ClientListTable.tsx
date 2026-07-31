'use client'

/**
 * ClientListTable — the approved CaretLegal-style client table, extracted so
 * every client-list surface (dashboard drill-down, team manager, supervisor,
 * support planner) renders identically. Presentational only: give it a client
 * array; it renders the star/name/program/deadline/owner/status/last-contact
 * layout locked in the /clients index. Empty + loading states use the glass
 * animation slots.
 */

import { useMemo, useState } from 'react'
import Link from 'next/link'
import LottieBlock from '@/components/ui/LottieBlock'
import EmptyState from '@/components/ui/EmptyState'
import { ANIM } from '@/lib/animations'
import {
  Client,
  PRIORITY_DATE_FIELDS,
  PRIORITY_DATE_LABELS,
  isOverdue,
  isDueToday,
  isDueThisWeek,
  getDaysSinceContact,
  formatDate,
} from '@/lib/types'

type Row = Client & { profiles?: { id: string; full_name: string | null } | null }

function nextDeadline(c: Client): { date: string; label: string } | null {
  let best: { date: string; label: string } | null = null
  for (const f of PRIORITY_DATE_FIELDS) {
    const d = c[f] as string | null
    if (!d) continue
    if (!best || d < best.date) best = { date: d, label: PRIORITY_DATE_LABELS[f as string] ?? String(f) }
  }
  return best
}

function relativeDays(dateStr: string): string {
  const today = new Date()
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
  const ms = new Date(dateStr + 'T00:00:00').getTime() - new Date(todayStr + 'T00:00:00').getTime()
  const days = Math.round(ms / 86400000)
  if (days === 0) return 'today'
  if (days < 0) return `${-days} day${days === -1 ? '' : 's'} ago`
  return `in ${days} day${days === 1 ? '' : 's'}`
}

function statusOf(c: Client): { label: string; bg: string } {
  const days = getDaysSinceContact(c.last_contact_date)
  if (isOverdue(c)) return { label: 'Overdue', bg: 'linear-gradient(135deg,#EF4444,#DC2626)' }
  if (isDueToday(c)) return { label: 'Due Today', bg: 'linear-gradient(135deg,#F97316,#EA580C)' }
  if (isDueThisWeek(c)) return { label: 'Due This Week', bg: 'linear-gradient(135deg,#F97316,#EA580C)' }
  if (days === null || days >= 15) return { label: 'No Contact 15+', bg: 'linear-gradient(135deg,#EC4899,#DB2777)' }
  return { label: 'On Track', bg: 'linear-gradient(135deg,#22C55E,#16A34A)' }
}

const CATEGORY_BADGE: Record<string, { fg: string; bd: string; bg: string }> = {
  cfc: { fg: '#1D4ED8', bd: '#BFDBFE', bg: '#EFF6FF' },
  co: { fg: '#9333EA', bd: '#E9D5FF', bg: '#FAF5FF' },
  dda: { fg: '#0D9488', bd: '#99F6E4', bg: '#F0FDFA' },
  cpas: { fg: '#0D9488', bd: '#99F6E4', bg: '#F0FDFA' },
}

export default function ClientListTable({
  clients,
  loading,
  emptyTitle = 'No clients in this view',
  emptyDescription = 'Try another filter, or check back later.',
  searchActive = false,
}: {
  clients: Row[]
  loading?: boolean
  emptyTitle?: string
  emptyDescription?: string
  searchActive?: boolean
}) {
  const [pinned, setPinned] = useState<Set<string>>(new Set())
  const togglePin = (id: string) =>
    setPinned(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })

  const sorted = useMemo(() => {
    const pin = clients.filter(r => pinned.has(r.id))
    const rest = clients.filter(r => !pinned.has(r.id))
    return [...pin, ...rest]
  }, [clients, pinned])

  if (loading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '48px 0', gap: 10 }}>
        <LottieBlock src={ANIM.loader} size={56} trigger="loop" label="Loading clients" />
        <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Loading clients…</div>
      </div>
    )
  }

  if (sorted.length === 0) {
    return (
      <EmptyState
        anim={searchActive ? ANIM.emptySearch : ANIM.emptyCaseload}
        title={emptyTitle}
        description={emptyDescription}
      />
    )
  }

  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13.5 }}>
        <thead>
          <tr>
            {['', 'Client', 'Program', 'Next Deadline', 'Deadline Type', 'Assigned To', 'Status', 'Last Contact'].map(h => (
              <th key={h} style={{ textAlign: 'left', fontSize: 11, letterSpacing: '.05em', textTransform: 'uppercase', color: 'var(--text-secondary)', fontWeight: 700, padding: '11px 14px', borderBottom: '1px solid var(--border)' }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map(c => {
            const nd = nextDeadline(c)
            const st = statusOf(c)
            const cat = CATEGORY_BADGE[(c.category as string) ?? 'cfc'] ?? CATEGORY_BADGE.cfc
            const days = getDaysSinceContact(c.last_contact_date)
            const isPin = pinned.has(c.id)
            return (
              <tr key={c.id}
                  onMouseEnter={e => (e.currentTarget.style.background = 'rgba(0,113,227,0.05)')}
                  onMouseLeave={e => (e.currentTarget.style.background = '')}>
                <td style={{ padding: '11px 6px 11px 14px', borderBottom: '1px solid var(--border)', width: 30 }}>
                  <span onClick={() => togglePin(c.id)} style={{ color: isPin ? '#F59E0B' : 'var(--border)', fontSize: 15, cursor: 'pointer', userSelect: 'none' }}>★</span>
                </td>
                <td style={{ padding: '11px 14px', borderBottom: '1px solid var(--border)' }}>
                  <Link href={`/clients/${c.id}`} style={{ textDecoration: 'none' }}>
                    <div style={{ color: 'var(--accent)', fontWeight: 700 }}>
                      {c.last_name}{c.first_name ? `, ${c.first_name}` : ''}
                    </div>
                    <div style={{ fontSize: 11.5, color: 'var(--text-secondary)' }}>{c.client_id}</div>
                  </Link>
                </td>
                <td style={{ padding: '11px 14px', borderBottom: '1px solid var(--border)' }}>
                  <span style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: '.04em', padding: '2.5px 8px', borderRadius: 6, border: `1px solid ${cat.bd}`, color: cat.fg, background: cat.bg, textTransform: 'uppercase' }}>
                    {String(c.category ?? 'cfc').toUpperCase()}
                  </span>
                </td>
                <td style={{ padding: '11px 14px', borderBottom: '1px solid var(--border)' }}>
                  {nd ? (<><b>{formatDate(nd.date)}</b><div style={{ fontSize: 11.5, color: 'var(--text-secondary)' }}>{relativeDays(nd.date)}</div></>) : '—'}
                </td>
                <td style={{ padding: '11px 14px', borderBottom: '1px solid var(--border)', color: 'var(--text-secondary)' }}>{nd?.label ?? '—'}</td>
                <td style={{ padding: '11px 14px', borderBottom: '1px solid var(--border)' }}>
                  {c.profiles?.full_name ? (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ width: 24, height: 24, borderRadius: '50%', background: 'linear-gradient(135deg,#1E7CFF,#1A6FEB)', color: '#fff', fontSize: 10, fontWeight: 800, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                        {c.profiles.full_name.split(' ').map(w => w[0]).slice(0, 2).join('')}
                      </span>
                      {c.profiles.full_name}
                    </span>
                  ) : (<span style={{ color: 'var(--text-secondary)' }}>Unassigned</span>)}
                </td>
                <td style={{ padding: '11px 14px', borderBottom: '1px solid var(--border)' }}>
                  <span style={{ fontSize: 11.5, fontWeight: 700, color: '#fff', padding: '4px 12px', borderRadius: 8, whiteSpace: 'nowrap', background: st.bg }}>{st.label}</span>
                </td>
                <td style={{ padding: '11px 14px', borderBottom: '1px solid var(--border)', color: days !== null && days >= 7 ? '#DC2626' : 'var(--text-secondary)', fontWeight: days !== null && days >= 7 ? 700 : 400 }}>
                  {days === null ? '—' : days === 0 ? 'today' : `${days} day${days === 1 ? '' : 's'}`}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
