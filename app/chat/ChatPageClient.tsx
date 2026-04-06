'use client'

import { isSupervisorLike, canManageTeam, getRoleLabel, getRoleColor } from '@/lib/roles'
import { useState, useEffect, useCallback } from 'react'
import Header from '@/components/Header'
import ChatSidebar from '@/components/ChatSidebar'
import ChatWindow from '@/components/ChatWindow'
import { Profile } from '@/lib/types'

interface UserInfo {
  id: string
  full_name: string | null
  role?: string | null
}

interface Channel {
  id: string
  name: string | null
  kind: string
  client_id: string | null
  unread?: number
  otherUser?: UserInfo
  lastMessage?: string
  lastMessageAt?: string
}

interface Props {
  userId: string
  profile: Profile
  channels: Channel[]
  allUsers: UserInfo[]
}

function getInitials(name: string | null | undefined) {
  if (!name) return '?'
  return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
}

function roleBadgeColor(role: string | null | undefined) {
  const map: Record<string, string> = {
    supervisor: '#bf5af2',
    team_manager: '#007aff',
    supports_planner: '#30d158',
  }
  return map[role ?? ''] ?? '#48484a'
}

function roleLabel(role: string | null | undefined) {
  if (role === 'supports_planner') return 'Supports Planner'
  if (role === 'team_manager') return 'Team Manager'
  if (role === 'supervisor') return 'Supervisor'
  if (role === 'it') return 'IT'
  return role ?? ''
}

const AVATAR_COLORS = [
  'linear-gradient(135deg, #636366, #48484a)',
  'linear-gradient(135deg, #30b0c7, #1a7a90)',
  'linear-gradient(135deg, #32ade6, #1a6fa0)',
  'linear-gradient(135deg, #30d158, #1a9033)',
  'linear-gradient(135deg, #ff9f0a, #cc7000)',
  'linear-gradient(135deg, #ff375f, #cc0030)',
  'linear-gradient(135deg, #bf5af2, #8833cc)',
]
function avatarColor(id: string) {
  let hash = 0
  for (let i = 0; i < id.length; i++) hash = (hash + id.charCodeAt(i)) % AVATAR_COLORS.length
  return AVATAR_COLORS[hash]
}

