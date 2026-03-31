'use client'

import { useEffect } from 'react'

interface Props {
  onClose: () => void
  canAddClient?: boolean
}

const SHORTCUTS = [
  { key: 'N', description: 'Add new client', adminOnly: true },
  { key: 'C', description: 'Go to Calendar' },
  { key: '/', description: 'Focus search bar' },
  { key: '?', description: 'Show this help' },
  { key: 'Esc', description: 'Close modal / dismiss' },
]

export default function KeyboardShortcutsModal({ onClose, canAddClient = false }: Props) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onClose])

  const visible = SHORTCUTS.filter(s => !s.adminOnly || canAddClient)

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 2000,
        background: 'rgba(0,0,0,0.7)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 20,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: 16,
          padding: 24,
          width: '100%',
          maxWidth: 380,
          boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>⌨️ Keyboard Shortcuts</h3>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, color: 'var(--text-secondary)' }}
          >
            ✕
          </button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {visible.map(s => (
            <div
              key={s.key}
              style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
            >
              <span style={{ fontSize: 14, color: 'var(--text-secondary)' }}>{s.description}</span>
              <kbd style={{
                background: 'var(--surface-2)',
                border: '1px solid var(--border)',
                borderRadius: 6,
                padding: '3px 10px',
                fontSize: 12,
                fontWeight: 700,
                color: 'var(--accent)',
                fontFamily: 'monospace',
                boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
                minWidth: 36,
                textAlign: 'center',
              }}>
                {s.key}
              </kbd>
            </div>
          ))}
        </div>

        <p style={{ margin: '16px 0 0', fontSize: 12, color: 'var(--text-secondary)', textAlign: 'center' }}>
          Shortcuts are disabled when typing in inputs
        </p>
      </div>
    </div>
  )
}
