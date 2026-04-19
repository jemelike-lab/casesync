'use client'
import { useEffect, useState, useMemo } from 'react'
import {
  Users, Building2, ShieldCheck, Plus, X, Loader2,
  CheckCircle2, XCircle, Edit2, Activity, Mail, Copy, Link2,
  Crown, ArrowRightLeft,
} from 'lucide-react'
import { getInitials, timeAgo } from '@/lib/workryn/utils'
import { assignableRoles, canCreateRole, canManageUser, isOwner, type Role } from '@/lib/workryn/permissions'

type AdminUser = {
  id: string; name: string | null; email: string | null; role: string
  jobTitle: string | null; isActive: boolean; avatarColor: string
  createdAt: string; lastLogin: string | null
  department: { id: string; name: string; color: string } | null
}
type Dept = {
  id: string; name: string; slug: string; color: string; description: string | null
  _count: { users: number; tasks: number }
}
type AuditLog = {
  id: string; action: string; resourceType: string; details: string | null; createdAt: string
  user: { id: string; name: string | null; avatarColor: string }
}
type Invitation = {
  id: string; email: string; token: string; role: string; status: string
  departmentId: string | null; message: string | null; expiresAt: string; createdAt: string
  invitedBy: { id: string; name: string | null; avatarColor: string }
}

const ROLE_COLORS: Record<string, string> = { OWNER: '#fbbf24', ADMIN: '#8b5cf6', MANAGER: '#6366f1', STAFF: '#64748b' }
const STATUS_COLORS: Record<string, string> = { PENDING: '#f59e0b', ACCEPTED: '#10b981', EXPIRED: '#64748b', REVOKED: '#ef4444' }
const TABS = [
  { id: 'users', label: 'Users', icon: <Users size={16} /> },
  { id: 'departments', label: 'Departments', icon: <Building2 size={16} /> },
  { id: 'audit', label: 'Audit Log', icon: <Activity size={16} /> },
]

interface Props {
  initialUsers: AdminUser[]
  initialDepartments: Dept[]
  auditLogs: AuditLog[]
  initialInvitations?: Invitation[]
  session: { user: { id: string; role: string } } | null
}

