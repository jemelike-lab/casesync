'use client'
import { ListChecks, MessageCircle, Timer, TrendingUp, ArrowUpRight, CheckCircle2, Clock, Bell, Zap } from 'lucide-react'
import { timeAgo, getPriorityColor, getInitials } from '@/lib/workryn/utils'
import Link from 'next/link'

interface Props {
  user: { name?: string | null; role: string; avatarColor: string; departmentName: string }
  stats: { taskCount: number; openTickets: number; weeklyHours: number }
  auditLogs: Array<{
    id: string; action: string; resourceType: string; details: string | null; createdAt: string
    user: { name: string | null; avatarColor: string }
  }>
  recentTasks: Array<{
    id: string; title: string; priority: string; status: string; dueDate: string | null
  }>
}

function greet(name: string) {
  const h = new Date().getHours()
  const prefix = h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'
  return `${prefix}, ${name.split(' ')[0]}`
}

// Donut chart component
function DonutChart({ completed, total }: { completed: number; total: number }) {
  const percent = total > 0 ? Math.round((completed / total) * 100) : 0
  const circumference = 2 * Math.PI * 36
  const offset = circumference * (1 - percent / 100)
  
  return (
    <div className="wd-donut-wrap">
      <svg viewBox="0 0 100 100" className="wd-donut-svg">
        <circle cx="50" cy="50" r="36" fill="none" stroke="rgba(148,163,184,0.1)" strokeWidth="8" />
        <circle cx="50" cy="50" r="36" fill="none" 
          stroke="url(#donutGradient)" strokeWidth="8"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          transform="rotate(-90 50 50)"
          className="wd-donut-progress"
        />
        <defs>
          <linearGradient id="donutGradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#10b981" />
            <stop offset="100%" stopColor="#a855f7" />
          </linearGradient>
        </defs>
      </svg>
      <div className="wd-donut-label">
        <span className="wd-donut-percent">{percent}%</span>
        <span className="wd-donut-text">Complete</span>
      </div>
    </div>
  )
}

