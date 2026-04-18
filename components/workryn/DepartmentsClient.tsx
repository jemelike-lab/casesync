'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  Building2, Briefcase, Users, Heart, Code, Settings as SettingsIcon,
  ShieldCheck, Headphones, Crown, Plus, Search, X, Loader2, ChevronRight,
  Ticket, CheckSquare, UserCheck, UserX,
} from 'lucide-react'
import { getInitials } from '@/lib/workryn/utils'

/* ─── Types ─────────────────────────────────────────────────────────────── */
type DeptHead = {
  id: string
  name: string | null
  avatarColor: string
  jobTitle: string | null
  role: string
} | null

export type DepartmentListItem = {
  id: string
  name: string
  slug: string
  description: string | null
  color: string
  icon: string
  createdAt: string
  updatedAt: string
  head: DeptHead
  _count: { users: number; tasks: number; tickets: number }
}

type UserOption = {
  id: string
  name: string | null
  email: string | null
  jobTitle: string | null
  role: string
  avatarColor: string
  departmentId: string | null
}

interface Props {
  initialDepartments: DepartmentListItem[]
  users: UserOption[]
  currentUserRole: string
}

/* ─── Icon registry ─────────────────────────────────────────────────────── */
export const DEPT_ICON_OPTIONS = [
  { key: 'building-2', label: 'Building', Icon: Building2 },
  { key: 'briefcase', label: 'Briefcase', Icon: Briefcase },
  { key: 'users', label: 'Users', Icon: Users },
  { key: 'heart', label: 'Heart', Icon: Heart },
  { key: 'code', label: 'Code', Icon: Code },
  { key: 'settings', label: 'Settings', Icon: SettingsIcon },
  { key: 'shield-check', label: 'Shield', Icon: ShieldCheck },
  { key: 'headphones', label: 'Support', Icon: Headphones },
] as const

export function getDeptIcon(key: string) {
  return DEPT_ICON_OPTIONS.find(o => o.key === key)?.Icon ?? Building2
}

export const DEPT_COLOR_SWATCHES = [
  '#6366f1', '#8b5cf6', '#ec4899', '#ef4444',
  '#f59e0b', '#10b981', '#06b6d4', '#3b82f6',
] as const

