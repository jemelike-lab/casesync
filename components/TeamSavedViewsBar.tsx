'use client'

import type { SavedViewRecord } from '@/lib/types'

interface Props {
  views: SavedViewRecord[]
  activeSavedViewId?: string | null
}

export default function TeamSavedViewsBar({ views, activeSavedViewId }: Props) {
  if (!views.length) return null

  return (
    <div className="card" style={{ marginBottom: 20, padding: 14 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, marginBottom: 10, flexWrap: 'wrap' }}>
        <div style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-secondary)' }}>
          Saved Queues
        </div>
        <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
          {views.length} available
        </div>
      </div>
      <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 8 }}>Team starter queues</div>
      <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 2 }}>
        {views.map((view) => {
          const active = view.id === activeSavedViewId
          return (
            <button
              key={view.id}
              type="button"
              onClick={() => { window.location.href = `/team?full=1&view=${encodeURIComponent(view.id)}` }}
              title={view.description ?? undefined}
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
              {view.name}
            </button>
          )
        })}
      </div>
    </div>
  )
}
