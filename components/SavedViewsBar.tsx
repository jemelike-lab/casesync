'use client'

import type { FilterType, Profile, SavedViewFilter, SavedViewRecord } from '@/lib/types'

export interface DashboardSavedView {
  id: string
  label: string
  filter?: FilterType
  plannerId?: string | null
  definition?: SavedViewFilter
  source?: 'system' | 'personal' | 'legacy'
}

interface Props {
  profile: Profile | null
  activeFilter: FilterType
  activePlannerId?: string | null
  views?: SavedViewRecord[]
  activeSavedViewId?: string | null
  onSelect: (view: DashboardSavedView) => void
}

const LEGACY_VIEWS: DashboardSavedView[] = [
  { id: 'all', label: 'All Active', filter: 'all', source: 'legacy' },
  { id: 'overdue', label: '🔴 Overdue', filter: 'overdue', source: 'legacy' },
  { id: 'due_this_week', label: '🟠 Due This Week', filter: 'due_this_week', source: 'legacy' },
  { id: 'no_contact_7', label: '📵 No Contact 7+d', filter: 'no_contact_7', source: 'legacy' },
  { id: 'eligibility_ending_soon', label: '⏳ Eligibility Ending', filter: 'eligibility_ending_soon', source: 'legacy' },
]

function mapSavedViewToDashboardView(view: SavedViewRecord): DashboardSavedView {
  const dueStates = view.filter_definition?.dueStates ?? []
  const assignmentStates = view.filter_definition?.assignmentStates ?? []
  const ownershipScope = view.filter_definition?.ownershipScope

  let filter: FilterType = 'all'
  let plannerId: string | null = null

  if (dueStates.includes('overdue')) filter = 'overdue'
  else if (dueStates.includes('due_this_week')) filter = 'due_this_week'
  else if (assignmentStates.includes('unassigned')) filter = 'all'

  if (ownershipScope === 'specific_planner' && view.filter_definition?.assignedToUserId) {
    plannerId = view.filter_definition.assignedToUserId
  }

  return {
    id: view.id,
    label: view.name,
    filter,
    plannerId,
    definition: view.filter_definition,
    source: view.visibility_type === 'system' ? 'system' : 'personal',
  }
}

export default function SavedViewsBar({ profile, activeFilter, activePlannerId, views = [], activeSavedViewId, onSelect }: Props) {
  const mappedViews = views.length > 0 ? views.map(mapSavedViewToDashboardView) : LEGACY_VIEWS
  const systemViews = mappedViews.filter(view => view.source === 'system' || view.source === 'legacy')
  const personalViews = mappedViews.filter(view => view.source === 'personal')

  return (
    <div className="card" style={{ marginBottom: 16, padding: 14 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, marginBottom: 10 }}>
        <div style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-secondary)' }}>
          Saved Views
        </div>
        {views.length > 0 && (
          <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
            {views.length} available
          </div>
        )}
      </div>
      {systemViews.length > 0 && (
        <div style={{ marginBottom: personalViews.length > 0 ? 10 : 0 }}>
          <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 8 }}>Starter queues</div>
          <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 2 }}>
            {systemViews.map((view) => {
              const active = activeSavedViewId
                ? view.id === activeSavedViewId
                : (view.filter ?? 'all') === activeFilter && (view.plannerId ?? null) === (activePlannerId ?? null)

              return (
                <button
                  key={view.id}
                  type="button"
                  onClick={() => onSelect(view)}
                  title={view.source === 'system' ? 'System starter view' : undefined}
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
      )}
      {personalViews.length > 0 && (
        <div>
          <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 8 }}>My saved views</div>
          <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 2 }}>
            {personalViews.map((view) => {
              const active = activeSavedViewId
                ? view.id === activeSavedViewId
                : (view.filter ?? 'all') === activeFilter && (view.plannerId ?? null) === (activePlannerId ?? null)

              return (
                <button
                  key={view.id}
                  type="button"
                  onClick={() => onSelect(view)}
                  title="Saved personal view"
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
      )}
    </div>
  )
}
