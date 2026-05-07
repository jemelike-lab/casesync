'use client'

import { useState, useEffect, useMemo } from 'react'
import Link from 'next/link'
import { 
  ArrowUpRight, Clock, Zap, MessageCircle, CalendarDays, 
  CheckCircle2, Flame, Sun,
  ChevronRight, ListTodo, Timer, 
  Briefcase, LogIn, LogOut, FileEdit, Bell
} from 'lucide-react'

interface Props {
  user: { name?: string | null; role?: string }
  stats: { taskCount: number; openTickets: number; weeklyHours: number }
  auditLogs: { id: string; action: string; createdAt: string }[]
  recentTasks: { id: string; title: string; priority: string; status: string }[]
  completedCount: number
  totalTaskCount: number
  todayShifts: { id: string; title?: string; startTime: string }[]
}

const PRIORITY_COLOR: Record<string, string> = {
  HIGH: '#ef4444', MEDIUM: '#f59e0b', LOW: '#10b981', URGENT: '#dc2626'
}

const TIPS = [
  "Stay hydrated — aim for 8 glasses of water today.",
  "Take a 5-minute stretch break every hour.",
  "Document your work as you go — future you will thank you.",
  "Reach out to a colleague today — connection matters.",
  "Review your PTO balance and plan time off proactively.",
  "Set 3 priorities for today and focus on those first.",
  "End your day by writing tomorrow's top task.",
]

const ACTION_META: Record<string, { icon: typeof Clock; color: string; label: string }> = {
  TIME_CLOCKED_IN:  { icon: LogIn,     color: '#34d399', label: 'Clocked In' },
  TIME_CLOCKED_OUT: { icon: LogOut,    color: '#f87171', label: 'Clocked Out' },
  TASK_UPDATED:     { icon: FileEdit,  color: '#60a5fa', label: 'Task Updated' },
  TASK_CREATED:     { icon: Zap,       color: '#a78bfa', label: 'Task Created' },
  TICKET_CREATED:   { icon: MessageCircle, color: '#fbbf24', label: 'Ticket Created' },
  TICKET_UPDATED:   { icon: Bell,      color: '#fb923c', label: 'Ticket Updated' },
}

function getActionMeta(action: string) {
  return ACTION_META[action] || { icon: Briefcase, color: '#64748b', label: action.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, c => c.toUpperCase()) }
}

function greet(name: string): string {
  const h = new Date().getHours()
  const prefix = h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'
  return `${prefix}, ${name}`
}

