'use client'

// components/BotKnowledgeClient.tsx
// Batch D: BLH Bot knowledge-base editor (admin-only page component).
// Entries marked Active are injected into the bot's system prompt (60s cache),
// in sort-order, under a hard character budget — so shorter, focused entries
// beat one giant one.

import { useState } from 'react'
import Link from 'next/link'

type KnowledgeEntry = {
  id: string
  title: string
  content: string
  category: string
  is_active: boolean
  sort_order: number
  created_at?: string
  updated_at?: string
}

const CATEGORIES = ['general', 'policy', 'procedure', 'deadlines', 'contacts', 'faq'] as const

const S = {
  page: { maxWidth: 860, margin: '0 auto', padding: '28px 20px 60px' } as React.CSSProperties,
  card: {
    background: 'rgba(255,255,255,0.04)',
    border: '1px solid rgba(139,92,246,0.22)',
    borderRadius: 14,
    padding: '16px 18px',
    marginBottom: 14,
  } as React.CSSProperties,
  input: {
    width: '100%',
    background: 'rgba(0,0,0,0.25)',
    border: '1px solid rgba(255,255,255,0.14)',
    borderRadius: 8,
    padding: '8px 10px',
    fontSize: 13,
    color: 'inherit',
    boxSizing: 'border-box' as const,
  } as React.CSSProperties,
  label: { display: 'block', fontSize: 11, opacity: 0.65, marginBottom: 4, marginTop: 10 } as React.CSSProperties,
  btn: (bg: string, fg: string): React.CSSProperties => ({
    background: bg,
    color: fg,
    border: 'none',
    borderRadius: 8,
    padding: '7px 14px',
    fontSize: 12,
    fontWeight: 700,
    cursor: 'pointer',
  }),
  ghostBtn: {
    background: 'transparent',
    border: '1px solid rgba(255,255,255,0.2)',
    borderRadius: 8,
    padding: '7px 14px',
    fontSize: 12,
    color: 'inherit',
    cursor: 'pointer',
  } as React.CSSProperties,
}

function EntryForm({
  initial,
  onSave,
  onCancel,
  saving,
}: {
  initial: Partial<KnowledgeEntry>
  onSave: (v: { title: string; content: string; category: string; sort_order: number }) => void
  onCancel: () => void
  saving: boolean
}) {
  const [title, setTitle] = useState(initial.title ?? '')
  const [content, setContent] = useState(initial.content ?? '')
  const [category, setCategory] = useState(initial.category ?? 'general')
  const [sortOrder, setSortOrder] = useState(initial.sort_order ?? 0)

  return (
    <div>
      <label style={S.label}>Title (max 120)</label>
      <input style={S.input} maxLength={120} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. LHD contact procedure" />
      <label style={S.label}>Category</label>
      <select style={S.input} value={category} onChange={(e) => setCategory(e.target.value)}>
        {CATEGORIES.map((c) => (
          <option key={c} value={c}>{c}</option>
        ))}
      </select>
      <label style={S.label}>Content (max 4000) — written directly into the bot&apos;s instructions; be factual and specific</label>
      <textarea style={{ ...S.input, minHeight: 120, resize: 'vertical' }} maxLength={4000} value={content} onChange={(e) => setContent(e.target.value)} />
      <label style={S.label}>Sort order (lower = injected first)</label>
      <input style={{ ...S.input, width: 120 }} type="number" value={sortOrder} onChange={(e) => setSortOrder(parseInt(e.target.value || '0', 10))} />
      <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
        <button
          type="button"
          disabled={saving || !title.trim() || !content.trim()}
          onClick={() => onSave({ title: title.trim(), content: content.trim(), category, sort_order: Number.isInteger(sortOrder) ? sortOrder : 0 })}
          style={{ ...S.btn('#8b5cf6', '#fff'), opacity: saving || !title.trim() || !content.trim() ? 0.5 : 1 }}
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
        <button type="button" onClick={onCancel} style={S.ghostBtn}>Cancel</button>
      </div>
    </div>
  )
}

