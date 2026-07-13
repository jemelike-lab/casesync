'use client'

/**
 * DocumentsOverviewClient — the /documents supervisor page body
 * (2026-07-12 file-organization build).
 *
 * Section 1: expired / expiring-within-30-days document queue.
 * Section 2: per-client completeness matrix — one row per active real
 * client, one column per file folder, zero-count cells highlighted so an
 * incomplete chart is visible without opening it. Every row links to the
 * client's detail page; the ⬇ action pulls that client's full chart as a
 * ZIP via /api/clients/[id]/files/zip.
 *
 * Styling uses the shared CSS variables only (var(--surface) etc.) so both
 * themes render correctly without hardcoded colors.
 */

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { CATEGORY_LABELS } from '@/lib/document-folders'

type Folder = { key: string; label: string }
type MatrixRow = { id: string; clientId: string; name: string; folders: Record<string, number>; total: number }
type ExpiringItem = { clientId: string; clientName: string; fileName: string; category: string; expiresAt: string; status: 'expired' | 'soon' }
type Payload = { generatedAt: string; folders: Folder[]; clients: MatrixRow[]; expiring: ExpiringItem[] }

function formatShortDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  if (!y || !m || !d) return iso
  return `${m}/${d}/${y}`
}

export default function DocumentsOverviewClient() {
  const [data, setData] = useState<Payload | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')
  const [sortMode, setSortMode] = useState<'name' | 'gaps'>('name')

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch('/api/documents/overview', { cache: 'no-store' })
        const body = await res.json()
        if (!res.ok) throw new Error(body?.error ?? `Request failed (${res.status})`)
        if (!cancelled) setData(body as Payload)
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load document overview')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [])

  const rows = useMemo(() => {
    if (!data) return []
    const q = query.trim().toLowerCase()
    let out = q
      ? data.clients.filter(c => c.name.toLowerCase().includes(q) || c.clientId.toLowerCase().includes(q))
      : [...data.clients]
    if (sortMode === 'gaps') {
      const gapCount = (c: MatrixRow) => data.folders.reduce((n, f) => n + ((c.folders[f.key] ?? 0) === 0 ? 1 : 0), 0)
      out = out.sort((a, b) => gapCount(b) - gapCount(a) || a.name.localeCompare(b.name))
    }
    return out
  }, [data, query, sortMode])

  const cellStyle: React.CSSProperties = {
    padding: '8px 10px', fontSize: 13, textAlign: 'center', borderBottom: '1px solid var(--border)',
  }
  const headStyle: React.CSSProperties = {
    padding: '8px 10px', fontSize: 11.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em',
    color: 'var(--text-secondary)', textAlign: 'center', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap',
  }
  const sectionStyle: React.CSSProperties = {
    background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 18, marginBottom: 20,
  }

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto', padding: '24px 16px' }}>
      <div style={{ marginBottom: 18 }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: 'var(--text)', margin: 0 }}>Client Documents</h1>
        <p style={{ fontSize: 13.5, color: 'var(--text-secondary)', margin: '6px 0 0' }}>
          Chart completeness and expiring records across your caseload. Counts include active clients only.
        </p>
      </div>

      {loading && (
        <div style={{ ...sectionStyle, textAlign: 'center', color: 'var(--text-secondary)', fontSize: 14 }}>
          Loading document overview…
        </div>
      )}
      {!loading && error && (
        <div style={{ ...sectionStyle, color: '#ff453a', fontSize: 14 }}>{error}</div>
      )}

      {!loading && !error && data && (
        <>
          {/* ── Expiring / expired queue ─────────────────────────────────── */}
          <div style={sectionStyle}>
            <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', marginBottom: 10 }}>
              Expiring documents <span style={{ fontWeight: 500, color: 'var(--text-secondary)', fontSize: 13 }}>(expired or due within 30 days)</span>
            </div>
            {data.expiring.length === 0 ? (
              <div style={{ fontSize: 13.5, color: 'var(--text-secondary)' }}>
                Nothing expiring in the next 30 days.
              </div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr>
                      <th style={{ ...headStyle, textAlign: 'left' }}>Client</th>
                      <th style={{ ...headStyle, textAlign: 'left' }}>File</th>
                      <th style={{ ...headStyle, textAlign: 'left' }}>Category</th>
                      <th style={headStyle}>Expires</th>
                      <th style={headStyle}>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.expiring.map((e, i) => (
                      <tr key={`${e.clientId}-${e.fileName}-${i}`}>
                        <td style={{ ...cellStyle, textAlign: 'left' }}>
                          <Link href={`/clients/${e.clientId}`} style={{ color: 'var(--accent, #2563eb)', textDecoration: 'none', fontWeight: 600 }}>
                            {e.clientName}
                          </Link>
                        </td>
                        <td style={{ ...cellStyle, textAlign: 'left', maxWidth: 320, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--text)' }} title={e.fileName}>
                          {e.fileName}
                        </td>
                        <td style={{ ...cellStyle, textAlign: 'left', color: 'var(--text-secondary)' }}>
                          {CATEGORY_LABELS[e.category] ?? e.category}
                        </td>
                        <td style={{ ...cellStyle, color: 'var(--text)' }}>{formatShortDate(e.expiresAt)}</td>
                        <td style={cellStyle}>
                          {e.status === 'expired' ? (
                            <span style={{ background: 'rgba(255,69,58,0.15)', color: '#ff453a', borderRadius: 4, padding: '2px 8px', fontSize: 11.5, fontWeight: 700 }}>Expired</span>
                          ) : (
                            <span style={{ background: 'rgba(255,159,10,0.15)', color: '#ff9f0a', borderRadius: 4, padding: '2px 8px', fontSize: 11.5, fontWeight: 700 }}>Due soon</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* ── Completeness matrix ──────────────────────────────────────── */}
          <div style={sectionStyle}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 12, flexWrap: 'wrap' }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', marginRight: 'auto' }}>
                Chart completeness <span style={{ fontWeight: 500, color: 'var(--text-secondary)', fontSize: 13 }}>({rows.length} of {data.clients.length} clients)</span>
              </div>
              <input
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="Search by name or client ID…"
                style={{ minWidth: 200, background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text)', padding: '6px 10px', fontSize: 13 }}
              />
              <div style={{ display: 'flex', border: '1px solid var(--border)', borderRadius: 6, overflow: 'hidden' }}>
                {([['name', 'A–Z'], ['gaps', 'Most gaps']] as const).map(([mode, label]) => (
                  <button
                    key={mode}
                    onClick={() => setSortMode(mode)}
                    style={{
                      fontSize: 12, padding: '6px 12px', border: 'none', cursor: 'pointer',
                      background: sortMode === mode ? 'var(--accent, #2563eb)' : 'var(--surface-2)',
                      color: sortMode === mode ? '#fff' : 'var(--text-secondary)',
                    }}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {rows.length === 0 ? (
              <div style={{ fontSize: 13.5, color: 'var(--text-secondary)', padding: '12px 0', textAlign: 'center' }}>
                No clients match the search.
              </div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr>
                      <th style={{ ...headStyle, textAlign: 'left' }}>Client</th>
                      {data.folders.map(f => (
                        <th key={f.key} style={headStyle} title={f.label}>{f.label}</th>
                      ))}
                      <th style={headStyle}>Total</th>
                      <th style={headStyle}>Pull</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map(c => (
                      <tr key={c.id}>
                        <td style={{ ...cellStyle, textAlign: 'left', whiteSpace: 'nowrap' }}>
                          <Link href={`/clients/${c.id}`} style={{ color: 'var(--accent, #2563eb)', textDecoration: 'none', fontWeight: 600 }}>
                            {c.name}
                          </Link>
                          <span style={{ marginLeft: 8, fontSize: 11.5, color: 'var(--text-secondary)' }}>{c.clientId}</span>
                        </td>
                        {data.folders.map(f => {
                          const n = c.folders[f.key] ?? 0
                          return (
                            <td
                              key={f.key}
                              style={{
                                ...cellStyle,
                                fontWeight: n === 0 ? 700 : 600,
                                color: n === 0 ? '#ff9f0a' : 'var(--text)',
                                background: n === 0 ? 'rgba(255,159,10,0.08)' : 'transparent',
                              }}
                            >
                              {n === 0 ? '—' : n}
                            </td>
                          )
                        })}
                        <td style={{ ...cellStyle, fontWeight: 700, color: 'var(--text)' }}>{c.total}</td>
                        <td style={cellStyle}>
                          {c.total > 0 ? (
                            <button
                              onClick={() => window.open(`/api/clients/${c.id}/files/zip?folder=all`, '_blank')}
                              title={`Download all of ${c.name}'s files as a ZIP`}
                              style={{ background: 'transparent', border: '1px solid var(--border)', borderRadius: 6, cursor: 'pointer', padding: '3px 10px', fontSize: 12.5, color: 'var(--text-secondary)' }}
                            >
                              ⬇ ZIP
                            </button>
                          ) : (
                            <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>—</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 10 }}>
              Highlighted cells are folders with no documents on file. Counts refresh on page load.
            </div>
          </div>
        </>
      )}
    </div>
  )
}
