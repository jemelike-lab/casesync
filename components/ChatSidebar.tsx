'use client'

import { useState } from 'react'

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
  // For DM channels
  otherUser?: UserInfo
  lastMessage?: string
  lastMessageAt?: string
}

interface Props {
  channels: Channel[]
  selectedId: string | null
  onSelect: (id: string) => void
  onNewDM?: () => void
  currentUser?: { id?: string; full_name: string | null; role?: string | null } | null
  isMobile?: boolean
}

function getInitials(name: string | null | undefined) {
  if (!name) return '?'
  return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
}

function roleBadgeStyle(role: string | null | undefined): React.CSSProperties {
  const map: Record<string, string> = {
    supervisor: '#bf5af2',
    team_manager: '#007aff',
    supports_planner: '#30d158',
  }
  return {
    background: map[role ?? ''] ?? '#48484a',
    color: '#fff',
    borderRadius: 4,
    padding: '1px 5px',
    fontSize: 9,
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: '0.04em',
    flexShrink: 0,
  }
}

function roleLabel(role: string | null | undefined) {
  if (role === 'supports_planner') return 'Planner'
  if (role === 'team_manager') return 'Manager'
  if (role === 'supervisor') return 'Supervisor'
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

export default function ChatSidebar({ channels, selectedId, onSelect, onNewDM, currentUser, isMobile }: Props) {
  const [search, setSearch] = useState('')
  const [searchFocused, setSearchFocused] = useState(false)

  const dmChannels = channels.filter(c => c.kind === 'direct')
  const teamChannels = channels.filter(c => c.kind === 'team')
  const clientChannels = channels.filter(c => c.kind === 'client')

  const filterChannels = (list: Channel[]) =>
    search
      ? list.filter(c => {
          const name = c.otherUser?.full_name ?? c.name ?? ''
          return name.toLowerCase().includes(search.toLowerCase())
        })
      : list

  function DMItem({ ch }: { ch: Channel }) {
    const active = ch.id === selectedId
    const other = ch.otherUser
    const initials = getInitials(other?.full_name)
    const aColor = other ? avatarColor(other.id) : 'linear-gradient(135deg, #48484a, #333336)'

    return (
      <div
        onClick={() => onSelect(ch.id)}
        style={{
          padding: '8px 10px',
          borderRadius: 10,
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          background: active ? 'rgba(0,122,255,0.15)' : 'transparent',
          borderLeft: active ? '3px solid #007aff' : '3px solid transparent',
          transition: 'background 0.15s',
          marginBottom: 2,
          userSelect: 'none',
        }}
        onMouseEnter={e => { if (!active) (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.05)' }}
        onMouseLeave={e => { if (!active) (e.currentTarget as HTMLElement).style.background = 'transparent' }}
      >
        {/* Avatar with online dot */}
        <div style={{ position: 'relative', flexShrink: 0 }}>
          <div style={{
            width: 34, height: 34, borderRadius: '50%',
            background: aColor,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 12, fontWeight: 700, color: '#fff',
          }}>
            {initials}
          </div>
          {/* Online indicator */}
          <div style={{
            position: 'absolute', bottom: 0, right: 0,
            width: 9, height: 9, borderRadius: '50%',
            background: '#30d158',
            border: '2px solid #1c1c1e',
          }} />
        </div>

        {/* Name + preview */}
        <div style={{ flex: 1, overflow: 'hidden' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
            <span style={{
              fontSize: 13, fontWeight: active ? 600 : ch.unread ? 600 : 400,
              color: active ? '#fff' : ch.unread ? '#f2f2f7' : '#aeaeb2',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              flex: 1,
            }}>
              {other?.full_name ?? 'Unknown'}
            </span>
            {other?.role && (
              <span style={roleBadgeStyle(other.role)}>{roleLabel(other.role)}</span>
            )}
          </div>
          {ch.lastMessage && (
            <div style={{
              fontSize: 11, color: '#636366',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
              {ch.lastMessage}
            </div>
          )}
        </div>

        {ch.unread && ch.unread > 0 ? (
          <span style={{
            background: '#ff3b30', color: '#fff',
            borderRadius: 10, minWidth: 18, height: 18,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 11, fontWeight: 700, padding: '0 5px', flexShrink: 0,
          }}>
            {ch.unread > 9 ? '9+' : ch.unread}
          </span>
        ) : null}
      </div>
    )
  }

  function TeamItem({ ch }: { ch: Channel }) {
    const active = ch.id === selectedId
    return (
      <div
        onClick={() => onSelect(ch.id)}
        style={{
          padding: '8px 10px',
          borderRadius: 10,
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          background: active ? 'rgba(0,122,255,0.15)' : 'transparent',
          borderLeft: active ? '3px solid #007aff' : '3px solid transparent',
          transition: 'background 0.15s',
          marginBottom: 2,
          userSelect: 'none',
        }}
        onMouseEnter={e => { if (!active) (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.05)' }}
        onMouseLeave={e => { if (!active) (e.currentTarget as HTMLElement).style.background = 'transparent' }}
      >
        <div style={{
          width: 34, height: 34, borderRadius: 10, flexShrink: 0,
          background: 'linear-gradient(135deg, #007aff, #0050a0)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 16, color: '#fff', fontWeight: 700,
        }}>
          #
        </div>
        <span style={{
          flex: 1, fontSize: 13,
          fontWeight: active ? 600 : ch.unread ? 600 : 400,
          color: active ? '#fff' : ch.unread ? '#f2f2f7' : '#aeaeb2',
        }}>
          {ch.name ?? 'Team'}
        </span>
        {ch.unread && ch.unread > 0 ? (
          <span style={{
            background: '#ff3b30', color: '#fff',
            borderRadius: 10, minWidth: 18, height: 18,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 11, fontWeight: 700, padding: '0 5px', flexShrink: 0,
          }}>
            {ch.unread > 9 ? '9+' : ch.unread}
          </span>
        ) : null}
      </div>
    )
  }

  function ClientItem({ ch }: { ch: Channel }) {
    const active = ch.id === selectedId
    return (
      <div
        onClick={() => onSelect(ch.id)}
        style={{
          padding: '8px 10px',
          borderRadius: 10,
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          background: active ? 'rgba(0,122,255,0.15)' : 'transparent',
          borderLeft: active ? '3px solid #007aff' : '3px solid transparent',
          transition: 'background 0.15s',
          marginBottom: 2,
          userSelect: 'none',
        }}
        onMouseEnter={e => { if (!active) (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.05)' }}
        onMouseLeave={e => { if (!active) (e.currentTarget as HTMLElement).style.background = 'transparent' }}
      >
        <div style={{
          width: 34, height: 34, borderRadius: 10, flexShrink: 0,
          background: 'linear-gradient(135deg, #ff9f0a, #cc7000)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 14, color: '#fff',
        }}>
          📋
        </div>
        <div style={{ flex: 1, overflow: 'hidden' }}>
          <div style={{
            fontSize: 13,
            fontWeight: active ? 600 : ch.unread ? 600 : 400,
            color: active ? '#fff' : ch.unread ? '#f2f2f7' : '#aeaeb2',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {ch.name ?? 'Client Thread'}
          </div>
        </div>
        {ch.unread && ch.unread > 0 ? (
          <span style={{
            background: '#ff3b30', color: '#fff',
            borderRadius: 10, minWidth: 18, height: 18,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 11, fontWeight: 700, padding: '0 5px', flexShrink: 0,
          }}>
            {ch.unread > 9 ? '9+' : ch.unread}
          </span>
        ) : null}
      </div>
    )
  }

  function SectionHeader({ label, action }: { label: string; action?: React.ReactNode }) {
    return (
      <div style={{
        fontSize: 10, fontWeight: 700, color: '#636366',
        padding: '14px 6px 6px',
        textTransform: 'uppercase', letterSpacing: '0.08em',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      }}>
        <span>{label}</span>
        {action}
      </div>
    )
  }

  return (
    <div style={{
      width: isMobile ? '100%' : 260,
      borderRight: '1px solid #333336',
      display: 'flex',
      flexDirection: 'column',
      background: '#1c1c1e',
      flexShrink: 0,
      height: '100%',
    }}>
      {/* Header */}
      <div style={{ padding: '14px 14px 10px', borderBottom: '1px solid #333336' }}>
        <div style={{ fontSize: 16, fontWeight: 700, color: '#fff', marginBottom: 10, letterSpacing: '-0.2px' }}>
          Messages
        </div>
        <div style={{ position: 'relative' }}>
          <span style={{
            position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)',
            fontSize: 12, color: '#636366', pointerEvents: 'none',
          }}>
            🔍
          </span>
          <input
            type="text"
            placeholder="Search…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            onFocus={() => setSearchFocused(true)}
            onBlur={() => setSearchFocused(false)}
            style={{
              width: '100%',
              fontSize: 13,
              padding: '7px 10px 7px 30px',
              background: '#2c2c2e',
              border: searchFocused ? '1px solid #007aff' : '1px solid #333336',
              borderRadius: 10,
              color: '#f2f2f7',
              outline: 'none',
              boxSizing: 'border-box',
              transition: 'border-color 0.2s',
            }}
          />
        </div>
      </div>

      {/* Lists */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '0 8px 8px' }}>

        {/* DIRECT MESSAGES */}
        <SectionHeader
          label="Direct Messages"
          action={
            onNewDM ? (
              <button
                onClick={onNewDM}
                title="New message"
                style={{
                  background: 'none', border: 'none', cursor: 'pointer',
                  color: '#007aff', padding: '2px 4px', borderRadius: 6,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  transition: 'background 0.1s',
                }}
                onMouseEnter={e => (e.currentTarget.style.background = 'rgba(0,122,255,0.12)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'none')}
              >
                {/* Pencil SVG icon */}
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                  <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                </svg>
              </button>
            ) : undefined
          }
        />
        {filterChannels(dmChannels).length > 0
          ? filterChannels(dmChannels).map(ch => <DMItem key={ch.id} ch={ch} />)
          : !search && (
            <div style={{ fontSize: 12, color: '#48484a', padding: '4px 6px 8px', fontStyle: 'italic' }}>
              No direct messages yet
            </div>
          )
        }

        {/* TEAM */}
        <SectionHeader label="Team" />
        {filterChannels(teamChannels).map(ch => <TeamItem key={ch.id} ch={ch} />)}

        {/* CLIENT THREADS */}
        {filterChannels(clientChannels).length > 0 && (
          <>
            <SectionHeader label="Client Threads" />
            {filterChannels(clientChannels).map(ch => <ClientItem key={ch.id} ch={ch} />)}
          </>
        )}

        {/* Empty state when searching */}
        {search && filterChannels([...dmChannels, ...teamChannels, ...clientChannels]).length === 0 && (
          <div style={{ fontSize: 13, color: '#636366', textAlign: 'center', padding: '20px 0' }}>
            No results for "{search}"
          </div>
        )}
      </div>

      {/* User profile footer */}
      {currentUser && (
        <div style={{
          padding: '10px 12px',
          borderTop: '1px solid #333336',
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          background: '#161618',
        }}>
          <div style={{
            width: 32, height: 32, borderRadius: '50%', flexShrink: 0,
            background: currentUser.id ? avatarColor(currentUser.id) : 'linear-gradient(135deg, #007aff, #0050a0)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 12, fontWeight: 700, color: '#fff',
            boxShadow: '0 0 0 2px rgba(0,122,255,0.3)',
          }}>
            {getInitials(currentUser.full_name)}
          </div>
          <div style={{ overflow: 'hidden', flex: 1 }}>
            <div style={{
              fontSize: 13, fontWeight: 600, color: '#f2f2f7',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
              {currentUser.full_name ?? 'You'}
            </div>
            {currentUser.role && (
              <div style={{ fontSize: 11, color: '#636366' }}>
                {roleLabel(currentUser.role)}
              </div>
            )}
          </div>
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#30d158', flexShrink: 0 }} title="Online" />
        </div>
      )}
    </div>
  )
}
