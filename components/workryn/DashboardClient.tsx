'use client'
import { ListChecks, MessageCircle, Timer, TrendingUp, ArrowUpRight, CheckCircle2, Clock, Bell, Zap, CalendarDays } from 'lucide-react'
import { timeAgo, getInitials } from '@/lib/workryn/utils'
import Link from 'next/link'

interface Props {
  user: { name?: string | null; email?: string | null; id?: string; role?: string; avatarColor?: string; departmentName?: string | null }
  stats: { taskCount: number; openTickets: number; weeklyHours: number }
  auditLogs: Array<{ id: string; action: string; resourceType: string; details: string | null; createdAt: string; user: { name: string | null; avatarColor: string } }>
  recentTasks: Array<{ id: string; title: string; priority: string; status: string; dueDate: string | null }>
}

function greet(name: string) {
  const h = new Date().getHours()
  const prefix = h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'
  return `${prefix}, ${name.split(' ')[0]}`
}

function DonutChart({ completed, total }: { completed: number; total: number }) {
  const percent = total > 0 ? Math.round((completed / total) * 100) : 0
  const r = 36
  const circ = 2 * Math.PI * r
  const offset = circ * (1 - percent / 100)
  return (
    <div className="wd-donut-wrap">
      <svg viewBox="0 0 100 100" className="wd-donut-svg">
        <defs>
          <linearGradient id="donutGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#10b981" />
            <stop offset="100%" stopColor="#a855f7" />
          </linearGradient>
        </defs>
        <circle cx="50" cy="50" r={r} fill="none" stroke="rgba(148,163,184,0.12)" strokeWidth="8" />
        <circle cx="50" cy="50" r={r} fill="none" stroke="url(#donutGrad)" strokeWidth="8"
          strokeDasharray={circ} strokeDashoffset={offset}
          strokeLinecap="round" transform="rotate(-90 50 50)" />
      </svg>
      <div className="wd-donut-center">
        <span className="wd-donut-pct">{percent}%</span>
        <span className="wd-donut-lbl">Complete</span>
      </div>
    </div>
  )
}

const PRIORITY_COLOR: Record<string, string> = {
  HIGH: '#ef4444', MEDIUM: '#f59e0b', LOW: '#10b981', URGENT: '#dc2626'
}

