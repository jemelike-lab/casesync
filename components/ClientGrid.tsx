'use client'

import { Client, SortField, SortDir, sortClients } from '@/lib/types'
import ClientCard from './ClientCard'

interface Props {
  clients: Client[]
  pinnedIds: string[]
  onTogglePin: (id: string) => void
  selectedIds?: string[]
  onToggleSelect?: (id: string) => void
  showSelect?: boolean
  sortField?: SortField
  sortDir?: SortDir
  onSortChange?: (field: SortField) => void
  onContactLogged?: (clientId: string, date: string, type: string, note: string) => void
}

const SORT_FIELDS: { field: SortField; label: string }[] = [
  { field: 'name', label: 'Name' },
  { field: 'goal_pct', label: 'Goal %' },
  { field: 'last_contact_date', label: 'Last Contact' },
  { field: 'eligibility_end_date', label: 'Elig. End' },
]

export default function ClientGrid({
  clients,
  pinnedIds,
  onTogglePin,
  selectedIds = [],
  onToggleSelect,
  showSelect,
  sortField,
  sortDir = 'asc',
  onSortChange,
  onContactLogged,
}: Props) {
  const sorted = sortField ? sortClients(clients, sortField, sortDir) : clients

  if (sorted.length === 0) {
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
    <div>
      {/* Sort bar */}
      {onSortChange && (
        <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap', alignItems: 'center' }}>
          <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Sort:</span>
          {SORT_FIELDS.map(sf => (
            <button
              key={sf.field}
              onClick={() => onSortChange(sf.field)}
              style={{
                background: sortField === sf.field ? 'rgba(0,122,255,0.15)' : 'var(--surface-2)',
                border: '1px solid',
                borderColor: sortField === sf.field ? 'var(--accent)' : 'var(--border)',
                borderRadius: 6,
                color: sortField === sf.field ? 'var(--accent)' : 'var(--text-secondary)',
                fontSize: 11,
                padding: '4px 10px',
                cursor: 'pointer',
                minHeight: 28,
              }}
            >
              {sf.label} {sortField === sf.field ? (sortDir === 'asc' ? '↑' : '↓') : ''}
            </button>
          ))}
        </div>
      )}

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
        gap: 16,
      }}>
        {sorted.map(client => (
          <ClientCard
            key={client.id}
            client={client}
            isPinned={pinnedIds.includes(client.id)}
            onTogglePin={onTogglePin}
            selected={selectedIds.includes(client.id)}
            onToggleSelect={onToggleSelect}
            showSelect={showSelect}
            onContactLogged={onContactLogged}
          />
        ))}
      </div>
    </div>
  )
}
