'use client'

// Pilot Scoreboard \u2014 \u201cTask Grid\u201d (Option B, approved 2026-07-16).
// Every pilot member \u00d7 every checklist task. Supervisor-like only (page gate);
// data via GET /api/pilot/checklist?all=1 (elevated RLS underneath).
// Progress % uses the 15 core tasks; the manager group renders as bonus
// columns (hatched until done) so SPs and the TM stay comparable.

import { useCallback, useEffect, useMemo, useState } from 'react'
import { PILOT_GROUPS } from '@/lib/pilot-tasks'
import { ComposeEmailModal, SchedulePilotEmailsModal } from '@/components/ComposeEmailModal'
import { getPilotDraft } from '@/lib/pilot-email-drafts'

interface Member {
  userId: string
  name: string | null
  role: string | null
  startedAt: string
  completed: string[]
  completedAt: Record<string, string>
  lastActive: string | null
  flags: number
}

const SHORT: Record<string, string> = {
  'verify.roster': 'Roster', 'verify.fields5': '5 fields', 'verify.dates5': '5 dates', 'verify.notes3': 'Notes',
  'live.contact': 'Log contact', 'live.deadline': 'Deadline', 'live.note': 'Add note', 'live.search10': 'Search',
  'live.calendar': 'Calendar', 'live.left_app': 'Left app?', 'casey.ask': 'Ask Casey', 'casey.briefing': 'Briefing',
  'tell.bug': 'File bug', 'tell.suggestion': 'Suggestion', 'tell.rls': 'See others?',
  'team.numbers': 'Numbers', 'team.drilldown': 'Drill-down', 'team.nocontact': 'No-contact', 'team.monday': 'Monday test', 'team.blindspots': 'Blind spots',
}

function initials(name: string) {
  return name.split(' ').map(x => x[0]).filter(Boolean).slice(0, 2).join('').toUpperCase()
}

function ago(iso: string | null, now: number): string {
  if (!iso) return 'not started'
  const m = Math.max(0, Math.round((now - new Date(iso).getTime()) / 60000))
  if (m < 60) return `${m}m ago`
  if (m < 60 * 24) return `${Math.round(m / 60)}h ago`
  return `${Math.round(m / 1440)}d ago`
}