export default function DashboardClient({ user, stats, auditLogs, recentTasks }: Props) {
  // Calculate completion %
  const completedTasks = recentTasks.filter(t => t.status === 'COMPLETED').length
  const totalTasks = recentTasks.length || 1

  // Mock upcoming shifts for timeline (in production, fetch from API)
  const upcomingShifts = [
    { id: '1', title: 'Morning Shift', time: '9:00 AM', color: '#10b981' },
    { id: '2', title: 'Team Meeting', time: '2:00 PM', color: '#3b82f6' },
    { id: '3', title: 'Client Call', time: '4:30 PM', color: '#8b5cf6' },
  ]

  return (
    <div className="wd">
      {/* Header */}
      <header className="wd-header">
        <div>
          <h1 className="wd-greeting">{greet(user.name ?? 'there')}</h1>
          <p className="wd-subtitle">Here's what's happening today</p>
        </div>
      </header>

      {/* Stat Cards with Glassmorphism */}
      <div className="wd-stats">
        <Link href="/w/tasks" className="wd-stat-card" style={{ '--accent': '#a78bfa' } as React.CSSProperties}>
          <div className="wd-stat-icon" style={{ background: 'rgba(167,139,250,0.12)', color: '#a78bfa' }}>
            <ListChecks size={20} strokeWidth={1.8} />
          </div>
          <div className="wd-stat-body">
            <span className="wd-stat-value">{stats.taskCount}</span>
            <span className="wd-stat-label">My Tasks</span>
          </div>
          <ArrowUpRight size={16} className="wd-stat-arrow" />
        </Link>

        <Link href="/w/tickets" className="wd-stat-card" style={{ '--accent': '#fbbf24' } as React.CSSProperties}>
          <div className="wd-stat-icon" style={{ background: 'rgba(251,191,36,0.12)', color: '#fbbf24' }}>
            <MessageCircle size={20} strokeWidth={1.8} />
          </div>
          <div className="wd-stat-body">
            <span className="wd-stat-value">{stats.openTickets}</span>
            <span className="wd-stat-label">Open Tickets</span>
          </div>
          <ArrowUpRight size={16} className="wd-stat-arrow" />
        </Link>

        <Link href="/w/time-clock" className="wd-stat-card" style={{ '--accent': '#34d399' } as React.CSSProperties}>
          <div className="wd-stat-icon" style={{ background: 'rgba(52,211,153,0.12)', color: '#34d399' }}>
            <Timer size={20} strokeWidth={1.8} />
          </div>
          <div className="wd-stat-body">
            <span className="wd-stat-value">{stats.weeklyHours}</span>
            <span className="wd-stat-label">Hours This Week</span>
          </div>
          <ArrowUpRight size={16} className="wd-stat-arrow" />
        </Link>

        <Link href="/w/schedule" className="wd-stat-card" style={{ '--accent': '#3b82f6' } as React.CSSProperties}>
          <div className="wd-stat-icon" style={{ background: 'rgba(59,130,246,0.12)', color: '#3b82f6' }}>
            <TrendingUp size={20} strokeWidth={1.8} />
          </div>
          <div className="wd-stat-body">
            <span className="wd-stat-value">{Math.round((completedTasks / totalTasks) * 100)}%</span>
            <span className="wd-stat-label">Productivity</span>
          </div>
          <ArrowUpRight size={16} className="wd-stat-arrow" />
        </Link>
      </div>

      {/* Content Grid */}
      <div className="wd-grid">
        {/* Task Completion Chart */}
        <div className="wd-panel wd-chart-panel">
          <div className="wd-panel-header">
            <h2 className="wd-panel-title">Task Progress</h2>
          </div>
          <div className="wd-chart-content">
            <DonutChart completed={completedTasks} total={totalTasks} />
            <div className="wd-chart-stats">
              <div className="wd-chart-stat">
                <span className="wd-chart-stat-val">{completedTasks}</span>
                <span className="wd-chart-stat-lbl">Completed</span>
              </div>
              <div className="wd-chart-stat">
                <span className="wd-chart-stat-val">{totalTasks - completedTasks}</span>
                <span className="wd-chart-stat-lbl">Remaining</span>
              </div>
            </div>
          </div>
        </div>

        {/* Timeline */}
        <div className="wd-panel wd-timeline-panel">
          <div className="wd-panel-header">
            <h2 className="wd-panel-title">Today's Schedule</h2>
          </div>
          <div className="wd-timeline">
            {upcomingShifts.map((shift, i) => (
              <div key={shift.id} className="wd-timeline-item">
                <div className="wd-timeline-marker" style={{ background: shift.color }} />
                <div className="wd-timeline-content">
                  <span className="wd-timeline-title">{shift.title}</span>
                  <span className="wd-timeline-time">
                    <Clock size={12} /> {shift.time}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Recent Tasks */}
        <div className="wd-panel wd-tasks-panel">
          <div className="wd-panel-header">
            <h2 className="wd-panel-title">Recent Tasks</h2>
            <Link href="/w/tasks" className="wd-panel-link">View all</Link>
          </div>
          <div className="wd-tasks-list">
            {recentTasks.length === 0 ? (
              <div className="wd-empty">No recent tasks</div>
            ) : (
              recentTasks.slice(0, 5).map(task => (
                <div key={task.id} className="wd-task-item">
                  <div className="wd-task-check">
                    {task.status === 'COMPLETED' ? (
                      <CheckCircle2 size={16} className="wd-task-check-done" />
                    ) : (
                      <div className="wd-task-check-empty" />
                    )}
                  </div>
                  <div className="wd-task-body">
                    <span className={`wd-task-title${task.status === 'COMPLETED' ? ' wd-task-done' : ''}`}>
                      {task.title}
                    </span>
                    <span className="wd-task-meta">
                      <span className={`wd-task-priority wd-priority-${task.priority.toLowerCase()}`}>
                        {task.priority}
                      </span>
                      {task.dueDate && (
                        <span className="wd-task-due">Due {new Date(task.dueDate).toLocaleDateString()}</span>
                      )}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Activity Feed */}
        <div className="wd-panel wd-activity-panel">
          <div className="wd-panel-header">
            <h2 className="wd-panel-title">Recent Activity</h2>
          </div>
          <div className="wd-activity-list">
            {auditLogs.length === 0 ? (
              <div className="wd-empty">No recent activity</div>
            ) : (
              auditLogs.slice(0, 6).map(log => (
                <div key={log.id} className="wd-activity-item">
                  <div className="wd-activity-avatar" style={{ background: log.user.avatarColor }}>
                    {getInitials(log.user.name || '?')}
                  </div>
                  <div className="wd-activity-content">
                    <span className="wd-activity-text">
                      <strong>{log.user.name || 'Someone'}</strong> {log.action.toLowerCase()} {log.resourceType.toLowerCase()}
                    </span>
                    <span className="wd-activity-time">{timeAgo(log.createdAt)}</span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Quick Actions */}
        <div className="wd-panel wd-actions-panel">
          <div className="wd-panel-header">
            <h2 className="wd-panel-title">Quick Actions</h2>
          </div>
          <div className="wd-actions-grid">
            <Link href="/w/tasks?new=true" className="wd-action-btn">
              <Zap size={16} />
              <span>New Task</span>
            </Link>
            <Link href="/w/tickets?new=true" className="wd-action-btn">
              <MessageCircle size={16} />
              <span>Open Ticket</span>
            </Link>
            <Link href="/w/time-clock" className="wd-action-btn">
              <Clock size={16} />
              <span>Clock In</span>
            </Link>
            <Link href="/w/schedule" className="wd-action-btn">
              <Bell size={16} />
              <span>View Schedule</span>
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
