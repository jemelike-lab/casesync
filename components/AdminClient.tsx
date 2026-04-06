'use client'

import { isSupervisorLike, canManageTeam, getRoleLabel, getRoleColor } from '@/lib/roles'
import { useState, useTransition } from 'react'
import { Profile, Role, UserInvite, InviteStatus } from '@/lib/types'
import { inviteUser, resendInviteReminder, removePendingInvite, updateUserRole, updateTeamManagerAssignment, deactivateUser } from '@/app/actions/admin'
import Link from 'next/link'

interface Props {
  users: Profile[]
  teamManagers: Profile[]
  invites: UserInvite[]
  currentUserId: string
}

const ROLE_OPTIONS: { value: Role; label: string }[] = [
  { value: 'supports_planner', label: 'Supports Planner' },
  { value: 'team_manager', label: 'Team Manager' },
  { value: 'supervisor', label: 'Supervisor' },
  { value: 'it', label: 'IT' },
]

const ROLE_COLORS: Record<Role, string> = {
  supervisor: '#ff453a',
  team_manager: '#ff9f0a',
  supports_planner: '#30d158',
  it: '#bf5af2',
}

const INVITE_STATUS_COLORS: Record<InviteStatus, string> = {
  pending: '#ff9f0a',
  accepted: '#30d158',
  expired: '#ff453a',
}

function RoleBadge({ role }: { role: Role | string }) {
  const color = ROLE_COLORS[role as Role] ?? '#98989d'
  const label = getRoleLabel(role)
  return (
    <span style={{
      fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 10,
      background: `${color}22`, color, textTransform: 'uppercase', letterSpacing: '0.08em',
    }}>
      {label}
    </span>
  )
}

function InviteStatusBadge({ status }: { status: InviteStatus }) {
  const color = INVITE_STATUS_COLORS[status] ?? '#98989d'
  return (
    <span style={{
      fontSize: 10,
      fontWeight: 700,
      padding: '2px 8px',
      borderRadius: 10,
      background: `${color}22`,
      color,
      textTransform: 'uppercase',
      letterSpacing: '0.08em',
    }}>
      {status}
    </span>
  )
}

function formatDateTime(dateStr: string | null) {
  if (!dateStr) return '—'
  return new Date(dateStr).toLocaleString()
}

