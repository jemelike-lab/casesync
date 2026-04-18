'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  Building2, Users, Ticket, CheckSquare,
  Crown, Mail, Phone, Calendar, Clock, Activity,
  Edit2, Trash2, UserPlus, X, Search, Plus, ChevronLeft,
  ShieldCheck, Settings as SettingsIcon, AlertTriangle,
  Loader2, Check, LayoutGrid, List, Eye, UserX, Star,
  Award, GraduationCap,
} from 'lucide-react'
import { getInitials, formatDate, formatDateTime, timeAgo } from '@/lib/workryn/utils'
import { DEPT_ICON_OPTIONS, DEPT_COLOR_SWATCHES, getDeptIcon } from '../DepartmentsClient'

/* ─── Types ─────────────────────────────────────────────────────────────── */
type Member = {
  id: string
  name: string | null
  email: string | null
  jobTitle: string | null
  phone: string | null
  role: string
  avatarColor: string
  isActive: boolean
  lastLogin: string | null
  createdAt: string
  mfaEnabled: boolean
}

type DeptHead = {
  id: string
  name: string | null
  email: string | null
  jobTitle: string | null
  role: string
  avatarColor: string
  phone: string | null
} | null

export type DepartmentDetail = {
  id: string
  name: string
  slug: string
  description: string | null
  color: string
  icon: string
  createdAt: string
  updatedAt: string
  head: DeptHead
  users: Member[]
  _count: { tasks: number; tickets: number; users: number }
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

type AuditLog = {
  id: string
  action: string
  resourceType: string
  details: string | null
  createdAt: string
  user: { id: string; name: string | null; avatarColor: string }
}

type ContactStats = {
  tasksAssigned: number
  ticketsCreated: number
  trainingCompleted: number
  evaluationsReceived: number
}

type ContactCardData = {
  id: string
  name: string | null
  email: string | null
  jobTitle: string | null
  phone: string | null
  role: string
  avatarColor: string
  isActive: boolean
  lastLogin: string | null
  createdAt: string
  department: { id: string; name: string; color: string }
  stats: ContactStats
}

interface Props {
  initialDepartment: DepartmentDetail
  allUsers: UserOption[]
  auditLogs: AuditLog[]
  currentUserId: string
  currentUserRole: string
}

const ROLE_COLORS: Record<string, string> = {
  OWNER: '#fbbf24',
  ADMIN: '#8b5cf6',
  MANAGER: '#6366f1',
  STAFF: '#64748b',
}

type TabId = 'overview' | 'members' | 'directory' | 'settings'

/* ─── Component ─────────────────────────────────────────────────────────── */
export default function DepartmentDetailClient({
  initialDepartment,
  allUsers,
  auditLogs: initialAuditLogs,
  currentUserId,
  currentUserRole,
}: Props) {
  const router = useRouter()
  const isAdmin = currentUserRole === 'OWNER' || currentUserRole === 'ADMIN'

  const [dept, setDept] = useState<DepartmentDetail>(initialDepartment)
  const [auditLogs] = useState<AuditLog[]>(initialAuditLogs)
  const [tab, setTab] = useState<TabId>('overview')

  // Members / directory search
  const [memberSearch, setMemberSearch] = useState('')
  const [directorySearch, setDirectorySearch] = useState('')

  // Contact card modal state
  const [contactOpen, setContactOpen] = useState(false)
  const [contactLoading, setContactLoading] = useState(false)
  const [contactData, setContactData] = useState<ContactCardData | null>(null)

  // Add member modal state
  const [showAddMember, setShowAddMember] = useState(false)
  const [addMemberId, setAddMemberId] = useState('')
  const [addMemberError, setAddMemberError] = useState<string | null>(null)
  const [savingAdd, setSavingAdd] = useState(false)

  // Settings form state
  const [settingsForm, setSettingsForm] = useState({
    name: dept.name,
    description: dept.description ?? '',
    color: dept.color,
    icon: dept.icon,
    headId: dept.head?.id ?? '',
  })
  const [savingSettings, setSavingSettings] = useState(false)
  const [settingsMessage, setSettingsMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  // Delete state
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  // Edit modal (from header button) — reuses settings form
  const [showEditModal, setShowEditModal] = useState(false)

  useEffect(() => {
    setSettingsForm({
      name: dept.name,
      description: dept.description ?? '',
      color: dept.color,
      icon: dept.icon,
      headId: dept.head?.id ?? '',
    })
  }, [dept])

  const Icon = getDeptIcon(dept.icon)

  /* ── Derived data ────────────────────────────────────────────────────── */
  const filteredMembers = useMemo(() => {
    const q = memberSearch.trim().toLowerCase()
    if (!q) return dept.users
    return dept.users.filter(u =>
      (u.name ?? '').toLowerCase().includes(q) ||
      (u.email ?? '').toLowerCase().includes(q) ||
      (u.jobTitle ?? '').toLowerCase().includes(q)
    )
  }, [dept.users, memberSearch])

  const filteredDirectory = useMemo(() => {
    const q = directorySearch.trim().toLowerCase()
    if (!q) return dept.users
    return dept.users.filter(u =>
      (u.name ?? '').toLowerCase().includes(q) ||
      (u.email ?? '').toLowerCase().includes(q) ||
      (u.jobTitle ?? '').toLowerCase().includes(q)
    )
  }, [dept.users, directorySearch])

  const availableToAdd = useMemo(
    () => allUsers.filter(u => u.departmentId !== dept.id),
    [allUsers, dept.id]
  )

  const tabs: { id: TabId; label: string; icon: React.ReactNode; gated?: boolean }[] = [
    { id: 'overview', label: 'Overview', icon: <LayoutGrid size={16} /> },
    { id: 'members', label: 'Members', icon: <Users size={16} /> },
    { id: 'directory', label: 'Directory', icon: <List size={16} /> },
    { id: 'settings', label: 'Settings', icon: <SettingsIcon size={16} />, gated: true },
  ]

  const visibleTabs = tabs.filter(t => !t.gated || isAdmin)

  /* ── Handlers ────────────────────────────────────────────────────────── */
  async function openContactCard(userId: string) {
    setContactOpen(true)
    setContactLoading(true)
    setContactData(null)
    try {
      const res = await fetch(`/api/workryn/departments/${dept.id}/contact/${userId}`)
      if (!res.ok) {
        setContactData(null)
        return
      }
      const data = await res.json()
      setContactData(data)
    } catch {
      setContactData(null)
    } finally {
      setContactLoading(false)
    }
  }

  function closeContact() {
    setContactOpen(false)
    setContactData(null)
  }

  async function handleAddMember() {
    if (!addMemberId) return
    setSavingAdd(true)
    setAddMemberError(null)
    try {
      const res = await fetch(`/api/workryn/departments/${dept.id}/members`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: addMemberId }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        setAddMemberError(err.error || 'Failed to add member')
        return
      }
      // Refetch department members
      await refreshMembers()
      setShowAddMember(false)
      setAddMemberId('')
    } catch {
      setAddMemberError('Failed to add member')
    } finally {
      setSavingAdd(false)
    }
  }

  async function refreshMembers() {
    try {
      const res = await fetch(`/api/workryn/departments/${dept.id}/members`)
      if (!res.ok) return
      const users: Member[] = await res.json()
      setDept(d => ({
        ...d,
        users,
        _count: { ...d._count, users: users.length },
      }))
    } catch {
      // ignore
    }
  }

  async function handleRemoveMember(user: Member) {
    if (!isAdmin) return
    if (!confirm(`Remove ${user.name} from ${dept.name}?`)) return
    try {
      const res = await fetch(`/api/workryn/departments/${dept.id}/members/${user.id}`, {
        method: 'DELETE',
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        alert(err.error || 'Failed to remove member')
        return
      }
      setDept(d => ({
        ...d,
        users: d.users.filter(u => u.id !== user.id),
        _count: { ...d._count, users: d._count.users - 1 },
        head: d.head && d.head.id === user.id ? null : d.head,
      }))
    } catch {
      alert('Failed to remove member')
    }
  }

  async function handleSaveSettings() {
    setSavingSettings(true)
    setSettingsMessage(null)
    try {
      const res = await fetch(`/api/workryn/departments/${dept.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: settingsForm.name.trim(),
          description: settingsForm.description.trim() || null,
          color: settingsForm.color,
          icon: settingsForm.icon,
          headId: settingsForm.headId || null,
        }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        setSettingsMessage({ type: 'error', text: err.error || 'Failed to save settings' })
        return
      }
      const updated = await res.json()
      setDept(d => ({
        ...d,
        name: updated.name ?? d.name,
        description: updated.description ?? null,
        color: updated.color ?? d.color,
        icon: updated.icon ?? d.icon,
        head: updated.head ?? null,
      }))
      setSettingsMessage({ type: 'success', text: 'Department updated successfully.' })
      setShowEditModal(false)
    } catch {
      setSettingsMessage({ type: 'error', text: 'Failed to save settings' })
    } finally {
      setSavingSettings(false)
    }
  }

  async function handleDelete() {
    setDeleting(true)
    setDeleteError(null)
    try {
      const res = await fetch(`/api/workryn/departments/${dept.id}`, { method: 'DELETE' })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        setDeleteError(err.error || 'Failed to delete department')
        return
      }
      router.push('/w/departments')
    } catch {
      setDeleteError('Failed to delete department')
    } finally {
      setDeleting(false)
    }
  }

  /* ── Render ──────────────────────────────────────────────────────────── */
  return (
    <>
      <div style={{ padding: '20px 32px 0' }}>
        <button
          className="btn btn-ghost btn-sm focus-ring"
          onClick={() => router.push('/w/departments')}
          style={{ marginBottom: 16 }}
        >
          <ChevronLeft size={14} /> All Departments
        </button>

        {/* Header Card */}
        <div
          className="dept-header-card animate-slide-up"
          style={{ ['--dept-color' as any]: dept.color }}
        >
          <div className="dept-header-bg" />
          <div className="dept-header-content">
            <div className="dept-header-left">
              <div
                className="dept-header-icon"
                style={{
                  background: `${dept.color}1f`,
                  border: `1px solid ${dept.color}44`,
                }}
              >
                <Icon size={40} color={dept.color} />
              </div>
              <div className="dept-header-text">
                <h1 style={{ margin: 0, fontSize: '1.75rem', letterSpacing: '-0.02em' }}>
                  {dept.name}
                </h1>
                {dept.description ? (
                  <p style={{ margin: '6px 0 0', maxWidth: 560 }}>{dept.description}</p>
                ) : (
                  <p style={{ margin: '6px 0 0', color: 'var(--text-muted)', fontStyle: 'italic' }}>
                    No description
                  </p>
                )}
                <div className="dept-header-meta">
                  <span className="dept-header-meta-item">
                    <Users size={13} /> {dept._count.users} members
                  </span>
                  <span className="dept-header-meta-item">
                    <Calendar size={13} /> Created {formatDate(dept.createdAt)}
                  </span>
                  {dept.head && (
                    <div className="dept-header-head-chip">
                      <div
                        className="avatar avatar-sm"
                        style={{ background: dept.head.avatarColor }}
                      >
                        {getInitials(dept.head.name ?? 'U')}
                      </div>
                      <div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                          Department Head
                        </div>
                        <div
                          style={{
                            fontSize: '0.875rem',
                            fontWeight: 600,
                            color: 'var(--text-primary)',
                            display: 'flex',
                            alignItems: 'center',
                            gap: 4,
                          }}
                        >
                          {dept.head.name}
                          {dept.head.role === 'OWNER' && (
                            <Crown size={12} color="#fbbf24" />
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {isAdmin && (
              <div className="dept-header-actions">
                <button
                  className="btn btn-ghost focus-ring"
                  onClick={() => setShowEditModal(true)}
                  id="btn-edit-department"
                >
                  <Edit2 size={14} /> Edit
                </button>
                <button
                  className="btn btn-danger focus-ring"
                  onClick={() => setShowDeleteConfirm(true)}
                  id="btn-delete-department"
                >
                  <Trash2 size={14} /> Delete
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Tabs */}
        <div className="dept-tabs">
          {visibleTabs.map(t => (
            <button
              key={t.id}
              className={`dept-tab-btn focus-ring ${tab === t.id ? 'active' : ''}`}
              onClick={() => setTab(t.id)}
              id={`dept-tab-${t.id}`}
            >
              {t.icon} {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="page-body" style={{ paddingTop: 24 }}>
        {/* ── OVERVIEW TAB ──────────────────────────────────────────────── */}
        {tab === 'overview' && (
          <div className="animate-in">
            <div className="dept-stat-grid">
              <div className="stat-card">
                <div className="stat-icon" style={{ background: 'rgba(99,102,241,0.12)' }}>
                  <Users size={22} color="#6366f1" />
                </div>
                <div className="stat-value">{dept._count.users}</div>
                <div className="stat-label">Members</div>
              </div>
              <div className="stat-card">
                <div className="stat-icon" style={{ background: 'rgba(245,158,11,0.12)' }}>
                  <Ticket size={22} color="#f59e0b" />
                </div>
                <div className="stat-value">{dept._count.tickets}</div>
                <div className="stat-label">Tickets</div>
              </div>
              <div className="stat-card">
                <div className="stat-icon" style={{ background: 'rgba(16,185,129,0.12)' }}>
                  <CheckSquare size={22} color="#10b981" />
                </div>
                <div className="stat-value">{dept._count.tasks}</div>
                <div className="stat-label">Tasks</div>
              </div>
            </div>

            <div className="dept-overview-grid">
              {/* Department Head Card */}
              <div className="glass-card">
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    marginBottom: 14,
                  }}
                >
                  <h3 style={{ margin: 0, fontSize: '0.9375rem' }}>Department Head</h3>
                  {isAdmin && (
                    <button
                      className="btn btn-ghost btn-sm focus-ring"
                      onClick={() => setTab('settings')}
                    >
                      <Edit2 size={13} /> Change
                    </button>
                  )}
                </div>

                {dept.head ? (
                  <div
                    className="dept-head-card-inner"
                    onClick={() => openContactCard(dept.head!.id)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={e => {
                      if (e.key === 'Enter') openContactCard(dept.head!.id)
                    }}
                  >
                    <div
                      className="avatar avatar-lg"
                      style={{
                        background: dept.head.avatarColor,
                        width: 64,
                        height: 64,
                        fontSize: '1.25rem',
                      }}
                    >
                      {getInitials(dept.head.name ?? 'U')}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div
                        style={{
                          fontSize: '1rem',
                          fontWeight: 700,
                          color: 'var(--text-primary)',
                          display: 'flex',
                          alignItems: 'center',
                          gap: 6,
                        }}
                      >
                        {dept.head.name}
                        {dept.head.role === 'OWNER' && (
                          <Crown size={14} color="#fbbf24" />
                        )}
                      </div>
                      {dept.head.jobTitle && (
                        <div
                          style={{
                            fontSize: '0.8125rem',
                            color: 'var(--text-secondary)',
                            marginTop: 2,
                          }}
                        >
                          {dept.head.jobTitle}
                        </div>
                      )}
                      <div
                        style={{
                          fontSize: '0.75rem',
                          color: 'var(--text-muted)',
                          marginTop: 6,
                          display: 'flex',
                          alignItems: 'center',
                          gap: 4,
                        }}
                      >
                        <Mail size={11} /> {dept.head.email}
                      </div>
                      <span
                        className="badge"
                        style={{
                          marginTop: 10,
                          background: `${ROLE_COLORS[dept.head.role] ?? '#64748b'}22`,
                          color: ROLE_COLORS[dept.head.role] ?? '#64748b',
                          fontWeight: 700,
                        }}
                      >
                        {dept.head.role}
                      </span>
                    </div>
                  </div>
                ) : (
                  <div className="empty-state" style={{ padding: '30px 16px' }}>
                    <UserX size={30} />
                    <p>No department head assigned</p>
                    {isAdmin && (
                      <button
                        className="btn btn-primary btn-sm focus-ring"
                        onClick={() => setTab('settings')}
                      >
                        <UserPlus size={14} /> Assign Head
                      </button>
                    )}
                  </div>
                )}
              </div>

              {/* Recent activity */}
              <div className="glass-card">
                <h3 style={{ margin: '0 0 14px', fontSize: '0.9375rem' }}>
                  <Activity size={14} style={{ display: 'inline', marginRight: 6 }} />
                  Recent Activity
                </h3>
                {auditLogs.length === 0 ? (
                  <div className="empty-state" style={{ padding: '30px 16px' }}>
                    <Activity size={26} />
                    <p>No activity yet</p>
                  </div>
                ) : (
                  <div className="dept-activity-feed">
                    {auditLogs.map(log => (
                      <div key={log.id} className="dept-activity-row">
                        <div
                          className="avatar avatar-sm"
                          style={{ background: log.user.avatarColor, flexShrink: 0 }}
                        >
                          {getInitials(log.user.name ?? 'U')}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: '0.8125rem' }}>
                            <strong style={{ color: 'var(--text-primary)' }}>
                              {log.user.name}
                            </strong>
                            <span
                              style={{
                                color: 'var(--text-secondary)',
                                marginLeft: 6,
                              }}
                            >
                              {log.details || log.action}
                            </span>
                          </div>
                          <div
                            style={{
                              fontSize: '0.6875rem',
                              color: 'var(--text-muted)',
                              marginTop: 2,
                            }}
                          >
                            {formatDateTime(log.createdAt)}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ── MEMBERS TAB ───────────────────────────────────────────────── */}
        {tab === 'members' && (
          <div className="animate-in">
            <div className="dept-topbar">
              <div className="dept-search">
                <Search size={16} className="dept-search-icon" />
                <input
                  className="input focus-ring"
                  placeholder="Search members by name, email, or job title…"
                  value={memberSearch}
                  onChange={e => setMemberSearch(e.target.value)}
                  style={{ paddingLeft: 38 }}
                />
              </div>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                <span
                  style={{
                    fontSize: '0.8125rem',
                    color: 'var(--text-muted)',
                    fontWeight: 600,
                  }}
                >
                  {filteredMembers.length} {filteredMembers.length === 1 ? 'member' : 'members'}
                </span>
                {isAdmin && (
                  <button
                    className="btn btn-primary focus-ring"
                    onClick={() => {
                      setAddMemberId('')
                      setAddMemberError(null)
                      setShowAddMember(true)
                    }}
                    id="btn-add-member"
                  >
                    <UserPlus size={15} /> Add Member
                  </button>
                )}
              </div>
            </div>

            {filteredMembers.length === 0 ? (
              <div className="empty-state">
                <Users size={36} />
                <p>
                  {memberSearch
                    ? `No members match "${memberSearch}"`
                    : 'No members in this department yet.'}
                </p>
              </div>
            ) : (
              <div className="table-wrap" style={{ marginTop: 16 }}>
                <table>
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Role</th>
                      <th className="hide-md">Job Title</th>
                      <th className="hide-md">Email</th>
                      <th className="hide-lg">Phone</th>
                      <th>Status</th>
                      <th className="hide-md">Last Login</th>
                      <th style={{ textAlign: 'right' }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredMembers.map(user => {
                      const isHead = dept.head?.id === user.id
                      return (
                        <tr key={user.id} id={`member-row-${user.id}`}>
                          <td>
                            <div className="flex items-center gap-3">
                              <div
                                className="avatar"
                                style={{
                                  background: user.avatarColor,
                                  width: 34,
                                  height: 34,
                                  fontSize: '0.75rem',
                                }}
                              >
                                {getInitials(user.name ?? 'U')}
                              </div>
                              <div>
                                <div
                                  style={{
                                    fontWeight: 600,
                                    color: 'var(--text-primary)',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 6,
                                  }}
                                >
                                  {user.name}
                                  {isHead && (
                                    <span title="Department Head">
                                      <Star size={13} color={dept.color} fill={dept.color} />
                                    </span>
                                  )}
                                  {user.role === 'OWNER' && (
                                    <span title="Owner">
                                      <Crown size={13} color="#fbbf24" />
                                    </span>
                                  )}
                                </div>
                                <div
                                  className="hide-lg-inline"
                                  style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}
                                >
                                  {user.email}
                                </div>
                              </div>
                            </div>
                          </td>
                          <td>
                            {user.role === 'OWNER' ? (
                              <span
                                className="badge"
                                style={{
                                  background:
                                    'linear-gradient(135deg, rgba(251,191,36,0.25), rgba(245,158,11,0.25))',
                                  color: '#fbbf24',
                                  border: '1px solid rgba(251,191,36,0.4)',
                                  fontWeight: 700,
                                }}
                              >
                                <Crown size={11} /> OWNER
                              </span>
                            ) : (
                              <span
                                className="badge"
                                style={{
                                  background: `${ROLE_COLORS[user.role] ?? '#64748b'}22`,
                                  color: ROLE_COLORS[user.role] ?? '#64748b',
                                  fontWeight: 700,
                                }}
                              >
                                {user.role}
                              </span>
                            )}
                          </td>
                          <td className="hide-md" style={{ color: 'var(--text-secondary)' }}>
                            {user.jobTitle || '—'}
                          </td>
                          <td
                            className="hide-md"
                            style={{ color: 'var(--text-muted)', fontSize: '0.8125rem' }}
                          >
                            {user.email}
                          </td>
                          <td
                            className="hide-lg"
                            style={{ color: 'var(--text-muted)', fontSize: '0.8125rem' }}
                          >
                            {user.phone || '—'}
                          </td>
                          <td>
                            <span
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 6,
                                fontSize: '0.8125rem',
                                fontWeight: 600,
                                color: user.isActive ? 'var(--success)' : 'var(--danger)',
                              }}
                            >
                              <span
                                className="dot"
                                style={{
                                  background: user.isActive
                                    ? 'var(--success)'
                                    : 'var(--danger)',
                                }}
                              />
                              {user.isActive ? 'Active' : 'Inactive'}
                            </span>
                          </td>
                          <td
                            className="hide-md"
                            style={{ color: 'var(--text-muted)', fontSize: '0.8125rem' }}
                          >
                            {user.lastLogin ? timeAgo(user.lastLogin) : 'Never'}
                          </td>
                          <td style={{ textAlign: 'right' }}>
                            <div
                              style={{ display: 'inline-flex', gap: 6, justifyContent: 'flex-end' }}
                            >
                              <button
                                className="btn btn-icon btn-ghost focus-ring"
                                style={{ width: 30, height: 30 }}
                                onClick={() => openContactCard(user.id)}
                                title="View contact card"
                                aria-label="View contact card"
                              >
                                <Eye size={14} />
                              </button>
                              {isAdmin && (
                                <button
                                  className="btn btn-icon btn-ghost focus-ring"
                                  style={{ width: 30, height: 30, color: 'var(--danger)' }}
                                  onClick={() => handleRemoveMember(user)}
                                  title="Remove from department"
                                  aria-label="Remove from department"
                                >
                                  <UserX size={14} />
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* ── DIRECTORY TAB ─────────────────────────────────────────────── */}
        {tab === 'directory' && (
          <div className="animate-in">
            <div className="dept-topbar">
              <div className="dept-search">
                <Search size={16} className="dept-search-icon" />
                <input
                  className="input focus-ring"
                  placeholder="Search directory…"
                  value={directorySearch}
                  onChange={e => setDirectorySearch(e.target.value)}
                  style={{ paddingLeft: 38 }}
                />
              </div>
              <span
                style={{
                  fontSize: '0.8125rem',
                  color: 'var(--text-muted)',
                  fontWeight: 600,
                }}
              >
                {filteredDirectory.length} people
              </span>
            </div>

            {filteredDirectory.length === 0 ? (
              <div className="empty-state">
                <Users size={36} />
                <p>
                  {directorySearch
                    ? `No people match "${directorySearch}"`
                    : 'No members in this department yet.'}
                </p>
              </div>
            ) : (
              <div className="dept-directory-grid">
                {filteredDirectory.map((user, idx) => {
                  const isHead = dept.head?.id === user.id
                  return (
                    <button
                      key={user.id}
                      className="dept-directory-card focus-ring animate-slide-up"
                      style={{ animationDelay: `${Math.min(idx, 10) * 30}ms` }}
                      onClick={() => openContactCard(user.id)}
                      id={`directory-card-${user.id}`}
                    >
                      {isHead && (
                        <div
                          className="dept-directory-head-badge"
                          style={{ background: dept.color }}
                        >
                          <Star size={10} fill="#fff" /> Head
                        </div>
                      )}
                      <div
                        className="dept-directory-avatar"
                        style={{ background: user.avatarColor }}
                      >
                        {getInitials(user.name ?? 'U')}
                      </div>
                      <div
                        style={{
                          fontWeight: 700,
                          fontSize: '0.9375rem',
                          color: 'var(--text-primary)',
                          marginTop: 12,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: 5,
                        }}
                      >
                        {user.name}
                        {user.role === 'OWNER' && <Crown size={12} color="#fbbf24" />}
                      </div>
                      <span
                        className="badge"
                        style={{
                          marginTop: 6,
                          background: `${ROLE_COLORS[user.role] ?? '#64748b'}22`,
                          color: ROLE_COLORS[user.role] ?? '#64748b',
                          fontWeight: 700,
                        }}
                      >
                        {user.role}
                      </span>
                      {user.jobTitle && (
                        <div
                          style={{
                            marginTop: 8,
                            fontSize: '0.8125rem',
                            color: 'var(--text-muted)',
                            textAlign: 'center',
                          }}
                        >
                          {user.jobTitle}
                        </div>
                      )}
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {/* ── SETTINGS TAB ──────────────────────────────────────────────── */}
        {tab === 'settings' && isAdmin && (
          <div className="animate-in" style={{ maxWidth: 720 }}>
            <div className="glass-card">
              <h3 style={{ marginTop: 0 }}>Department Settings</h3>
              <p style={{ fontSize: '0.8125rem', marginBottom: 20 }}>
                Update the name, appearance, and head for this department.
              </p>

              <div className="form-group" style={{ marginBottom: 14 }}>
                <label className="label">Name</label>
                <input
                  className="input focus-ring"
                  value={settingsForm.name}
                  onChange={e =>
                    setSettingsForm(f => ({ ...f, name: e.target.value }))
                  }
                />
              </div>

              <div className="form-group" style={{ marginBottom: 14 }}>
                <label className="label">Description</label>
                <textarea
                  className="input focus-ring"
                  value={settingsForm.description}
                  onChange={e =>
                    setSettingsForm(f => ({ ...f, description: e.target.value }))
                  }
                  rows={3}
                  style={{ resize: 'vertical' }}
                />
              </div>

              <div className="form-group" style={{ marginBottom: 14 }}>
                <label className="label">Color</label>
                <div className="dept-swatch-row">
                  {DEPT_COLOR_SWATCHES.map(c => (
                    <button
                      key={c}
                      type="button"
                      aria-label={`Color ${c}`}
                      className="dept-swatch"
                      style={{
                        background: c,
                        outline: settingsForm.color === c ? `2px solid ${c}` : 'none',
                        border:
                          settingsForm.color === c
                            ? '3px solid #fff'
                            : '3px solid transparent',
                      }}
                      onClick={() => setSettingsForm(f => ({ ...f, color: c }))}
                    />
                  ))}
                </div>
              </div>

              <div className="form-group" style={{ marginBottom: 14 }}>
                <label className="label">Icon</label>
                <div className="dept-icon-grid">
                  {DEPT_ICON_OPTIONS.map(({ key, label, Icon }) => (
                    <button
                      key={key}
                      type="button"
                      aria-label={label}
                      title={label}
                      className={`dept-icon-tile focus-ring ${
                        settingsForm.icon === key ? 'active' : ''
                      }`}
                      style={
                        settingsForm.icon === key
                          ? {
                              borderColor: settingsForm.color,
                              background: `${settingsForm.color}1a`,
                              color: settingsForm.color,
                            }
                          : undefined
                      }
                      onClick={() => setSettingsForm(f => ({ ...f, icon: key }))}
                    >
                      <Icon size={20} />
                    </button>
                  ))}
                </div>
              </div>

              <div className="form-group" style={{ marginBottom: 18 }}>
                <label className="label">Department Head</label>
                <select
                  className="input focus-ring"
                  value={settingsForm.headId}
                  onChange={e =>
                    setSettingsForm(f => ({ ...f, headId: e.target.value }))
                  }
                >
                  <option value="">— No head assigned —</option>
                  {dept.users.map(u => (
                    <option key={u.id} value={u.id}>
                      {u.name} {u.jobTitle ? `· ${u.jobTitle}` : ''}
                    </option>
                  ))}
                </select>
                <div
                  style={{
                    fontSize: '0.75rem',
                    color: 'var(--text-muted)',
                    marginTop: 6,
                  }}
                >
                  Only current members can be assigned as head. Add users via the Members tab first.
                </div>
              </div>

              {settingsMessage && (
                <div
                  style={{
                    background:
                      settingsMessage.type === 'success'
                        ? 'rgba(16,185,129,0.08)'
                        : 'rgba(239,68,68,0.08)',
                    border: `1px solid ${
                      settingsMessage.type === 'success'
                        ? 'rgba(16,185,129,0.3)'
                        : 'rgba(239,68,68,0.3)'
                    }`,
                    borderRadius: 'var(--radius-md)',
                    padding: 10,
                    fontSize: '0.8125rem',
                    color:
                      settingsMessage.type === 'success' ? 'var(--success)' : 'var(--danger)',
                    marginBottom: 12,
                  }}
                >
                  {settingsMessage.text}
                </div>
              )}

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
                <button
                  className="btn btn-primary focus-ring"
                  onClick={handleSaveSettings}
                  disabled={savingSettings || !settingsForm.name.trim()}
                  id="btn-save-settings"
                >
                  {savingSettings ? (
                    <Loader2 size={16} className="spin" />
                  ) : (
                    <>
                      <Check size={15} /> Save Changes
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Danger Zone */}
            <div
              style={{
                marginTop: 24,
                padding: 22,
                background: 'rgba(239,68,68,0.04)',
                border: '1px solid rgba(239,68,68,0.3)',
                borderRadius: 'var(--radius-lg)',
              }}
            >
              <h3
                style={{
                  margin: 0,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  color: 'var(--danger)',
                }}
              >
                <AlertTriangle size={16} /> Danger Zone
              </h3>
              <p
                style={{
                  fontSize: '0.8125rem',
                  marginTop: 6,
                  marginBottom: 16,
                }}
              >
                Deleting a department cannot be undone. All members must be removed first.
              </p>
              <button
                className="btn btn-danger focus-ring"
                onClick={() => setShowDeleteConfirm(true)}
                id="btn-danger-delete-dept"
              >
                <Trash2 size={14} /> Delete Department
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ── Add Member Modal ──────────────────────────────────────────── */}
      {showAddMember && (
        <div className="modal-overlay" onClick={() => setShowAddMember(false)}>
          <div
            className="modal animate-scale-in"
            onClick={e => e.stopPropagation()}
            style={{ maxWidth: 460 }}
          >
            <div className="modal-header">
              <h3>Add Member to {dept.name}</h3>
              <button
                className="btn btn-icon btn-ghost focus-ring"
                onClick={() => setShowAddMember(false)}
                aria-label="Close"
                title="Close"
              >
                <X size={18} />
              </button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label className="label">Select User</label>
                <select
                  className="input focus-ring"
                  value={addMemberId}
                  onChange={e => setAddMemberId(e.target.value)}
                  autoFocus
                >
                  <option value="">— Choose a user —</option>
                  {availableToAdd.map(u => (
                    <option key={u.id} value={u.id}>
                      {u.name} {u.jobTitle ? `· ${u.jobTitle}` : ''}
                    </option>
                  ))}
                </select>
                {availableToAdd.length === 0 && (
                  <div
                    style={{
                      fontSize: '0.8125rem',
                      color: 'var(--text-muted)',
                      marginTop: 6,
                    }}
                  >
                    All active users are already in this department.
                  </div>
                )}
              </div>
              {addMemberError && (
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
                  {addMemberError}
                </div>
              )}
            </div>
            <div className="modal-footer">
              <button
                className="btn btn-ghost focus-ring"
                onClick={() => setShowAddMember(false)}
              >
                Cancel
              </button>
              <button
                className="btn btn-primary focus-ring"
                onClick={handleAddMember}
                disabled={!addMemberId || savingAdd}
              >
                {savingAdd ? (
                  <Loader2 size={16} className="spin" />
                ) : (
                  <>
                    <UserPlus size={15} /> Add Member
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Edit Modal (opens from header) ─────────────────────────────── */}
      {showEditModal && (
        <div className="modal-overlay" onClick={() => setShowEditModal(false)}>
          <div
            className="modal animate-scale-in"
            onClick={e => e.stopPropagation()}
            style={{ maxWidth: 520 }}
          >
            <div className="modal-header">
              <h3>Edit Department</h3>
              <button
                className="btn btn-icon btn-ghost focus-ring"
                onClick={() => setShowEditModal(false)}
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
                  value={settingsForm.name}
                  onChange={e =>
                    setSettingsForm(f => ({ ...f, name: e.target.value }))
                  }
                  autoFocus
                />
              </div>
              <div className="form-group">
                <label className="label">Description</label>
                <textarea
                  className="input focus-ring"
                  value={settingsForm.description}
                  onChange={e =>
                    setSettingsForm(f => ({ ...f, description: e.target.value }))
                  }
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
                      className="dept-swatch"
                      aria-label={`Color ${c}`}
                      style={{
                        background: c,
                        outline: settingsForm.color === c ? `2px solid ${c}` : 'none',
                        border:
                          settingsForm.color === c
                            ? '3px solid #fff'
                            : '3px solid transparent',
                      }}
                      onClick={() => setSettingsForm(f => ({ ...f, color: c }))}
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
                      className={`dept-icon-tile focus-ring ${
                        settingsForm.icon === key ? 'active' : ''
                      }`}
                      style={
                        settingsForm.icon === key
                          ? {
                              borderColor: settingsForm.color,
                              background: `${settingsForm.color}1a`,
                              color: settingsForm.color,
                            }
                          : undefined
                      }
                      onClick={() => setSettingsForm(f => ({ ...f, icon: key }))}
                    >
                      <Icon size={20} />
                    </button>
                  ))}
                </div>
              </div>
              <div className="form-group">
                <label className="label">Department Head</label>
                <select
                  className="input focus-ring"
                  value={settingsForm.headId}
                  onChange={e =>
                    setSettingsForm(f => ({ ...f, headId: e.target.value }))
                  }
                >
                  <option value="">— No head assigned —</option>
                  {dept.users.map(u => (
                    <option key={u.id} value={u.id}>
                      {u.name} {u.jobTitle ? `· ${u.jobTitle}` : ''}
                    </option>
                  ))}
                </select>
              </div>
              {settingsMessage && settingsMessage.type === 'error' && (
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
                  {settingsMessage.text}
                </div>
              )}
            </div>
            <div className="modal-footer">
              <button
                className="btn btn-ghost focus-ring"
                onClick={() => setShowEditModal(false)}
              >
                Cancel
              </button>
              <button
                className="btn btn-primary focus-ring"
                onClick={handleSaveSettings}
                disabled={savingSettings || !settingsForm.name.trim()}
              >
                {savingSettings ? (
                  <Loader2 size={16} className="spin" />
                ) : (
                  'Save Changes'
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Delete Confirm Modal ──────────────────────────────────────── */}
      {showDeleteConfirm && (
        <div
          className="modal-overlay"
          onClick={() => !deleting && setShowDeleteConfirm(false)}
        >
          <div
            className="modal animate-scale-in"
            onClick={e => e.stopPropagation()}
            style={{ maxWidth: 460 }}
          >
            <div className="modal-header">
              <h3 style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <AlertTriangle size={18} color="var(--danger)" /> Delete Department
              </h3>
              <button
                className="btn btn-icon btn-ghost focus-ring"
                onClick={() => setShowDeleteConfirm(false)}
                aria-label="Close"
                title="Close"
                disabled={deleting}
              >
                <X size={18} />
              </button>
            </div>
            <div className="modal-body">
              <p style={{ marginBottom: 12 }}>
                Are you sure you want to delete <strong>{dept.name}</strong>? This action
                cannot be undone.
              </p>
              <p
                style={{
                  fontSize: '0.8125rem',
                  color: 'var(--text-muted)',
                  marginBottom: 12,
                }}
              >
                Departments with active members cannot be deleted. Remove all members first.
              </p>
              {deleteError && (
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
                  {deleteError}
                </div>
              )}
            </div>
            <div className="modal-footer">
              <button
                className="btn btn-ghost focus-ring"
                onClick={() => setShowDeleteConfirm(false)}
                disabled={deleting}
              >
                Cancel
              </button>
              <button
                className="btn btn-danger focus-ring"
                onClick={handleDelete}
                disabled={deleting}
                id="btn-confirm-delete-dept"
              >
                {deleting ? (
                  <Loader2 size={16} className="spin" />
                ) : (
                  <>
                    <Trash2 size={14} /> Delete Permanently
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Contact Card Modal ────────────────────────────────────────── */}
      {contactOpen && (
        <div className="modal-overlay" onClick={closeContact}>
          <div
            className="modal contact-card animate-scale-in"
            onClick={e => e.stopPropagation()}
            style={{ maxWidth: 500, padding: 0 }}
          >
            <button
              className="btn btn-icon btn-ghost focus-ring contact-close-btn"
              onClick={closeContact}
              aria-label="Close"
              title="Close"
            >
              <X size={18} />
            </button>

            {/* Gradient header bar in dept color */}
            <div
              className="contact-gradient-header"
              style={{
                background: `linear-gradient(135deg, ${dept.color}, color-mix(in srgb, ${dept.color} 50%, #6366f1))`,
              }}
            />

            {contactLoading || !contactData ? (
              <div style={{ padding: 60, textAlign: 'center' }}>
                {contactLoading ? (
                  <Loader2 size={28} className="spin" style={{ color: 'var(--brand)' }} />
                ) : (
                  <div style={{ color: 'var(--text-muted)' }}>Failed to load contact</div>
                )}
              </div>
            ) : (
              <div style={{ padding: '0 28px 24px' }}>
                <div
                  className="avatar avatar-lg contact-avatar"
                  style={{
                    background: contactData.avatarColor,
                    width: 96,
                    height: 96,
                    fontSize: '2rem',
                    border: '4px solid var(--bg-elevated)',
                  }}
                >
                  {getInitials(contactData.name ?? 'U')}
                </div>

                <div style={{ marginTop: 14 }}>
                  <div
                    style={{
                      fontSize: '1.375rem',
                      fontWeight: 700,
                      color: 'var(--text-primary)',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                    }}
                  >
                    {contactData.name}
                    {contactData.role === 'OWNER' && (
                      <Crown size={16} color="#fbbf24" />
                    )}
                    {contactData.role !== 'OWNER' && (
                      <span
                        className="badge"
                        style={{
                          background: `${ROLE_COLORS[contactData.role] ?? '#64748b'}22`,
                          color: ROLE_COLORS[contactData.role] ?? '#64748b',
                          fontWeight: 700,
                        }}
                      >
                        {contactData.role}
                      </span>
                    )}
                    {contactData.role === 'OWNER' && (
                      <span
                        className="badge"
                        style={{
                          background:
                            'linear-gradient(135deg, rgba(251,191,36,0.25), rgba(245,158,11,0.25))',
                          color: '#fbbf24',
                          border: '1px solid rgba(251,191,36,0.4)',
                          fontWeight: 700,
                        }}
                      >
                        OWNER
                      </span>
                    )}
                  </div>
                  {contactData.jobTitle && (
                    <div
                      style={{
                        color: 'var(--text-secondary)',
                        fontSize: '0.9375rem',
                        marginTop: 4,
                      }}
                    >
                      {contactData.jobTitle}
                    </div>
                  )}

                  <div style={{ marginTop: 10 }}>
                    <span
                      className="badge"
                      style={{
                        background: `${contactData.department.color}22`,
                        color: contactData.department.color,
                      }}
                    >
                      <Building2 size={11} /> {contactData.department.name}
                    </span>
                  </div>
                </div>

                {/* Contact rows */}
                <div className="contact-rows">
                  {contactData.email && (
                    <a
                      href={`mailto:${contactData.email}`}
                      className="contact-row focus-ring"
                    >
                      <Mail size={15} />
                      <div>
                        <div className="contact-row-label">Email</div>
                        <div className="contact-row-value">{contactData.email}</div>
                      </div>
                    </a>
                  )}
                  {contactData.phone && (
                    <a
                      href={`tel:${contactData.phone}`}
                      className="contact-row focus-ring"
                    >
                      <Phone size={15} />
                      <div>
                        <div className="contact-row-label">Phone</div>
                        <div className="contact-row-value">{contactData.phone}</div>
                      </div>
                    </a>
                  )}
                </div>

                {/* Stats */}
                <div className="contact-stats">
                  <div className="contact-stat">
                    <CheckSquare size={16} color="#10b981" />
                    <div className="contact-stat-value">
                      {contactData.stats.tasksAssigned}
                    </div>
                    <div className="contact-stat-label">Tasks</div>
                  </div>
                  <div className="contact-stat">
                    <Ticket size={16} color="#f59e0b" />
                    <div className="contact-stat-value">
                      {contactData.stats.ticketsCreated}
                    </div>
                    <div className="contact-stat-label">Tickets</div>
                  </div>
                  <div className="contact-stat">
                    <GraduationCap size={16} color="#8b5cf6" />
                    <div className="contact-stat-value">
                      {contactData.stats.trainingCompleted}
                    </div>
                    <div className="contact-stat-label">Training</div>
                  </div>
                  <div className="contact-stat">
                    <Award size={16} color="#6366f1" />
                    <div className="contact-stat-value">
                      {contactData.stats.evaluationsReceived}
                    </div>
                    <div className="contact-stat-label">Reviews</div>
                  </div>
                </div>

                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    fontSize: '0.75rem',
                    color: 'var(--text-muted)',
                    padding: '12px 0',
                    borderTop: '1px solid var(--border-subtle)',
                    borderBottom: '1px solid var(--border-subtle)',
                    marginTop: 16,
                  }}
                >
                  <span>
                    <Calendar size={11} style={{ display: 'inline', marginRight: 4 }} />
                    Member since {formatDate(contactData.createdAt)}
                  </span>
                  <span>
                    <Clock size={11} style={{ display: 'inline', marginRight: 4 }} />
                    {contactData.lastLogin
                      ? `Last active ${timeAgo(contactData.lastLogin)}`
                      : 'Never logged in'}
                  </span>
                </div>

                <div
                  style={{
                    display: 'flex',
                    gap: 10,
                    marginTop: 18,
                    flexWrap: 'wrap',
                  }}
                >
                  {contactData.email && (
                    <a
                      href={`mailto:${contactData.email}`}
                      className="btn btn-primary focus-ring"
                      style={{ flex: 1, justifyContent: 'center', minWidth: 120 }}
                    >
                      <Mail size={14} /> Email
                    </a>
                  )}
                  {contactData.phone && (
                    <a
                      href={`tel:${contactData.phone}`}
                      className="btn btn-ghost focus-ring"
                      style={{ flex: 1, justifyContent: 'center', minWidth: 120 }}
                    >
                      <Phone size={14} /> Call
                    </a>
                  )}
                  <button
                    className="btn btn-ghost focus-ring"
                    style={{ flex: 1, justifyContent: 'center', minWidth: 120 }}
                    onClick={() => {
                      if (contactData.id === currentUserId) {
                        router.push('/w/profile')
                      } else {
                        closeContact()
                      }
                    }}
                  >
                    <ShieldCheck size={14} /> View Profile
                  </button>
                  {isAdmin && (
                    <button
                      className="btn btn-ghost focus-ring"
                      style={{ justifyContent: 'center', minWidth: 80 }}
                      title="Edit user (admin panel)"
                      onClick={() => router.push('/admin?tab=users')}
                    >
                      <Edit2 size={14} />
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      <style>{`
        .dept-header-card {
          position: relative;
          background: var(--bg-surface);
          border: 1px solid var(--border-subtle);
          border-radius: var(--radius-xl);
          overflow: hidden;
          padding: 28px 28px 26px;
          margin-bottom: 20px;
        }
        .dept-header-bg {
          position: absolute;
          inset: 0;
          background: linear-gradient(135deg, color-mix(in srgb, var(--dept-color) 12%, transparent) 0%, transparent 55%);
          pointer-events: none;
        }
        .dept-header-card::before {
          content: '';
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          height: 4px;
          background: linear-gradient(135deg, var(--dept-color), color-mix(in srgb, var(--dept-color) 40%, #fff));
        }
        .dept-header-content {
          position: relative;
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 20px;
          flex-wrap: wrap;
        }
        .dept-header-left {
          display: flex;
          gap: 20px;
          align-items: flex-start;
          flex: 1;
          min-width: 280px;
        }
        .dept-header-icon {
          width: 84px;
          height: 84px;
          border-radius: var(--radius-lg);
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }
        .dept-header-text { min-width: 0; flex: 1; }
        .dept-header-meta {
          display: flex;
          flex-wrap: wrap;
          gap: 16px;
          margin-top: 16px;
          align-items: center;
        }
        .dept-header-meta-item {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          font-size: 0.8125rem;
          color: var(--text-muted);
          font-weight: 500;
        }
        .dept-header-head-chip {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 6px 12px 6px 6px;
          background: var(--bg-overlay);
          border: 1px solid var(--border-subtle);
          border-radius: 99px;
        }
        .dept-header-actions {
          display: flex;
          gap: 8px;
        }
        .dept-tabs {
          display: flex;
          gap: 4px;
          border-bottom: 1px solid var(--border-subtle);
          margin-top: 8px;
        }
        .dept-tab-btn {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 12px 18px;
          border: none;
          background: none;
          color: var(--text-muted);
          font-size: 0.9rem;
          font-weight: 500;
          cursor: pointer;
          border-bottom: 2px solid transparent;
          margin-bottom: -1px;
          transition: color var(--transition-smooth), border-color var(--transition-smooth);
        }
        .dept-tab-btn:hover { color: var(--text-secondary); }
        .dept-tab-btn.active { color: var(--brand-light); border-bottom-color: var(--brand); }

        /* Overview */
        .dept-stat-grid {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 14px;
          margin-bottom: 22px;
        }
        .dept-overview-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 18px;
        }
        @media (max-width: 1100px) {
          .dept-stat-grid { grid-template-columns: repeat(2, 1fr); }
          .dept-overview-grid { grid-template-columns: 1fr; }
        }
        @media (max-width: 640px) {
          .dept-stat-grid { grid-template-columns: 1fr; }
        }
        .dept-head-card-inner {
          display: flex;
          gap: 16px;
          align-items: flex-start;
          padding: 10px;
          margin: -10px;
          border-radius: var(--radius-md);
          cursor: pointer;
          transition: background var(--transition-smooth);
        }
        .dept-head-card-inner:hover { background: var(--bg-hover); }
        .dept-activity-feed {
          display: flex;
          flex-direction: column;
          gap: 0;
          max-height: 380px;
          overflow-y: auto;
        }
        .dept-activity-row {
          display: flex;
          gap: 10px;
          align-items: flex-start;
          padding: 10px 0;
          border-bottom: 1px solid var(--border-subtle);
        }
        .dept-activity-row:last-child { border-bottom: none; }

        /* Topbar shared */
        .dept-topbar {
          display: flex;
          align-items: center;
          gap: 12px;
          margin-bottom: 4px;
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

        /* Directory */
        .dept-directory-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
          gap: 16px;
          margin-top: 16px;
        }
        .dept-directory-card {
          position: relative;
          background: var(--bg-surface);
          border: 1px solid var(--border-subtle);
          border-radius: var(--radius-lg);
          padding: 24px 16px 20px;
          display: flex;
          flex-direction: column;
          align-items: center;
          cursor: pointer;
          color: var(--text-primary);
          transition: all var(--transition-smooth);
          overflow: hidden;
        }
        .dept-directory-card:hover {
          border-color: var(--border-default);
          transform: translateY(-3px);
          box-shadow: var(--shadow-glow);
        }
        .dept-directory-avatar {
          width: 80px;
          height: 80px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 1.625rem;
          font-weight: 700;
          color: #fff;
          border: 3px solid var(--bg-elevated);
        }
        .dept-directory-head-badge {
          position: absolute;
          top: 10px;
          right: 10px;
          display: inline-flex;
          align-items: center;
          gap: 4px;
          padding: 3px 8px;
          border-radius: 99px;
          font-size: 0.625rem;
          font-weight: 700;
          color: #fff;
          letter-spacing: 0.04em;
          text-transform: uppercase;
        }

        /* Swatches + icons (shared) */
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

        /* Contact Card Modal */
        .contact-card { position: relative; }
        .contact-close-btn {
          position: absolute;
          top: 14px;
          right: 14px;
          z-index: 2;
          color: #fff;
          background: rgba(0,0,0,0.35);
        }
        .contact-close-btn:hover { background: rgba(0,0,0,0.5); }
        .contact-gradient-header {
          height: 110px;
          width: 100%;
        }
        .contact-avatar {
          margin-top: -54px;
          margin-left: 0;
          box-shadow: 0 6px 24px rgba(0,0,0,0.4);
        }
        .contact-rows {
          display: flex;
          flex-direction: column;
          gap: 4px;
          margin-top: 18px;
        }
        .contact-row {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 10px 12px;
          background: var(--bg-overlay);
          border: 1px solid var(--border-subtle);
          border-radius: var(--radius-md);
          color: var(--text-primary);
          transition: all var(--transition-smooth);
        }
        .contact-row:hover {
          border-color: var(--border-default);
          background: var(--bg-hover);
        }
        .contact-row svg { color: var(--brand-light); flex-shrink: 0; }
        .contact-row-label {
          font-size: 0.6875rem;
          color: var(--text-muted);
          text-transform: uppercase;
          letter-spacing: 0.04em;
          font-weight: 600;
        }
        .contact-row-value {
          font-size: 0.875rem;
          color: var(--text-primary);
          font-weight: 500;
        }
        .contact-stats {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 10px;
          margin-top: 18px;
        }
        .contact-stat {
          background: var(--bg-overlay);
          border: 1px solid var(--border-subtle);
          border-radius: var(--radius-md);
          padding: 12px 8px;
          text-align: center;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 4px;
        }
        .contact-stat-value {
          font-size: 1.125rem;
          font-weight: 700;
          color: var(--text-primary);
        }
        .contact-stat-label {
          font-size: 0.6875rem;
          color: var(--text-muted);
          text-transform: uppercase;
          letter-spacing: 0.04em;
          font-weight: 600;
        }

        /* Responsive table column hiding */
        @media (max-width: 1100px) {
          .hide-lg, .hide-lg-inline { display: none; }
        }
        @media (max-width: 820px) {
          .hide-md { display: none; }
        }

        .spin { animation: spin 0.7s linear infinite; }
      `}</style>
    </>
  )
}