export default function AdminClient({ initialUsers, initialDepartments, auditLogs, initialInvitations = [], session }: Props) {
  
  const currentUserRole = session?.user.role as string | undefined
  const currentUserId = session?.user.id as string | undefined
  const myAssignableRoles = useMemo(() => assignableRoles(currentUserRole), [currentUserRole])
  const defaultAssignRole: string = myAssignableRoles.includes('STAFF' as Role)
    ? 'STAFF'
    : myAssignableRoles[0] ?? 'STAFF'
  const viewerIsOwner = isOwner(currentUserRole)

  const [tab, setTab] = useState('users')
  const [users, setUsers] = useState<AdminUser[]>(initialUsers)
  const [departments] = useState<Dept[]>(initialDepartments)
  const [invitations, setInvitations] = useState<Invitation[]>(initialInvitations)
  const [showUserModal, setShowUserModal] = useState(false)
  const [showDeptModal, setShowDeptModal] = useState(false)
  const [showInviteModal, setShowInviteModal] = useState(false)
  const [showTransferModal, setShowTransferModal] = useState(false)
  const [transferTargetId, setTransferTargetId] = useState('')
  const [editUser, setEditUser] = useState<AdminUser | null>(null)
  const [saving, setSaving] = useState(false)
  const [copied, setCopied] = useState<string | null>(null)
  const [userForm, setUserForm] = useState({ name: '', email: '', password: '', role: defaultAssignRole, jobTitle: '', departmentId: '', avatarColor: '#6366f1' })
  const [deptForm, setDeptForm] = useState({ name: '', description: '', color: '#6366f1' })
  const [inviteForm, setInviteForm] = useState({ email: '', role: defaultAssignRole, departmentId: '', message: '' })
  const [inviteFilter, setInviteFilter] = useState('ALL')

  // Check URL params for tab (once on mount)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const urlTab = params.get('tab')
    if (urlTab && TABS.some(t => t.id === urlTab)) {
      setTab(urlTab)
    }
  }, [])

  function openUserCreate() {
    setEditUser(null)
    setUserForm({ name: '', email: '', password: '', role: defaultAssignRole, jobTitle: '', departmentId: '', avatarColor: '#6366f1' })
    setShowUserModal(true)
  }

  function openUserEdit(user: AdminUser) {
    if (!canManageUser(currentUserRole, user.role)) return
    setEditUser(user)
    setUserForm({ name: user.name ?? '', email: user.email ?? '', password: '', role: user.role, jobTitle: user.jobTitle ?? '', departmentId: user.department?.id ?? '', avatarColor: user.avatarColor })
    setShowUserModal(true)
  }

  async function handlePromoteToOwner(user: AdminUser) {
    if (!viewerIsOwner) return
    if (user.role === 'OWNER') return
    if (!confirm(`Promote ${user.name} to OWNER? They will have the same privileges as you.`)) return
    try {
      const res = await fetch('/api/workryn/admin/transfer-ownership', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetUserId: user.id, demoteSelf: false }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        alert(err.error || 'Failed to promote user')
        return
      }
      setUsers(u => u.map(x => x.id === user.id ? { ...x, role: 'OWNER' } : x))
    } catch {
      alert('Failed to promote user')
    }
  }

  async function handleTransferOwnership() {
    if (!viewerIsOwner || !transferTargetId) return
    const target = users.find(u => u.id === transferTargetId)
    if (!target) return
    if (!confirm(`Transfer ownership to ${target.name}? You will be demoted to ADMIN and lose owner privileges.`)) return
    setSaving(true)
    try {
      const res = await fetch('/api/workryn/admin/transfer-ownership', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetUserId: transferTargetId, demoteSelf: true }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        alert(err.error || 'Failed to transfer ownership')
        return
      }
      setUsers(u => u.map(x => {
        if (x.id === transferTargetId) return { ...x, role: 'OWNER' }
        if (x.id === currentUserId) return { ...x, role: 'ADMIN' }
        return x
      }))
      setShowTransferModal(false)
      setTransferTargetId('')
      alert('Ownership transferred. Please sign out and back in to refresh your session.')
    } finally { setSaving(false) }
  }

  async function handleUserSave() {
    setSaving(true)
    try {
      if (editUser) {
        const res = await fetch(`/api/workryn/admin/users/${editUser.id}`, {
          method: 'PUT', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(userForm),
        })
        const updated = await res.json()
        setUsers(u => u.map(x => x.id === editUser.id ? { ...x, ...updated } : x))
      } else {
        const res = await fetch('/api/workryn/admin/users', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(userForm),
        })
        const created = await res.json()
        setUsers(u => [created, ...u])
      }
      setShowUserModal(false)
    } finally { setSaving(false) }
  }

  async function handleUserToggle(userId: string, isActive: boolean) {
    await fetch(`/api/workryn/admin/users/${userId}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isActive: !isActive }),
    })
    setUsers(u => u.map(x => x.id === userId ? { ...x, isActive: !isActive } : x))
  }

  async function handleDeptSave() {
    setSaving(true)
    try {
      const res = await fetch('/api/workryn/admin/departments', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(deptForm),
      })
      const created = await res.json()
      setShowDeptModal(false)
    } finally { setSaving(false) }
  }

  async function handleInviteSend() {
    if (!inviteForm.email.trim()) return
    setSaving(true)
    try {
      const res = await fetch('/api/workryn/invitations', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(inviteForm),
      })
      if (!res.ok) {
        const err = await res.json()
        alert(err.error || 'Failed to send invitation')
        return
      }
      const invite = await res.json()
      setInvitations(i => [invite, ...i])
      setShowInviteModal(false)
      setInviteForm({ email: '', role: defaultAssignRole, departmentId: '', message: '' })
    } finally { setSaving(false) }
  }

  async function handleRevokeInvite(id: string) {
    const res = await fetch('/api/workryn/invitations', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    })
    if (res.ok) {
      const updated = await res.json()
      setInvitations(i => i.map(x => x.id === id ? updated : x))
    }
  }

  function copyInviteLink(token: string) {
    const link = `${window.location.origin}/accept-invite?token=${token}`
    navigator.clipboard.writeText(link)
    setCopied(token)
    setTimeout(() => setCopied(null), 2000)
  }

  const filteredInvitations = inviteFilter === 'ALL'
    ? invitations
    : invitations.filter(i => i.status === inviteFilter)

  const pendingCount = invitations.filter(i => i.status === 'PENDING').length

  const AVATAR_COLORS = ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#f97316', '#ec4899']
  const DEPT_COLORS = ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4']

  return (
    <>
      {/* Stats Bar */}
      <div style={{ padding: '24px 32px 0' }}>
        <h1 style={{ marginBottom: 4 }}>Admin Panel</h1>
        <p style={{ fontSize: '0.875rem', marginBottom: 20 }}>Manage users, departments, invitations, and system settings</p>

        <div className="admin-stats">
          <div className="admin-stat">
            <div className="admin-stat-icon" style={{ background: 'rgba(99,102,241,0.12)' }}><Users size={22} color="#6366f1" /></div>
            <div><div className="admin-stat-num">{users.length}</div><div className="admin-stat-label">Total Users</div></div>
          </div>
          <div className="admin-stat">
            <div className="admin-stat-icon" style={{ background: 'rgba(16,185,129,0.12)' }}><CheckCircle2 size={22} color="#10b981" /></div>
            <div><div className="admin-stat-num">{users.filter(u => u.isActive).length}</div><div className="admin-stat-label">Active</div></div>
          </div>
          <div className="admin-stat">
            <div className="admin-stat-icon" style={{ background: 'rgba(251,191,36,0.12)' }}><Crown size={22} color="#fbbf24" /></div>
            <div><div className="admin-stat-num">{users.filter(u => u.role === 'OWNER').length}</div><div className="admin-stat-label">Owners</div></div>
          </div>
          <div className="admin-stat">
            <div className="admin-stat-icon" style={{ background: 'rgba(139,92,246,0.12)' }}><ShieldCheck size={22} color="#8b5cf6" /></div>
            <div><div className="admin-stat-num">{users.filter(u => u.role === 'ADMIN').length}</div><div className="admin-stat-label">Admins</div></div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ padding: '16px 32px 0', borderBottom: '1px solid var(--border-subtle)' }}>
        <div className="tab-list" style={{ display: 'flex', gap: 4 }}>
          {TABS.map(t => (
            <button key={t.id} className={`tab-btn focus-ring ${tab === t.id ? 'active' : ''}`} onClick={() => setTab(t.id)} id={`admin-tab-${t.id}`}>
              {t.icon} {t.label}
              {t.id === 'invitations' && pendingCount > 0 && (
                <span style={{ background: 'var(--warning)', color: 'var(--text-inverse)', fontSize: '0.625rem', fontWeight: 700, borderRadius: 99, padding: '1px 5px', marginLeft: 4 }}>
                  {pendingCount}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      <div className="page-body" style={{ paddingTop: 24 }}>
        {/* Users Tab */}
        {tab === 'users' && (
          <>
            <div className="flex items-center justify-between" style={{ marginBottom: 16 }}>
              <span style={{ fontWeight: 600, color: 'var(--text-secondary)' }}>{users.length} users</span>
              <div className="flex items-center gap-2">
                {viewerIsOwner && (
                  <button
                    className="btn btn-ghost focus-ring"
                    onClick={() => { setTransferTargetId(''); setShowTransferModal(true) }}
                    id="btn-transfer-ownership"
                    style={{ borderColor: 'rgba(251,191,36,0.35)', color: '#fbbf24' }}
                  >
                    <ArrowRightLeft size={16} /> Transfer Ownership
                  </button>
                )}
                {myAssignableRoles.length > 0 && (
                  <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Users sync from CaseSync</span>
                )}
              </div>
            </div>
            <div className="admin-table-wrap">
              <table className="admin-table">
                <thead>
                  <tr><th>User</th><th>Role</th><th>Department</th><th>Job Title</th><th>Status</th><th>Last Login</th><th>Actions</th></tr>
                </thead>
                <tbody>
                  {users.map(user => (
                    <tr key={user.id} id={`user-row-${user.id}`}>
                      <td>
                        <div className="flex items-center gap-3">
                          <div className="avatar" style={{ background: user.avatarColor, width: 36, height: 36, fontSize: '0.8125rem' }}>
                            {getInitials(user.name ?? 'U')}
                          </div>
                          <div>
                            <div style={{ fontWeight: 500, color: 'var(--text-primary)' }}>{user.name}</div>
                            <div style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>{user.email}</div>
                          </div>
                        </div>
                      </td>
                      <td>
                        {user.role === 'OWNER' ? (
                          <span
                            className="badge owner-badge"
                            style={{
                              background: 'linear-gradient(135deg, rgba(251,191,36,0.25), rgba(245,158,11,0.25))',
                              color: '#fbbf24',
                              fontWeight: 700,
                              border: '1px solid rgba(251,191,36,0.4)',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 4,
                            }}
                          >
                            <Crown size={12} /> OWNER
                          </span>
                        ) : (
                          <span className="badge" style={{ background: ROLE_COLORS[user.role] + '22', color: ROLE_COLORS[user.role], fontWeight: 700 }}>{user.role}</span>
                        )}
                      </td>
                      <td>
                        {user.department ? (
                          <span className="badge" style={{ background: user.department.color + '22', color: user.department.color }}>{user.department.name}</span>
                        ) : <span style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>—</span>}
                      </td>
                      <td style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>{user.jobTitle || '—'}</td>
                      <td>
                        <button className="status-toggle" style={{ color: user.isActive ? '#10b981' : '#ef4444' }} onClick={() => handleUserToggle(user.id, user.isActive)} title={user.isActive ? 'Deactivate' : 'Activate'}>
                          {user.isActive ? <CheckCircle2 size={16} /> : <XCircle size={16} />}
                          {user.isActive ? 'Active' : 'Inactive'}
                        </button>
                      </td>
                      <td style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>{user.lastLogin ? timeAgo(user.lastLogin) : 'Never'}</td>
                      <td>
                        <div className="flex gap-1">
                          {canManageUser(currentUserRole, user.role) && (
                            <button className="btn btn-icon btn-ghost focus-ring" style={{ width: 30, height: 30 }} onClick={() => openUserEdit(user)} title="Edit user" aria-label="Edit user"><Edit2 size={14} /></button>
                          )}
                          {viewerIsOwner && user.role !== 'OWNER' && user.id !== currentUserId && (
                            <button
                              className="btn btn-icon btn-ghost focus-ring"
                              style={{ width: 30, height: 30, color: '#fbbf24' }}
                              onClick={() => handlePromoteToOwner(user)}
                              title="Promote to Owner"
                              aria-label="Promote to Owner"
                            >
                              <Crown size={14} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        {/* Invitations Tab */}
        {tab === 'invitations' && (
          <>
            <div className="flex items-center justify-between" style={{ marginBottom: 16 }}>
              <div className="flex items-center gap-2">
                {['ALL', 'PENDING', 'ACCEPTED', 'EXPIRED', 'REVOKED'].map(f => (
                  <button key={f} className={`badge ${inviteFilter === f ? 'badge-brand' : 'badge-muted'}`} style={{ cursor: 'pointer', padding: '4px 12px' }} onClick={() => setInviteFilter(f)}>
                    {f === 'ALL' ? 'All' : f.charAt(0) + f.slice(1).toLowerCase()}
                  </button>
                ))}
              </div>
              <button className="btn btn-gradient focus-ring" onClick={() => setShowInviteModal(true)} id="btn-send-invitation">
                <Mail size={16} /> Send Invitation
              </button>
            </div>

            {filteredInvitations.length === 0 ? (
              <div className="empty-state"><Mail size={32} /><p>No invitations {inviteFilter !== 'ALL' ? `with status ${inviteFilter.toLowerCase()}` : 'yet'}</p></div>
            ) : (
              <div className="admin-table-wrap">
                <table className="admin-table">
                  <thead>
                    <tr><th>Email</th><th>Role</th><th>Status</th><th>Invited By</th><th>Sent</th><th>Expires</th><th>Actions</th></tr>
                  </thead>
                  <tbody>
                    {filteredInvitations.map(inv => (
                      <tr key={inv.id}>
                        <td style={{ fontWeight: 500, color: 'var(--text-primary)' }}>{inv.email}</td>
                        <td>
                          {inv.role === 'OWNER' ? (
                            <span
                              className="badge owner-badge"
                              style={{
                                background: 'linear-gradient(135deg, rgba(251,191,36,0.25), rgba(245,158,11,0.25))',
                                color: '#fbbf24',
                                fontWeight: 700,
                                border: '1px solid rgba(251,191,36,0.4)',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 4,
                              }}
                            >
                              <Crown size={12} /> OWNER
                            </span>
                          ) : (
                            <span className="badge" style={{ background: ROLE_COLORS[inv.role] + '22', color: ROLE_COLORS[inv.role], fontWeight: 700 }}>{inv.role}</span>
                          )}
                        </td>
                        <td>
                          <span className="badge" style={{ background: (STATUS_COLORS[inv.status] || '#64748b') + '22', color: STATUS_COLORS[inv.status] || '#64748b', fontWeight: 600 }}>
                            {inv.status}
                          </span>
                        </td>
                        <td>
                          <div className="flex items-center gap-2">
                            <div className="avatar avatar-sm" style={{ background: inv.invitedBy.avatarColor, width: 24, height: 24, fontSize: '0.5625rem' }}>
                              {getInitials(inv.invitedBy.name ?? 'U')}
                            </div>
                            <span style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>{inv.invitedBy.name}</span>
                          </div>
                        </td>
                        <td style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>{timeAgo(inv.createdAt)}</td>
                        <td style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>{new Date(inv.expiresAt).toLocaleDateString()}</td>
                        <td>
                          <div className="flex gap-1">
                            <button className="btn btn-icon btn-ghost focus-ring" style={{ width: 28, height: 28 }} onClick={() => copyInviteLink(inv.token)} title="Copy invite link" aria-label="Copy invite link">
                              {copied === inv.token ? <CheckCircle2 size={13} color="var(--success)" /> : <Copy size={13} />}
                            </button>
                            {inv.status === 'PENDING' && (
                              <button className="btn btn-icon btn-ghost focus-ring" style={{ width: 28, height: 28, color: 'var(--danger)' }} onClick={() => handleRevokeInvite(inv.id)} title="Revoke" aria-label="Revoke invitation">
                                <XCircle size={13} />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}

        {/* Departments Tab */}
        {tab === 'departments' && (
          <>
            <div className="flex items-center justify-between" style={{ marginBottom: 16 }}>
              <span style={{ fontWeight: 600, color: 'var(--text-secondary)' }}>{departments.length} departments</span>
              <button className="btn btn-primary focus-ring" onClick={() => setShowDeptModal(true)} id="btn-add-dept"><Plus size={16} /> New Department</button>
            </div>
            <div className="dept-grid">
              {departments.map(dept => (
                <div key={dept.id} className="dept-card" id={`dept-${dept.id}`}>
                  <div className="dept-card-icon" style={{ background: dept.color + '18' }}><Building2 size={24} color={dept.color} /></div>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: '1rem', color: 'var(--text-primary)', marginBottom: 4 }}>{dept.name}</div>
                    {dept.description && <div style={{ fontSize: '0.875rem', color: 'var(--text-muted)', marginBottom: 10 }}>{dept.description}</div>}
                    <div className="flex gap-3">
                      <span style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>👥 {dept._count.users} members</span>
                      <span style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>✓ {dept._count.tasks} tasks</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        {/* Audit Log Tab */}
        {tab === 'audit' && (
          <div className="audit-list">
            {auditLogs.map(log => (
              <div key={log.id} className="audit-row" id={`audit-${log.id}`}>
                <div className="avatar avatar-sm" style={{ background: log.user.avatarColor, flexShrink: 0 }}>{getInitials(log.user.name ?? 'U')}</div>
                <div className="audit-content">
                  <div className="flex items-center gap-2">
                    <span className="badge badge-muted" style={{ fontSize: '0.6875rem', fontFamily: 'monospace' }}>{log.action}</span>
                    <span className="badge badge-muted" style={{ fontSize: '0.6875rem' }}>{log.resourceType}</span>
                  </div>
                  <div style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', marginTop: 2 }}>
                    <strong style={{ color: 'var(--text-primary)' }}>{log.user.name}</strong>
                    {log.details && ` · ${log.details}`}
                  </div>
                </div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', flexShrink: 0 }}>{timeAgo(log.createdAt)}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* User Modal */}
      {showUserModal && (
        <div className="modal-overlay" onClick={() => setShowUserModal(false)}>
          <div className="modal animate-scale-in" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>{editUser ? 'Edit User' : 'Add User'}</h3>
              <button className="btn btn-icon btn-ghost focus-ring" onClick={() => setShowUserModal(false)} aria-label="Close" title="Close"><X size={18} /></button>
            </div>
            <div className="modal-body">
              <div className="flex gap-3">
                <div className="form-group flex-1">
                  <label className="label">Full Name</label>
                  <input className="input focus-ring" value={userForm.name} onChange={e => setUserForm(f => ({ ...f, name: e.target.value }))} placeholder="Jane Smith" autoFocus />
                </div>
                <div className="form-group" style={{ width: 'auto' }}>
                  <label className="label">Color</label>
                  <div className="flex gap-1" style={{ marginTop: 4 }}>
                    {AVATAR_COLORS.map(c => (
                      <button key={c} style={{ width: 24, height: 24, borderRadius: '50%', background: c, border: userForm.avatarColor === c ? '3px solid white' : '3px solid transparent', cursor: 'pointer', outline: userForm.avatarColor === c ? `2px solid ${c}` : 'none' }} onClick={() => setUserForm(f => ({ ...f, avatarColor: c }))} />
                    ))}
                  </div>
                </div>
              </div>
              <div className="form-group">
                <label className="label">Email</label>
                <input className="input focus-ring" type="email" value={userForm.email} onChange={e => setUserForm(f => ({ ...f, email: e.target.value }))} placeholder="jane@company.com" />
              </div>
              {!editUser && (
                <div className="form-group">
                  <label className="label">Password</label>
                  <input className="input focus-ring" type="password" value={userForm.password} onChange={e => setUserForm(f => ({ ...f, password: e.target.value }))} placeholder="Temporary password" />
                </div>
              )}
              <div className="flex gap-3">
                <div className="form-group flex-1">
                  <label className="label">Role</label>
                  {(() => {
                    // When editing, the existing role is always shown even if not normally assignable,
                    // but the dropdown only lets you switch to roles you can assign.
                    const optionRoles: string[] = Array.from(new Set<string>([
                      ...myAssignableRoles,
                      ...(editUser ? [editUser.role] : []),
                    ]))
                    return (
                      <select
                        className="input focus-ring"
                        value={userForm.role}
                        onChange={e => setUserForm(f => ({ ...f, role: e.target.value }))}
                        disabled={editUser ? !canManageUser(currentUserRole, editUser.role) : myAssignableRoles.length === 0}
                      >
                        {optionRoles.map(r => (
                          <option
                            key={r}
                            value={r}
                            disabled={!canCreateRole(currentUserRole, r) && (!editUser || r !== editUser.role)}
                          >
                            {r}
                          </option>
                        ))}
                      </select>
                    )
                  })()}
                </div>
                <div className="form-group flex-1">
                  <label className="label">Department</label>
                  <select className="input focus-ring" value={userForm.departmentId} onChange={e => setUserForm(f => ({ ...f, departmentId: e.target.value }))}>
                    <option value="">None</option>
                    {initialDepartments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                  </select>
                </div>
              </div>
              <div className="form-group">
                <label className="label">Job Title</label>
                <input className="input focus-ring" value={userForm.jobTitle} onChange={e => setUserForm(f => ({ ...f, jobTitle: e.target.value }))} placeholder="Nurse Practitioner, Support Specialist…" />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost focus-ring" onClick={() => setShowUserModal(false)}>Cancel</button>
              <button
                className="btn btn-primary focus-ring"
                onClick={handleUserSave}
                id="btn-save-user"
                disabled={
                  saving ||
                  !userForm.name.trim() ||
                  !userForm.email.trim() ||
                  (editUser ? !canManageUser(currentUserRole, editUser.role) : !canCreateRole(currentUserRole, userForm.role))
                }
              >
                {saving ? <Loader2 size={16} className="spin" /> : editUser ? 'Save Changes' : 'Create User'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Send Invitation Modal */}
      {showInviteModal && (
        <div className="modal-overlay" onClick={() => setShowInviteModal(false)}>
          <div className="modal animate-scale-in" onClick={e => e.stopPropagation()} style={{ maxWidth: 460 }}>
            <div className="modal-header">
              <h3>Send Invitation</h3>
              <button className="btn btn-icon btn-ghost focus-ring" onClick={() => setShowInviteModal(false)} aria-label="Close" title="Close"><X size={18} /></button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label className="label">Email Address</label>
                <input className="input focus-ring" type="email" value={inviteForm.email} onChange={e => setInviteForm(f => ({ ...f, email: e.target.value }))} placeholder="newteam@company.com" autoFocus />
              </div>
              <div className="flex gap-3">
                <div className="form-group flex-1">
                  <label className="label">Role</label>
                  <select className="input focus-ring" value={inviteForm.role} onChange={e => setInviteForm(f => ({ ...f, role: e.target.value }))} disabled={myAssignableRoles.length === 0}>
                    {myAssignableRoles.map(r => <option key={r} value={r}>{r}</option>)}
                  </select>
                </div>
                <div className="form-group flex-1">
                  <label className="label">Department</label>
                  <select className="input focus-ring" value={inviteForm.departmentId} onChange={e => setInviteForm(f => ({ ...f, departmentId: e.target.value }))}>
                    <option value="">None</option>
                    {initialDepartments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                  </select>
                </div>
              </div>
              <div className="form-group">
                <label className="label">Personal Message (optional)</label>
                <textarea className="input focus-ring" value={inviteForm.message} onChange={e => setInviteForm(f => ({ ...f, message: e.target.value }))} placeholder="Welcome to the team! We're excited to have you…" rows={3} style={{ resize: 'vertical' }} />
              </div>
              <div style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 6 }}>
                <Link2 size={13} /> Invitation link expires in 7 days
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost focus-ring" onClick={() => setShowInviteModal(false)}>Cancel</button>
              <button className="btn btn-gradient focus-ring" onClick={handleInviteSend} disabled={saving || !inviteForm.email.trim()}>
                {saving ? <Loader2 size={16} className="spin" /> : <><Mail size={16} /> Send Invitation</>}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Department Modal */}
      {showDeptModal && (
        <div className="modal-overlay" onClick={() => setShowDeptModal(false)}>
          <div className="modal animate-scale-in" onClick={e => e.stopPropagation()} style={{ maxWidth: 440 }}>
            <div className="modal-header">
              <h3>New Department</h3>
              <button className="btn btn-icon btn-ghost focus-ring" onClick={() => setShowDeptModal(false)} aria-label="Close" title="Close"><X size={18} /></button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label className="label">Name</label>
                <input className="input focus-ring" value={deptForm.name} onChange={e => setDeptForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Nursing, IT, Finance" autoFocus />
              </div>
              <div className="form-group">
                <label className="label">Description</label>
                <input className="input focus-ring" value={deptForm.description} onChange={e => setDeptForm(f => ({ ...f, description: e.target.value }))} placeholder="Brief description…" />
              </div>
              <div className="form-group">
                <label className="label">Color</label>
                <div className="flex gap-2" style={{ marginTop: 4 }}>
                  {DEPT_COLORS.map(c => (
                    <button key={c} style={{ width: 28, height: 28, borderRadius: '50%', background: c, border: deptForm.color === c ? '3px solid white' : '3px solid transparent', cursor: 'pointer', outline: deptForm.color === c ? `2px solid ${c}` : 'none' }} onClick={() => setDeptForm(f => ({ ...f, color: c }))} />
                  ))}
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost focus-ring" onClick={() => setShowDeptModal(false)}>Cancel</button>
              <button className="btn btn-primary focus-ring" onClick={handleDeptSave} id="btn-save-dept" disabled={saving || !deptForm.name.trim()}>
                {saving ? <Loader2 size={16} className="spin" /> : 'Create Department'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Transfer Ownership Modal */}
      {showTransferModal && viewerIsOwner && (
        <div className="modal-overlay" onClick={() => setShowTransferModal(false)}>
          <div className="modal animate-scale-in" onClick={e => e.stopPropagation()} style={{ maxWidth: 480 }}>
            <div className="modal-header">
              <h3 style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Crown size={18} color="#fbbf24" /> Transfer Ownership
              </h3>
              <button className="btn btn-icon btn-ghost focus-ring" onClick={() => setShowTransferModal(false)} aria-label="Close" title="Close"><X size={18} /></button>
            </div>
            <div className="modal-body">
              <div
                style={{
                  background: 'rgba(251,191,36,0.08)',
                  border: '1px solid rgba(251,191,36,0.3)',
                  borderRadius: 'var(--radius-md)',
                  padding: 12,
                  fontSize: '0.8125rem',
                  color: 'var(--text-secondary)',
                  lineHeight: 1.5,
                }}
              >
                Transferring ownership will promote the selected user to <strong style={{ color: '#fbbf24' }}>OWNER</strong> and demote you to <strong>ADMIN</strong>. You will lose the ability to transfer ownership or manage other owners. This action is logged and cannot be undone automatically.
              </div>
              <div className="form-group">
                <label className="label">Select New Owner</label>
                <select
                  className="input focus-ring"
                  value={transferTargetId}
                  onChange={e => setTransferTargetId(e.target.value)}
                  autoFocus
                >
                  <option value="">— Choose a user —</option>
                  {users
                    .filter(u => u.id !== currentUserId && u.isActive && u.role !== 'OWNER')
                    .map(u => (
                      <option key={u.id} value={u.id}>
                        {u.name} ({u.email}) · {u.role}
                      </option>
                    ))}
                </select>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost focus-ring" onClick={() => setShowTransferModal(false)}>Cancel</button>
              <button
                className="btn btn-primary focus-ring"
                onClick={handleTransferOwnership}
                disabled={saving || !transferTargetId}
                style={{ background: 'linear-gradient(135deg, #fbbf24, #f59e0b)', color: '#1a1a1a' }}
              >
                {saving ? <Loader2 size={16} className="spin" /> : <><Crown size={16} /> Transfer Ownership</>}
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        .admin-stats { display: flex; gap: 12px; margin-bottom: 20px; }
        .admin-stat {
          flex: 1; background: var(--bg-surface); border: 1px solid var(--border-subtle);
          border-radius: var(--radius-lg); padding: 14px; display: flex; align-items: center; gap: 14px;
          transition: border-color var(--transition-smooth), transform var(--transition-smooth), box-shadow var(--transition-smooth);
          position: relative; overflow: hidden;
        }
        .admin-stat::before { content: ''; position: absolute; top: 0; left: 0; right: 0; height: 3px; background: var(--brand-gradient); opacity: 0; transition: opacity var(--transition-smooth); }
        .admin-stat:hover { border-color: var(--border-default); transform: translateY(-2px); box-shadow: var(--shadow-glow); }
        .admin-stat:hover::before { opacity: 1; }
        .admin-stat-icon { width: 44px; height: 44px; border-radius: var(--radius-md); display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
        .admin-stat-num { font-size: 1.5rem; font-weight: 700; color: var(--text-primary); line-height: 1; }
        .admin-stat-label { font-size: 0.8125rem; color: var(--text-muted); margin-top: 2px; }
        .tab-btn {
          display: flex; align-items: center; gap: 8px;
          padding: 10px 16px; border: none; background: none;
          color: var(--text-muted); font-size: 0.9rem; font-weight: 500;
          cursor: pointer; border-bottom: 2px solid transparent;
          margin-bottom: -1px; transition: all var(--transition-smooth);
        }
        .tab-btn:hover { color: var(--text-secondary); }
        .tab-btn.active { color: var(--brand-light); border-bottom-color: var(--brand); }
        .admin-table-wrap { background: var(--bg-surface); border: 1px solid var(--border-subtle); border-radius: var(--radius-lg); overflow: hidden; }
        .admin-table { width: 100%; border-collapse: collapse; }
        .admin-table th { text-align: left; padding: 12px 16px; font-size: 0.75rem; font-weight: 600; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.05em; border-bottom: 1px solid var(--border-subtle); background: var(--bg-overlay); }
        .admin-table td { padding: 14px 16px; border-bottom: 1px solid var(--border-subtle); font-size: 0.875rem; }
        .admin-table tr:last-child td { border-bottom: none; }
        .admin-table tr:hover td { background: var(--bg-hover); }
        .status-toggle { display: flex; align-items: center; gap: 6px; font-size: 0.8125rem; font-weight: 600; border: none; background: none; cursor: pointer; transition: opacity var(--transition); }
        .status-toggle:hover { opacity: 0.7; }
        .dept-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 14px; }
        .dept-card { background: var(--bg-surface); border: 1px solid var(--border-subtle); border-radius: var(--radius-lg); padding: 20px; display: flex; gap: 16px; align-items: flex-start; transition: all var(--transition-smooth); }
        .dept-card:hover { border-color: var(--border-default); transform: translateY(-1px); box-shadow: var(--shadow-glow); }
        .dept-card-icon { width: 48px; height: 48px; border-radius: var(--radius-md); display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
        .audit-list { display: flex; flex-direction: column; gap: 0; }
        .audit-row { display: flex; align-items: flex-start; gap: 14px; padding: 14px 0; border-bottom: 1px solid var(--border-subtle); }
        .audit-row:last-child { border-bottom: none; }
        .audit-content { flex: 1; min-width: 0; }
        .spin { animation: spin 0.7s linear infinite; }

        @media (max-width: 768px) {
          .admin-stats { flex-direction: column; }
        }
      `}</style>
    </>
  )
}