export default function ChatPageClient({ userId, profile, channels: initialChannels, allUsers }: Props) {
  const [channels, setChannels] = useState<Channel[]>(initialChannels)
  const [selectedChannelId, setSelectedChannelId] = useState<string | null>(null)
  const [showNewDM, setShowNewDM] = useState(false)
  const [dmSearch, setDmSearch] = useState('')
  const [messageableUsers, setMessageableUsers] = useState<UserInfo[]>([])
  const [loadingUsers, setLoadingUsers] = useState(false)
  const [isMobile, setIsMobile] = useState(false)
  const [showChat, setShowChat] = useState(false)

  // Detect mobile
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 700)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  // Auto-select first channel on desktop
  useEffect(() => {
    if (!isMobile && !selectedChannelId && channels.length > 0) {
      // Prefer team channel first, then DMs
      const team = channels.find(c => c.kind === 'team')
      setSelectedChannelId((team ?? channels[0]).id)
    }
  }, [channels, isMobile])

  const handleSelect = useCallback((id: string) => {
    setSelectedChannelId(id)
    if (isMobile) setShowChat(true)
  }, [isMobile])

  const handleBack = useCallback(() => {
    setShowChat(false)
  }, [])

  const openNewDM = useCallback(async () => {
    setShowNewDM(true)
    setLoadingUsers(true)
    try {
      const res = await fetch('/api/chat/users')
      const data = await res.json()
      setMessageableUsers(data.users ?? [])
    } catch {
      setMessageableUsers([])
    }
    setLoadingUsers(false)
  }, [])

  const startDM = useCallback(async (targetUser: UserInfo) => {
    setShowNewDM(false)
    setDmSearch('')
    try {
      const res = await fetch('/api/chat/dm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetUserId: targetUser.id }),
      })
      const data = await res.json()
      if (data.channelId) {
        // Add to channels list if not already there
        setChannels(prev => {
          const exists = prev.find(c => c.id === data.channelId)
          if (exists) return prev
          const newCh: Channel = {
            id: data.channelId,
            name: null,
            kind: 'direct',
            client_id: null,
            otherUser: targetUser,
          }
          return [newCh, ...prev]
        })
        handleSelect(data.channelId)
      }
    } catch (e) {
      console.error('Failed to start DM', e)
    }
  }, [handleSelect])

  const selectedChannel = channels.find(c => c.id === selectedChannelId)
  const dmOtherUser = selectedChannel?.kind === 'direct' ? selectedChannel.otherUser ?? null : null

  const userLike = { id: userId, email: '' } as any
  const profileWithId = { ...profile, id: userId }

  const filteredDMUsers = dmSearch
    ? messageableUsers.filter(u => (u.full_name ?? '').toLowerCase().includes(dmSearch.toLowerCase()))
    : messageableUsers

  return (
    <>
      <Header user={userLike} profile={profile} />

      <div style={{ height: 'calc(100dvh - 60px)', minHeight: 'calc(100dvh - 60px)', display: 'flex', overflow: 'hidden', position: 'relative' }}>

        {/* Sidebar */}
        {(!isMobile || !showChat) && (
          <ChatSidebar
            channels={channels}
            selectedId={selectedChannelId}
            onSelect={handleSelect}
            onNewDM={openNewDM}
            currentUser={profileWithId}
            isMobile={isMobile}
          />
        )}

        {/* Chat window */}
        {(!isMobile || showChat) && (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: '#0f0f11' }}>
            {selectedChannelId && selectedChannel ? (
              <ChatWindow
                channelId={selectedChannelId}
                channelName={selectedChannel.otherUser?.full_name ?? selectedChannel.name ?? 'Channel'}
                channelKind={selectedChannel.kind}
                currentUserId={userId}
                users={allUsers}
                dmOtherUser={dmOtherUser}
                onBack={isMobile ? handleBack : undefined}
              />
            ) : (
              <div style={{
                flex: 1, display: 'flex', flexDirection: 'column',
                alignItems: 'center', justifyContent: 'center',
                color: '#636366', fontSize: 14, gap: 12,
              }}>
                <div style={{ fontSize: 48, marginBottom: 4 }}>💬</div>
                <div style={{ fontWeight: 600, color: '#8e8e93', fontSize: 16 }}>Your messages</div>
                <div style={{ fontSize: 13, color: '#48484a', textAlign: 'center', maxWidth: 240, lineHeight: 1.6 }}>
                  Send private messages to your team or select a conversation
                </div>
                <button
                  onClick={openNewDM}
                  style={{
                    marginTop: 8,
                    background: '#007aff',
                    color: '#fff',
                    border: 'none',
                    borderRadius: 10,
                    padding: '10px 20px',
                    fontSize: 14,
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  New Message
                </button>
              </div>
            )}
          </div>
        )}

        {/* New DM modal overlay */}
        {showNewDM && (
          <>
            <div
              onClick={() => { setShowNewDM(false); setDmSearch('') }}
              style={{
                position: 'absolute', inset: 0,
                background: 'rgba(0,0,0,0.5)',
                zIndex: 100,
              }}
            />
            <div style={{
              position: 'absolute',
              top: '50%', left: '50%',
              transform: 'translate(-50%, -50%)',
              width: Math.min(360, window.innerWidth - 32),
              maxHeight: '70vh',
              background: '#1c1c1e',
              borderRadius: 16,
              boxShadow: '0 20px 60px rgba(0,0,0,0.6)',
              zIndex: 101,
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
            }}>
              {/* Modal header */}
              <div style={{
                padding: '16px 16px 12px',
                borderBottom: '1px solid #333336',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}>
                <div style={{ fontSize: 15, fontWeight: 700, color: '#fff' }}>New Message</div>
                <button
                  onClick={() => { setShowNewDM(false); setDmSearch('') }}
                  style={{
                    background: '#2c2c2e', border: 'none', cursor: 'pointer',
                    color: '#8e8e93', borderRadius: '50%',
                    width: 28, height: 28,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 16,
                  }}
                >
                  ×
                </button>
              </div>

              {/* Search */}
              <div style={{ padding: '10px 14px' }}>
                <div style={{ position: 'relative' }}>
                  <span style={{
                    position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)',
                    fontSize: 12, color: '#636366', pointerEvents: 'none',
                  }}>🔍</span>
                  <input
                    autoFocus
                    type="text"
                    placeholder="Search people…"
                    value={dmSearch}
                    onChange={e => setDmSearch(e.target.value)}
                    style={{
                      width: '100%',
                      fontSize: 14,
                      padding: '8px 10px 8px 30px',
                      background: '#2c2c2e',
                      border: '1px solid #444446',
                      borderRadius: 10,
                      color: '#f2f2f7',
                      outline: 'none',
                      boxSizing: 'border-box',
                    }}
                  />
                </div>
              </div>

              {/* User list */}
              <div style={{ overflowY: 'auto', flex: 1, padding: '0 8px 12px' }}>
                {loadingUsers ? (
                  <div style={{ fontSize: 13, color: '#636366', textAlign: 'center', padding: '20px 0' }}>
                    Loading…
                  </div>
                ) : filteredDMUsers.length === 0 ? (
                  <div style={{ fontSize: 13, color: '#636366', textAlign: 'center', padding: '20px 0' }}>
                    {dmSearch ? `No results for "${dmSearch}"` : 'No users available'}
                  </div>
                ) : (
                  filteredDMUsers.map(u => (
                    <div
                      key={u.id}
                      onClick={() => startDM(u)}
                      style={{
                        padding: '8px 10px',
                        borderRadius: 10,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 10,
                        transition: 'background 0.15s',
                      }}
                      onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.06)')}
                      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                    >
                      <div style={{
                        width: 38, height: 38, borderRadius: '50%', flexShrink: 0,
                        background: avatarColor(u.id),
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 13, fontWeight: 700, color: '#fff',
                      }}>
                        {getInitials(u.full_name)}
                      </div>
                      <div style={{ flex: 1, overflow: 'hidden' }}>
                        <div style={{
                          fontSize: 14, fontWeight: 500, color: '#f2f2f7',
                          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                        }}>
                          {u.full_name ?? 'Unknown'}
                        </div>
                        {u.role && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 2 }}>
                            <span style={{
                              background: roleBadgeColor(u.role),
                              color: '#fff',
                              borderRadius: 4,
                              padding: '1px 5px',
                              fontSize: 9,
                              fontWeight: 700,
                              textTransform: 'uppercase',
                              letterSpacing: '0.04em',
                            }}>
                              {roleLabel(u.role)}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </>
  )
}
