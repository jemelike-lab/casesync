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
}

export default function ChatSidebar({ channels, selectedId, onSelect, onNewDM }: Props) {
  const [search, setSearch] = useState('')

  const teamChannels = channels.filter(c => c.kind === 'team' || c.kind === 'direct')
  const clientChannels = channels.filter(c => c.kind === 'client')

  const filtered = (list: Channel[]) =>
    search ? list.filter(c => (c.name ?? '').toLowerCase().includes(search.toLowerCase())) : list

  function ChannelItem({ ch }: { ch: Channel }) {
    const active = ch.id === selectedId
    const icon = ch.kind === 'direct' ? '👤' : ch.kind === 'client' ? '📋' : '💬'
    return (
      <div
        onClick={() => onSelect(ch.id)}
        style={{
          padding: '8px 12px', borderRadius: 8, cursor: 'pointer', display: 'flex',
          alignItems: 'center', gap: 10,
          background: active ? 'rgba(0,122,255,0.15)' : 'transparent',
          transition: 'background 0.15s',
        }}
        onMouseEnter={e => { if (!active) e.currentTarget.style.background = 'var(--surface-2)' }}
        onMouseLeave={e => { if (!active) e.currentTarget.style.background = 'transparent' }}
      >
        <span style={{ fontSize: 16 }}>{icon}</span>
        <span style={{ flex: 1, fontSize: 13, fontWeight: active ? 600 : 400, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {ch.name ?? 'Unnamed'}
        </span>
        {ch.unread && ch.unread > 0 ? (
          <span style={{ background: 'var(--accent)', color: 'white', borderRadius: '50%', minWidth: 18, height: 18, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700 }}>
            {ch.unread > 9 ? '9+' : ch.unread}
          </span>
        ) : null}
      </div>
    )
  }

  return (
    <div style={{ width: 240, borderRight: '1px solid var(--border)', display: 'flex', flexDirection: 'column', background: 'var(--surface)', flexShrink: 0 }}>
      <div style={{ padding: '12px 12px 8px' }}>
        <input
          type="text"
          placeholder="Search channels…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ width: '100%', fontSize: 12, padding: '6px 10px' }}
        />
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: '0 8px 8px' }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', padding: '10px 4px 4px', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>Team</span>
          {onNewDM && (
            <button onClick={onNewDM} style={{ background: 'none', border: 'none', color: 'var(--accent)', cursor: 'pointer', fontSize: 16, padding: 0 }} title="New direct message">+</button>
          )}
        </div>
        {filtered(teamChannels).map(ch => <ChannelItem key={ch.id} ch={ch} />)}

        {filtered(clientChannels).length > 0 && (
          <>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', padding: '14px 4px 4px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Clients
            </div>
            {filtered(clientChannels).map(ch => <ChannelItem key={ch.id} ch={ch} />)}
          </>
        )}
      </div>
    </div>
  )
}
