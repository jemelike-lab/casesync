'use client'
import { ListChecks, MessageCircle, Timer, TrendingUp, ArrowUpRight, CheckCircle2 } from 'lucide-react'
import { timeAgo, getPriorityColor, getInitials } from '@/lib/workryn/utils'
import Link from 'next/link'

interface Props {
  user: { name?: string | null; role: string; avatarColor: string; departmentName?: string }
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

export default function DashboardClient({ user, stats, auditLogs, recentTasks }: Props) {
  return (
    <div className="wd">
      {/* Header */}
      <header className="wd-header">
        <div>
          <h1 className="wd-greeting">{greet(user.name ?? 'there')}</h1>
          <p className="wd-subtitle">Here&apos;s your workspace overview.</p>
        </div>
        <div className="wd-actions">
          <Link href="/w/tasks" className="wd-btn wd-btn-primary">+ New Task</Link>
          <Link href="/w/tickets" className="wd-btn wd-btn-outline">+ New Ticket</Link>
        </div>
      </header>

      {/* Stat Cards */}
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
      </div>

      {/* Content Grid */}
      <div className="wd-grid">
        {/* Tasks Panel */}
        <div className="wd-panel">
          <div className="wd-panel-header">
            <h2 className="wd-panel-title">
              <ListChecks size={18} strokeWidth={1.8} />
              Open Tasks
            </h2>
            <Link href="/w/tasks" className="wd-link">View all →</Link>
          </div>
          <div className="wd-panel-body">
            {recentTasks.length === 0 ? (
              <div className="wd-empty">
                <CheckCircle2 size={40} strokeWidth={1.2} />
                <p>No open tasks — you&apos;re all caught up!</p>
              </div>
            ) : (
              <div className="wd-task-list">
                {recentTasks.map((task) => (
                  <Link key={task.id} href="/w/tasks" className="wd-task-row">
                    <span className="wd-task-dot" style={{ background: getPriorityColor(task.priority) }} />
                    <span className="wd-task-title">{task.title}</span>
                    {task.dueDate && (
                      <span className="wd-task-due">
                        <Timer size={11} />
                        {new Date(task.dueDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                      </span>
                    )}
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Activity Panel */}
        <div className="wd-panel wd-panel-sm">
          <div className="wd-panel-header">
            <h2 className="wd-panel-title">
              <TrendingUp size={18} strokeWidth={1.8} />
              Activity
            </h2>
          </div>
          <div className="wd-panel-body">
            {auditLogs.length === 0 ? (
              <div className="wd-empty wd-empty-sm">
                <TrendingUp size={32} strokeWidth={1.2} />
                <p>No recent activity</p>
              </div>
            ) : (
              <div className="wd-activity-list">
                {auditLogs.map((log) => (
                  <div key={log.id} className="wd-activity-row">
                    <div className="wd-activity-avatar" style={{ background: log.user.avatarColor }}>
                      {getInitials(log.user.name ?? 'U')}
                    </div>
                    <div className="wd-activity-body">
                      <div className="wd-activity-text">
                        <span className="wd-activity-action">{log.action.replace(/_/g, ' ')}</span>
                        <span className="wd-activity-resource"> · {log.resourceType}</span>
                      </div>
                      <span className="wd-activity-time">{timeAgo(log.createdAt)}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

    </div>
  )
}
