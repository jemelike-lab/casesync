'use client'

import { Client } from '@/lib/types'
import ClientCard from './ClientCard'

interface Props {
  clients: Client[]
  pinnedIds: string[]
  onTogglePin: (id: string) => void
}

export default function ClientGrid({ clients, pinnedIds, onTogglePin }: Props) {
  if (clients.length === 0) {
    return (
      <div style={{
        textAlign: 'center',
        padding: '60px 24px',
        color: 'var(--text-secondary)',
        fontSize: 14,
      }}>
        <div style={{ fontSize: 40, marginBottom: 12 }}>🔍</div>
        <div>No clients match your search or filter.</div>
      </div>
    )
  }

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
      gap: 16,
    }}>
      {clients.map(client => (
        <ClientCard
          key={client.id}
          client={client}
          isPinned={pinnedIds.includes(client.id)}
          onTogglePin={onTogglePin}
        />
      ))}
    </div>
  )
}