function LiveClock() {
  const [time, setTime] = useState(new Date())
  useEffect(() => {
    const t = setInterval(() => setTime(new Date()), 1000)
    return () => clearInterval(t)
  }, [])
  return (
    <div className="wd-live-clock">
      <span className="wd-clock-time">
        {time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
      </span>
      <span className="wd-clock-date">
        {time.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
      </span>
    </div>
  )
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

/* ── Mini SVG Progress Ring ── */
function ProgressRing({ percent, size = 52, stroke = 5 }: { percent: number; size?: number; stroke?: number }) {
  const r = (size - stroke) / 2
  const circ = 2 * Math.PI * r
  const offset = circ - (percent / 100) * circ
  return (
    <svg width={size} height={size} className="wd-progress-ring">
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={stroke} />
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="url(#ring-grad)" strokeWidth={stroke}
        strokeDasharray={circ} strokeDashoffset={offset} strokeLinecap="round"
        style={{ transition: 'stroke-dashoffset 1.2s cubic-bezier(0.34,1.56,0.64,1)', transform: 'rotate(-90deg)', transformOrigin: '50% 50%' }} />
      <defs>
        <linearGradient id="ring-grad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#2563eb" />
          <stop offset="100%" stopColor="#60a5fa" />
        </linearGradient>
      </defs>
    </svg>
  )
}

/* ── Stat card accent colors ── */
const STAT_ACCENTS = [
  'linear-gradient(90deg, #a78bfa, #7c3aed)',
  'linear-gradient(90deg, #fbbf24, #f59e0b)',
  'linear-gradient(90deg, #34d399, #059669)',
  'linear-gradient(90deg, #3b82f6, #2563eb)',
]

export default function DashboardClient({ user, stats, auditLogs, recentTasks, completedCount, totalTaskCount, todayShifts }: Props) {
  const productivity = totalTaskCount > 0 ? Math.round((completedCount / totalTaskCount) * 100) : 0
  const tip = TIPS[new Date().getDay() % TIPS.length]
  const streak = Math.min(completedCount, 30)

  const formattedShifts = todayShifts.map((shift) => ({
    id: shift.id,
    title: shift.title || 'Shift',
    time: new Date(shift.startTime).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }),
  }))

  const dayLabels = useMemo(() => {
    const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
    const today = new Date().getDay()
    const todayIdx = today === 0 ? 6 : today - 1
    return days.map((d, i) => ({ label: d, isToday: i === todayIdx }))
  }, [])

  return (
    <div className="wd">
      {/* Ambient background glow */}
      <div className="wd-ambient" aria-hidden="true" />

      {/* ═══ HERO SECTION ═══ */}
      <div className="wd-hero">
        <div className="wd-hero-left">
          <h1 className="wd-hero-greeting">{greet(user.name ?? 'there')}</h1>
          <p className="wd-hero-sub">Here&apos;s what&apos;s happening in your workspace today.</p>
        </div>
        <LiveClock />
      </div>

      {/* ═══ STAT CARDS ═══ */}
      <div className="wd-stats">
        <Link href="/w/tasks" className="wd-stat-card" style={{ '--accent': STAT_ACCENTS[0] } as React.CSSProperties}>
          <div className="wd-stat-icon" style={{ background: 'rgba(167,139,250,0.15)', color: '#a78bfa' }}>
            <ListTodo size={28} />
          </div>
          <div className="wd-stat-body">
            <span className="wd-stat-value">{stats.taskCount}</span>
            <span className="wd-stat-label">My Tasks</span>
          </div>
          <ArrowUpRight size={18} className="wd-stat-arrow" />
        </Link>

        <Link href="/w/tickets" className="wd-stat-card" style={{ '--accent': STAT_ACCENTS[1] } as React.CSSProperties}>
          <div className="wd-stat-icon" style={{ background: 'rgba(251,191,36,0.15)', color: '#fbbf24' }}>
            <MessageCircle size={28} />
          </div>
          <div className="wd-stat-body">
            <span className="wd-stat-value">{stats.openTickets}</span>
            <span className="wd-stat-label">Open Tickets</span>
          </div>
          <ArrowUpRight size={18} className="wd-stat-arrow" />
        </Link>

        <Link href="/w/time-clock" className="wd-stat-card" style={{ '--accent': STAT_ACCENTS[2] } as React.CSSProperties}>
          <div className="wd-stat-icon" style={{ background: 'rgba(52,211,153,0.15)', color: '#34d399' }}>
            <Timer size={28} />
          </div>
          <div className="wd-stat-body">
            <span className="wd-stat-value">{stats.weeklyHours}<span className="wd-stat-unit">h</span></span>
            <span className="wd-stat-label">Hours This Week</span>
          </div>
          <ArrowUpRight size={18} className="wd-stat-arrow" />
        </Link>

        <div className="wd-stat-card wd-stat-productivity" style={{ '--accent': STAT_ACCENTS[3] } as React.CSSProperties}>
          <div className="wd-stat-icon-ring">
            <ProgressRing percent={productivity} />
          </div>
          <div className="wd-stat-body">
            <span className="wd-stat-value">{productivity}<span className="wd-stat-unit">%</span></span>
            <span className="wd-stat-label">Productivity</span>
          </div>
        </div>
      </div>

      {/* ═══ MAIN GRID: 2 columns ═══ */}
      <div className="wd-grid">
        {/* LEFT COLUMN */}
        <div className="wd-col">
          <div className="wd-panel">
            <div className="wd-panel-header">
              <h2 className="wd-panel-title">
                <CalendarDays size={18} className="wd-panel-title-icon" />
                Today&apos;s Schedule
              </h2>
              <Link href="/w/schedule" className="wd-panel-link">View all <ChevronRight size={14} /></Link>
            </div>
            <div className="wd-panel-body">
              {formattedShifts.length === 0 ? (
                <div className="wd-empty-mini">
                  <CalendarDays size={36} />
                  <p>No shifts scheduled today</p>
                </div>
              ) : (
                <div className="wd-timeline">
                  {formattedShifts.map(shift => (
                    <div key={shift.id} className="wd-timeline-item">
                      <div className="wd-timeline-dot" />
                      <div className="wd-timeline-content">
                        <span className="wd-timeline-title">{shift.title}</span>
                        <span className="wd-timeline-time">{shift.time}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="wd-panel">
            <div className="wd-panel-header">
              <h2 className="wd-panel-title">
                <ListTodo size={18} className="wd-panel-title-icon" />
                Recent Tasks
              </h2>
              <Link href="/w/tasks" className="wd-panel-link">View all <ChevronRight size={14} /></Link>
            </div>
            <div className="wd-panel-body">
              {recentTasks.length === 0 ? (
                <div className="wd-empty-mini">
                  <Zap size={36} />
                  <p>No tasks yet — create one to get started</p>
                </div>
              ) : (
                <div className="wd-task-list">
                  {recentTasks.slice(0, 5).map(task => (
                    <Link key={task.id} href="/w/tasks" className="wd-task-row">
                      <span className="wd-task-priority" style={{ background: PRIORITY_COLOR[task.priority] || '#64748b' }} />
                      <span className="wd-task-title">{task.title}</span>
                      <span className={`wd-task-status wd-task-status-${task.status.toLowerCase()}`}>{task.status}</span>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="wd-panel wd-actions-panel">
            <div className="wd-panel-header">
              <h2 className="wd-panel-title">
                <Zap size={18} className="wd-panel-title-icon" />
                Quick Actions
              </h2>
            </div>
            <div className="wd-panel-body">
              <div className="wd-qa-grid">
                <Link href="/w/tasks?new=true" className="wd-qa-btn wd-qa-purple">
                  <Zap size={24} />
                  <span>New Task</span>
                </Link>
                <Link href="/w/tickets?new=true" className="wd-qa-btn wd-qa-amber">
                  <MessageCircle size={24} />
                  <span>Open Ticket</span>
                </Link>
                <Link href="/w/time-clock" className="wd-qa-btn wd-qa-green">
                  <Clock size={24} />
                  <span>Clock In</span>
                </Link>
                <Link href="/w/schedule" className="wd-qa-btn wd-qa-blue">
                  <CalendarDays size={24} />
                  <span>Schedule</span>
                </Link>
              </div>
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN */}
        <div className="wd-col">
          <div className="wd-panel wd-streak-panel">
            <div className="wd-streak-row">
              <div className="wd-streak-badge">
                <Flame size={28} />
                <span className="wd-streak-count">{streak}</span>
              </div>
              <div className="wd-streak-info">
                <span className="wd-streak-title">Task Streak</span>
                <span className="wd-streak-sub">{streak > 0 ? `${streak} tasks completed — keep it up!` : 'Complete tasks to build your streak'}</span>
              </div>
            </div>
            <div className="wd-tip">
              <Sun size={16} />
              <span>{tip}</span>
            </div>
          </div>

          <div className="wd-panel wd-week-panel">
            <div className="wd-panel-header">
              <h2 className="wd-panel-title">
                <Timer size={18} className="wd-panel-title-icon" />
                Week at a Glance
              </h2>
            </div>
            <div className="wd-panel-body">
              <div className="wd-week-chart">
                {dayLabels.map(({ label, isToday }) => {
                  const barPercent = isToday && stats.weeklyHours > 0 ? Math.min(stats.weeklyHours * 12.5, 100) : (isToday ? 8 : 0)
                  return (
                    <div key={label} className={`wd-week-bar-col ${isToday ? 'wd-week-today' : ''}`}>
                      <div className="wd-week-bar-track">
                        <div className="wd-week-bar-fill" style={{ height: `${barPercent}%` }} />
                      </div>
                      <span className="wd-week-bar-label">{label}</span>
                    </div>
                  )
                })}
              </div>
              <div className="wd-week-summary">
                <span className="wd-week-total">{stats.weeklyHours}h</span>
                <span className="wd-week-total-label">total this week</span>
              </div>
            </div>
          </div>

          <div className="wd-panel wd-activity-panel">
            <div className="wd-panel-header">
              <h2 className="wd-panel-title">
                <Clock size={18} className="wd-panel-title-icon" />
                Recent Activity
              </h2>
            </div>
            <div className="wd-panel-body">
              {auditLogs.length === 0 ? (
                <div className="wd-empty-mini">
                  <Clock size={36} />
                  <p>No recent activity</p>
                </div>
              ) : (
                <div className="wd-activity-list">
                  {auditLogs.slice(0, 8).map(log => {
                    const meta = getActionMeta(log.action)
                    const Icon = meta.icon
                    return (
                      <div key={log.id} className="wd-act-row">
                        <div className="wd-act-icon" style={{ background: `${meta.color}18`, color: meta.color }}>
                          <Icon size={14} />
                        </div>
                        <div className="wd-act-content">
                          <span className="wd-act-action">{meta.label}</span>
                          <span className="wd-act-time">{timeAgo(log.createdAt)}</span>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
