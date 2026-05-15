'use client'
import { useState, useEffect } from 'react'
import Link from 'next/link'
import {
  Award, Clock, CheckCircle2, AlertTriangle, Users, MapPin,
  ClipboardCheck, CalendarDays, ChevronDown, ChevronRight,
  Loader2, Zap, Send, ExternalLink, Sparkles, Eye, FileText,
} from 'lucide-react'
import { getInitials } from '@/lib/workryn/utils'

/* ── Types ── */
type StaffMember = {
  id: string; name: string | null; email: string | null
  jobTitle: string | null; avatarColor: string
  hireDate: string; daysEmployed: number; milestone: string
  status: string; stepsComplete: number; stepsTotal: number
  countyDone: boolean; countyData: { residenceCounty: string; preferredCounties: string; submittedAt: string } | null
  selfAssessmentDone: boolean; selfAssessment: { id: string; templateName: string; createdAt: string; answeredCount: number; totalQuestions: number } | null
  supervisorReviewDone: boolean; supervisorReview: { id: string; overallRating: number | null; createdAt: string } | null
  remindersCount: number; remindersPending: number
}

type Milestone = {
  key: string; label: string; dueBy: number; color: string
  staff: StaffMember[]
  completedCount: number; overdueCount: number; inProgressCount: number
}

type Summary = {
  totalStaff: number; completed: number; inProgress: number; overdue: number; notStarted: number
}

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string; icon: typeof CheckCircle2 }> = {
  COMPLETED: { label: 'Completed', color: '#10b981', bg: 'rgba(16,185,129,0.12)', icon: CheckCircle2 },
  IN_PROGRESS: { label: 'In Progress', color: '#3b82f6', bg: 'rgba(59,130,246,0.12)', icon: Clock },
  OVERDUE: { label: 'Overdue', color: '#ef4444', bg: 'rgba(239,68,68,0.12)', icon: AlertTriangle },
  NOT_STARTED: { label: 'Not Started', color: '#64748b', bg: 'rgba(100,116,139,0.12)', icon: Clock },
}

const CALENDLY_URL = 'https://calendly.com/sabbott-9/evaluations'

/* ── Avatar ── */
function Av({ name, color, size = 36 }: { name: string | null; color: string; size?: number }) {
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%', background: color,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: size < 30 ? '0.625rem' : '0.75rem', fontWeight: 700, color: '#fff', flexShrink: 0,
    }}>{getInitials(name || '?')}</div>
  )
}

/* ── Donut Ring (small) ── */
function MiniDonut({ percent, size = 40, color = '#3b82f6' }: { percent: number; size?: number; color?: string }) {
  const r = (size - 5) / 2
  const circ = 2 * Math.PI * r
  const offset = circ - (percent / 100) * circ
  return (
    <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={5} />
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={5}
        strokeDasharray={circ} strokeDashoffset={offset} strokeLinecap="round"
        style={{ transition: 'stroke-dashoffset 800ms ease' }} />
    </svg>
  )
}

