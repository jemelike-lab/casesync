'use client'

// Notes — Phase A Batch 2 v2 rebuild.
// Data layer lifted from legacy NotesSection inline function in ClientEditForm.tsx.
// Same Supabase queries; v2-native white-card styling.

import { useState, useEffect } from 'react'
import { Box, Group, Text } from '@mantine/core'
import { Send } from 'lucide-react'
import type { Client, ClientNote } from '@/lib/types'
import SectionPaper from '../SectionPaper'

interface Props {
  client: Client
  currentUserId: string
}

function getInitials(name: string | null | undefined): string {
  if (!name) return '?'
  const parts = name.trim().split(/\s+/)
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
  return parts[0]?.[0]?.toUpperCase() ?? '?'
}

function hueFromName(name: string | null | undefined): number {
  if (!name) return 215
  return name.split('').reduce((a, c) => a + c.charCodeAt(0), 0) % 360
}

function formatNoteDate(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

export default function Notes({ client }: Props) {
  const [notes, setNotes] = useState<ClientNote[]>([])
  const [newNote, setNewNote] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    fetch(`/api/clients/${client.id}/notes`)
      .then(r => r.json())
      .then(j => { if (j?.notes) setNotes(j.notes as ClientNote[]) })
      .catch(() => {})
  }, [client.id])

  const addNote = async () => {
    const trimmed = newNote.trim()
    if (!trimmed) return
    setSaving(true)
    const res = await fetch(`/api/clients/${client.id}/notes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: trimmed }),
    })
    const j = await res.json().catch(() => ({} as { note?: ClientNote }))
    if (res.ok && j?.note) {
      setNotes(prev => [j.note as ClientNote, ...prev])
      setNewNote('')
    }
    setSaving(false)
  }

  const count = notes.length
  const canSubmit = !saving && newNote.trim().length > 0

  return (
    <SectionPaper
      title="Notes"
      subtitle={count === 0 ? 'No entries yet' : `${count} ${count === 1 ? 'entry' : 'entries'}`}
    >
      {/* Composer */}
      <Box
        style={{
          display: 'flex',
          gap: 10,
          alignItems: 'flex-end',
          marginBottom: count > 0 ? 14 : 0,
          paddingBottom: count > 0 ? 14 : 0,
          borderBottom: count > 0 ? '0.5px solid var(--v2-border-soft)' : 'none',
        }}
      >
        <textarea
          value={newNote}
          onChange={(e) => setNewNote(e.target.value)}
          placeholder="Add a note..."
          rows={2}
          style={{
            flex: 1,
            minHeight: 48,
            resize: 'vertical',
            border: '0.5px solid var(--v2-border-soft)',
            borderRadius: 8,
            padding: '10px 12px',
            fontSize: 13,
            color: 'var(--v2-text)',
            background: 'var(--v2-surface)',
            outline: 'none',
            fontFamily: 'inherit',
            boxSizing: 'border-box',
            lineHeight: 1.5,
          }}
        />
        <button
          type="button"
          onClick={addNote}
          disabled={!canSubmit}
          style={{
            background: '#1E7CFF',
            color: '#fff',
            border: 'none',
            borderRadius: 8,
            padding: '8px 14px',
            fontSize: 12,
            fontWeight: 500,
            cursor: canSubmit ? 'pointer' : 'not-allowed',
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            opacity: canSubmit ? 1 : 0.45,
            transition: 'opacity 120ms',
            flexShrink: 0,
          }}
        >
          <Send size={13} strokeWidth={2.5} />
          {saving ? 'Saving...' : 'Add'}
        </button>
      </Box>

      {/* Note list */}
      {notes.map((note, idx) => {
        const hue = hueFromName(note.profiles?.full_name)
        const initials = getInitials(note.profiles?.full_name)
        const isLast = idx === notes.length - 1
        return (
          <Box
            key={note.id}
            style={{
              display: 'flex',
              gap: 12,
              padding: '12px 0',
              borderBottom: isLast ? 'none' : '0.5px solid var(--v2-border-soft)',
            }}
          >
            <Box
              style={{
                width: 32, height: 32, borderRadius: 8, flexShrink: 0,
                background: `hsl(${hue}, 40%, 93%)`,
                color: `hsl(${hue}, 55%, 32%)`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 11, fontWeight: 600, letterSpacing: '0.02em',
              }}
            >
              {initials}
            </Box>
            <Box style={{ flex: 1, minWidth: 0 }}>
              <Group justify="space-between" gap={8} mb={3} wrap="nowrap">
                <Text fz={12} fw={600} c="#185FA5" style={{ letterSpacing: '-0.005em' }}>
                  {note.profiles?.full_name ?? 'Unknown'}
                </Text>
                <Text fz={11} c="var(--v2-text-muted)" style={{ fontVariantNumeric: 'tabular-nums', flexShrink: 0 }}>
                  {formatNoteDate(note.created_at)}
                </Text>
              </Group>
              <Text fz={13} c="var(--v2-text)" style={{ whiteSpace: 'pre-wrap', lineHeight: 1.55 }}>
                {note.content}
              </Text>
            </Box>
          </Box>
        )
      })}
    </SectionPaper>
  )
}
