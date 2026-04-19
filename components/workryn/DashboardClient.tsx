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

      <style>{`
        .wd { min-height: 100vh; background: var(--w-bg-base); }

        .wd-header {
          display: flex; align-items: center; justify-content: space-between;
          padding: 32px 36px 28px;
        }
        .wd-greeting {
          font-size: 1.625rem; font-weight: 700; color: var(--w-text-primary);
          letter-spacing: -0.02em; margin: 0 0 4px;
        }
        .wd-subtitle { font-size: 0.9rem; color: var(--w-text-muted); margin: 0; }
        .wd-actions { display: flex; gap: 10px; }
        .wd-btn {
          display: inline-flex; align-items: center; gap: 6px;
          padding: 9px 18px; border-radius: 10px;
          font-size: 0.8125rem; font-weight: 600;
          text-decoration: none; cursor: pointer; transition: all 200ms ease;
        }
        .wd-btn-primary { background: var(--w-brand); color: #fff; border: none; }
        .wd-btn-primary:hover { background: var(--w-brand-light); box-shadow: var(--w-shadow-brand); transform: translateY(-1px); }
        .wd-btn-outline { background: transparent; color: var(--w-text-secondary); border: 1px solid var(--w-border-default); }
        .wd-btn-outline:hover { background: var(--w-bg-hover); color: var(--w-text-primary); border-color: var(--w-border-strong); }

        .wd-stats { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; padding: 0 36px 28px; }
        .wd-stat-card {
          display: flex; align-items: center; gap: 14px; padding: 20px;
          background: var(--w-bg-surface); border: 1px solid var(--w-border-subtle);
          border-radius: 14px; text-decoration: none; position: relative; overflow: hidden;
          transition: all 250ms cubic-bezier(0.4, 0, 0.2, 1);
        }
        .wd-stat-card::after {
          content: ''; position: absolute; top: 0; left: 0; right: 0; height: 2px;
          background: var(--accent, var(--w-brand)); opacity: 0; transition: opacity 250ms ease;
        }
        .wd-stat-card:hover {
          border-color: color-mix(in srgb, var(--accent, var(--w-brand)) 30%, transparent);
          background: var(--w-bg-elevated); transform: translateY(-2px);
          box-shadow: 0 8px 24px rgba(0,0,0,0.2);
        }
        .wd-stat-card:hover::after { opacity: 1; }
        .wd-stat-icon { width: 44px; height: 44px; border-radius: 12px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
        .wd-stat-body { flex: 1; }
        .wd-stat-value { display: block; font-size: 1.5rem; font-weight: 700; color: var(--w-text-primary); letter-spacing: -0.02em; line-height: 1.2; }
        .wd-stat-label { display: block; font-size: 0.8125rem; color: var(--w-text-muted); margin-top: 2px; }
        .wd-stat-arrow { color: var(--w-text-muted); opacity: 0; transition: all 200ms ease; flex-shrink: 0; }
        .wd-stat-card:hover .wd-stat-arrow { opacity: 1; color: var(--accent, var(--w-brand-light)); transform: translate(2px, -2px); }

        .wd-grid { display: grid; grid-template-columns: 1fr 360px; gap: 20px; padding: 0 36px 36px; align-items: start; }
        .wd-panel { background: var(--w-bg-surface); border: 1px solid var(--w-border-subtle); border-radius: 16px; overflow: hidden; }
        .wd-panel-header { display: flex; align-items: center; justify-content: space-between; padding: 18px 22px; border-bottom: 1px solid var(--w-border-subtle); }
        .wd-panel-title { display: flex; align-items: center; gap: 10px; font-size: 0.9375rem; font-weight: 600; color: var(--w-text-primary); margin: 0; }
        .wd-link { font-size: 0.8125rem; font-weight: 500; color: var(--w-brand-light); text-decoration: none; transition: color 150ms ease; }
        .wd-link:hover { color: var(--w-brand); text-decoration: underline; }
        .wd-panel-body { padding: 8px; }

        .wd-task-list { display: flex; flex-direction: column; gap: 2px; }
        .wd-task-row { display: flex; align-items: center; gap: 12px; padding: 12px 14px; border-radius: 10px; color: var(--w-text-secondary); font-size: 0.875rem; text-decoration: none; transition: all 200ms ease; }
        .wd-task-row:hover { background: var(--w-bg-hover); color: var(--w-text-primary); }
        .wd-task-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
        .wd-task-title { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .wd-task-due { display: flex; align-items: center; gap: 4px; font-size: 0.75rem; color: var(--w-text-muted); white-space: nowrap; }

        .wd-activity-list { display: flex; flex-direction: column; }
        .wd-activity-row { display: flex; gap: 12px; padding: 14px; border-bottom: 1px solid var(--w-border-subtle); }
        .wd-activity-row:last-child { border-bottom: none; }
        .wd-activity-avatar { width: 30px; height: 30px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 0.6875rem; font-weight: 700; color: #fff; flex-shrink: 0; }
        .wd-activity-body { flex: 1; min-width: 0; }
        .wd-activity-text { font-size: 0.8125rem; line-height: 1.4; }
        .wd-activity-action { font-weight: 500; color: var(--w-text-primary); text-transform: capitalize; }
        .wd-activity-resource { color: var(--w-text-muted); text-transform: capitalize; }
        .wd-activity-time { font-size: 0.75rem; color: var(--w-text-muted); margin-top: 3px; display: block; }

        .wd-empty { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 12px; padding: 48px 20px; color: var(--w-text-muted); text-align: center; }
        .wd-empty-sm { padding: 32px 20px; }
        .wd-empty p { font-size: 0.875rem; margin: 0; }

        @media (max-width: 1024px) { .wd-grid { grid-template-columns: 1fr; } }
        @media (max-width: 768px) {
          .wd-header { flex-direction: column; align-items: flex-start; gap: 16px; padding: 24px 20px 20px; }
          .wd-stats { grid-template-columns: 1fr; padding: 0 20px 20px; }
          .wd-grid { padding: 0 20px 20px; }
        }
      `}</style>
    </div>
  )
}