/* ─── Component ─────────────────────────────────────────────────────────── */
export default function DepartmentsClient({ initialDepartments, users, currentUserRole }: Props) {
  const router = useRouter()
  const isAdmin = currentUserRole === 'OWNER' || currentUserRole === 'ADMIN'

  const [departments, setDepartments] = useState<DepartmentListItem[]>(initialDepartments)
  const [search, setSearch] = useState('')
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [saving, setSaving] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)
  const [form, setForm] = useState({
    name: '',
    description: '',
    color: DEPT_COLOR_SWATCHES[0] as string,
    icon: 'building-2',
    headId: '',
  })

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return departments
    return departments.filter(d =>
      d.name.toLowerCase().includes(q) ||
      (d.description ?? '').toLowerCase().includes(q) ||
      (d.head?.name ?? '').toLowerCase().includes(q)
    )
  }, [departments, search])

  const stats = useMemo(() => {
    const totalMembers = departments.reduce((sum, d) => sum + d._count.users, 0)
    const withHead = departments.filter(d => d.head).length
    const withoutHead = departments.length - withHead
    return {
      total: departments.length,
      totalMembers,
      withHead,
      withoutHead,
    }
  }, [departments])

  function openCreate() {
    setForm({
      name: '',
      description: '',
      color: DEPT_COLOR_SWATCHES[0] as string,
      icon: 'building-2',
      headId: '',
    })
    setCreateError(null)
    setShowCreateModal(true)
  }

  async function handleCreate() {
    if (!form.name.trim()) return
    setSaving(true)
    setCreateError(null)
    try {
      const res = await fetch('/api/workryn/departments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name.trim(),
          description: form.description.trim() || undefined,
          color: form.color,
          icon: form.icon,
          headId: form.headId || undefined,
        }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        setCreateError(err.error || 'Failed to create department')
        return
      }
      const created = await res.json()
      setDepartments(d => [...d, created].sort((a, b) => a.name.localeCompare(b.name)))
      setShowCreateModal(false)
    } catch {
      setCreateError('Failed to create department')
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <div style={{ padding: '28px 32px 0' }}>
        <h1 className="gradient-text" style={{ marginBottom: 4 }}>Departments</h1>
        <p style={{ fontSize: '0.9375rem', marginBottom: 24 }}>
          Manage your team structure and view department members
        </p>

        {/* Stats Row */}
        <div className="dept-stats-row">
          <div className="stat-card">
            <div className="stat-icon" style={{ background: 'rgba(99,102,241,0.12)' }}>
              <Building2 size={22} color="#6366f1" />
            </div>
            <div className="stat-value">{stats.total}</div>
            <div className="stat-label">Total Departments</div>
          </div>
          <div className="stat-card">
            <div className="stat-icon" style={{ background: 'rgba(139,92,246,0.12)' }}>
              <Users size={22} color="#8b5cf6" />
            </div>
            <div className="stat-value">{stats.totalMembers}</div>
            <div className="stat-label">Total Members</div>
          </div>
          <div className="stat-card">
            <div className="stat-icon" style={{ background: 'rgba(16,185,129,0.12)' }}>
              <UserCheck size={22} color="#10b981" />
            </div>
            <div className="stat-value">{stats.withHead}</div>
            <div className="stat-label">With Head Assigned</div>
          </div>
          <div className="stat-card">
            <div className="stat-icon" style={{ background: 'rgba(239,68,68,0.12)' }}>
              <UserX size={22} color="#ef4444" />
            </div>
            <div className="stat-value">{stats.withoutHead}</div>
            <div className="stat-label">Without Head</div>
          </div>
        </div>

        {/* Top bar */}
        <div className="dept-topbar">
          <div className="dept-search">
            <Search size={16} className="dept-search-icon" />
            <input
              className="input focus-ring"
              placeholder="Search departments, descriptions, or heads…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={{ paddingLeft: 38 }}
            />
          </div>
          {isAdmin && (
            <button
              className="btn btn-gradient focus-ring"
              onClick={openCreate}
              id="btn-new-department"
            >
              <Plus size={16} /> New Department
            </button>
          )}
        </div>
      </div>

      <div className="page-body" style={{ paddingTop: 20 }}>
        {filtered.length === 0 ? (
          <div className="empty-state">
            <Building2 size={40} />
            <p>
              {search
                ? `No departments match "${search}"`
                : 'No departments yet. Create your first department to get started.'}
            </p>
          </div>
        ) : (
          <div className="dept-grid">
            {filtered.map((dept, idx) => {
              const Icon = getDeptIcon(dept.icon)
              return (
                <button
                  key={dept.id}
                  id={`dept-card-${dept.id}`}
                  className="dept-card animate-slide-up focus-ring"
                  style={{
                    animationDelay: `${Math.min(idx, 8) * 40}ms`,
                    // expose color via CSS var for the top gradient bar
                    ['--dept-color' as any]: dept.color,
                  }}
                  onClick={() => router.push(`/w/departments/${dept.id}`)}
                >
                  <div className="dept-card-top-bar" />

                  <div className="dept-card-head">
                    <div
                      className="dept-card-icon"
                      style={{
                        background: `${dept.color}1a`,
                        border: `1px solid ${dept.color}33`,
                      }}
                    >
                      <Icon size={26} color={dept.color} />
                    </div>
                    <ChevronRight size={18} className="dept-card-arrow" />
                  </div>

                  <div className="dept-card-body">
                    <div className="dept-card-name">{dept.name}</div>
                    {dept.description ? (
                      <div className="dept-card-desc">{dept.description}</div>
                    ) : (
                      <div className="dept-card-desc dim">No description</div>
                    )}

                    <div className="dept-card-counts">
                      <span className="dept-count">
                        <Users size={13} /> {dept._count.users}
                      </span>
                      <span className="dept-count">
                        <Ticket size={13} /> {dept._count.tickets}
                      </span>
                      <span className="dept-count">
                        <CheckSquare size={13} /> {dept._count.tasks}
                      </span>
                    </div>
                  </div>

                  <div className="dept-card-foot">
                    {dept.head ? (
                      <div className="dept-head-chip">
                        <div
                          className="avatar avatar-sm"
                          style={{ background: dept.head.avatarColor }}
                        >
                          {getInitials(dept.head.name ?? 'U')}
                        </div>
                        <div className="dept-head-info">
                          <div className="dept-head-name">
                            {dept.head.name}
                            {dept.head.role === 'OWNER' && (
                              <Crown size={11} color="#fbbf24" style={{ marginLeft: 4, display: 'inline' }} />
                            )}
                          </div>
                          <div className="dept-head-role">Department Head</div>
                        </div>
                      </div>
                    ) : (
                      <div className="dept-head-chip empty">
                        <div className="avatar avatar-sm empty-avatar">?</div>
                        <div className="dept-head-info">
                          <div className="dept-head-name muted">No head assigned</div>
                          <div className="dept-head-role">—</div>
                        </div>
                      </div>
                    )}
                  </div>
                </button>
              )
            })}
          </div>
        )}
      </div>

      {/* Create Modal */}
      {showCreateModal && (
        <div className="modal-overlay" onClick={() => setShowCreateModal(false)}>
          <div
            className="modal animate-scale-in"
            onClick={e => e.stopPropagation()}
            style={{ maxWidth: 520 }}
          >
            <div className="modal-header">
              <h3>New Department</h3>
              <button
                className="btn btn-icon btn-ghost focus-ring"
                onClick={() => setShowCreateModal(false)}
                aria-label="Close"
                title="Close"
              >
                <X size={18} />
              </button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label className="label">Name</label>
                <input
                  className="input focus-ring"
                  value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="e.g. Engineering, Nursing, Finance"
                  autoFocus
                />
              </div>

              <div className="form-group">
                <label className="label">Description</label>
                <textarea
                  className="input focus-ring"
                  value={form.description}
                  onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                  placeholder="Brief description of this department…"
                  rows={2}
                  style={{ resize: 'vertical' }}
                />
              </div>

              <div className="form-group">
                <label className="label">Color</label>
                <div className="dept-swatch-row">
                  {DEPT_COLOR_SWATCHES.map(c => (
                    <button
                      key={c}
                      type="button"
                      aria-label={`Select color ${c}`}
                      className="dept-swatch"
                      style={{
                        background: c,
                        outline: form.color === c ? `2px solid ${c}` : 'none',
                        border: form.color === c ? '3px solid #fff' : '3px solid transparent',
                      }}
                      onClick={() => setForm(f => ({ ...f, color: c }))}
                    />
                  ))}
                </div>
              </div>

              <div className="form-group">
                <label className="label">Icon</label>
                <div className="dept-icon-grid">
                  {DEPT_ICON_OPTIONS.map(({ key, label, Icon }) => (
                    <button
                      key={key}
                      type="button"
                      aria-label={label}
                      title={label}
                      className={`dept-icon-tile focus-ring ${form.icon === key ? 'active' : ''}`}
                      style={form.icon === key ? {
                        borderColor: form.color,
                        background: `${form.color}1a`,
                        color: form.color,
                      } : undefined}
                      onClick={() => setForm(f => ({ ...f, icon: key }))}
                    >
                      <Icon size={20} />
                    </button>
                  ))}
                </div>
              </div>

              <div className="form-group">
                <label className="label">Department Head (optional)</label>
                <select
                  className="input focus-ring"
                  value={form.headId}
                  onChange={e => setForm(f => ({ ...f, headId: e.target.value }))}
                >
                  <option value="">— No head assigned —</option>
                  {users.map(u => (
                    <option key={u.id} value={u.id}>
                      {u.name} {u.jobTitle ? `· ${u.jobTitle}` : ''}
                    </option>
                  ))}
                </select>
              </div>

              {createError && (
                <div
                  style={{
                    background: 'rgba(239,68,68,0.08)',
                    border: '1px solid rgba(239,68,68,0.3)',
                    borderRadius: 'var(--radius-md)',
                    padding: 10,
                    fontSize: '0.8125rem',
                    color: 'var(--danger)',
                  }}
                >
                  {createError}
                </div>
              )}
            </div>
            <div className="modal-footer">
              <button
                className="btn btn-ghost focus-ring"
                onClick={() => setShowCreateModal(false)}
              >
                Cancel
              </button>
              <button
                className="btn btn-gradient focus-ring"
                onClick={handleCreate}
                disabled={saving || !form.name.trim()}
                id="btn-save-department"
              >
                {saving ? <Loader2 size={16} className="spin" /> : <><Plus size={16} /> Create Department</>}
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        .dept-stats-row {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 14px;
          margin-bottom: 22px;
        }
        .dept-topbar {
          display: flex;
          align-items: center;
          gap: 12px;
          padding-bottom: 4px;
        }
        .dept-search {
          position: relative;
          flex: 1;
          max-width: 480px;
        }
        .dept-search-icon {
          position: absolute;
          left: 14px;
          top: 50%;
          transform: translateY(-50%);
          color: var(--text-muted);
          pointer-events: none;
        }
        .dept-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 18px;
        }
        @media (max-width: 1200px) {
          .dept-grid { grid-template-columns: repeat(2, 1fr); }
          .dept-stats-row { grid-template-columns: repeat(2, 1fr); }
        }
        @media (max-width: 720px) {
          .dept-grid { grid-template-columns: 1fr; }
          .dept-stats-row { grid-template-columns: 1fr 1fr; }
          .dept-topbar { flex-direction: column; align-items: stretch; }
          .dept-search { max-width: none; }
        }
        .dept-card {
          position: relative;
          text-align: left;
          background: var(--bg-surface);
          border: 1px solid var(--border-subtle);
          border-radius: var(--radius-lg);
          padding: 22px;
          color: var(--text-primary);
          cursor: pointer;
          overflow: hidden;
          transition: border-color var(--transition-smooth), transform var(--transition-smooth), box-shadow var(--transition-smooth);
          display: flex;
          flex-direction: column;
          min-height: 220px;
        }
        .dept-card::before {
          content: '';
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          height: 3px;
          background: linear-gradient(135deg, var(--dept-color), color-mix(in srgb, var(--dept-color) 40%, #fff));
          opacity: 0.9;
        }
        .dept-card:hover {
          border-color: var(--border-default);
          transform: translateY(-3px);
          box-shadow: var(--shadow-glow), 0 4px 24px color-mix(in srgb, var(--dept-color) 15%, transparent);
        }
        .dept-card:hover .dept-card-arrow { transform: translateX(2px); opacity: 1; }
        .dept-card-head {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          margin-bottom: 14px;
        }
        .dept-card-icon {
          width: 54px;
          height: 54px;
          border-radius: var(--radius-md);
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }
        .dept-card-arrow {
          color: var(--text-muted);
          opacity: 0.5;
          transition: transform var(--transition-smooth), opacity var(--transition-smooth);
          margin-top: 4px;
        }
        .dept-card-body { flex: 1; }
        .dept-card-name {
          font-size: 1.125rem;
          font-weight: 700;
          color: var(--text-primary);
          margin-bottom: 6px;
          letter-spacing: -0.01em;
        }
        .dept-card-desc {
          font-size: 0.875rem;
          color: var(--text-secondary);
          line-height: 1.5;
          margin-bottom: 14px;
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
          overflow: hidden;
        }
        .dept-card-desc.dim { color: var(--text-muted); font-style: italic; }
        .dept-card-counts {
          display: flex;
          gap: 10px;
          flex-wrap: wrap;
          margin-bottom: 16px;
        }
        .dept-count {
          display: inline-flex;
          align-items: center;
          gap: 5px;
          padding: 4px 10px;
          background: var(--bg-overlay);
          border: 1px solid var(--border-subtle);
          border-radius: 99px;
          font-size: 0.75rem;
          font-weight: 600;
          color: var(--text-secondary);
        }
        .dept-card-foot {
          padding-top: 14px;
          border-top: 1px solid var(--border-subtle);
        }
        .dept-head-chip {
          display: flex;
          align-items: center;
          gap: 10px;
        }
        .dept-head-info { min-width: 0; flex: 1; }
        .dept-head-name {
          font-size: 0.875rem;
          font-weight: 600;
          color: var(--text-primary);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .dept-head-name.muted { color: var(--text-muted); font-weight: 500; }
        .dept-head-role {
          font-size: 0.75rem;
          color: var(--text-muted);
        }
        .empty-avatar {
          background: var(--bg-hover) !important;
          color: var(--text-muted) !important;
          font-weight: 700;
        }
        .dept-swatch-row {
          display: flex;
          gap: 10px;
          flex-wrap: wrap;
          margin-top: 4px;
        }
        .dept-swatch {
          width: 30px;
          height: 30px;
          border-radius: 50%;
          cursor: pointer;
          transition: transform var(--transition);
        }
        .dept-swatch:hover { transform: scale(1.1); }
        .dept-icon-grid {
          display: grid;
          grid-template-columns: repeat(8, 1fr);
          gap: 8px;
          margin-top: 4px;
        }
        @media (max-width: 520px) {
          .dept-icon-grid { grid-template-columns: repeat(4, 1fr); }
        }
        .dept-icon-tile {
          aspect-ratio: 1;
          display: flex;
          align-items: center;
          justify-content: center;
          background: var(--bg-overlay);
          border: 1px solid var(--border-default);
          border-radius: var(--radius-md);
          color: var(--text-secondary);
          cursor: pointer;
          transition: all var(--transition-smooth);
        }
        .dept-icon-tile:hover {
          border-color: var(--border-strong);
          color: var(--text-primary);
          transform: translateY(-1px);
        }
        .spin { animation: spin 0.7s linear infinite; }
      `}</style>
    </>
  )
}
