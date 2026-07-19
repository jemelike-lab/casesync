'use client'

/**
 * ClientIndexClient — the real /clients index (queued item #7, shipped with
 * the facelift). Structure modeled on Josh's CaretLegal reference: colored
 * header band, filter chips with live counts, dense table with status pills
 * and owner column. All data flows through GET /api/clients (RLS-scoped,
 * Azure-backed); status pills derive from the same lib/types predicates the
 * dashboard aggregates use, so numbers always agree.
 *
 * Banked API gotchas respected: pages are 0-indexed, limit caps at 100.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import LottieBlock from '@/components/ui/LottieBlock'
import EmptyState from '@/components/ui/EmptyState'
import QuickLog from '@/components/QuickLog'
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

type ClientRow = Client & { profiles?: { id: string; full_name: string | null; role: string | null } | null }

const PAGE_SIZE = 50

const CHIPS: { key: string; label: string; filter: string; mineOnly?: boolean }[] = [
  { key: 'mine', label: 'My Caseload', filter: 'all', mineOnly: true },
  { key: 'all', label: 'All Active', filter: 'all' },
  { key: 'overdue', label: 'Overdue', filter: 'overdue' },
  { key: 'due_this_week', label: 'Due This Week', filter: 'due_this_week' },
  { key: 'due_next_14_days', label: 'Due Next 14', filter: 'due_next_14_days' },
  { key: 'no_contact_7', label: 'No Contact 7+', filter: 'no_contact_7' },
  { key: 'eligibility_ending_soon', label: 'Elig Ending Soon', filter: 'eligibility_ending_soon' },
  { key: 'co', label: 'CO', filter: 'co' },
  { key: 'cfc', label: 'CFC', filter: 'cfc' },
]

function nextDeadline(c: Client): { date: string; label: string } | null {
  // "Next deadline" semantics (2026-07-12 audit, P3): prefer the earliest
  // UPCOMING deadline (>= today); when every tracked date is past, show the
  // most RECENT overdue one. The previous lexicographic min surfaced
  // decades-old sentinel dates (e.g. 1999-12-31) as "thousands of days ago".
  // Local-date anchor matches relativeDays() below (client component).
  const t = new Date()
  const todayStr = `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`
  let upcoming: { date: string; label: string } | null = null
  let recentPast: { date: string; label: string } | null = null
  for (const f of PRIORITY_DATE_FIELDS) {
    const d = c[f] as string | null
    if (!d) continue
    const label = PRIORITY_DATE_LABELS[f as string] ?? String(f)
    if (d >= todayStr) {
      if (!upcoming || d < upcoming.date) upcoming = { date: d, label }
    } else {
      if (!recentPast || d > recentPast.date) recentPast = { date: d, label }
    }
  }
  return upcoming ?? recentPast
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
  if (days === null || days >= 7) return { label: 'No Contact 7+', bg: 'linear-gradient(135deg,#EC4899,#DB2777)' }
  return { label: 'On Track', bg: 'linear-gradient(135deg,#22C55E,#16A34A)' }
}

const CATEGORY_BADGE: Record<string, { fg: string; bd: string; bg: string }> = {
  cfc: { fg: '#1D4ED8', bd: '#BFDBFE', bg: '#EFF6FF' },
  co: { fg: '#9333EA', bd: '#E9D5FF', bg: '#FAF5FF' },
  cpas: { fg: '#0D9488', bd: '#99F6E4', bg: '#F0FDFA' },
}

export default function ClientIndexClient({
  userId,
  isPlannerRole,
}: {
  userId: string
  isPlannerRole: boolean
}) {
  const [chip, setChip] = useState(isPlannerRole ? 'mine' : 'all')
  const [search, setSearch] = useState('')
  const [debounced, setDebounced] = useState('')
  const [rows, setRows] = useState<ClientRow[]>([])
  const [total, setTotal] = useState<number | null>(null)
  const [counts, setCounts] = useState<Record<string, number>>({})
  const [page, setPage] = useState(0)
  const [loading, setLoading] = useState(true)
  const [pinned, setPinned] = useState<Set<string>>(new Set())
  const [sortField, setSortField] = useState<'name' | 'last_contact_date'>('name')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')
  const abortRef = useRef<AbortController | null>(null)
  const [refreshTick, setRefreshTick] = useState(0)

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search.trim()), 300)
    return () => clearTimeout(t)
  }, [search])

  const buildUrl = useCallback(
    (chipKey: string, p: number, limit: number, q: string, sf?: string, sd?: string) => {
      const def = CHIPS.find(c => c.key === chipKey) ?? CHIPS[1]
      const params = new URLSearchParams({ filter: def.filter, page: String(p), limit: String(limit) })
      if (q) params.set('search', q)
      if (def.mineOnly) params.set('assignedTo', userId)
      if (sf === 'last_contact_date') params.set('sortField', sf)
      if (sd) params.set('sortDir', sd)
      return `/api/clients?${params.toString()}`
    },
    [userId],
  )

  // rows for the active chip
  useEffect(() => {
    abortRef.current?.abort()
    const ac = new AbortController()
    abortRef.current = ac
    setLoading(true)
    fetch(buildUrl(chip, page, PAGE_SIZE, debounced, sortField, sortDir), { signal: ac.signal })
      .then(r => r.json())
      .then(d => {
        setRows(Array.isArray(d.clients) ? d.clients : [])
        setTotal(typeof d.total === 'number' ? d.total : null)
        setLoading(false)
      })
      .catch(e => { if (e?.name !== 'AbortError') setLoading(false) })
    return () => ac.abort()
  }, [chip, page, debounced, sortField, sortDir, buildUrl, refreshTick])

  // chip counts — one lightweight limit=1 call per chip
  useEffect(() => {
    let alive = true
    Promise.all(
      CHIPS.filter(c => !c.mineOnly || isPlannerRole).map(c =>
        fetch(buildUrl(c.key, 0, 1, ''))
          .then(r => r.json())
          .then(d => [c.key, (typeof d.total === 'number' ? d.total : 0)] as const)
          .catch(() => [c.key, 0] as const),
      ),
    ).then(pairs => { if (alive) setCounts(Object.fromEntries(pairs)) })
    return () => { alive = false }
  }, [buildUrl, isPlannerRole, refreshTick])

  const sorted = useMemo(() => {
    const pin = rows.filter(r => pinned.has(r.id))
    const rest = rows.filter(r => !pinned.has(r.id))
    return [...pin, ...rest]
  }, [rows, pinned])

  const togglePin = (id: string) =>
    setPinned(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })

  const pageCount = total !== null ? Math.max(1, Math.ceil(total / PAGE_SIZE)) : 1

  return (
    <div style={{ maxWidth: 1220, margin: '0 auto', padding: '24px 20px' }}>
      {/* Page hero */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 16 }}>
        <LottieBlock src={ANIM.gTeam} size={54} trigger="mount" />
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.01em', margin: 0 }}>Clients</h1>
          <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
            {total !== null ? `${total} matching` : '\u00A0'}
          </div>
        </div>
        <input
          value={search}
          onChange={e => { setSearch(e.target.value); setPage(0) }}
          placeholder="Search by name or client ID…"
          style={{
            marginLeft: 'auto', width: 300, maxWidth: '40vw', padding: '9px 14px', fontSize: 13.5,
            borderRadius: 11, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)',
            outline: 'none',
          }}
        />
      </div>

      {/* Filter chips */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
        {CHIPS.filter(c => !c.mineOnly || isPlannerRole).map(c => {
          const on = chip === c.key
          return (
            <button
              key={c.key}
              onClick={() => { setChip(c.key); setPage(0) }}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 12.5, fontWeight: 650,
                padding: '6px 13px', borderRadius: 999, cursor: 'pointer',
                border: `1px solid ${on ? 'var(--accent)' : 'var(--border)'}`,
                background: on ? 'var(--accent)' : 'var(--surface)',
                color: on ? '#fff' : 'var(--text-secondary)',
              }}
            >
              {c.label}
              <b style={{ fontWeight: 800, color: on ? '#fff' : 'var(--text)' }}>{counts[c.key] ?? '·'}</b>
            </button>
          )
        })}
      </div>

      {/* Table */}
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, overflow: 'hidden', boxShadow: '0 1px 3px rgba(15,23,42,.06)' }}>
        {loading ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '48px 0', gap: 10 }}>
            <LottieBlock src={ANIM.loader} size={56} trigger="loop" label="Loading clients" />
            <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Loading clients…</div>
          </div>
        ) : sorted.length === 0 ? (
          <EmptyState
            anim={debounced ? ANIM.emptySearch : ANIM.emptyCaseload}
            title={debounced ? `No clients match “${debounced}”` : 'No clients in this view'}
            description={debounced ? 'Try a different name or client ID.' : 'Try another filter, or check back later.'}
          />
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13.5 }}>
              <thead>
                <tr>
                  {([
                    ['', null],
                    ['Client', 'name'],
                    ['Program', null],
                    ['Next Deadline', null],
                    ['Deadline Type', null],
                    ['Assigned To', null],
                    ['Status', null],
                    ['Last Contact', 'last_contact_date'],
                    ['Log Contact', null],
                  ] as [string, 'name' | 'last_contact_date' | null][]).map(([h, sf]) => {
                    const isSortable = sf !== null
                    const isActive = isSortable && sortField === sf
                    return (
                      <th
                        key={h || 'pin'}
                        onClick={isSortable ? () => {
                          if (sortField === sf) { setSortDir(d => (d === 'asc' ? 'desc' : 'asc')) }
                          else { setSortField(sf as 'name' | 'last_contact_date'); setSortDir('asc') }
                          setPage(0)
                        } : undefined}
                        title={isSortable ? `Sort by ${h}` : undefined}
                        style={{ textAlign: 'left', fontSize: 11, letterSpacing: '.05em', textTransform: 'uppercase', color: isActive ? 'var(--accent)' : 'var(--text-secondary)', fontWeight: 700, padding: '11px 14px', borderBottom: '1px solid var(--border)', cursor: isSortable ? 'pointer' : 'default', userSelect: 'none', whiteSpace: 'nowrap' }}
                      >
                        {h}
                        {isSortable ? (
                          <span style={{ marginLeft: 5, fontSize: 9, opacity: isActive ? 1 : 0.35 }}>
                            {isActive ? (sortDir === 'asc' ? '\u25B2' : '\u25BC') : '\u2195'}
                          </span>
                        ) : null}
                      </th>
                    )
                  })}
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
                    <tr key={c.id} style={{ cursor: 'pointer' }}
                        onMouseEnter={e => (e.currentTarget.style.background = 'rgba(0,113,227,0.05)')}
                        onMouseLeave={e => (e.currentTarget.style.background = '')}>
                      <td style={{ padding: '11px 6px 11px 14px', borderBottom: '1px solid var(--border)', width: 30 }}>
                        <span onClick={e => { e.stopPropagation(); togglePin(c.id) }}
                              style={{ color: isPin ? '#F59E0B' : 'var(--border)', fontSize: 15, userSelect: 'none' }}>★</span>
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
                      <td style={{ padding: '11px 14px', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' }}>
                        <QuickLog
                          clientId={c.id}
                          clientName={`${c.first_name ?? ''} ${c.last_name ?? ''}`.trim()}
                          contextLine={[String(c.category ?? 'cfc').toUpperCase(), days === null ? 'never contacted' : days === 0 ? 'contacted today' : `last contact ${days}d ago`].join(' \u00b7 ')}
                          variant="row"
                          onLogged={() => setRefreshTick(t => t + 1)}
                        />
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Pagination */}
      {total !== null && total > PAGE_SIZE && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, marginTop: 14, fontSize: 13 }}>
          <button disabled={page === 0} onClick={() => setPage(p => p - 1)}
                  style={{ padding: '7px 14px', borderRadius: 9, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)', cursor: page === 0 ? 'default' : 'pointer', opacity: page === 0 ? 0.5 : 1 }}>← Prev</button>
          <span style={{ color: 'var(--text-secondary)' }}>Page {page + 1} of {pageCount}</span>
          <button disabled={page + 1 >= pageCount} onClick={() => setPage(p => p + 1)}
                  style={{ padding: '7px 14px', borderRadius: 9, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)', cursor: page + 1 >= pageCount ? 'default' : 'pointer', opacity: page + 1 >= pageCount ? 0.5 : 1 }}>Next →</button>
        </div>
      )}
    </div>
  )
}
