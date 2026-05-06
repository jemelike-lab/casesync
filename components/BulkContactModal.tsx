'use client'

import { useState } from 'react'
import { Client, formatDate } from '@/lib/types'

interface Props {
  clients: Client[]
  onClose: () => void
  onSuccess: (clientIds: string[], date: string, type: string) => void
}

const CONTACT_TYPES = ['Phone', 'Home Visit', 'Email', 'Office Visit', 'Video']

export default function BulkContactModal({ clients, onClose, onSuccess }: Props) {
  const [date, setDate] = useState(new Date().toISOString().split('T')[0])
  const [type, setType] = useState('Phone')
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit() {
    if (clients.length === 0) return
    setSaving(true)
    setError('')

    try {
      const res = await fetch('/api/clients/bulk-contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientIds: clients.map(c => c.id),
          date,
          type,
          note: note.trim() || undefined,
        }),
      })

      if (!res.ok) {
        const data = await res.json()
        setError(data.error || 'Failed to log contacts')
        setSaving(false)
        return
      }

      const data = await res.json()
      onSuccess(clients.map(c => c.id), date, type)
      // Don't close yet — onSuccess will handle the toast and cleanup
    } catch {
      setError('Network error — please try again')
      setSaving(false)
    }
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 1000,
      background: 'rgba(0,0,0,0.7)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 20,
    }} onClick={onClose}>
      <div
        className="card slide-in-up"
        style={{ width: '100%', maxWidth: 480, maxHeight: '90vh', overflowY: 'auto' }}
        onClick={e => e.stopPropagation()}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <h3 style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>
            📞 Log Contacts — {clients.length} client{clients.length !== 1 ? 's' : ''}
          </h3>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: 16, padding: 4 }}
          >✕</button>
        </div>

        {/* Client list preview */}
        <div style={{
          maxHeight: 140, overflowY: 'auto',
          background: 'var(--surface-2)', borderRadius: 8, padding: '8px 12px',
          marginBottom: 16,
          border: '1px solid var(--border)',
        }}>
          {clients.map(c => (
            <div key={c.id} style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              padding: '4px 0',
              fontSize: 13,
              borderBottom: '1px solid var(--border)',
            }}>
              <span style={{ fontWeight: 600, color: 'var(--text)' }}>
                {c.last_name}, {c.first_name}
              </span>
              <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                {c.last_contact_date ? `Last: ${formatDate(c.last_contact_date)}` : 'No contact'}
              </span>
            </div>
          ))}
        </div>

        {/* Form fields */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', gap: 12 }}>
            <div style={{ flex: 1 }}>
              <label style={{ display: 'block', fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4, fontWeight: 600 }}>Date</label>
              <input
                type="date"
                value={date}
                onChange={e => setDate(e.target.value)}
                style={{ width: '100%' }}
              />
            </div>
            <div style={{ flex: 1 }}>
              <label style={{ display: 'block', fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4, fontWeight: 600 }}>Contact Type</label>
              <select value={type} onChange={e => setType(e.target.value)} style={{ width: '100%' }}>
                {CONTACT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4, fontWeight: 600 }}>
              Note <span style={{ fontWeight: 400 }}>(optional — shared across all)</span>
            </label>
            <textarea
              value={note}
              onChange={e => setNote(e.target.value)}
              placeholder="Brief note about the contacts..."
              maxLength={1000}
              style={{ width: '100%', minHeight: 70, resize: 'vertical' }}
            />
          </div>

          {error && (
            <div style={{
              background: 'rgba(255,69,58,0.12)', border: '1px solid rgba(255,69,58,0.3)',
              borderRadius: 6, padding: '8px 12px', fontSize: 12, color: '#ff453a',
            }}>
              {error}
            </div>
          )}

          <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
            <button
              className="btn-primary"
              style={{ flex: 1, fontSize: 14, minHeight: 42 }}
              disabled={saving}
              onClick={handleSubmit}
            >
              {saving ? 'Logging…' : `Log ${clients.length} Contact${clients.length !== 1 ? 's' : ''}`}
            </button>
            <button className="btn-secondary" onClick={onClose} style={{ minHeight: 42 }}>Cancel</button>
          </div>
        </div>
      </div>
    </div>
  )
}
