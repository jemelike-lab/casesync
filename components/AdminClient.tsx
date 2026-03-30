'use client'

import { useState, useTransition } from 'react'
import { Profile, Role } from '@/lib/types'
import { inviteUser, updateUserRole, updateTeamManagerAssignment, deactivateUser } from '@/app/actions/admin'
import Link from 'next/link'

interface Props {
  users: Profile[]
  teamManagers: Profile[]
  currentUserId: string
}

const ROLE_OPTIONS: { value: Role; label: string }[] = [
  { value: 'supports_planner', label: 'Supports Planner' },
  { value: 'team_manager', label: 'Team Manager' },
  { value: 'supervisor', label: 'Supervisor' },
]

const ROLE_COLORS: Record<Role, string> = {
  supervisor: '#ff453a',
  team_manager: '#ff9f0a',
  supports_planner: '#30d158',
}

function RoleBadge({ role }: { role: Role | string }) {
  const color = ROLE_COLORS[role as Role] ?? '#98989d'
  const label = role === 'supervisor' ? 'Supervisor' : role === 'team_manager' ? 'Team Manager' : role === 'supports_planner' ? 'Supports Planner' : role
  return (
    <span style={{
      fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 10,
      background: `${color}22`, color, textTransform: 'uppercase', letterSpacing: '0.08em',
    }}>
      {label}
    </span>
  )
}

export default function AdminClient({ users: initialUsers, teamManagers, currentUserId }: Props) {
  const [users, setUsers] = useState<Profile[]>(initialUsers)
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteName, setInviteName] = useState('')
  const [inviteRole, setInviteRole] = useState<Role>('supports_planner')
  const [inviting, startInvite] = useTransition()
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null)
  const [editingRoles, setEditingRoles] = useState<Record<string, Role>>({})
  const [savingRole, setSavingRole] = useState<string | null>(null)

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
        setInviteEmail('')
        setInviteName('')
        setInviteRole('supports_planner')
      }
    })
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

  const handleDeactivate = async (userId: string, userName: string) => {
    if (!confirm(`Deactivate ${userName}? They will not be able to log in.`)) return
    const result = await deactivateUser(userId)
    if (result.error) {
      showToast('error', result.error)
    } else {
      showToast('success', `${userName} has been deactivated.`)
    }
  }

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', paddingBottom: 80 }}>
      {/* Toast */}
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

      {/* Invite user */}
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

      {/* Users list */}
      <div className="card">
        <h2 style={{ fontSize: 14, fontWeight: 600, marginBottom: 16, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          All Users ({users.length})
        </h2>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)' }}>
                {['Name', 'Role', 'Team Manager', 'Actions'].map(h => (
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
                const tm = teamManagers.find(t => t.id === user.team_manager_id)

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
                        <button
                          onClick={() => handleDeactivate(user.id, user.full_name ?? 'this user')}
                          style={{
                            background: 'transparent', border: '1px solid rgba(255,69,58,0.4)',
                            color: 'var(--red)', borderRadius: 6, fontSize: 11,
                            padding: '3px 10px', cursor: 'pointer', minHeight: 28,
                          }}
                        >
                          Deactivate
                        </button>
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
