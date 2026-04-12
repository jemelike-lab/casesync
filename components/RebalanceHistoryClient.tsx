'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'

interface HistoryEntry {
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
  logs: HistoryEntry[]
}

function formatDateTime(d: string) {
  return new Date(d).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })
}

function isRecommendedRebalanceMove(action: string) {
  return /Recommended rebalance move/i.test(action)
}

function formatPlannerValue(value: string | null) {
  if (!value) return 'Unassigned'
  return value
}

function inferOutcomeLabel(entry: HistoryEntry) {
  const raw = `${entry.action} ${entry.old_value ?? ''} ${entry.new_value ?? ''}`.toLowerCase()
  if (raw.includes('higher load accepted')) return 'higher load accepted'
  if (raw.includes('helped')) return 'helped'
  if (raw.includes('worse')) return 'worse'
  if (raw.includes('neutral')) return 'neutral'
  return null
}

function getOutcomeTone(label: string) {
  if (/helped/i.test(label)) return { background: 'rgba(48,209,88,0.14)', color: '#30d158' }
  if (/worse/i.test(label)) return { background: 'rgba(255,69,58,0.14)', color: '#ff453a' }
  if (/higher load accepted/i.test(label)) return { background: 'rgba(10,132,255,0.14)', color: '#0a84ff' }
  return { background: 'rgba(142,142,147,0.16)', color: '#8e8e93' }
}

function parsePlannerNames(entry: HistoryEntry) {
  if (entry.field_name !== 'assigned_to') return null
  return {
    from: formatPlannerValue(entry.old_value),
    to: formatPlannerValue(entry.new_value),
  }
}

