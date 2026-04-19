'use client'

import { useEffect, useState } from 'react'
import {
  User as UserIcon, Mail, Phone, Briefcase, Building2, Calendar, Clock,
  CheckSquare, Ticket, GraduationCap, ClipboardCheck, Crown, Shield,
  Check, Star, Palette, Save, AlertCircle, BookOpen,
} from 'lucide-react'
import { getInitials, formatDate, timeAgo } from '@/lib/workryn/utils'

interface TrainingEnrollment {
  id: string
  status: string
  completedAt: string | null
  enrolledAt: string
  course?: {
    id: string
    title: string
    description?: string | null
    category?: string | null
  }
  progress?: number
  quizScore?: number | null
}

interface ProfileProps {
  profile: {
    id: string
    name: string | null
    email: string | null
    role: string
    jobTitle: string | null
    phone: string | null
    avatarColor: string
    mfaEnabled: boolean
    isActive: boolean
    lastLogin: string | null
    createdAt: string
    departmentId: string | null
    department: { id: string; name: string; color: string; icon: string } | null
  }
  stats: {
    tasksAssigned: number
    ticketsCreated: number
    trainingCompleted: number
    evaluationsReceived: number
  }
  initialEnrollments?: TrainingEnrollment[]
  session: { user: { id: string; role: string } } | null
}

type Tab = 'overview' | 'training' | 'evaluations' | 'settings'

const AVATAR_COLORS = [
  '#6366f1', '#8b5cf6', '#ec4899', '#f43f5e', '#f97316',
  '#f59e0b', '#eab308', '#84cc16', '#22c55e', '#10b981',
  '#14b8a6', '#06b6d4', '#0ea5e9', '#3b82f6', '#64748b',
]

interface EvaluationItem {
  id: string
  overallRating: number | null
  comments: string | null
  acknowledgedAt: string | null
  createdAt: string
  evaluator?: { id: string; name: string | null; avatarColor?: string }
  template?: { id: string; name: string }
}