export default function DashboardClient({ user, stats, auditLogs, recentTasks }: Props) {
  const completedTasks = recentTasks.filter(t => t.status === 'COMPLETED' || t.status === 'DONE').length
  const totalTasks = recentTasks.length || 1
  const productivity = Math.round((completedTasks / totalTasks) * 100)

  const upcomingShifts = [
    { id: '1', title: 'Morning Shift',  time: '9:00 AM',  color: '#10b981' },
    { id: '2', title: 'Team Meeting',   time: '2:00 PM',  color: '#3b82f6' },
    { id: '3', title: 'Client Call',    time: '4:30 PM',  color: '#8b5cf6' },
  ]

  return (
    <div className="wd">
      {/* ── Header ── */}
      <header className="wd-header">
        <div className="wd-header-left">
          <img
            src="/logo.png" alt="BLH"
            className="wd-logo"
          />
          <div>
            <h1 className="wd-greeting">{greet(user.name ?? 'there')}</h1>
            <p className="wd-subtitle">Here's what's happening in your workspace today.</p>
          </div>
        </div>
      </header>

      {/* ── Stat Cards ── */}
      <div className="wd-stats">
        <Link href="/w/tasks" className="wd-stat-card">
          <div className="wd-stat-icon" style={{ background: 'rgba(167,139,250,0.12)', color: '#a78bfa' }}>
            <ListChecks size={20} strokeWidth={1.8} />
          </div>
          <div className="wd-stat-body">
            <span className="wd-stat-value">{stats.taskCount}</span>
            <span className="wd-stat-label">My Tasks</span>
          </div>
          <ArrowUpRight size={15} className="wd-stat-arrow-icon" />
        </Link>

        <Link href="/w/tickets" className="wd-stat-card">
          <div className="wd-stat-icon" style={{ background: 'rgba(251,191,36,0.12)', color: '#fbbf24' }}>
            <MessageCircle size={20} strokeWidth={1.8} />
          </div>
          <div className="wd-stat-body">
            <span className="wd-stat-value">{stats.openTickets}</span>
            <span className="wd-stat-label">Open Tickets</span>
          </div>
          <ArrowUpRight size={15} className="wd-stat-arrow-icon" />
        </Link>

        <Link href="/w/time-clock" className="wd-stat-card">
          <div className="wd-stat-icon" style={{ background: 'rgba(52,211,153,0.12)', color: '#34d399' }}>
            <Timer size={20} strokeWidth={1.8} />
          </div>
          <div className="wd-stat-body">
            <span className="wd-stat-value">{stats.weeklyHours}<span className="wd-stat-unit">h</span></span>
            <span className="wd-stat-label">Hours This Week</span>
          </div>
          <ArrowUpRight size={15} className="wd-stat-arrow-icon" />
        </Link>

        <Link href="/w/schedule" className="wd-stat-card">
          <div className="wd-stat-icon" style={{ background: 'rgba(59,130,246,0.12)', color: '#3b82f6' }}>
            <TrendingUp size={20} strokeWidth={1.8} />
          </div>
          <div className="wd-stat-body">
            <span className="wd-stat-value">{productivity}<span className="wd-stat-unit">%</span></span>
            <span className="wd-stat-label">Productivity</span>
          </div>
          <ArrowUpRight size={15} className="wd-stat-arrow-icon" />
        </Link>
      </div>

      {/* ── Main Grid ── */}
      <div className="wd-grid">

        {/* Task Progress */}
        <div className="wd-panel">
          <div className="wd-panel-header">
            <h2 className="wd-panel-title">Task Progress</h2>
          </div>
          <div className="wd-panel-body wd-chart-body">
            <DonutChart completed={completedTasks} total={totalTasks} />
            <div className="wd-chart-legend">
              <div className="wd-chart-leg-item">
                <span className="wd-chart-leg-dot" style={{ background: '#10b981' }} />
                <div>
                  <span className="wd-chart-leg-val">{completedTasks}</span>
                  <span className="wd-chart-leg-lbl">Completed</span>
                </div>
              </div>
              <div className="wd-chart-leg-item">
                <span className="wd-chart-leg-dot" style={{ background: '#a855f7' }} />
                <div>
                  <span className="wd-chart-leg-val">{totalTasks - completedTasks}</span>
                  <span className="wd-chart-leg-lbl">Remaining</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Today's Schedule */}
        <div className="wd-panel">
          <div className="wd-panel-header">
            <h2 className="wd-panel-title">Today's Schedule</h2>
            <Link href="/w/schedule" className="wd-panel-link">View schedule</Link>
          </div>
          <div className="wd-panel-body">
            <div className="wd-timeline">
              {upcomingShifts.map(shift => (
                <div key={shift.id} className="wd-tl-row">
                  <div className="wd-tl-dot" style={{ background: shift.color }} />
                  <div className="wd-tl-line" />
                  <div className="wd-tl-content">
                    <span className="wd-tl-title">{shift.title}</span>
                    <span className="wd-tl-time"><Clock size={11} />{shift.time}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Recent Tasks */}
        <div className="wd-panel">
          <div className="wd-panel-header">
            <h2 className="wd-panel-title">Recent Tasks</h2>
            <Link href="/w/tasks" className="wd-panel-link">View all</Link>
          </div>
          <div className="wd-panel-body">
            {recentTasks.length === 0 ? (
              <div className="wd-empty-state">
                <ListChecks size={24} />
                <p>No tasks yet</p>
                <span>Tasks assigned to you will appear here.</span>
              </div>
            ) : recentTasks.slice(0, 5).map(task => (
              <div key={task.id} className="wd-task-row">
                <div className="wd-task-check">
                  {task.status === 'COMPLETED' || task.status === 'DONE'
                    ? <CheckCircle2 size={16} style={{ color: '#10b981' }} />
                    : <div className="wd-task-circle" />}
                </div>
                <div className="wd-task-info">
                  <span className={`wd-task-name${task.status === 'COMPLETED' || task.status === 'DONE' ? ' wd-task-done' : ''}`}>
                    {task.title}
                  </span>
                  <div className="wd-task-meta">
                    <span className="wd-priority-chip" style={{ color: PRIORITY_COLOR[task.priority] ?? '#64748b', background: (PRIORITY_COLOR[task.priority] ?? '#64748b') + '18' }}>
                      {task.priority.charAt(0) + task.priority.slice(1).toLowerCase()}
                    </span>
                    {task.dueDate && (
                      <span className="wd-task-due">Due {new Date(task.dueDate).toLocaleDateString([], { month: 'short', day: 'numeric' })}</span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Recent Activity */}
        <div className="wd-panel">
          <div className="wd-panel-header">
            <h2 className="wd-panel-title">Recent Activity</h2>
          </div>
          <div className="wd-panel-body">
            {auditLogs.length === 0 ? (
              <div className="wd-empty-state">
                <Bell size={24} />
                <p>No activity yet</p>
                <span>Team actions will appear here.</span>
              </div>
            ) : auditLogs.slice(0, 6).map(log => (
              <div key={log.id} className="wd-activity-row">
                <div className="wd-act-avatar" style={{ background: log.user.avatarColor }}>
                  {getInitials(log.user.name || '?')}
                </div>
                <div className="wd-act-body">
                  <p className="wd-act-text">
                    <strong>{log.user.name || 'Someone'}</strong>
                    {' '}{log.action.replace(/_/g, ' ').toLowerCase()}{' '}
                    <span className="wd-act-resource">{log.resourceType.toLowerCase()}</span>
                  </p>
                  <span className="wd-act-time">{timeAgo(log.createdAt)}</span>
                </div>
              </div>
            ))}
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
                <Zap size={18} />
                <span>New Task</span>
              </Link>
              <Link href="/w/tickets?new=true" className="wd-qa-btn">
                <MessageCircle size={18} />
                <span>Open Ticket</span>
              </Link>
              <Link href="/w/time-clock" className="wd-qa-btn">
                <Clock size={18} />
                <span>Clock In</span>
              </Link>
              <Link href="/w/schedule" className="wd-qa-btn">
                <CalendarDays size={18} />
                <span>Schedule</span>
              </Link>
            </div>
          </div>
        </div>

      </div>
    </div>
  )
}
