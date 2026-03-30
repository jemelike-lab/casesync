'use client'

import { useState, useRef, useEffect, KeyboardEvent } from 'react'
import { createClient } from '@/lib/supabase/client'

interface User {
  id: string
  full_name: string | null
}

interface Props {
  channelId: string
  senderId: string
  users: User[]
  onSent?: () => void
}

export default function MessageInput({ channelId, senderId, users, onSent }: Props) {
  const supabase = createClient()
  const [content, setContent] = useState('')
  const [sending, setSending] = useState(false)
  const [mentionSearch, setMentionSearch] = useState('')
  const [showMentions, setShowMentions] = useState(false)
  const [mentionIndex, setMentionIndex] = useState(0)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const filteredUsers = users.filter(u =>
    u.full_name?.toLowerCase().includes(mentionSearch.toLowerCase())
  ).slice(0, 5)

  function handleInput(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const val = e.target.value
    setContent(val)
    // Detect @mention
    const lastAt = val.lastIndexOf('@')
    if (lastAt >= 0) {
      const after = val.slice(lastAt + 1)
      if (!after.includes(' ') && after.length >= 0) {
        setMentionSearch(after)
        setShowMentions(true)
        setMentionIndex(0)
        return
      }
    }
    setShowMentions(false)
  }

  function insertMention(user: User) {
    const lastAt = content.lastIndexOf('@')
    const newContent = content.slice(0, lastAt) + `@${user.full_name} `
    setContent(newContent)
    setShowMentions(false)
    textareaRef.current?.focus()
  }

  async function handleSend() {
    if (!content.trim() || sending) return
    setSending(true)

    // Extract mentions
    const mentionNames = content.match(/@([^@\s]+(?:\s[^@\s]+)*)/g) ?? []
    const mentions: string[] = []
    mentionNames.forEach(m => {
      const name = m.slice(1).trim()
      const user = users.find(u => u.full_name === name)
      if (user) mentions.push(user.id)
    })

    const { error } = await supabase.from('chat_messages').insert({
      channel_id: channelId,
      sender_id: senderId,
      content: content.trim(),
      mentions,
      read_by: [senderId],
    })

    if (!error) {
      setContent('')
      onSent?.()
    }
    setSending(false)
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (showMentions && filteredUsers.length > 0) {
      if (e.key === 'ArrowDown') { e.preventDefault(); setMentionIndex(i => (i + 1) % filteredUsers.length) }
      if (e.key === 'ArrowUp') { e.preventDefault(); setMentionIndex(i => (i - 1 + filteredUsers.length) % filteredUsers.length) }
      if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); insertMention(filteredUsers[mentionIndex]); return }
      if (e.key === 'Escape') { setShowMentions(false); return }
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  return (
    <div style={{ padding: '12px 16px', borderTop: '1px solid var(--border)', position: 'relative' }}>
      {showMentions && filteredUsers.length > 0 && (
        <div style={{
          position: 'absolute', bottom: '100%', left: 16, right: 16, marginBottom: 4,
          background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8,
          boxShadow: '0 4px 16px rgba(0,0,0,0.3)', overflow: 'hidden',
        }}>
          {filteredUsers.map((u, i) => (
            <div
              key={u.id}
              onMouseDown={() => insertMention(u)}
              style={{
                padding: '8px 14px', cursor: 'pointer',
                background: i === mentionIndex ? 'var(--surface-2)' : 'transparent',
                fontSize: 13,
              }}
            >
              👤 {u.full_name}
            </div>
          ))}
        </div>
      )}
      <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end' }}>
        <textarea
          ref={textareaRef}
          value={content}
          onChange={handleInput}
          onKeyDown={handleKeyDown}
          placeholder="Message… (@ to mention, Enter to send)"
          rows={1}
          style={{
            flex: 1, resize: 'none', fontSize: 13, padding: '10px 14px',
            borderRadius: 12, lineHeight: 1.5, minHeight: 42, maxHeight: 120, overflowY: 'auto',
          }}
        />
        <button
          onClick={handleSend}
          disabled={!content.trim() || sending}
          className="btn-primary"
          style={{ minHeight: 42, padding: '0 18px', fontSize: 14, flexShrink: 0 }}
        >
          {sending ? '…' : '→'}
        </button>
      </div>
    </div>
  )
}
