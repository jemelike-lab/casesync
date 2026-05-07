'use client'
import '@app/workryn.css'
import { useState, useEffect } from 'react'
import Link from 'next/link'
import { 
  ArrowUpRight, Clock, Zap, MessageCircle, CalendarDays, 
  CheckCircle2, Flame, Trophy, Sun, Moon, CloudSun,
  ChevronRight, ListTodo, Timer, Coffee
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

export default function DashboardClient({ user, stats, auditLogs, recentTasks, completedCount, totalTaskCount, todayShifts }: Props) {
  const productivity = totalTaskCount > 0 ? Math.round((completedCount / totalTaskCount) * 100) : 0
  const remainingTasks = totalTaskCount - completedCount
  const tip = TIPS[new Date().getDay() % TIPS.length]
  const streak = Math.min(completedCount, 30) // placeholder streak based on completed tasks

  const formattedShifts = todayShifts.map((shift, i) => ({
    id: shift.id,
    title: shift.title || 'Shift',
    time: new Date(shift.startTime).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }),
  }))

  return (
    <div className="wd">
      {/* ═══ HERO SECTION ═══ */}
      <div className="wd-hero">
        <div className="wd-hero-left">
          <h1 className="wd-hero-greeting">{greet(user.name ?? 'there')}</h1>
          <p className="wd-hero-sub">Here's what's happening in your workspace today.</p>
        </div>
        <LiveClock />
      </div>

      {/* ═══ STAT CARDS ═══ */}
      <div className="wd-stats">
        <Link href="/w/tasks" className="wd-stat-card">
          <div className="wd-stat-icon" style={{ background: 'rgba(167,139,250,0.12)', color: '#a78bfa' }}>
            <ListTodo size={22} />
          </div>
          <div className="wd-stat-body">
            <span className="wd-stat-value">{stats.taskCount}</span>
            <span className="wd-stat-label">My Tasks</span>
          </div>
          <ArrowUpRight size={16} className="wd-stat-arrow" />
        </Link>
        <Link href="/w/tickets" className="wd-stat-card">
          <div className="wd-stat-icon" style={{ background: 'rgba(251,191,36,0.12)', color: '#fbbf24' }}>
            <MessageCircle size={22} />
          </div>
          <div className="wd-stat-body">
            <span className="wd-stat-value">{stats.openTickets}</span>
            <span className="wd-stat-label">Open Tickets</span>
          </div>
          <ArrowUpRight size={16} className="wd-stat-arrow" />
        </Link>
        <Link href="/w/time-clock" className="wd-stat-card">
          <div className="wd-stat-icon" style={{ background: 'rgba(52,211,153,0.12)', color: '#34d399' }}>
            <Timer size={22} />
          </div>
          <div className="wd-stat-body">
            <span className="wd-stat-value">{stats.weeklyHours}<span className="wd-stat-unit">h</span></span>
            <span className="wd-stat-label">Hours This Week</span>
          </div>
          <ArrowUpRight size={16} className="wd-stat-arrow" />
        </Link>
        <div className="wd-stat-card wd-stat-productivity">
          <div className="wd-stat-icon" style={{ background: 'rgba(59,130,246,0.12)', color: '#3b82f6' }}>
            <CheckCircle2 size={22} />
          </div>
          <div className="wd-stat-body">
            <span className="wd-stat-value">{productivity}<span className="wd-stat-unit">%</span></span>
            <span className="wd-stat-label">Productivity</span>
          </div>
          <div className="wd-stat-progress">
            <div className="wd-stat-progress-fill" style={{ width: `${productivity}%` }} />
          </div>
        </div>
      </div>

      {/* ═══ MAIN GRID: 2 columns ═══ */}
      <div className="wd-grid">
        {/* LEFT COLUMN */}
        <div className="wd-col">
          {/* Today's Schedule */}
          <div className="wd-panel">
            <div className="wd-panel-header">
              <h2 className="wd-panel-title">Today's Schedule</h2>
              <Link href="/w/schedule" className="wd-panel-link">View all <ChevronRight size={14} /></Link>
            </div>
            <div className="wd-panel-body">
              {formattedShifts.length === 0 ? (
                <div className="wd-empty-mini">
                  <CalendarDays size={28} />
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

          {/* Recent Tasks */}
          <div className="wd-panel">
            <div className="wd-panel-header">
              <h2 className="wd-panel-title">Recent Tasks</h2>
              <Link href="/w/tasks" className="wd-panel-link">View all <ChevronRight size={14} /></Link>
            </div>
            <div className="wd-panel-body">
              {recentTasks.length === 0 ? (
                <div className="wd-empty-mini">
                  <Zap size={28} />
                  <p>No tasks yet</p>
                </div>
              ) : (
                <div className="wd-task-list">
                  {recentTasks.slice(0, 5).map(task => (
                    <Link key={task.id} href={`/w/tasks`} className="wd-task-row">
                      <span className="wd-task-priority" style={{ background: PRIORITY_COLOR[task.priority] || '#64748b' }} />
                      <span className="wd-task-title">{task.title}</span>
                      <span className={`wd-task-status wd-task-status-${task.status.toLowerCase()}`}>{task.status}</span>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN */}
        <div className="wd-col">
          {/* Streak + Tip */}
          <div className="wd-panel wd-streak-panel">
            <div className="wd-streak-row">
              <div className="wd-streak-badge">
                <Flame size={24} />
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

          {/* Activity Feed */}
          <div className="wd-panel wd-activity-panel">
            <div className="wd-panel-header">
              <h2 className="wd-panel-title">Recent Activity</h2>
            </div>
            <div className="wd-panel-body">
              {auditLogs.length === 0 ? (
                <div className="wd-empty-mini">
                  <Clock size={28} />
                  <p>No recent activity</p>
                </div>
              ) : (
                <div className="wd-activity-list">
                  {auditLogs.slice(0, 8).map(log => (
                    <div key={log.id} className="wd-act-row">
                      <div className="wd-act-dot" />
                      <div className="wd-act-content">
                        <span className="wd-act-action">{log.action}</span>
                        <span className="wd-act-time">{timeAgo(log.createdAt)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Quick Actions */}
          <div className="wd-panel wd-actions-panel">
            <div className="wd-panel-header">
              <h2 className="wd-panel-title">Quick Actions</h2>
            </div>
            <div className="wd-panel-body">
              <div className="wd-qa-grid">
                <Link href="/w/tasks?new=true" className="wd-qa-btn">
                  <Zap size={20} />
                  <span>New Task</span>
                </Link>
                <Link href="/w/tickets?new=true" className="wd-qa-btn">
                  <MessageCircle size={20} />
                  <span>Open Ticket</span>
                </Link>
                <Link href="/w/time-clock" className="wd-qa-btn">
                  <Clock size={20} />
                  <span>Clock In</span>
                </Link>
                <Link href="/w/schedule" className="wd-qa-btn">
                  <CalendarDays size={20} />
                  <span>Schedule</span>
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
