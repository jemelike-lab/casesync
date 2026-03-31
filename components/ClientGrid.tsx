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
  loading?: boolean
}

const SORT_FIELDS: { field: SortField; label: string }[] = [
  { field: 'priority', label: '\u{1F525} Priority' },
  { field: 'name', label: 'Name' },
  { field: 'goal_pct', label: 'Goal %' },
  { field: 'last_contact_date', label: 'Last Contact' },
  { field: 'eligibility_end_date', label: 'Elig. End' },
]

function ClientSkeleton() {
  return (
    <div className="card" style={{ opacity: 0.6 }}>
      <div style={{ height: 20, background: 'var(--surface-2)', borderRadius: 4, marginBottom: 8, width: '60%' }} />
      <div style={{ height: 14, background: 'var(--surface-2)', borderRadius: 4, marginBottom: 6, width: '40%' }} />
      <div style={{ height: 14, background: 'var(--surface-2)', borderRadius: 4, width: '80%' }} />
    </div>
  )
}

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
  loading = false,
}: Props) {
  const sorted = sortField ? sortClients(clients, sortField, sortDir) : clients

  if (loading) {
    return (
      <div>
        {onSortChange && (
          <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap', alignItems: 'center' }}>
            <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Sort:</span>
            {SORT_FIELDS.map(sf => (
              <button
                key={sf.field}
                style={{
                  background: 'var(--surface-2)',
                  border: '1px solid',
                  borderColor: 'var(--border)',
                  borderRadius: 6,
                  color: 'var(--text-secondary)',
                  fontSize: 11,
                  padding: '4px 10px',
                  cursor: 'pointer',
                  minHeight: 28,
                }}
                disabled
              >
                {sf.label}
              </button>
            ))}
          </div>
        )}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
          gap: 16,
        }}>
          {Array.from({ length: 6 }).map((_, i) => <ClientSkeleton key={i} />)}
        </div>
      </div>
    )
  }

  if (sorted.length === 0) {
    return (
      <div style={{
        textAlign: 'center',
        padding: '60px 24px',
        color: 'var(--text-secondary)',
        fontSize: 14,
      }}>
        <div style={{ fontSize: 40, marginBottom: 12 }}>\u{1F4CD}</div>
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
              {sf.label} {sortField === sf.field ? (sortDir === 'asc' ? '\u2191' : '\u2193') : ''}
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
