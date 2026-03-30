'use client'

import { FilterType } from '@/lib/types'

interface Props {
  activeFilter: FilterType
  search: string
  onFilterChange: (f: FilterType) => void
  onSearchChange: (s: string) => void
}

const FILTERS: { key: FilterType; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'overdue', label: '🔴 Overdue' },
  { key: 'due_this_week', label: '🟠 Due This Week' },
  { key: 'no_contact_7', label: '📵 No Contact 7+d' },
  { key: 'eligibility_ending_soon', label: '⏳ Eligibility Ending' },
  { key: 'co', label: 'CO' },
  { key: 'cfc', label: 'CFC' },
  { key: 'cpas', label: 'CPAS' },
]

export default function FilterBar({ activeFilter, search, onFilterChange, onSearchChange }: Props) {
  return (
    <div style={{ marginBottom: 20 }}>
      {/* Search */}
      <input
        type="search"
        value={search}
        onChange={e => onSearchChange(e.target.value)}
        placeholder="Search by client ID, name, or eligibility code…"
        style={{ width: '100%', fontSize: 14, marginBottom: 12 }}
      />

      {/* Filter chips */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {FILTERS.map(f => (
          <button
            key={f.key}
            onClick={() => onFilterChange(f.key)}
            style={{
              padding: '6px 14px',
              borderRadius: 20,
              fontSize: 12,
              fontWeight: 500,
              cursor: 'pointer',
              border: '1px solid',
              borderColor: activeFilter === f.key ? 'var(--accent)' : 'var(--border)',
              background: activeFilter === f.key ? 'rgba(0, 122, 255, 0.15)' : 'var(--surface-2)',
              color: activeFilter === f.key ? 'var(--accent)' : 'var(--text-secondary)',
              transition: 'all 0.15s',
            }}
          >
            {f.label}
          </button>
        ))}
      </div>
    </div>
  )
}