export default function PilotScoreboardClient({ canSend = false }: { canSend?: boolean }) {
  const [members, setMembers] = useState<Member[]>([])
  const [composeOpen, setComposeOpen] = useState(false)
  const [composePrefill, setComposePrefill] = useState<{ toUserId?: string; toName?: string; subject?: string; body?: string } | undefined>(undefined)
  const [scheduleOpen, setScheduleOpen] = useState(false)
  const [now, setNow] = useState(Date.now())
  const [err, setErr] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/pilot/checklist?all=1')
      if (!res.ok) { setErr(`Feed unavailable (${res.status})`); return }
      const d = await res.json()
      setMembers(Array.isArray(d.members) ? d.members : [])
      setNow(Date.now())
      setErr(null)
    } catch { setErr('Feed unavailable') }
  }, [])

  useEffect(() => {
    load()
    const t = setInterval(load, 60_000)
    return () => clearInterval(t)
  }, [load])

  const groups = PILOT_GROUPS
  const coreKeys = useMemo(() => groups.filter(g => !g.managerOnly).flatMap(g => g.tasks.map(t => t.key)), [groups])
  const totals = useMemo(() => {
    const doneSet = members.reduce((n, m) => n + m.completed.length, 0)
    const activeToday = members.filter(m => m.lastActive && now - new Date(m.lastActive).getTime() < 86400000).length
    const flags = members.reduce((n, m) => n + m.flags, 0)
    return { doneSet, activeToday, flags }
  }, [members, now])

  return (
    <div style={{ maxWidth: 1220, margin: '0 auto', padding: 20 }}>
      <div style={{ background: 'linear-gradient(135deg, #1E7CFF 0%, #2D8BFF 50%, #1A6FEB 100%)', borderRadius: '16px 16px 0 0', padding: '18px 22px', color: '#fff', display: 'flex', alignItems: 'center', gap: 18 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 18, fontWeight: 800 }}>Pilot Scoreboard</h1>
          <p style={{ margin: '4px 0 0', fontSize: 12.5, opacity: 0.9 }}>{'Green = done. A column nobody fills is a task nobody understands \u2014 that\u2019s product feedback too.'}</p>
        </div>
        {canSend ? (
          <div style={{ marginLeft: 18, display: 'flex', gap: 8 }}>
            <button onClick={() => { setComposePrefill(undefined); setComposeOpen(true) }} style={{ fontSize: 12, fontWeight: 600, color: '#fff', background: 'rgba(255,255,255,0.16)', border: '1px solid rgba(255,255,255,0.35)', borderRadius: 8, padding: '6px 12px', cursor: 'pointer' }}>{'\u2709'} Compose</button>
            <button onClick={() => setScheduleOpen(true)} style={{ fontSize: 12, fontWeight: 600, color: '#1E7CFF', background: '#fff', border: 'none', borderRadius: 8, padding: '6px 12px', cursor: 'pointer' }}>{'\ud83d\udcc5'} Schedule pilot emails</button>
          </div>
        ) : null}
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 22, textAlign: 'center' }}>
          <div><div style={{ fontSize: 24, fontWeight: 800, lineHeight: 1 }}>{members.length}</div><div style={{ fontSize: 10.5, opacity: 0.85, textTransform: 'uppercase', letterSpacing: '.05em', marginTop: 3 }}>In pilot</div></div>
          <div><div style={{ fontSize: 24, fontWeight: 800, lineHeight: 1 }}>{totals.activeToday}</div><div style={{ fontSize: 10.5, opacity: 0.85, textTransform: 'uppercase', letterSpacing: '.05em', marginTop: 3 }}>Active today</div></div>
          <div><div style={{ fontSize: 24, fontWeight: 800, lineHeight: 1 }}>{totals.doneSet}</div><div style={{ fontSize: 10.5, opacity: 0.85, textTransform: 'uppercase', letterSpacing: '.05em', marginTop: 3 }}>Tasks done</div></div>
          <div><div style={{ fontSize: 24, fontWeight: 800, lineHeight: 1 }}>{totals.flags}</div><div style={{ fontSize: 10.5, opacity: 0.85, textTransform: 'uppercase', letterSpacing: '.05em', marginTop: 3 }}>Flags filed</div></div>
        </div>
      </div>

      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderTop: 'none', borderRadius: '0 0 16px 16px', overflow: 'auto' }}>
        {err ? <div style={{ padding: 24, fontSize: 13, color: 'var(--text-secondary)' }}>{err}</div> : (
          <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 980 }}>
            <thead>
              <tr>
                <th rowSpan={2} style={{ textAlign: 'left', paddingLeft: 22, width: 210, background: '#F8FAFD', borderBottom: '2px solid var(--border)', fontSize: 10, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '.03em' }}>Member</th>
                <th rowSpan={2} style={{ width: 84, background: '#F8FAFD', borderBottom: '2px solid var(--border)', fontSize: 10, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '.03em' }}>Progress</th>
                {groups.map(g => (
                  <th key={g.name} colSpan={g.tasks.length} style={{ background: '#EEF3F9', fontSize: 9.5, color: '#475569', fontWeight: 800, letterSpacing: '.04em', padding: 5, borderBottom: '1px solid var(--border)', textTransform: 'uppercase' }}>{g.name}</th>
                ))}
              </tr>
              <tr>
                {groups.flatMap(g => g.tasks.map(t => (
                  <th key={t.key} title={t.t} style={{ background: '#F8FAFD', borderBottom: '2px solid var(--border)', padding: '10px 4px', height: 92, verticalAlign: 'bottom' }}>
                    <div style={{ writingMode: 'vertical-rl', transform: 'rotate(195deg)', whiteSpace: 'nowrap', margin: '0 auto', maxHeight: 78, overflow: 'hidden', fontSize: 10, fontWeight: 700, color: 'var(--text-secondary)' }}>{SHORT[t.key] ?? t.key}</div>
                  </th>
                )))}
              </tr>
            </thead>
            <tbody>
              {members.map(m => {
                const isTm = m.role === 'team_manager'
                const doneCore = m.completed.filter(k => coreKeys.includes(k)).length
                const pct = Math.round((doneCore / coreKeys.length) * 100)
                const days = Math.max(1, Math.floor((now - new Date(m.startedAt).getTime()) / 86400000) + 1)
                return (
                  <tr key={m.userId}>
                    <td style={{ textAlign: 'left', paddingLeft: 22, borderBottom: '1px solid #F1F5FA', height: 52 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'linear-gradient(135deg,#1E7CFF,#7C3AED)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 12, flex: '0 0 32px' }}>{initials(m.name ?? '?')}</div>
                        <div>
                          <div style={{ fontSize: 13, fontWeight: 750, color: 'var(--text)' }}>{m.name}{m.flags > 0 ? <span style={{ fontSize: 10.5, color: '#B45309', background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: 6, padding: '1px 6px', marginLeft: 7 }}>{'\u2691'} {m.flags}</span> : null}</div>
                          <div style={{ fontSize: 10.5, color: 'var(--text-secondary)' }}>Day {days} {'\u00b7'} {ago(m.lastActive, now)}</div>
                        </div>
                        {canSend ? (
                          <button
                            title={`Email ${m.name ?? ''}`}
                            onClick={() => {
                              const d = getPilotDraft(m.userId)
                              setComposePrefill({ toUserId: m.userId, toName: m.name ?? m.userId, subject: d?.subject ?? '', body: d?.body ?? '' })
                              setComposeOpen(true)
                            }}
                            style={{ marginLeft: 'auto', marginRight: 10, fontSize: 14, color: '#1E7CFF', background: '#EEF3F9', border: '1px solid var(--border)', borderRadius: 6, width: 28, height: 28, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flex: '0 0 28px' }}
                          >{'\u2709'}</button>
                        ) : null}
                      </div>
                    </td>
                    <td style={{ borderBottom: '1px solid #F1F5FA', textAlign: 'center' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
                        <span style={{ fontSize: 15, fontWeight: 800, color: 'var(--text)' }}>{pct}%</span>
                        <span style={{ width: 52, height: 5, background: '#EEF3F9', borderRadius: 3, overflow: 'hidden', display: 'block' }}><i style={{ display: 'block', height: '100%', width: `${pct}%`, background: 'linear-gradient(90deg,#1E7CFF,#22C55E)' }} /></span>
                      </div>
                    </td>
                    {groups.flatMap(g => g.tasks.map(t => {
                      const done = m.completed.includes(t.key)
                      const na = Boolean(g.managerOnly && !isTm)
                      const at = m.completedAt?.[t.key]
                      return (
                        <td key={t.key} style={{ borderBottom: '1px solid #F1F5FA' }}>
                          <div title={na ? 'Manager-only task' : (done && at ? `${t.t}\nDone ${new Date(at).toLocaleString()}` : t.t)}
                            style={{ width: 26, height: 26, borderRadius: 6, margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 900, color: '#fff',
                              background: done ? 'linear-gradient(135deg,#22C55E,#16A34A)' : na ? 'repeating-linear-gradient(45deg,#F1F5FA,#F1F5FA 4px,#E8EEF6 4px,#E8EEF6 8px)' : '#EEF3F9',
                              border: done || na ? 'none' : '1px solid var(--border)' }}>
                            {done ? '\u2713' : ''}
                          </div>
                        </td>
                      )
                    }))}
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
      {canSend ? (
        <>
          <ComposeEmailModal open={composeOpen} onClose={() => setComposeOpen(false)} prefill={composePrefill} />
          <SchedulePilotEmailsModal open={scheduleOpen} onClose={() => setScheduleOpen(false)} memberIds={members.map(m => m.userId)} />
        </>
      ) : null}
      <p style={{ fontSize: 11, color: 'var(--text-secondary)', margin: '10px 4px 0' }}>{'Progress % counts the 15 core tasks. Mariama\u2019s team-manager tasks appear as extra columns and unlock when her planners are added.'}</p>
    </div>
  )
}
