'use client'
import { CheckSquare, Ticket, Activity, Clock, AlertTriangle } from 'lucide-react'
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

const statCards = (stats: Props['stats']) => [
  {
    label: 'My Tasks',
    value: stats.taskCount,
    icon: CheckSquare,
    iconBg: 'rgba(99,102,241,0.15)',
    iconColor: '#818cf8',
    href: '/tasks',
  },
  {
    label: 'Open Tickets',
    value: stats.openTickets,
    icon: Ticket,
    iconBg: 'rgba(245,158,11,0.15)',
    iconColor: '#f59e0b',
    href: '/tickets',
  },
  {
    label: 'Hours This Week',
    value: stats.weeklyHours,
    icon: Clock,
    iconBg: 'rgba(16,185,129,0.15)',
    iconColor: '#10b981',
    href: '/time-clock',
  },
]

function greet(name: string) {
  const h = new Date().getHours()
  const prefix = h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'
  return `${prefix}, ${name.split(' ')[0]}`
}

export default function DashboardClient({ user, stats, auditLogs, recentTasks }: Props) {
  const cards = statCards(stats)

  return (
    <>
      {/* Welcome banner */}
      <div className="dash-welcome animate-slide-up">
        <div className="dash-welcome-inner">
          <div className="dash-welcome-text">
            <h1 className="dash-greeting">
              {greet(user.name ?? 'there')} <span style={{ fontSize: '1.75rem' }}>👋</span>
            </h1>
            <p className="dash-subtitle">
              Here&apos;s what&apos;s happening in your workspace today.
            </p>
          </div>
          <div className="flex gap-2">
            <Link href="/w/tasks" className="btn btn-primary btn-sm focus-ring" id="btn-new-task">
              + New Task
            </Link>
            <Link href="/w/tickets" className="btn btn-ghost btn-sm focus-ring" id="btn-new-ticket">
              + New Ticket
            </Link>
          </div>
        </div>
      </div>

      <div className="page-body">
        {/* Stat cards */}
        <div className="grid grid-cols-3 gap-4" style={{ marginBottom: 28 }}>
          {cards.map(({ label, value, icon: Icon, iconBg, iconColor, href }, i) => (
            <Link key={label} href={href} style={{ textDecoration: 'none' }}>
              <div
                className="stat-card animate-slide-up"
                style={{ animationDelay: `${i * 80}ms` }}
              >
                <div className="stat-icon" style={{ background: iconBg }}>
                  <Icon size={22} color={iconColor} />
                </div>
                <div className="stat-value">{value}</div>
                <div className="stat-label">{label}</div>
              </div>
            </Link>
          ))}
        </div>

        {/* Two-column layout */}
        <div className="flex gap-6" style={{ alignItems: 'flex-start' }}>

          {/* Recent Tasks */}
          <div className="glass-card flex-1 animate-slide-up" style={{ animationDelay: '200ms' }}>
            <div className="flex items-center justify-between" style={{ marginBottom: 18 }}>
              <h3 className="flex gap-2 items-center">
                <CheckSquare size={18} color="var(--brand-light)" />
                <span className="gradient-text">My Open Tasks</span>
              </h3>
              <Link href="/w/tasks" className="btn btn-ghost btn-sm">View all</Link>
            </div>

            {recentTasks.length === 0 ? (
              <div className="empty-state" style={{ padding: '32px 0' }}>
                <CheckSquare size={36} />
                <p>No open tasks — you&apos;re all caught up!</p>
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                {recentTasks.map((task, i) => (
                  <Link
                    key={task.id}
                    href="/w/tasks"
                    className="task-row focus-ring"
                    id={`task-${task.id}`}
                    style={{ animationDelay: `${300 + i * 50}ms` }}
                  >
                    <span
                      className="dot"
                      style={{ background: getPriorityColor(task.priority) }}
                    />
                    <span className="task-row-title">{task.title}</span>
                    {task.dueDate && (
                      <span className="task-row-due flex gap-1 items-center">
                        <Clock size={12} />
                        {new Date(task.dueDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                      </span>
                    )}
                  </Link>
                ))}
              </div>
            )}
          </div>

          {/* Activity Feed */}
          <div className="glass-card animate-slide-up" style={{ width: 340, flexShrink: 0, animationDelay: '260ms' }}>
            <div className="flex items-center justify-between" style={{ marginBottom: 18 }}>
              <h3 className="flex gap-2 items-center">
                <Activity size={18} color="var(--brand-light)" />
                <span className="gradient-text">Activity</span>
              </h3>
            </div>

            {auditLogs.length === 0 ? (
              <div className="empty-state" style={{ padding: '24px 0' }}>
                <Activity size={28} />
                <p>No recent activity</p>
              </div>
            ) : (
              <div className="flex flex-col gap-0">
                {auditLogs.map((log, i) => (
                  <div key={log.id} className="activity-row">
                    <div
                      className="avatar avatar-sm"
                      style={{ background: log.user.avatarColor, flexShrink: 0 }}
                    >
                      {getInitials(log.user.name ?? 'U')}
                    </div>
                    <div className="activity-content">
                      <span className="activity-action">{log.action.replace(/_/g, ' ')}</span>
                      <span className="activity-resource"> · {log.resourceType}</span>
                      <div className="activity-time">{timeAgo(log.createdAt)}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <style>{`
        /* ── Welcome banner ── */
        .dash-welcome {
          padding: 28px 32px 24px;
          border-bottom: 1px solid var(--border-subtle);
          background: var(--bg-base);
          position: sticky;
          top: 0;
          z-index: 10;
        }
        .dash-welcome-inner {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 20px 24px;
          background: var(--brand-gradient-subtle);
          border: 1px solid var(--glass-border);
          border-radius: var(--radius-lg);
          position: relative;
          overflow: hidden;
        }
        .dash-welcome-inner::before {
          content: '';
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          height: 2px;
          background: var(--brand-gradient);
          opacity: 0.6;
        }
        .dash-greeting {
          font-size: 1.5rem;
          font-weight: 700;
          color: var(--text-primary);
          margin-bottom: 4px;
          letter-spacing: -0.02em;
        }
        .dash-subtitle {
          font-size: 0.875rem;
          color: var(--text-secondary);
        }

        /* ── Task rows ── */
        .task-row {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 10px 12px;
          border-radius: var(--radius-md);
          border: 1px solid var(--border-subtle);
          background: var(--bg-elevated);
          color: var(--text-secondary);
          font-size: 0.875rem;
          transition: all var(--transition-smooth);
          text-decoration: none;
          animation: slideUp 0.3s ease both;
        }
        .task-row:hover {
          border-color: var(--brand);
          color: var(--text-primary);
          background: var(--bg-hover);
          transform: translateX(4px);
          box-shadow: 0 0 16px rgba(99,102,241,0.1);
        }
        .task-row-title {
          flex: 1;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .task-row-due {
          font-size: 0.75rem;
          color: var(--text-muted);
          white-space: nowrap;
        }

        /* ── Activity feed ── */
        .activity-row {
          display: flex;
          gap: 12px;
          padding: 12px 0;
          border-bottom: 1px solid var(--border-subtle);
          transition: background var(--transition-smooth);
        }
        .activity-row:last-child { border-bottom: none; }
        .activity-content { flex: 1; min-width: 0; }
        .activity-action {
          font-size: 0.8125rem;
          font-weight: 500;
          color: var(--text-primary);
          text-transform: capitalize;
        }
        .activity-resource {
          font-size: 0.8125rem;
          color: var(--text-muted);
          text-transform: capitalize;
        }
        .activity-time {
          font-size: 0.75rem;
          color: var(--text-muted);
          margin-top: 4px;
        }
      `}</style>
    </>
  )
}
