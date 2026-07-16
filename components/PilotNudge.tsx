'use client'

// PilotNudge \u2014 gentle stall-only toast (default approved 2026-07-16).
// Shows at most once per day, only when the member is behind their own pace:
//   \u2022 never on a day they've already completed a task
//   \u2022 never once the checklist is finished
//   \u2022 dismiss (\u00d7 / Later / Not now) hides it for 24h (localStorage)
// It never blocks work \u2014 it's a card above Pilot HQ, not a modal.

import { useEffect, useState } from 'react'
import { PILOT_GROUPS } from '@/lib/pilot-tasks'

const DISMISS_KEY = 'pilot-nudge-dismissed-until'

export default function PilotNudge() {
  const [state, setState] = useState<{ mode: 'hidden' } | { mode: 'fresh' } | { mode: 'mid'; done: number; total: number; nextTask: string }>({ mode: 'hidden' })

  useEffect(() => {
    let alive = true
    try {
      const until = Number(localStorage.getItem(DISMISS_KEY) ?? 0)
      if (until > Date.now()) return
    } catch { /* storage unavailable \u2192 still show */ }
    fetch('/api/pilot/checklist')
      .then(r => (r.ok ? r.json() : { inPilot: false }))
      .then(d => {
        if (!alive || !d.inPilot) return
        const completed: string[] = Array.isArray(d.completed) ? d.completed : []
        const isManager = Boolean(d.isManager)
        const teamUnlocked = Boolean(d.teamUnlocked)
        const visible = PILOT_GROUPS.filter(g => (!g.managerOnly || isManager) && (!g.managerOnly || teamUnlocked))
        const allTasks = visible.flatMap(g => g.tasks)
        const total = allTasks.length
        if (completed.length >= total) return // finished \u2014 never nudge
        // never on a day they've already made progress
        if (d.lastCompletedAt) {
          const last = new Date(d.lastCompletedAt)
          const today = new Date()
          if (last.toDateString() === today.toDateString()) return
        }
        if (completed.length === 0) { setState({ mode: 'fresh' }); return }
        const next = allTasks.find(t => !completed.includes(t.key))
        setState({ mode: 'mid', done: completed.length, total, nextTask: next ? next.t : '' })
      })
      .catch(() => {})
    return () => { alive = false }
  }, [])

  if (state.mode === 'hidden') return null

  const dismiss = () => {
    try { localStorage.setItem(DISMISS_KEY, String(Date.now() + 24 * 3600 * 1000)) } catch { /* noop */ }
    setState({ mode: 'hidden' })
  }
  const openChecklist = () => {
    dismiss()
    document.getElementById('pilot-hq')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  const mid = state.mode === 'mid' ? state : null

  return (
    <div style={{ maxWidth: 1220, margin: '0 auto', padding: '20px 20px 0' }}>
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderLeft: '4px solid #1E7CFF', borderRadius: 12, boxShadow: '0 6px 22px rgba(15,23,42,.10)', padding: '15px 16px', display: 'flex', gap: 13, alignItems: 'flex-start', maxWidth: 430 }}>
        <div style={{ width: 34, height: 34, flex: '0 0 34px', borderRadius: 9, background: 'linear-gradient(135deg,#EFF6FF,#DBEAFE)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 17 }}>{mid ? '\u2728' : '\ud83d\udc4b'}</div>
        <div style={{ flex: 1 }}>
          <h4 style={{ margin: '0 0 3px', fontSize: 13.5, fontWeight: 750, color: 'var(--text)' }}>{mid ? `You're ${mid.done} of ${mid.total} through the pilot` : 'Ready when you are'}</h4>
          <p style={{ margin: 0, fontSize: 12.5, color: 'var(--text-secondary)', lineHeight: 1.45 }}>
            {mid
              ? `Nice start. Pick up where you left off whenever you have a few minutes${mid.nextTask ? ` \u2014 your next step: ${mid.nextTask}` : '.'}`
              : 'Your pilot checklist is waiting below. The first step takes about two minutes \u2014 just confirm your caseload looks right.'}
          </p>
          {mid ? (
            <div style={{ margin: '9px 0 2px', height: 6, background: '#EEF3F9', borderRadius: 3, overflow: 'hidden', width: '100%' }}>
              <i style={{ display: 'block', height: '100%', width: `${Math.round((mid.done / mid.total) * 100)}%`, background: 'linear-gradient(90deg,#1E7CFF,#22C55E)', borderRadius: 3 }} />
            </div>
          ) : null}
          <div style={{ display: 'flex', gap: 8, marginTop: 11 }}>
            <button onClick={openChecklist} style={{ fontSize: 12, fontWeight: 700, borderRadius: 8, padding: '6px 13px', cursor: 'pointer', border: 'none', background: 'linear-gradient(135deg,#1E7CFF,#1A6FEB)', color: '#fff' }}>{mid ? 'Open my checklist' : 'Start with step one'}</button>
            <button onClick={dismiss} style={{ fontSize: 12, fontWeight: 700, borderRadius: 8, padding: '6px 13px', cursor: 'pointer', background: 'transparent', color: 'var(--text-secondary)', border: '1px solid var(--border)' }}>{mid ? 'Later' : 'Not now'}</button>
          </div>
        </div>
        <button onClick={dismiss} aria-label="Dismiss" style={{ background: 'none', border: 'none', color: '#C4D2E6', cursor: 'pointer', fontSize: 16, lineHeight: 1, padding: '2px 4px' }}>{'\u00d7'}</button>
      </div>
    </div>
  )
}
