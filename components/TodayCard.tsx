"use client"

// TodayCard — Phase 3 daily-habit anchor. "The 5 that matter out of 50."
// Data: /api/today (lib/today.ts engine — identical math to the morning
// digest email). Shows green when caught up, not just red when behind.

import { useEffect, useState } from 'react'
import Link from 'next/link'

type Focus = { id: string; name: string; reasons: string[] }
type TodayData = {
  generated_for: string
  counts: { total: number; overdue: number; due_today: number; due_this_week: number; no_contact_7: number; eligibility_soon_30: number }
  focus: Focus[]
  caught_up: boolean
  changes_24h?: { activity: number; notes: number } | null
}

const CHIP_DEFS: Array<{ key: keyof TodayData['counts']; label: string; color: string }> = [
  { key: 'overdue', label: 'Overdue', color: '#DC2626' },
  { key: 'due_today', label: 'Due today', color: '#D97706' },
  { key: 'due_this_week', label: 'Due this week', color: '#1E7CFF' },
  { key: 'no_contact_7', label: 'No contact 7+', color: '#7C3AED' },
  { key: 'eligibility_soon_30', label: 'Elig. ends 30d', color: '#0D9488' },
]

export default function TodayCard() {
  const [data, setData] = useState<TodayData | null>(null)

  useEffect(() => {
    let alive = true
    fetch('/api/today', { cache: 'no-store' })
      .then(r => (r.ok ? r.json() : null))
      .then(j => { if (alive && j && j.counts) setData(j) })
      .catch(() => {})
    return () => { alive = false }
  }, [])

  if (!data) return null

  const dateLabel = new Date(data.generated_for + 'T00:00:00Z').toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', timeZone: 'UTC',
  })
  const changeCount = (data.changes_24h?.activity ?? 0) + (data.changes_24h?.notes ?? 0)

  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, overflow: 'hidden', boxShadow: '0 4px 18px rgba(15,23,42,.07)', marginBottom: 16 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, padding: '14px 20px 10px', flexWrap: 'wrap' }}>
        <span style={{ fontSize: 12, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#1E7CFF' }}>Today</span>
        <span style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--text)' }}>{dateLabel}</span>
        {changeCount > 0 && (
          <span style={{ marginLeft: 'auto', fontSize: 11.5, fontWeight: 600, color: 'var(--text-secondary)' }}>
            {changeCount} update{changeCount === 1 ? '' : 's'} in the last 24h
          </span>
        )}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '0 20px 12px', flexWrap: 'wrap' }}>
        {CHIP_DEFS.map(c => {
          const v = data.counts[c.key]
          return (
            <span key={c.key} style={{
              display: 'inline-flex', alignItems: 'center', gap: 6, borderRadius: 999,
              padding: '4px 11px', fontSize: 11.5, fontWeight: 700,
              color: v > 0 ? c.color : 'var(--text-secondary)',
              background: v > 0 ? c.color + '1A' : 'transparent',
              border: `1px solid ${v > 0 ? c.color + '33' : 'var(--border)'}`,
            }}>
              <span style={{ fontSize: 13, fontWeight: 800 }}>{v}</span> {c.label}
            </span>
          )
        })}
      </div>

      {data.caught_up ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'linear-gradient(135deg,#ECFDF5,#F0FDFA)', borderTop: '1px solid var(--border)', padding: '14px 20px', fontSize: 13.5, fontWeight: 600, color: '#16A34A' }}>
          <span style={{ fontSize: 18 }}>{'\u{1F389}'}</span>
          {"You're caught up — nothing overdue and nothing due today."}
        </div>
      ) : (
        <div style={{ borderTop: '1px solid var(--border)', padding: '10px 20px 14px' }}>
          <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text-secondary)', margin: '4px 0 8px' }}>
            Top priorities
          </div>
          {data.focus.map(f => (
            <div key={f.id} style={{ padding: '7px 0', borderBottom: '1px solid var(--border)' }}>
              <Link href={`/clients/${f.id}`} style={{ fontSize: 13, fontWeight: 700, color: '#1E7CFF', textDecoration: 'none' }}>
                {f.name}
              </Link>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 1 }}>
                {f.reasons.join(' \u00b7 ')}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