export default function BotKnowledgeClient({ initialEntries }: { initialEntries: KnowledgeEntry[] }) {
  const [entries, setEntries] = useState<KnowledgeEntry[]>(initialEntries)
  const [adding, setAdding] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const api = async (path: string, init: RequestInit): Promise<Record<string, unknown> | null> => {
    setError(null)
    const r = await fetch(path, { credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, ...init })
    const j = (await r.json().catch(() => ({}))) as Record<string, unknown>
    if (!r.ok) {
      setError(typeof j.error === 'string' ? j.error : `Request failed (${r.status})`)
      return null
    }
    return j
  }

  const create = async (v: { title: string; content: string; category: string; sort_order: number }) => {
    setBusyId('new')
    const j = await api('/api/bot-knowledge', { method: 'POST', body: JSON.stringify(v) })
    setBusyId(null)
    if (j?.entry) {
      setEntries((prev) => [...prev, j.entry as KnowledgeEntry].sort((a, b) => a.sort_order - b.sort_order))
      setAdding(false)
    }
  }

  const update = async (id: string, v: Partial<KnowledgeEntry>) => {
    setBusyId(id)
    const j = await api(`/api/bot-knowledge/${id}`, { method: 'PATCH', body: JSON.stringify(v) })
    setBusyId(null)
    if (j?.entry) {
      setEntries((prev) => prev.map((e) => (e.id === id ? (j.entry as KnowledgeEntry) : e)).sort((a, b) => a.sort_order - b.sort_order))
      setEditingId(null)
    }
  }

  const remove = async (id: string) => {
    if (!window.confirm('Delete this knowledge entry? The bot will stop using it within a minute.')) return
    setBusyId(id)
    const j = await api(`/api/bot-knowledge/${id}`, { method: 'DELETE' })
    setBusyId(null)
    if (j?.ok) setEntries((prev) => prev.filter((e) => e.id !== id))
  }

  return (
    <div style={S.page}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>BLH Bot Knowledge Base</h1>
        <Link href="/admin" style={{ fontSize: 12, opacity: 0.7 }}>← Back to Admin</Link>
      </div>
      <p style={{ fontSize: 13, opacity: 0.7, marginTop: 4, marginBottom: 20, lineHeight: 1.5 }}>
        Active entries are injected into BLH Bot&apos;s instructions for every user (updates take effect within ~60 seconds).
        Never include client PHI here — this is organizational guidance only. Keep entries short and specific; there is a
        total size budget and lower sort-order entries win.
      </p>

      {error && (
        <div style={{ ...S.card, borderColor: 'rgba(255,107,107,0.5)', color: '#ff6b6b', fontSize: 13 }}>{error}</div>
      )}

      {entries.length === 0 && !adding && (
        <div style={{ ...S.card, textAlign: 'center', opacity: 0.7, fontSize: 13 }}>
          No knowledge entries yet. Add the first one — e.g. a program policy the bot keeps getting asked about.
        </div>
      )}

      {entries.map((e) =>
        editingId === e.id ? (
          <div key={e.id} style={S.card}>
            <EntryForm
              initial={e}
              saving={busyId === e.id}
              onCancel={() => setEditingId(null)}
              onSave={(v) => update(e.id, v)}
            />
          </div>
        ) : (
          <div key={e.id} style={{ ...S.card, opacity: e.is_active ? 1 : 0.55 }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 700 }}>
                  {e.title}
                  <span style={{ fontSize: 10, fontWeight: 600, marginLeft: 8, padding: '2px 8px', borderRadius: 10, background: 'rgba(139,92,246,0.18)', color: '#a78bfa', verticalAlign: 'middle' }}>
                    {e.category}
                  </span>
                  {!e.is_active && (
                    <span style={{ fontSize: 10, fontWeight: 600, marginLeft: 6, padding: '2px 8px', borderRadius: 10, background: 'rgba(255,255,255,0.1)', verticalAlign: 'middle' }}>
                      inactive
                    </span>
                  )}
                </div>
                <div style={{ fontSize: 12, opacity: 0.75, marginTop: 6, whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>{e.content}</div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flexShrink: 0 }}>
                <button type="button" style={S.ghostBtn} onClick={() => setEditingId(e.id)}>Edit</button>
                <button
                  type="button"
                  style={S.ghostBtn}
                  disabled={busyId === e.id}
                  onClick={() => update(e.id, { is_active: !e.is_active })}
                >
                  {e.is_active ? 'Deactivate' : 'Activate'}
                </button>
                <button
                  type="button"
                  style={{ ...S.ghostBtn, borderColor: 'rgba(255,107,107,0.4)', color: '#ff6b6b' }}
                  disabled={busyId === e.id}
                  onClick={() => remove(e.id)}
                >
                  Delete
                </button>
              </div>
            </div>
          </div>
        ),
      )}

      {adding ? (
        <div style={S.card}>
          <EntryForm initial={{}} saving={busyId === 'new'} onCancel={() => setAdding(false)} onSave={create} />
        </div>
      ) : (
        <button type="button" style={S.btn('#8b5cf6', '#fff')} onClick={() => setAdding(true)}>
          + Add knowledge entry
        </button>
      )}
    </div>
  )
}