/* ── Step Indicator ── */
function StepDot({ done, label, icon: Icon }: { done: boolean; label: string; icon: typeof CheckCircle2 }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <div style={{
        width: 22, height: 22, borderRadius: '50%',
        background: done ? 'rgba(16,185,129,0.2)' : 'rgba(255,255,255,0.05)',
        border: `1.5px solid ${done ? '#10b981' : 'rgba(255,255,255,0.1)'}`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        {done ? <CheckCircle2 size={12} style={{ color: '#10b981' }} /> : <Icon size={10} style={{ color: 'rgba(255,255,255,0.25)' }} />}
      </div>
      <span style={{ fontSize: '0.75rem', color: done ? '#10b981' : 'var(--text-muted)', fontWeight: done ? 600 : 400 }}>{label}</span>
    </div>
  )
}

/* ── Main Component ── */
export default function MilestoneDashboard() {
  const [milestones, setMilestones] = useState<Milestone[]>([])
  const [summary, setSummary] = useState<Summary>({ totalStaff: 0, completed: 0, inProgress: 0, overdue: 0, notStarted: 0 })
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [sending, setSending] = useState<string | null>(null)
  const [sentActions, setSentActions] = useState<Set<string>>(new Set())

  async function load() {
    setLoading(true)
    try {
      const res = await fetch('/api/workryn/evaluations/milestones')
      if (res.ok) {
        const data = await res.json()
        setMilestones(data.milestones ?? [])
        setSummary(data.summary ?? { totalStaff: 0, completed: 0, inProgress: 0, overdue: 0, notStarted: 0 })
        // Auto-expand milestones that have people
        const autoExpand = new Set<string>()
        for (const m of data.milestones ?? []) {
          if (m.staff.length > 0) autoExpand.add(m.key)
        }
        setExpanded(autoExpand)
      }
    } catch {}
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  function toggleExpand(key: string) {
    setExpanded(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key); else next.add(key)
      return next
    })
  }

  async function sendAction(userId: string, action: 'start' | 'remind' | 'nudge') {
    const key = userId + action
    setSending(key)
    try {
      await fetch('/api/workryn/evaluations/onboarding', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, action }),
      })
      setSentActions(prev => new Set(prev).add(key))
      await load()
    } catch {}
    setSending(null)
  }

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '60px 0', color: 'var(--text-muted)' }}>
        <Loader2 size={24} className="spin" style={{ marginRight: 10 }} /> Loading evaluation dashboard…
      </div>
    )
  }

  return (
    <div className="md-wrap">
      {/* ── Summary Cards ── */}
      <div className="md-summary-row">
        <div className="md-sum-card">
          <Users size={20} style={{ color: '#3b82f6' }} />
          <div className="md-sum-val">{summary.totalStaff}</div>
          <div className="md-sum-label">Support Planners</div>
        </div>
        <div className="md-sum-card">
          <CheckCircle2 size={20} style={{ color: '#10b981' }} />
          <div className="md-sum-val" style={{ color: '#10b981' }}>{summary.completed}</div>
          <div className="md-sum-label">Completed</div>
        </div>
        <div className="md-sum-card">
          <Clock size={20} style={{ color: '#f59e0b' }} />
          <div className="md-sum-val" style={{ color: '#f59e0b' }}>{summary.inProgress}</div>
          <div className="md-sum-label">In Progress</div>
        </div>
        <div className="md-sum-card">
          <AlertTriangle size={20} style={{ color: '#ef4444' }} />
          <div className="md-sum-val" style={{ color: '#ef4444' }}>{summary.overdue}</div>
          <div className="md-sum-label">Overdue</div>
        </div>
        <div className="md-sum-card">
          <Sparkles size={20} style={{ color: '#64748b' }} />
          <div className="md-sum-val" style={{ color: '#64748b' }}>{summary.notStarted}</div>
          <div className="md-sum-label">Not Started</div>
        </div>
      </div>

      {/* ── Quick Links ── */}
      <div className="md-links">
        <a href={CALENDLY_URL} target="_blank" rel="noopener noreferrer" className="md-link-chip">
          <CalendarDays size={14} /> Calendly — Sarah Abbott <ExternalLink size={10} />
        </a>
        <Link href="/w/county-preference" className="md-link-chip">
          <MapPin size={14} /> County Preference Form <ChevronRight size={10} />
        </Link>
      </div>

      {/* ── Milestone Sections ── */}
      {milestones.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '48px 20px', color: 'var(--text-muted)' }}>
          <Users size={40} style={{ opacity: 0.3, marginBottom: 12 }} />
          <div style={{ fontSize: '1rem', fontWeight: 600 }}>No active support planners</div>
          <div style={{ fontSize: '0.875rem', marginTop: 4 }}>Staff members will appear here once onboarded.</div>
        </div>
      ) : (
        milestones.map(m => {
          const isOpen = expanded.has(m.key)
          const totalInMilestone = m.staff.length
          const completePct = totalInMilestone > 0 ? Math.round((m.completedCount / totalInMilestone) * 100) : 0

          return (
            <div key={m.key} className="md-milestone">
              {/* Milestone Header */}
              <button type="button" className="md-ms-header" onClick={() => toggleExpand(m.key)}>
                <div className="md-ms-color-bar" style={{ background: m.color }} />
                <div className="md-ms-info">
                  <div className="md-ms-title">
                    <span className="md-ms-dot" style={{ background: m.color }} />
                    {m.label}
                  </div>
                  <div className="md-ms-meta">
                    {totalInMilestone} planner{totalInMilestone !== 1 ? 's' : ''}
                    {m.overdueCount > 0 && <span className="md-ms-overdue-badge">{m.overdueCount} overdue</span>}
                  </div>
                </div>

                <div className="md-ms-stats">
                  {m.completedCount > 0 && (
                    <span className="md-ms-stat-chip" style={{ color: '#10b981', background: 'rgba(16,185,129,0.1)' }}>
                      <CheckCircle2 size={12} /> {m.completedCount} done
                    </span>
                  )}
                  {m.inProgressCount > 0 && (
                    <span className="md-ms-stat-chip" style={{ color: '#3b82f6', background: 'rgba(59,130,246,0.1)' }}>
                      <Clock size={12} /> {m.inProgressCount} in progress
                    </span>
                  )}
                  {m.overdueCount > 0 && (
                    <span className="md-ms-stat-chip" style={{ color: '#ef4444', background: 'rgba(239,68,68,0.1)' }}>
                      <AlertTriangle size={12} /> {m.overdueCount} overdue
                    </span>
                  )}
                </div>

                <div className="md-ms-ring">
                  <MiniDonut percent={completePct} color={m.color} size={38} />
                  <span className="md-ms-ring-label">{completePct}%</span>
                </div>

                <ChevronDown size={18} style={{ color: 'var(--text-muted)', transition: 'transform 0.2s', transform: isOpen ? 'rotate(180deg)' : 'rotate(0)' }} />
              </button>

              {/* Staff Cards */}
              {isOpen && (
                <div className="md-ms-body">
                  {m.staff.map(person => {
                    const sc = STATUS_CONFIG[person.status] ?? STATUS_CONFIG.NOT_STARTED
                    const progressPct = Math.round((person.stepsComplete / person.stepsTotal) * 100)
                    const daysUntilDue = m.dueBy - person.daysEmployed
                    const isOverdue = daysUntilDue < 0

                    return (
                      <div key={person.id} className="md-person-card">
                        {/* Person header */}
                        <div className="md-person-top">
                          <Av name={person.name} color={person.avatarColor} size={40} />
                          <div className="md-person-info">
                            <div className="md-person-name">{person.name || person.email}</div>
                            <div className="md-person-meta">
                              Day {person.daysEmployed} · Hired {new Date(person.hireDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                            </div>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginLeft: 'auto' }}>
                            <span className="md-status-badge" style={{ color: sc.color, background: sc.bg }}>
                              <sc.icon size={12} /> {sc.label}
                            </span>
                            {isOverdue ? (
                              <span className="md-due-badge md-due-overdue">{Math.abs(daysUntilDue)}d overdue</span>
                            ) : (
                              <span className="md-due-badge">{daysUntilDue}d remaining</span>
                            )}
                          </div>
                        </div>

                        {/* Progress bar */}
                        <div className="md-progress-row">
                          <div className="md-progress-track">
                            <div className="md-progress-fill" style={{
                              width: `${progressPct}%`,
                              background: progressPct === 100
                                ? 'linear-gradient(90deg, #10b981, #34d399)'
                                : `linear-gradient(90deg, ${m.color}, ${m.color}aa)`,
                            }} />
                          </div>
                          <span className="md-progress-label">{person.stepsComplete}/{person.stepsTotal}</span>
                        </div>

                        {/* Steps checklist */}
                        <div className="md-steps-row">
                          <StepDot done={person.countyDone} label="County Preference" icon={MapPin} />
                          <StepDot done={person.selfAssessmentDone} label="Self-Assessment" icon={ClipboardCheck} />
                          <StepDot done={person.supervisorReviewDone} label="Supervisor Review" icon={Award} />
                        </div>

                        {/* Detail chips */}
                        <div className="md-detail-row">
                          {person.countyDone && person.countyData && (
                            <span className="md-detail-chip md-detail-green">
                              <MapPin size={11} /> {person.countyData.residenceCounty}
                            </span>
                          )}
                          {person.selfAssessmentDone && person.selfAssessment && (
                            <span className="md-detail-chip md-detail-blue">
                              <FileText size={11} /> {person.selfAssessment.answeredCount}/{person.selfAssessment.totalQuestions} answered
                            </span>
                          )}
                          {person.supervisorReviewDone && person.supervisorReview?.overallRating && (
                            <span className="md-detail-chip md-detail-purple">
                              <Award size={11} /> Rating: {person.supervisorReview.overallRating}/5
                            </span>
                          )}
                          {person.remindersCount > 0 && (
                            <span className="md-detail-chip md-detail-muted">
                              <Send size={11} /> {person.remindersCount} reminder{person.remindersCount !== 1 ? 's' : ''} sent
                            </span>
                          )}
                        </div>

                        {/* Actions */}
                        {person.status !== 'COMPLETED' && (
                          <div className="md-actions-row">
                            {person.remindersCount === 0 && (
                              <button
                                type="button" className="md-action-btn md-action-primary"
                                onClick={() => sendAction(person.id, 'start')}
                                disabled={sending === person.id + 'start'}
                              >
                                {sending === person.id + 'start' ? <Loader2 size={13} className="spin" /> : <Sparkles size={13} />}
                                Launch Workflow
                              </button>
                            )}
                            {person.remindersCount > 0 && (
                              <button
                                type="button" className="md-action-btn"
                                onClick={() => sendAction(person.id, 'remind')}
                                disabled={sending === person.id + 'remind'}
                              >
                                {sending === person.id + 'remind' ? <Loader2 size={13} className="spin" /> : <Send size={13} />}
                                Send Reminder
                              </button>
                            )}
                            {person.status === 'OVERDUE' && (
                              <button
                                type="button" className="md-action-btn md-action-danger"
                                onClick={() => sendAction(person.id, 'nudge')}
                                disabled={sending === person.id + 'nudge'}
                              >
                                {sending === person.id + 'nudge' ? <Loader2 size={13} className="spin" /> : <Zap size={13} />}
                                Urgent Nudge
                              </button>
                            )}
                            {person.selfAssessmentDone && !person.supervisorReviewDone && (
                              <span className="md-action-hint">
                                <Eye size={12} /> Ready for your review
                              </span>
                            )}
                            {sentActions.has(person.id + 'start') && <span className="md-sent-confirm"><CheckCircle2 size={12} /> Sent</span>}
                            {sentActions.has(person.id + 'remind') && <span className="md-sent-confirm"><CheckCircle2 size={12} /> Sent</span>}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })
      )}

      <style>{`
        .md-wrap { display: flex; flex-direction: column; gap: 20px; }

        /* ── Summary ── */
        .md-summary-row { display: grid; grid-template-columns: repeat(5, 1fr); gap: 12px; }
        @media (max-width: 900px) { .md-summary-row { grid-template-columns: repeat(3, 1fr); } }
        @media (max-width: 540px) { .md-summary-row { grid-template-columns: repeat(2, 1fr); } }
        .md-sum-card {
          display: flex; flex-direction: column; align-items: center; gap: 6px;
          padding: 18px 12px; background: var(--glass-bg); backdrop-filter: var(--glass-blur);
          border: 1px solid var(--border-subtle); border-radius: var(--radius-lg);
          transition: all 0.15s;
        }
        .md-sum-card:hover { border-color: var(--border-default); transform: translateY(-2px); }
        .md-sum-val { font-size: 1.75rem; font-weight: 800; color: var(--text-primary); line-height: 1; }
        .md-sum-label { font-size: 0.75rem; color: var(--text-muted); font-weight: 500; }

        /* ── Links ── */
        .md-links { display: flex; gap: 10px; flex-wrap: wrap; }
        .md-link-chip {
          display: inline-flex; align-items: center; gap: 6px;
          padding: 8px 16px; border-radius: 99px;
          background: var(--bg-elevated); border: 1px solid var(--border-subtle);
          color: var(--text-secondary); font-size: 0.8125rem; font-weight: 500;
          text-decoration: none; transition: all 0.15s; cursor: pointer;
        }
        .md-link-chip:hover { border-color: var(--brand); color: var(--brand-light); background: rgba(37,99,235,0.06); }

        /* ── Milestone Section ── */
        .md-milestone {
          background: var(--glass-bg); backdrop-filter: var(--glass-blur);
          border: 1px solid var(--border-subtle); border-radius: var(--radius-lg);
          overflow: hidden; transition: border-color 0.15s;
        }
        .md-milestone:hover { border-color: var(--border-default); }
        .md-ms-header {
          display: flex; align-items: center; gap: 14px; width: 100%;
          padding: 16px 20px; background: transparent; border: none;
          cursor: pointer; color: inherit; text-align: left; position: relative;
        }
        .md-ms-color-bar {
          position: absolute; left: 0; top: 0; bottom: 0; width: 4px;
        }
        .md-ms-info { flex: 1; min-width: 0; padding-left: 8px; }
        .md-ms-title {
          display: flex; align-items: center; gap: 8px;
          font-size: 1rem; font-weight: 700; color: var(--text-primary);
        }
        .md-ms-dot { width: 10px; height: 10px; border-radius: 3px; flex-shrink: 0; }
        .md-ms-meta { font-size: 0.8125rem; color: var(--text-muted); margin-top: 2px; display: flex; align-items: center; gap: 8px; }
        .md-ms-overdue-badge {
          display: inline-flex; align-items: center; padding: 2px 8px;
          border-radius: 99px; background: rgba(239,68,68,0.12);
          color: #ef4444; font-size: 0.6875rem; font-weight: 700;
        }
        .md-ms-stats { display: flex; gap: 6px; flex-wrap: wrap; }
        .md-ms-stat-chip {
          display: inline-flex; align-items: center; gap: 4px;
          padding: 3px 10px; border-radius: 99px;
          font-size: 0.6875rem; font-weight: 700;
        }
        .md-ms-ring { position: relative; width: 38px; height: 38px; flex-shrink: 0; }
        .md-ms-ring-label {
          position: absolute; inset: 0; display: flex; align-items: center; justify-content: center;
          font-size: 0.625rem; font-weight: 800; color: var(--text-muted);
        }

        /* ── Person Cards ── */
        .md-ms-body { padding: 0 16px 16px; display: flex; flex-direction: column; gap: 12px; }
        .md-person-card {
          padding: 16px 18px; background: var(--bg-surface);
          border: 1px solid var(--border-subtle); border-radius: var(--radius-md);
          display: flex; flex-direction: column; gap: 12px;
          transition: border-color 0.15s;
        }
        .md-person-card:hover { border-color: var(--border-default); }
        .md-person-top { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
        .md-person-info { min-width: 0; }
        .md-person-name { font-size: 0.9375rem; font-weight: 600; color: var(--text-primary); }
        .md-person-meta { font-size: 0.75rem; color: var(--text-muted); margin-top: 1px; }
        .md-status-badge {
          display: inline-flex; align-items: center; gap: 4px;
          padding: 3px 10px; border-radius: 99px; font-size: 0.6875rem; font-weight: 700;
          text-transform: uppercase; letter-spacing: 0.04em;
        }
        .md-due-badge {
          font-size: 0.6875rem; font-weight: 600; color: var(--text-muted);
          padding: 2px 8px; border-radius: 99px; background: rgba(255,255,255,0.04);
        }
        .md-due-overdue { color: #ef4444; background: rgba(239,68,68,0.08); }

        /* ── Progress ── */
        .md-progress-row { display: flex; align-items: center; gap: 10px; }
        .md-progress-track { flex: 1; height: 6px; border-radius: 3px; background: rgba(255,255,255,0.06); overflow: hidden; }
        .md-progress-fill { height: 100%; border-radius: 3px; transition: width 600ms ease; }
        .md-progress-label { font-size: 0.6875rem; font-weight: 700; color: var(--text-muted); white-space: nowrap; }

        /* ── Steps ── */
        .md-steps-row { display: flex; gap: 16px; flex-wrap: wrap; }

        /* ── Detail chips ── */
        .md-detail-row { display: flex; gap: 6px; flex-wrap: wrap; }
        .md-detail-chip {
          display: inline-flex; align-items: center; gap: 4px;
          padding: 3px 10px; border-radius: 6px; font-size: 0.6875rem; font-weight: 600;
        }
        .md-detail-green { background: rgba(16,185,129,0.1); color: #34d399; }
        .md-detail-blue { background: rgba(59,130,246,0.1); color: #60a5fa; }
        .md-detail-purple { background: rgba(139,92,246,0.1); color: #a78bfa; }
        .md-detail-muted { background: rgba(100,116,139,0.1); color: #94a3b8; }

        /* ── Actions ── */
        .md-actions-row {
          display: flex; align-items: center; gap: 8px; flex-wrap: wrap;
          padding-top: 4px; border-top: 1px solid var(--border-subtle);
        }
        .md-action-btn {
          display: inline-flex; align-items: center; gap: 5px;
          padding: 6px 14px; border-radius: 8px;
          font-size: 0.75rem; font-weight: 600; cursor: pointer;
          border: 1px solid var(--border-default); background: var(--bg-elevated);
          color: var(--text-secondary); transition: all 0.15s;
        }
        .md-action-btn:hover:not(:disabled) { background: var(--bg-hover); border-color: var(--brand); color: var(--brand-light); }
        .md-action-btn:disabled { opacity: 0.5; cursor: not-allowed; }
        .md-action-primary { background: rgba(37,99,235,0.12); border-color: rgba(37,99,235,0.3); color: #60a5fa; }
        .md-action-primary:hover:not(:disabled) { background: rgba(37,99,235,0.2); }
        .md-action-danger { background: rgba(239,68,68,0.1); border-color: rgba(239,68,68,0.3); color: #f87171; }
        .md-action-danger:hover:not(:disabled) { background: rgba(239,68,68,0.18); }
        .md-action-hint {
          display: inline-flex; align-items: center; gap: 5px;
          font-size: 0.75rem; font-weight: 600; color: #f59e0b;
          margin-left: auto;
        }
        .md-sent-confirm {
          display: inline-flex; align-items: center; gap: 4px;
          font-size: 0.75rem; font-weight: 600; color: #10b981;
        }

        @media (max-width: 700px) {
          .md-ms-stats { display: none; }
          .md-person-top { flex-direction: column; align-items: flex-start; }
          .md-steps-row { flex-direction: column; gap: 8px; }
        }
      `}</style>
    </div>
  )
}