export default function AdminClient({ users: initialUsers, teamManagers, invites, currentUserId }: Props) {
  const [users, setUsers] = useState<Profile[]>(initialUsers)
  const [inviteRows, setInviteRows] = useState<UserInvite[]>(invites)
  const pendingInvites = inviteRows.filter(i => (i.computed_status ?? i.status) === 'pending')
  const inviteHistory = inviteRows.filter(i => (i.computed_status ?? i.status) !== 'pending')
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteName, setInviteName] = useState('')
  const [inviteRole, setInviteRole] = useState<Role>('supports_planner')
  const [inviting, startInvite] = useTransition()
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null)
  const [editingRoles, setEditingRoles] = useState<Record<string, Role>>({})
  const [savingRole, setSavingRole] = useState<string | null>(null)
  const [sendingReminderId, setSendingReminderId] = useState<string | null>(null)
  const [removingInviteId, setRemovingInviteId] = useState<string | null>(null)
  const [showInviteHistory, setShowInviteHistory] = useState(false)

  function showToast(type: 'success' | 'error', message: string) {
    setToast({ type, message })
    setTimeout(() => setToast(null), 4000)
  }

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!inviteEmail.trim() || !inviteName.trim()) return
    startInvite(async () => {
      const result = await inviteUser(inviteEmail.trim(), inviteRole, inviteName.trim())
      if (result.error) {
        showToast('error', result.error)
      } else {
        showToast('success', `Invite sent to ${inviteEmail}!`)
        setInviteRows(prev => [
          {
            id: `temp-${Date.now()}`,
            email: inviteEmail.trim().toLowerCase(),
            full_name: inviteName.trim(),
            role: inviteRole,
            invited_user_id: null,
            invited_by: currentUserId,
            invite_sent_at: new Date().toISOString(),
            accepted_at: null,
            reminder_sent_at: null,
            reminder_count: 0,
            expires_at: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(),
            status: 'pending',
            computed_status: 'pending',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
          ...prev.filter(i => i.email.toLowerCase() !== inviteEmail.trim().toLowerCase()),
        ])
        setInviteEmail('')
        setInviteName('')
        setInviteRole('supports_planner')
      }
    })
  }

  const handleReminder = async (inviteId: string) => {
    setSendingReminderId(inviteId)
    const result = await resendInviteReminder(inviteId)
    if (result.error) {
      showToast('error', result.error)
    } else {
      setInviteRows(prev => prev.map(invite =>
        invite.id === inviteId
          ? {
              ...invite,
              reminder_sent_at: new Date().toISOString(),
              reminder_count: (invite.reminder_count ?? 0) + 1,
              expires_at: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(),
              status: 'pending',
              computed_status: 'pending',
            }
          : invite
      ))
      showToast('success', 'Reminder sent.')
    }
    setSendingReminderId(null)
  }

  const handleRemoveInvite = async (inviteId: string, email: string) => {
    if (!confirm(`Remove pending invite for ${email}?`)) return
    setRemovingInviteId(inviteId)
    const result = await removePendingInvite(inviteId)
    if (result.error) {
      showToast('error', result.error)
    } else {
      setInviteRows(prev => prev.filter(invite => invite.id !== inviteId))
      showToast('success', 'Pending invite removed.')
    }
    setRemovingInviteId(null)
  }

  const handleRoleSave = async (userId: string) => {
    const newRole = editingRoles[userId]
    if (!newRole) return
    setSavingRole(userId)
    const result = await updateUserRole(userId, newRole)
    if (result.error) {
      showToast('error', result.error)
    } else {
      setUsers(prev => prev.map(u => u.id === userId ? { ...u, role: newRole } : u))
      setEditingRoles(prev => { const n = { ...prev }; delete n[userId]; return n })
      showToast('success', 'Role updated.')
    }
    setSavingRole(null)
  }

  const handleAssignTM = async (userId: string, tmId: string) => {
    const result = await updateTeamManagerAssignment(userId, tmId || null)
    if (result.error) {
      showToast('error', result.error)
    } else {
      setUsers(prev => prev.map(u => u.id === userId ? { ...u, team_manager_id: tmId || null } : u))
      showToast('success', 'Assignment updated.')
    }
  }

  const handleRemoveUser = async (userId: string, userName: string) => {
    if (!confirm(`Remove ${userName} from active access? They will not be able to sign in, but their history will be kept.`)) return
    const result = await deactivateUser(userId)
    if (result.error) {
      showToast('error', result.error)
    } else {
      setUsers(prev => prev.filter(u => u.id !== userId))
      showToast('success', `${userName} has been removed from active access.`)
    }
  }

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', paddingBottom: 80 }}>
      {toast && (
        <div style={{
          position: 'fixed', top: 20, right: 20, zIndex: 9999,
          background: toast.type === 'success' ? '#1a3a1a' : '#3a1a1a',
          border: `1px solid ${toast.type === 'success' ? '#34c759' : '#ff3b30'}`,
          borderRadius: 10, padding: '12px 18px',
          color: toast.type === 'success' ? '#34c759' : '#ff3b30',
          fontSize: 14, fontWeight: 500, maxWidth: 320,
        }}>
          {toast.type === 'success' ? '✓ ' : '✗ '}{toast.message}
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>⚙️ Admin Panel</h1>
        <Link href="/dashboard" style={{
          fontSize: 13, color: 'var(--accent)', textDecoration: 'none',
          padding: '6px 12px', border: '1px solid var(--border)', borderRadius: 6,
        }}>
          ← Dashboard
        </Link>
      </div>

      <div className="card" style={{ marginBottom: 24 }}>
        <h2 style={{ fontSize: 14, fontWeight: 600, marginBottom: 16, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          Invite New User
        </h2>
        <form onSubmit={handleInvite} style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div style={{ flex: '1 1 200px' }}>
            <label style={{ display: 'block', fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4 }}>Full Name</label>
            <input value={inviteName} onChange={e => setInviteName(e.target.value)} placeholder="Jane Doe" required style={{ width: '100%' }} />
          </div>
          <div style={{ flex: '1 1 200px' }}>
            <label style={{ display: 'block', fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4 }}>Email</label>
            <input type="email" value={inviteEmail} onChange={e => setInviteEmail(e.target.value)} placeholder="jane@example.com" required style={{ width: '100%' }} />
          </div>
          <div style={{ flex: '0 0 180px' }}>
            <label style={{ display: 'block', fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4 }}>Role</label>
            <select value={inviteRole} onChange={e => setInviteRole(e.target.value as Role)} style={{ width: '100%' }}>
              {ROLE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
          <button type="submit" className="btn-primary" disabled={inviting} style={{ minHeight: 36 }}>
            {inviting ? 'Sending…' : 'Send Invite'}
          </button>
        </form>
      </div>

      <div className="card" style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
          <div>
            <h2 style={{ fontSize: 14, fontWeight: 600, margin: 0, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Invite Status
            </h2>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 8 }}>
              <span style={{ fontSize: 12, color: '#ff9f0a', fontWeight: 600 }}>
                Pending: {pendingInvites.length}
              </span>
              <span style={{ fontSize: 12, color: '#30d158', fontWeight: 600 }}>
                Accepted: {inviteHistory.filter(i => (i.computed_status ?? i.status) === 'accepted').length}
              </span>
              <span style={{ fontSize: 12, color: '#ff453a', fontWeight: 600 }}>
                Expired: {inviteHistory.filter(i => (i.computed_status ?? i.status) === 'expired').length}
              </span>
            </div>
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
            Pending invites stay here. Older accepted and expired invites move to history below.
          </div>
        </div>
        {pendingInvites.length === 0 ? (
          <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: 13 }}>No pending invites right now.</p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)' }}>
                  {['Name', 'Email', 'Role', 'Status', 'Sent', 'Joined', 'Reminders', 'Actions'].map(h => (
                    <th key={h} style={{ padding: '8px 12px', textAlign: 'left', color: 'var(--text-secondary)', fontWeight: 600, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {pendingInvites.map(invite => {
                  const status = (invite.computed_status ?? invite.status) as InviteStatus
                  const canRemind = status === 'pending'
                  return (
                    <tr key={invite.id} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={{ padding: '10px 12px', fontWeight: 500 }}>{invite.full_name ?? '—'}</td>
                      <td style={{ padding: '10px 12px' }}>{invite.email}</td>
                      <td style={{ padding: '10px 12px' }}><RoleBadge role={invite.role} /></td>
                      <td style={{ padding: '10px 12px' }}><InviteStatusBadge status={status} /></td>
                      <td style={{ padding: '10px 12px' }}>{formatDateTime(invite.invite_sent_at)}</td>
                      <td style={{ padding: '10px 12px' }}>
                        {status === 'accepted' ? (
                          <div>
                            <div style={{ fontWeight: 600, color: '#30d158' }}>✅ Joined</div>
                            <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{formatDateTime(invite.accepted_at)}</div>
                          </div>
                        ) : (
                          <span style={{ color: 'var(--text-secondary)' }}>—</span>
                        )}
                      </td>
                      <td style={{ padding: '10px 12px' }}>
                        <div>{invite.reminder_count ?? 0}</div>
                        <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>Last: {formatDateTime(invite.reminder_sent_at)}</div>
                      </td>
                      <td style={{ padding: '10px 12px' }}>
                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                          <button
                            className="btn-primary"
                            disabled={!canRemind || sendingReminderId === invite.id}
                            onClick={() => handleReminder(invite.id)}
                            style={{ minHeight: 30, fontSize: 11, padding: '4px 10px', opacity: canRemind ? 1 : 0.55 }}
                          >
                            {sendingReminderId === invite.id ? 'Sending…' : 'Resend Reminder'}
                          </button>
                          <button
                            onClick={() => handleRemoveInvite(invite.id, invite.email)}
                            disabled={status !== 'pending' || removingInviteId === invite.id}
                            style={{
                              background: 'transparent',
                              border: '1px solid rgba(255,69,58,0.45)',
                              color: '#ff453a',
                              borderRadius: 6,
                              fontSize: 11,
                              padding: '4px 10px',
                              cursor: 'pointer',
                              minHeight: 30,
                              opacity: status === 'pending' ? 1 : 0.55,
                            }}
                          >
                            {removingInviteId === invite.id ? 'Removing…' : 'Remove Invite'}
                          </button>
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

      {inviteHistory.length > 0 && (
        <div className="card" style={{ marginBottom: 24 }}>
          <button
            type="button"
            onClick={() => setShowInviteHistory(v => !v)}
            style={{
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              background: 'transparent',
              border: 'none',
              color: 'var(--text)',
              padding: 0,
              cursor: 'pointer',
              textAlign: 'left',
            }}
          >
            <div>
              <h2 style={{ fontSize: 14, fontWeight: 600, margin: 0, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Invite History ({inviteHistory.length})
              </h2>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 8 }}>
                Older accepted and expired invites live here so they don’t crowd the main admin view.
              </div>
            </div>
            <div style={{ fontSize: 18, color: 'var(--text-secondary)', paddingLeft: 12 }}>
              {showInviteHistory ? '▾' : '▸'}
            </div>
          </button>

          {showInviteHistory && (
            <div style={{ overflowX: 'auto', marginTop: 16 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border)' }}>
                    {['Name', 'Email', 'Role', 'Status', 'Sent', 'Joined'].map(h => (
                      <th key={h} style={{ padding: '8px 12px', textAlign: 'left', color: 'var(--text-secondary)', fontWeight: 600, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {inviteHistory.map(invite => {
                    const status = (invite.computed_status ?? invite.status) as InviteStatus
                    return (
                      <tr key={invite.id} style={{ borderBottom: '1px solid var(--border)' }}>
                        <td style={{ padding: '10px 12px', fontWeight: 500 }}>{invite.full_name ?? '—'}</td>
                        <td style={{ padding: '10px 12px' }}>{invite.email}</td>
                        <td style={{ padding: '10px 12px' }}><RoleBadge role={invite.role} /></td>
                        <td style={{ padding: '10px 12px' }}><InviteStatusBadge status={status} /></td>
                        <td style={{ padding: '10px 12px' }}>{formatDateTime(invite.invite_sent_at)}</td>
                        <td style={{ padding: '10px 12px' }}>{formatDateTime(invite.accepted_at)}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      <div className="card">
        <h2 style={{ fontSize: 14, fontWeight: 600, marginBottom: 16, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          All Users ({users.length})
        </h2>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)' }}>
                {['Name', 'Role', 'Added', 'Team Manager', 'Actions'].map(h => (
                  <th key={h} style={{ padding: '8px 12px', textAlign: 'left', color: 'var(--text-secondary)', fontWeight: 600, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {users.map(user => {
                const isMe = user.id === currentUserId
                const editRole = editingRoles[user.id]
                const isSP = user.role === 'supports_planner'

                return (
                  <tr key={user.id} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '10px 12px' }}>
                      <div style={{ fontWeight: 500 }}>{user.full_name ?? '—'}</div>
                      {isMe && <div style={{ fontSize: 11, color: 'var(--accent)' }}>You</div>}
                    </td>
                    <td style={{ padding: '10px 12px' }}>
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                        <RoleBadge role={editRole ?? user.role} />
                        {!isMe && (
                          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                            <select
                              value={editRole ?? user.role}
                              onChange={e => setEditingRoles(prev => ({ ...prev, [user.id]: e.target.value as Role }))}
                              style={{ fontSize: 11, padding: '3px 6px' }}
                            >
                              {ROLE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                            </select>
                            {editRole && editRole !== user.role && (
                              <button
                                className="btn-primary"
                                style={{ fontSize: 11, padding: '3px 10px', minHeight: 28 }}
                                disabled={savingRole === user.id}
                                onClick={() => handleRoleSave(user.id)}
                              >
                                Save
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    </td>
                    <td style={{ padding: '10px 12px' }}>
                      {user.joined_at ? (
                        <div>
                          <div style={{ fontWeight: 600, color: '#30d158' }}>✅ Joined</div>
                          <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{formatDateTime(user.joined_at)}</div>
                        </div>
                      ) : (
                        <div>
                          <div style={{ fontWeight: 600, color: 'var(--text)' }}>Added</div>
                          <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{formatDateTime(user.created_at)}</div>
                        </div>
                      )}
                    </td>
                    <td style={{ padding: '10px 12px' }}>
                      {isSP ? (
                        <select
                          value={user.team_manager_id ?? ''}
                          onChange={e => handleAssignTM(user.id, e.target.value)}
                          style={{ fontSize: 12, padding: '3px 8px' }}
                        >
                          <option value="">None</option>
                          {teamManagers.map(t => (
                            <option key={t.id} value={t.id}>{t.full_name}</option>
                          ))}
                        </select>
                      ) : (
                        <span style={{ color: 'var(--text-secondary)', fontSize: 12 }}>—</span>
                      )}
                    </td>
                    <td style={{ padding: '10px 12px' }}>
                      {!isMe && (
                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                          <button
                            onClick={() => handleRemoveUser(user.id, user.full_name ?? 'this user')}
                            style={{
                              background: 'transparent', border: '1px solid rgba(255,69,58,0.55)',
                              color: '#ff453a', borderRadius: 6, fontSize: 11,
                              padding: '3px 10px', cursor: 'pointer', minHeight: 28,
                            }}
                          >
                            Remove User
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
