'use client'

import type { FilterType, Profile } from '@/lib/types'

interface SavedView {
  id: string
  label: string
  filter?: FilterType
  plannerId?: string | null
  category?: 'core' | 'team'
}

interface Props {
  profile: Profile | null
  activeFilter: FilterType
  activePlannerId?: string | null
  onSelect: (view: SavedView) => void
}

const CORE_VIEWS: SavedView[] = [
  { id: 'all', label: 'All Active', filter: 'all', category: 'core' },
  { id: 'overdue', label: '🔴 Overdue', filter: 'overdue', category: 'core' },
  { id: 'due_this_week', label: '🟠 Due This Week', filter: 'due_this_week', category: 'core' },
  { id: 'no_contact_7', label: '📵 No Contact 7+d', filter: 'no_contact_7', category: 'core' },
  { id: 'eligibility_ending_soon', label: '⏳ Eligibility Ending', filter: 'eligibility_ending_soon', category: 'core' },
]

export default function SavedViewsBar({ profile, activeFilter, activePlannerId, onSelect }: Props) {
  const views: SavedView[] = [...CORE_VIEWS]

  return (
    <div className="card" style={{ marginBottom: 16, padding: 14 }}>
      <div style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-secondary)', marginBottom: 10 }}>
        Saved Views
      </div>
      <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 2 }}>
        {views.map((view) => {
          const active = (view.filter ?? 'all') === activeFilter && !activePlannerId

          return (
            <button
              key={view.id}
              type="button"
              onClick={() => onSelect(view)}
              style={{
                padding: '8px 12px',
                borderRadius: 999,
                border: '1px solid',
                borderColor: active ? 'var(--accent)' : 'var(--border)',
                background: active ? 'rgba(0,122,255,0.15)' : 'var(--surface-2)',
                color: active ? 'var(--accent)' : 'var(--text-secondary)',
                whiteSpace: 'nowrap',
                fontSize: 12,
                fontWeight: 600,
                cursor: 'pointer',
                minHeight: 36,
              }}
            >
              {view.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}