export default function ProfileClient({ profile, stats, initialEnrollments = [], session }: ProfileProps) {
  
  const [activeTab, setActiveTab] = useState<Tab>('overview')

  const isOwner = profile.role === 'OWNER'

  return (
    <>
      <div className="page-body animate-slide-up">
        {/* Header */}
        <div className="profile-header gradient-card animate-slide-up">
          <div className="profile-header-inner">
            <div
              className="profile-avatar"
              style={{ background: profile.avatarColor }}
            >
              {getInitials(profile.name ?? profile.email ?? 'U')}
            </div>

            <div className="profile-header-info">
              <div className="profile-name-row">
                <h1 className="profile-name gradient-text">
                  {profile.name ?? 'Unnamed User'}
                </h1>
                <span className="profile-role-pill">
                  {isOwner && <Crown size={13} style={{ color: '#fbbf24' }} />}
                  {profile.role}
                </span>
              </div>
              {profile.jobTitle && (
                <div className="profile-job-title">
                  <Briefcase size={14} /> {profile.jobTitle}
                </div>
              )}
              <div className="profile-meta-row">
                {profile.email && (
                  <span className="profile-meta-item">
                    <Mail size={13} /> {profile.email}
                  </span>
                )}
                {profile.department && (
                  <span
                    className="profile-dept-badge"
                    style={{
                      background: `${profile.department.color}22`,
                      color: profile.department.color,
                      borderColor: `${profile.department.color}44`,
                    }}
                  >
                    <Building2 size={12} /> {profile.department.name}
                  </span>
                )}
                {profile.mfaEnabled && (
                  <span className="badge badge-success">
                    <Shield size={11} /> MFA Enabled
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Stats Grid */}
        <div className="profile-stats-grid">
          <StatCard
            label="Tasks Assigned"
            value={stats.tasksAssigned}
            icon={CheckSquare}
            iconBg="rgba(99,102,241,0.15)"
            iconColor="#818cf8"
            delay={0}
          />
          <StatCard
            label="Tickets Created"
            value={stats.ticketsCreated}
            icon={Ticket}
            iconBg="rgba(245,158,11,0.15)"
            iconColor="#f59e0b"
            delay={80}
          />
          <StatCard
            label="Training Completed"
            value={stats.trainingCompleted}
            icon={GraduationCap}
            iconBg="rgba(16,185,129,0.15)"
            iconColor="#10b981"
            delay={160}
          />
          <StatCard
            label="Evaluations Received"
            value={stats.evaluationsReceived}
            icon={ClipboardCheck}
            iconBg="rgba(236,72,153,0.15)"
            iconColor="#ec4899"
            delay={240}
          />
        </div>

        {/* Tabs */}
        <div className="profile-tabs-bar">
          <button
            className={`profile-tab focus-ring ${activeTab === 'overview' ? 'active' : ''}`}
            onClick={() => setActiveTab('overview')}
          >
            <UserIcon size={14} /> Overview
          </button>
          <button
            className={`profile-tab focus-ring ${activeTab === 'training' ? 'active' : ''}`}
            onClick={() => setActiveTab('training')}
          >
            <GraduationCap size={14} /> Training Progress
          </button>
          <button
            className={`profile-tab focus-ring ${activeTab === 'evaluations' ? 'active' : ''}`}
            onClick={() => setActiveTab('evaluations')}
          >
            <ClipboardCheck size={14} /> Evaluations
          </button>
          <button
            className={`profile-tab focus-ring ${activeTab === 'settings' ? 'active' : ''}`}
            onClick={() => setActiveTab('settings')}
          >
            <Palette size={14} /> Settings
          </button>
        </div>

        {/* Tab content */}
        <div className="profile-tab-content animate-in">
          {activeTab === 'overview' && <OverviewTab profile={profile} />}
          {activeTab === 'training' && <TrainingTab enrollments={initialEnrollments} />}
          {activeTab === 'evaluations' && <EvaluationsTab userId={profile.id} />}
          {activeTab === 'settings' && (
            <SettingsTab
              profile={profile}
              onSaved={async () => {
                // Refresh session to pick up changes like avatarColor
                // Session refreshed via server
              }}
            />
          )}
        </div>
      </div>

      <style>{`
        .profile-header {
          margin-bottom: 24px;
          padding: 28px;
        }
        .profile-header-inner {
          display: flex;
          align-items: center;
          gap: 24px;
          flex-wrap: wrap;
        }
        .profile-avatar {
          width: 96px;
          height: 96px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 2rem;
          font-weight: 800;
          color: #fff;
          flex-shrink: 0;
          box-shadow: 0 0 32px rgba(99,102,241,0.3);
          border: 3px solid var(--border-subtle);
          letter-spacing: -0.02em;
        }
        .profile-header-info {
          flex: 1;
          min-width: 240px;
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        .profile-name-row {
          display: flex;
          align-items: center;
          gap: 12px;
          flex-wrap: wrap;
        }
        .profile-name {
          font-size: 1.75rem;
          font-weight: 800;
          letter-spacing: -0.02em;
          margin: 0;
        }
        .profile-role-pill {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 4px 12px;
          border-radius: 99px;
          font-size: 0.6875rem;
          font-weight: 700;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          background: var(--brand-gradient-subtle);
          color: var(--brand-light);
          border: 1px solid rgba(99,102,241,0.25);
        }
        .profile-job-title {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          font-size: 0.9375rem;
          color: var(--text-secondary);
          font-weight: 500;
        }
        .profile-meta-row {
          display: flex;
          align-items: center;
          gap: 12px;
          flex-wrap: wrap;
          margin-top: 4px;
        }
        .profile-meta-item {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          font-size: 0.8125rem;
          color: var(--text-muted);
        }
        .profile-dept-badge {
          display: inline-flex;
          align-items: center;
          gap: 5px;
          padding: 3px 10px;
          border-radius: 99px;
          font-size: 0.75rem;
          font-weight: 600;
          border: 1px solid;
        }

        .profile-stats-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
          gap: 16px;
          margin-bottom: 28px;
        }

        .profile-tabs-bar {
          display: flex;
          gap: 4px;
          border-bottom: 1px solid var(--border-subtle);
          margin-bottom: 24px;
          overflow-x: auto;
          padding-bottom: 0;
        }
        .profile-tab {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 10px 16px;
          background: transparent;
          border: none;
          border-bottom: 2px solid transparent;
          color: var(--text-muted);
          font-size: 0.875rem;
          font-weight: 600;
          cursor: pointer;
          transition: all var(--transition-smooth);
          white-space: nowrap;
          margin-bottom: -1px;
        }
        .profile-tab:hover { color: var(--text-primary); }
        .profile-tab.active {
          color: var(--brand-light);
          border-bottom-color: var(--brand);
        }

        .profile-tab-content {
          display: flex;
          flex-direction: column;
          gap: 16px;
        }

        .info-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
          gap: 16px;
        }
        .info-item {
          display: flex;
          align-items: flex-start;
          gap: 12px;
          padding: 16px;
          background: var(--bg-elevated);
          border: 1px solid var(--border-subtle);
          border-radius: var(--radius-md);
          transition: border-color var(--transition-smooth);
        }
        .info-item:hover { border-color: var(--border-default); }
        .info-icon {
          width: 36px;
          height: 36px;
          border-radius: var(--radius-md);
          background: var(--brand-gradient-subtle);
          color: var(--brand-light);
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }
        .info-label {
          font-size: 0.75rem;
          color: var(--text-muted);
          text-transform: uppercase;
          letter-spacing: 0.06em;
          font-weight: 600;
        }
        .info-value {
          font-size: 0.9375rem;
          color: var(--text-primary);
          font-weight: 500;
          margin-top: 2px;
          word-break: break-word;
        }

        .training-row, .eval-row {
          display: flex;
          align-items: center;
          gap: 14px;
          padding: 16px;
          background: var(--bg-elevated);
          border: 1px solid var(--border-subtle);
          border-radius: var(--radius-md);
          transition: all var(--transition-smooth);
        }
        .training-row:hover, .eval-row:hover {
          border-color: var(--brand);
          box-shadow: 0 0 16px rgba(99,102,241,0.1);
        }
        .training-icon, .eval-icon {
          width: 42px;
          height: 42px;
          border-radius: var(--radius-md);
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }
        .training-body, .eval-body {
          flex: 1;
          min-width: 0;
        }
        .training-title, .eval-title {
          font-size: 0.9375rem;
          font-weight: 600;
          color: var(--text-primary);
          margin-bottom: 4px;
        }
        .training-meta, .eval-meta {
          font-size: 0.75rem;
          color: var(--text-muted);
          display: flex;
          gap: 12px;
          flex-wrap: wrap;
        }
        .progress-bar-wrap {
          margin-top: 10px;
          width: 100%;
          height: 6px;
          background: var(--bg-overlay);
          border-radius: 99px;
          overflow: hidden;
        }
        .progress-bar-fill {
          height: 100%;
          background: var(--brand-gradient);
          border-radius: 99px;
          transition: width var(--transition-smooth);
        }

        .eval-rating {
          display: flex;
          gap: 2px;
        }
        .eval-rating-star { color: #f59e0b; }
        .eval-rating-star.empty { color: var(--border-default); }

        .settings-form {
          display: flex;
          flex-direction: column;
          gap: 18px;
          max-width: 560px;
        }
        .color-picker {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(40px, 1fr));
          gap: 10px;
          padding: 12px;
          background: var(--bg-elevated);
          border: 1px solid var(--border-default);
          border-radius: var(--radius-md);
        }
        .color-swatch {
          width: 38px;
          height: 38px;
          border-radius: 50%;
          cursor: pointer;
          border: 2px solid transparent;
          transition: all var(--transition-smooth);
          position: relative;
        }
        .color-swatch:hover { transform: scale(1.08); }
        .color-swatch.selected {
          border-color: var(--text-primary);
          box-shadow: 0 0 0 3px var(--brand-glow);
        }
        .color-swatch.selected::after {
          content: '✓';
          position: absolute;
          inset: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          color: #fff;
          font-weight: 700;
          font-size: 1rem;
        }

        .alert-error {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 12px 16px;
          background: rgba(239,68,68,0.1);
          border: 1px solid rgba(239,68,68,0.3);
          border-radius: var(--radius-md);
          color: var(--danger);
          font-size: 0.875rem;
        }
        .alert-success {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 12px 16px;
          background: rgba(16,185,129,0.1);
          border: 1px solid rgba(16,185,129,0.3);
          border-radius: var(--radius-md);
          color: var(--success);
          font-size: 0.875rem;
        }
      `}</style>
    </>
  )
}

/* ────────────────────────────────────────────────────────────────────────── */

function StatCard({
  label, value, icon: Icon, iconBg, iconColor, delay,
}: {
  label: string; value: number; icon: React.ElementType
  iconBg: string; iconColor: string; delay: number
}) {
  return (
    <div
      className="stat-card animate-slide-up"
      style={{ animationDelay: `${delay}ms` }}
    >
      <div className="stat-icon" style={{ background: iconBg }}>
        <Icon size={22} color={iconColor} />
      </div>
      <div className="stat-value">{value}</div>
      <div className="stat-label">{label}</div>
    </div>
  )
}

/* ────────────────────────────────────────────────────────────────────────── */

function OverviewTab({ profile }: { profile: ProfileProps['profile'] }) {
  return (
    <div className="glass-card">
      <h3 className="gradient-text" style={{ marginBottom: 18 }}>Personal Information</h3>
      <div className="info-grid">
        <InfoItem icon={UserIcon} label="Full Name" value={profile.name ?? '—'} />
        <InfoItem icon={Mail} label="Email" value={profile.email ?? '—'} />
        <InfoItem icon={Briefcase} label="Job Title" value={profile.jobTitle ?? 'Not set'} />
        <InfoItem icon={Phone} label="Phone" value={profile.phone ?? 'Not set'} />
        <InfoItem
          icon={Building2}
          label="Department"
          value={profile.department?.name ?? 'Unassigned'}
        />
        <InfoItem icon={Shield} label="Role" value={profile.role} />
        <InfoItem
          icon={Calendar}
          label="Member Since"
          value={formatDate(profile.createdAt)}
        />
        <InfoItem
          icon={Clock}
          label="Last Login"
          value={profile.lastLogin ? timeAgo(profile.lastLogin) : 'Never'}
        />
      </div>
    </div>
  )
}

function InfoItem({
  icon: Icon, label, value,
}: { icon: React.ElementType; label: string; value: string }) {
  return (
    <div className="info-item">
      <div className="info-icon">
        <Icon size={16} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="info-label">{label}</div>
        <div className="info-value">{value}</div>
      </div>
    </div>
  )
}

/* ────────────────────────────────────────────────────────────────────────── */

function TrainingTab({ enrollments }: { enrollments: TrainingEnrollment[] }) {
  if (enrollments.length === 0) {
    return (
      <div className="glass-card">
        <div className="empty-state">
          <GraduationCap size={40} />
          <p>No training enrollments yet. Visit the Training Center to start a course.</p>
        </div>
      </div>
    )
  }

  const inProgress = enrollments.filter((e) => e.status !== 'COMPLETED')
  const completed = enrollments.filter((e) => e.status === 'COMPLETED')

  return (
    <>
      {inProgress.length > 0 && (
        <div className="glass-card">
          <h3 className="gradient-text" style={{ marginBottom: 16 }}>In Progress</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {inProgress.map((e) => (
              <div key={e.id} className="training-row">
                <div
                  className="training-icon"
                  style={{ background: 'rgba(99,102,241,0.15)', color: '#818cf8' }}
                >
                  <BookOpen size={20} />
                </div>
                <div className="training-body">
                  <div className="training-title">{e.course?.title}</div>
                  <div className="training-meta">
                    {e.course?.category && <span>{e.course.category}</span>}
                    <span>Enrolled {timeAgo(e.enrolledAt)}</span>
                  </div>
                  <div className="progress-bar-wrap">
                    <div
                      className="progress-bar-fill"
                      style={{ width: `${Math.min(100, Math.max(0, e.progress ?? 0))}%` }}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {completed.length > 0 && (
        <div className="glass-card">
          <h3 className="gradient-text" style={{ marginBottom: 16 }}>Completed</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {completed.map((e) => (
              <div key={e.id} className="training-row">
                <div
                  className="training-icon"
                  style={{ background: 'rgba(16,185,129,0.15)', color: '#10b981' }}
                >
                  <Check size={20} />
                </div>
                <div className="training-body">
                  <div className="training-title">{e.course?.title}</div>
                  <div className="training-meta">
                    {e.completedAt && <span>Completed {formatDate(e.completedAt)}</span>}
                    {typeof e.quizScore === 'number' && (
                      <span>Quiz score: {e.quizScore}%</span>
                    )}
                  </div>
                </div>
                <span className="badge badge-success">
                  <Check size={11} /> Done
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  )
}

/* ────────────────────────────────────────────────────────────────────────── */

function EvaluationsTab({ userId }: { userId: string }) {
  const [loading, setLoading] = useState(true)
  const [evaluations, setEvaluations] = useState<EvaluationItem[]>([])
  const [error, setError] = useState(false)
  const [ackError, setAckError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const res = await fetch(`/api/workryn/evaluations?agentId=${encodeURIComponent(userId)}`)
        if (!res.ok) throw new Error('not ok')
        const data = await res.json()
        if (cancelled) return

        const list: EvaluationItem[] = Array.isArray(data)
          ? data
          : Array.isArray(data?.evaluations)
          ? data.evaluations
          : []
        setEvaluations(list)
      } catch {
        if (!cancelled) setError(true)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [userId])

  async function acknowledge(id: string) {
    setAckError(null)
    try {
      const res = await fetch(`/api/workryn/evaluations/${id}/acknowledge`, { method: 'POST' })
      if (!res.ok) throw new Error('Failed to acknowledge')
      setEvaluations((prev) =>
        prev.map((e) =>
          e.id === id ? { ...e, acknowledgedAt: new Date().toISOString() } : e
        )
      )
    } catch {
      setAckError('Could not acknowledge evaluation. Please try again.')
    }
  }

  if (loading) {
    return (
      <div className="glass-card">
        <div className="empty-state">
          <div className="spinner" />
          <p>Loading evaluations...</p>
        </div>
      </div>
    )
  }

  if (error || evaluations.length === 0) {
    return (
      <div className="glass-card">
        <div className="empty-state">
          <ClipboardCheck size={40} />
          <p>
            {error
              ? 'Evaluations data is not available yet.'
              : 'No evaluations received yet.'}
          </p>
        </div>
      </div>
    )
  }

  return (
    <>
      {ackError && (
        <div className="alert-error">
          <AlertCircle size={16} /> {ackError}
        </div>
      )}
      <div className="glass-card">
        <h3 className="gradient-text" style={{ marginBottom: 16 }}>Evaluations Received</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {evaluations.map((e) => {
            const rating = e.overallRating ?? 0
            return (
              <div key={e.id} className="eval-row">
                <div
                  className="eval-icon"
                  style={{ background: 'rgba(236,72,153,0.15)', color: '#ec4899' }}
                >
                  <ClipboardCheck size={20} />
                </div>
                <div className="eval-body">
                  <div className="eval-title">
                    {e.template?.name ?? 'Evaluation'}
                  </div>
                  <div className="eval-meta">
                    {e.evaluator?.name && <span>By {e.evaluator.name}</span>}
                    <span>{formatDate(e.createdAt)}</span>
                    {rating > 0 && (
                      <span className="eval-rating">
                        {Array.from({ length: 5 }).map((_, i) => (
                          <Star
                            key={i}
                            size={13}
                            fill={i < rating ? '#f59e0b' : 'none'}
                            className={`eval-rating-star ${i >= rating ? 'empty' : ''}`}
                          />
                        ))}
                      </span>
                    )}
                  </div>
                </div>
                {e.acknowledgedAt ? (
                  <span className="badge badge-success">
                    <Check size={11} /> Acknowledged
                  </span>
                ) : (
                  <button
                    className="btn btn-primary btn-sm"
                    onClick={() => acknowledge(e.id)}
                  >
                    Acknowledge
                  </button>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </>
  )
}

/* ────────────────────────────────────────────────────────────────────────── */

function SettingsTab({
  profile,
  onSaved,
}: {
  profile: ProfileProps['profile']
  onSaved: () => void | Promise<void>
}) {
  
  const isAdmin = profile.role === 'OWNER' || profile.role === 'ADMIN'

  const [name, setName] = useState(profile.name ?? '')
  const [jobTitle, setJobTitle] = useState(profile.jobTitle ?? '')
  const [phone, setPhone] = useState(profile.phone ?? '')
  const [avatarColor, setAvatarColor] = useState(profile.avatarColor)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    setSuccess(false)
    try {
      const body: Record<string, unknown> = { name, phone, avatarColor }
      // jobTitle is admin-only on /api/profile/me — only include for admins
      if (isAdmin) body.jobTitle = jobTitle || null

      const res = await fetch(`/api/workryn/profile/me`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setError(data?.error ?? 'Failed to update profile.')
        setSaving(false)
        return
      }

      setSuccess(true)
      await onSaved()
    } catch {
      setError('Network error. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="glass-card">
      <h3 className="gradient-text" style={{ marginBottom: 18 }}>Edit Profile</h3>

      {error && (
        <div className="alert-error" style={{ marginBottom: 16 }}>
          <AlertCircle size={16} /> {error}
        </div>
      )}
      {success && (
        <div className="alert-success" style={{ marginBottom: 16 }}>
          <Check size={16} /> Profile updated successfully.
        </div>
      )}

      <form className="settings-form" onSubmit={handleSave}>
        <div className="form-group">
          <label className="label" htmlFor="profile-name">Full Name</label>
          <input
            id="profile-name"
            className="input focus-ring"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Your full name"
          />
        </div>

        <div className="form-group">
          <label className="label" htmlFor="profile-job-title">Job Title</label>
          <input
            id="profile-job-title"
            className="input focus-ring"
            type="text"
            value={jobTitle}
            onChange={(e) => setJobTitle(e.target.value)}
            placeholder="e.g. Support Specialist"
          />
        </div>

        <div className="form-group">
          <label className="label" htmlFor="profile-phone">Phone</label>
          <input
            id="profile-phone"
            className="input focus-ring"
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="Optional"
          />
          <small style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 4 }}>
            Phone updates via admin API require elevated permissions.
          </small>
        </div>

        <div className="form-group">
          <label className="label">Avatar Color</label>
          <div className="color-picker">
            {AVATAR_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                className={`color-swatch ${avatarColor === c ? 'selected' : ''}`}
                style={{ background: c }}
                onClick={() => setAvatarColor(c)}
                aria-label={`Select color ${c}`}
              />
            ))}
          </div>
        </div>

        <div style={{ display: 'flex', gap: 12 }}>
          <button
            type="submit"
            className="btn btn-gradient"
            disabled={saving}
            id="btn-save-profile"
          >
            {saving ? (
              <>
                <div className="spinner" style={{ width: 14, height: 14 }} /> Saving...
              </>
            ) : (
              <>
                <Save size={14} /> Save Changes
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  )
}
