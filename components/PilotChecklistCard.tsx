'use client'

// PilotChecklistCard \u2014 Option A \u201cPilot HQ\u201d card (mock approved 2026-07-13).
// Renders at the top of the SP dashboard for active pilot_roster members;
// renders nothing for everyone else. Progress persists via
// POST /api/pilot/checklist (pilot_checklist_progress on Azure, FORCE RLS).
// \u201cFlag an issue\u201d opens the existing FeedbackTab modal pre-tagged via the
// cs:open-feedback window event.

import { useCallback, useEffect, useMemo, useState } from 'react'
import { PILOT_GROUPS, PILOT_TOTAL_TASKS } from '@/lib/pilot-tasks'

const RING_C = 169.6 // 2\u03c0r, r=27
const PHASE_LABELS = ['Verify', 'Live', 'Wrap'] as const

export default function PilotChecklistCard() {
  const [inPilot, setInPilot] = useState<boolean | null>(null)
  const [startedAt, setStartedAt] = useState<string | null>(null)
  const [completed, setCompleted] = useState<Set<string>>(new Set())
  const [caseload, setCaseload] = useState<number | null>(null)
  const [openGroups, setOpenGroups] = useState<Set<number>>(new Set([0]))

  useEffect(() => {
    let alive = true
    fetch('/api/pilot/checklist')
      .then(r => (r.ok ? r.json() : { inPilot: false }))
      .then(d => {
        if (!alive) return
        setInPilot(Boolean(d.inPilot))
        setStartedAt(typeof d.startedAt === 'string' ? d.startedAt : null)
        setCompleted(new Set(Array.isArray(d.completed) ? d.completed : []))
      })
      .catch(() => { if (alive) setInPilot(false) })
    fetch('/api/clients?filter=all&page=0&limit=1')
      .then(r => r.json())
      .then(d => { if (alive && typeof d.total === 'number') setCaseload(d.total) })
      .catch(() => {})
    return () => { alive = false }
  }, [])

  const toggle = useCallback((key: string) => {
    setCompleted(prev => {
      const next = new Set(prev)
      const done = !next.has(key)
      done ? next.add(key) : next.delete(key)
      fetch('/api/pilot/checklist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ taskKey: key, done }),
      }).catch(() => {
        // revert on network failure so the UI never lies about saved state
        setCompleted(p => {
          const undo = new Set(p)
          done ? undo.delete(key) : undo.add(key)
          return undo
        })
      })
      return next
    })
  }, [])

  const openFeedback = useCallback((context?: string) => {
    window.dispatchEvent(new CustomEvent('cs:open-feedback', { detail: context ? { context } : {} }))
  }, [])

  const week = useMemo(() => {
    if (!startedAt) return 1
    const days = (Date.now() - new Date(startedAt).getTime()) / 86400000
    return Math.min(3, Math.max(1, Math.floor(days / 7) + 1))
  }, [startedAt])

  if (!inPilot) return null

  const pct = Math.round((completed.size / PILOT_TOTAL_TASKS) * 100)

  return (
    <div style={{ maxWidth: 1220, margin: '0 auto', padding: '20px 20px 0' }}>
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, overflow: 'hidden', boxShadow: '0 4px 18px rgba(15,23,42,.07)' }}>

        {/* Hero */}
        <div style={{ background: 'linear-gradient(135deg, #1E7CFF 0%, #2D8BFF 50%, #1A6FEB 100%)', padding: '18px 20px', display: 'flex', alignItems: 'center', gap: 16, color: '#fff' }}>
          <div style={{ position: 'relative', width: 64, height: 64, flex: '0 0 64px' }}>
            <svg width="64" height="64" style={{ transform: 'rotate(-90deg)' }}>
              <circle cx="32" cy="32" r="27" stroke="rgba(255,255,255,.25)" strokeWidth="6" fill="none" />
              <circle cx="32" cy="32" r="27" stroke="#fff" strokeWidth="6" fill="none" strokeLinecap="round"
                strokeDasharray={RING_C} strokeDashoffset={RING_C * (1 - pct / 100)} style={{ transition: 'stroke-dashoffset .4s' }} />
            </svg>
            <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 15 }}>{pct}%</div>
          </div>
          <div>
            <h2 style={{ margin: 0, fontSize: 17, fontWeight: 800, letterSpacing: '-0.01em' }}>CaseSync Pilot {'\u2014'} your checklist</h2>
            <div style={{ fontSize: 12.5, opacity: 0.92, marginTop: 3 }}>{'You\u2019re one of four planners shaping CaseSync before it goes agency-wide.'}</div>
          </div>
          <div style={{ marginLeft: 'auto', background: 'rgba(255,255,255,.16)', border: '1px solid rgba(255,255,255,.35)', backdropFilter: 'blur(8px)', borderRadius: 999, padding: '5px 13px', fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap' }}>
            Week {week} of 3 {'\u00b7'} {PHASE_LABELS[week - 1]}
          </div>
        </div>

        {/* Verify counter */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'linear-gradient(135deg,#EFF6FF,#F0FDFA)', borderBottom: '1px solid var(--border)', padding: '12px 20px', fontSize: 13, color: '#0F172A' }}>
          <span>{'\ud83c\udfaf'}</span>
          <span>
            <b style={{ fontSize: 15, color: '#1E7CFF' }}>{caseload ?? '\u2026'}</b>
            {' '}clients on your caseload to verify against your records
          </span>
          <a href="/clients" style={{ marginLeft: 'auto', fontSize: 12.5, fontWeight: 700, color: '#1E7CFF', textDecoration: 'none' }}>Open My Caseload {'\u2192'}</a>
        </div>

        {/* Groups */}
        <div>
          {PILOT_GROUPS.map((g, gi) => {
            const isOpen = openGroups.has(gi)
            const doneCt = g.tasks.filter(t => completed.has(t.key)).length
            return (
              <div key={g.name} style={{ borderBottom: gi === PILOT_GROUPS.length - 1 ? 'none' : '1px solid var(--border)' }}>
                <div
                  onClick={() => setOpenGroups(prev => { const n = new Set(prev); n.has(gi) ? n.delete(gi) : n.add(gi); return n })}
                  style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '13px 20px', cursor: 'pointer', userSelect: 'none' }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'rgba(0,113,227,0.04)')}
                  onMouseLeave={e => (e.currentTarget.style.background = '')}
                >
                  <div style={{ width: 24, height: 24, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 800, color: '#fff', background: g.color }}>{g.icon}</div>
                  <h3 style={{ margin: 0, fontSize: 13.5, fontWeight: 750, flex: 1, color: 'var(--text)' }}>{g.name}</h3>
                  <span style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--text-secondary)' }}>{doneCt}/{g.tasks.length}</span>
                  <span style={{ fontSize: 11, color: 'var(--text-secondary)', transition: 'transform .18s', transform: isOpen ? 'rotate(90deg)' : 'none' }}>\u25b6</span>
                </div>
                {isOpen && (
                  <div style={{ padding: '2px 20px 12px' }}>
                    {g.tasks.map((t, ti) => {
                      const done = completed.has(t.key)
                      return (
                        <div key={t.key} style={{ display: 'flex', alignItems: 'flex-start', gap: 11, padding: '9px 0', borderTop: ti === 0 ? 'none' : '1px dashed var(--border)' }}>
                          <div
                            onClick={() => toggle(t.key)}
                            role="checkbox"
                            aria-checked={done}
                            style={{ width: 19, height: 19, flex: '0 0 19px', borderRadius: 6, border: done ? '2px solid transparent' : '2px solid #C4D2E6', background: done ? 'linear-gradient(135deg,#22C55E,#16A34A)' : 'var(--surface)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', marginTop: 1, transition: 'all .15s', color: '#fff', fontSize: 12, fontWeight: 900 }}
                          >{done ? '\u2713' : ''}</div>
                          <div style={{ fontSize: 13.5, lineHeight: 1.45, flex: 1, color: done ? 'var(--text-secondary)' : 'var(--text)', textDecoration: done ? 'line-through' : 'none' }}>
                            {t.t}
                            {t.s ? <small style={{ display: 'block', fontSize: 11.5, color: 'var(--text-secondary)', marginTop: 2, textDecoration: 'none' }}>{t.s}</small> : null}
                          </div>
                          <button
                            onClick={() => openFeedback(`Pilot task \u2014 ${t.t}`)}
                            style={{ fontSize: 11, fontWeight: 700, color: '#DC2626', background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 999, padding: '3px 10px', cursor: 'pointer', whiteSpace: 'nowrap' }}
                          >{'\u2691'} Flag an issue</button>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}
        </div>

        {/* Footer */}
        <div style={{ padding: '12px 20px', background: 'var(--surface)', borderTop: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 10, fontSize: 12, color: 'var(--text-secondary)' }}>
          <span>Progress saves automatically. Gabriela and Josh can see it live.</span>
          <button
            onClick={() => openFeedback()}
            style={{ marginLeft: 'auto', background: 'linear-gradient(135deg,#1E7CFF,#1A6FEB)', color: '#fff', fontWeight: 700, fontSize: 12, border: 'none', borderRadius: 9, padding: '7px 14px', cursor: 'pointer' }}
          >{'\ud83d\udcac'} Send feedback</button>
        </div>
      </div>
    </div>
  )
}
