'use client'

import { useState } from 'react'

interface Channel {
  id: string
  name: string | null
  kind: string
  client_id: string | null
  unread?: number
}

interface Props {
  channels: Channel[]
  selectedId: string | null
  onSelect: (id: string) => void
  onNewDM?: () => void
  currentUser?: { full_name: string | null; role?: string | null } | null
}

function getInitials(name: string | null | undefined) {
  if (!name) return '?'
  return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
}

export default function ChatSidebar({ channels, selectedId, onSelect, onNewDM, currentUser }: Props) {
  const [search, setSearch] = useState('')
  const [searchFocused, setSearchFocused] = useState(false)

  const teamChannels = channels.filter(c => c.kind === 'team' || c.kind === 'direct')
  const clientChannels = channels.filter(c => c.kind === 'client')

  const filtered = (list: Channel[]) =>
    search ? list.filter(c => (c.name ?? '').toLowerCase().includes(search.toLowerCase())) : list

  function ChannelItem({ ch }: { ch: Channel }) {
    const active = ch.id === selectedId
    const icon = ch.kind === 'direct' ? '👤' : ch.kind === 'client' ? '📋' : '#'
    const isHash = icon === '#'

    return (
      <div
        onClick={() => onSelect(ch.id)}
        style={{
          padding: '8px 10px 8px 8px',
          borderRadius: 8,
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: 9,
          background: active ? 'rgba(0,122,255,0.12)' : 'transparent',
          borderLeft: active ? '3px solid #007aff' : '3px solid transparent',
          transition: 'background 0.15s, border-color 0.15s',
          marginBottom: 1,
          userSelect: 'none',
        }}
        onMouseEnter={e => { if (!active) (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.05)' }}
        onMouseLeave={e => { if (!active) (e.currentTarget as HTMLElement).style.background = 'transparent' }}
      >
        <span style={{
          fontSize: isHash ? 13 : 15,
          color: active ? '#007aff' : '#636366',
          flexShrink: 0,
          width: 20,
          textAlign: 'center',
          fontWeight: isHash ? 700 : 400,
        }}>
          {icon}
        </span>
        <span style={{
          flex: 1,
          fontSize: 14,
          fontWeight: active ? 600 : ch.unread ? 500 : 400,
          color: active ? '#fff' : ch.unread ? '#f2f2f7' : '#8e8e93',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}>
          {ch.name ?? 'Unnamed'}
        </span>
        {ch.unread && ch.unread > 0 ? (
          <span style={{
            background: '#ff3b30',
            color: '#fff',
            borderRadius: 10,
            minWidth: 18,
            height: 18,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 11,
            fontWeight: 700,
            padding: '0 5px',
            flexShrink: 0,
          }}>
            {ch.unread > 9 ? '9+' : ch.unread}
          </span>
        ) : null}
      </div>
    )
  }

  return (
    <div style={{
      width: 240,
      borderRight: '1px solid #333336',
      display: 'flex',
      flexDirection: 'column',
      background: '#1c1c1e',
      flexShrink: 0,
      height: '100%',
    }}>
      {/* Sidebar header */}
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
            placeholder="Search channels…"
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

      {/* Channel list */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '6px 8px' }}>
        {/* Team section */}
        <div style={{
          fontSize: 11, fontWeight: 600, color: '#636366',
          padding: '10px 4px 4px',
          textTransform: 'uppercase', letterSpacing: '0.06em',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
          <span>Team</span>
          {onNewDM && (
            <button
              onClick={onNewDM}
              style={{
                background: 'none', border: 'none', color: '#007aff', cursor: 'pointer',
                fontSize: 18, padding: '0 2px', lineHeight: 1, fontWeight: 300,
                borderRadius: 4, transition: 'background 0.1s',
              }}
              title="New direct message"
              onMouseEnter={e => { (e.currentTarget).style.background = 'rgba(0,122,255,0.12)' }}
              onMouseLeave={e => { (e.currentTarget).style.background = 'none' }}
            >
              +
            </button>
          )}
        </div>
        {filtered(teamChannels).map(ch => <ChannelItem key={ch.id} ch={ch} />)}

        {/* Client section */}
        {filtered(clientChannels).length > 0 && (
          <>
            <div style={{
              fontSize: 11, fontWeight: 600, color: '#636366',
              padding: '14px 4px 4px',
              textTransform: 'uppercase', letterSpacing: '0.06em',
            }}>
              Clients
            </div>
            {filtered(clientChannels).map(ch => <ChannelItem key={ch.id} ch={ch} />)}
          </>
        )}

        {/* Empty state */}
        {filtered(teamChannels).length === 0 && filtered(clientChannels).length === 0 && search && (
          <div style={{ fontSize: 13, color: '#636366', textAlign: 'center', padding: '20px 0' }}>
            No channels found
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
            background: 'linear-gradient(135deg, #007aff, #0050a0)',
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
              <div style={{
                fontSize: 11, color: '#636366',
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>
                {currentUser.role}
              </div>
            )}
          </div>
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#30d158', flexShrink: 0 }} title="Online" />
        </div>
      )}
    </div>
  )
}