export default function RebalanceHistoryClient({ logs }: Props) {
  const [showUndone, setShowUndone] = useState(true)
  const [plannerFilter, setPlannerFilter] = useState('')

  const rebalanceEntries = useMemo(() => logs.filter(l => isRecommendedRebalanceMove(l.action)), [logs])

  const plannerOptions = useMemo(() => {
    const names = new Set<string>()
    for (const entry of rebalanceEntries) {
      const planners = parsePlannerNames(entry)
      if (!planners) continue
      names.add(planners.from)
      names.add(planners.to)
    }
    return Array.from(names).sort((a, b) => a.localeCompare(b))
  }, [rebalanceEntries])

  const filteredEntries = useMemo(() => {
    return rebalanceEntries.filter(entry => {
      if (!showUndone && /undone/i.test(entry.action)) return false
      if (!plannerFilter) return true
      const planners = parsePlannerNames(entry)
      if (!planners) return false
      return planners.from === plannerFilter || planners.to === plannerFilter
    })
  }, [rebalanceEntries, showUndone, plannerFilter])

  const summary = useMemo(() => {
    const appliedEntries = filteredEntries.filter(l => /applied/i.test(l.action))
    const undoneEntries = filteredEntries.filter(l => /undone/i.test(l.action))
    const applied = appliedEntries.length
    const undone = undoneEntries.length
    const netMoves = applied - undone
    const uniqueClients = new Set(filteredEntries.map(l => l.client_id).filter(Boolean)).size
    const latest = filteredEntries[0] ?? null
    const outcomeCounts = filteredEntries.reduce<Record<string, number>>((acc, entry) => {
      const label = inferOutcomeLabel(entry)
      if (!label) return acc
      acc[label] = (acc[label] ?? 0) + 1
      return acc
    }, {})

    const plannerRows = filteredEntries.reduce<Record<string, { inbound: number, outbound: number, helped: number, neutral: number, worse: number }>>((acc, entry) => {
      const planners = parsePlannerNames(entry)
      if (!planners) return acc
      acc[planners.from] ??= { inbound: 0, outbound: 0, helped: 0, neutral: 0, worse: 0 }
      acc[planners.to] ??= { inbound: 0, outbound: 0, helped: 0, neutral: 0, worse: 0 }
      acc[planners.from].outbound += 1
      acc[planners.to].inbound += 1
      const label = inferOutcomeLabel(entry)
      if (label === 'helped') acc[planners.to].helped += 1
      if (label === 'neutral') acc[planners.to].neutral += 1
      if (label === 'worse') acc[planners.to].worse += 1
      return acc
    }, {})

    return {
      applied,
      undone,
      netMoves,
      uniqueClients,
      latest,
      outcomeCounts,
      plannerRows: Object.entries(plannerRows)
        .map(([planner, counts]) => ({ planner, ...counts }))
        .sort((a, b) => (b.helped + b.inbound) - (a.helped + a.inbound)),
    }
  }, [filteredEntries])

  return (
    <main style={{ maxWidth: 1100, margin: '0 auto', padding: '24px 16px 100px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap', marginBottom: 20 }}>
        <div>
          <div style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-secondary)', marginBottom: 6 }}>
            Team Ops
          </div>
          <h1 style={{ margin: 0, fontSize: 28, lineHeight: 1.1 }}>Rebalance History</h1>
          <div style={{ marginTop: 8, fontSize: 14, color: 'var(--text-secondary)' }}>
            Review recent recommended moves, where clients went, and whether the outcome looked helpful.
          </div>
        </div>
        <Link href="/team" style={{ fontSize: 13, color: 'var(--accent)', textDecoration: 'none', padding: '8px 12px', border: '1px solid var(--border)', borderRadius: 8 }}>
          ← Back to Team
        </Link>
      </div>

      <div className="card" style={{ marginBottom: 18, display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--text)', cursor: 'pointer' }}>
          <input type="checkbox" checked={showUndone} onChange={e => setShowUndone(e.target.checked)} style={{ accentColor: '#bf5af2' }} />
          Show undone moves
        </label>
        <select value={plannerFilter} onChange={e => setPlannerFilter(e.target.value)} style={{ background: '#1c1c1e', border: '1px solid #333336', borderRadius: 8, color: '#f5f5f7', padding: '8px 10px', fontSize: 12 }}>
          <option value="">All planners</option>
          {plannerOptions.map(name => <option key={name} value={name}>{name}</option>)}
        </select>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 18 }}>
        <div className="card"><div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>Applied</div><div style={{ fontSize: 24, fontWeight: 700, marginTop: 4 }}>{summary.applied}</div></div>
        <div className="card"><div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>Undone</div><div style={{ fontSize: 24, fontWeight: 700, marginTop: 4 }}>{summary.undone}</div></div>
        <div className="card"><div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>Net kept moves</div><div style={{ fontSize: 24, fontWeight: 700, marginTop: 4, color: summary.netMoves >= 0 ? '#30d158' : '#ff453a' }}>{summary.netMoves >= 0 ? '+' : ''}{summary.netMoves}</div></div>
        <div className="card"><div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>Clients touched</div><div style={{ fontSize: 24, fontWeight: 700, marginTop: 4 }}>{summary.uniqueClients}</div></div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1.1fr 0.9fr', gap: 16, marginBottom: 18 }}>
        <div className="card">
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>Recent move outcomes</div>
          <div style={{ display: 'grid', gap: 8 }}>
            {['helped', 'neutral', 'worse', 'higher load accepted'].map(label => (
              <div key={label} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, border: '1px solid var(--border)', borderRadius: 8, padding: '8px 10px', background: 'var(--surface-2)' }}>
                <span style={{ fontSize: 12, color: 'var(--text-secondary)', textTransform: 'capitalize' }}>{label}</span>
                <strong style={{ ...getOutcomeTone(label), borderRadius: 999, padding: '2px 10px', fontSize: 11 }}>{summary.outcomeCounts[label] ?? 0}</strong>
              </div>
            ))}
          </div>
        </div>
        <div className="card">
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>Latest move</div>
          {summary.latest ? (
            <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.7 }}>
              <div><strong style={{ color: 'var(--text)' }}>{summary.latest.action}</strong></div>
              <div style={{ marginTop: 6 }}>{formatDateTime(summary.latest.created_at)}</div>
              {summary.latest.clients ? (
                <div style={{ marginTop: 6 }}>
                  <Link href={`/clients/${summary.latest.client_id}`} style={{ color: 'var(--accent)', textDecoration: 'none' }}>
                    {summary.latest.clients.last_name}, {summary.latest.clients.first_name ?? ''} ({summary.latest.clients.client_id})
                  </Link>
                </div>
              ) : null}
            </div>
          ) : (
            <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>No rebalance move history yet.</div>
          )}
        </div>
      </div>

      {summary.plannerRows.length > 0 && (
        <div className="card" style={{ marginBottom: 18 }}>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>Planner impact snapshot</div>
          <div style={{ display: 'grid', gap: 8 }}>
            {summary.plannerRows.slice(0, 10).map(row => (
              <div key={row.planner} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 10px', background: 'var(--surface-2)' }}>
                <div style={{ fontSize: 12, color: 'var(--text)', fontWeight: 600 }}>{row.planner}</div>
                <div style={{ fontSize: 11, color: 'var(--text-secondary)', display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                  <span>{row.inbound} in</span>
                  <span>{row.outbound} out</span>
                  <span style={{ color: '#30d158' }}>{row.helped} helped</span>
                  <span>{row.neutral} neutral</span>
                  <span style={{ color: '#ff453a' }}>{row.worse} worse</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="card">
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>Move log</div>
        <div style={{ display: 'grid', gap: 10 }}>
          {filteredEntries.length === 0 ? (
            <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>No rebalance entries match this filter.</div>
          ) : filteredEntries.map(entry => {
            const planners = parsePlannerNames(entry)
            const outcome = inferOutcomeLabel(entry)
            return (
              <div key={entry.id} style={{ border: '1px solid var(--border)', borderRadius: 10, padding: 12, background: 'var(--surface-2)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>{entry.action}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4, lineHeight: 1.6 }}>
                      {planners ? <>{planners.from} → {planners.to}</> : 'Planner move'}
                      {entry.profiles?.full_name ? <> • by {entry.profiles.full_name}</> : null}
                    </div>
                    {entry.clients ? (
                      <div style={{ marginTop: 6, fontSize: 12 }}>
                        <Link href={`/clients/${entry.client_id}`} style={{ color: 'var(--accent)', textDecoration: 'none' }}>
                          {entry.clients.last_name}, {entry.clients.first_name ?? ''} ({entry.clients.client_id})
                        </Link>
                      </div>
                    ) : null}
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{formatDateTime(entry.created_at)}</div>
                    {outcome ? (
                      <div style={{ marginTop: 6 }}>
                        <span style={{ ...getOutcomeTone(outcome), borderRadius: 999, padding: '3px 10px', fontWeight: 700, fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.03em' }}>{outcome}</span>
                      </div>
                    ) : null}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </main>
  )
}
