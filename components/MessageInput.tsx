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

const EMOJIS = [
  '😊', '😂', '😍', '🥳', '😅', '😮', '😢', '😎',
  '👍', '👏', '🙌', '🤝', '🙏', '💪', '👀', '✅',
  '❤️', '🔥', '💯', '🎉', '⚡', '✨', '🎯', '💡',
]

function getInitials(name: string | null | undefined) {
  if (!name) return '?'
  return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
}

export default function MessageInput({ channelId, senderId, users, onSent }: Props) {
  const supabase = createClient()
  const [content, setContent] = useState('')
  const [sending, setSending] = useState(false)
  const [mentionSearch, setMentionSearch] = useState('')
  const [showMentions, setShowMentions] = useState(false)
  const [mentionIndex, setMentionIndex] = useState(0)
  const [showEmojis, setShowEmojis] = useState(false)
  const [focused, setFocused] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const emojiPickerRef = useRef<HTMLDivElement>(null)
  const emojiBtnRef = useRef<HTMLButtonElement>(null)

  const filteredUsers = users.filter(u =>
    u.full_name?.toLowerCase().includes(mentionSearch.toLowerCase())
  ).slice(0, 5)

  // Close emoji picker on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (
        emojiPickerRef.current && !emojiPickerRef.current.contains(e.target as Node) &&
        emojiBtnRef.current && !emojiBtnRef.current.contains(e.target as Node)
      ) {
        setShowEmojis(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  function handleInput(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const val = e.target.value
    setContent(val)
    // Auto-resize
    const ta = textareaRef.current
    if (ta) {
      ta.style.height = 'auto'
      ta.style.height = Math.min(ta.scrollHeight, 120) + 'px'
    }
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

  function insertEmoji(emoji: string) {
    const ta = textareaRef.current
    const start = ta?.selectionStart ?? content.length
    const newContent = content.slice(0, start) + emoji + content.slice(start)
    setContent(newContent)
    setShowEmojis(false)
    setTimeout(() => {
      textareaRef.current?.focus()
    }, 0)
  }

  async function handleSend() {
    if (!content.trim() || sending) return
    setSending(true)

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
      if (textareaRef.current) {
        textareaRef.current.style.height = 'auto'
      }
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

  const canSend = content.trim().length > 0 && !sending

  return (
    <div style={{ padding: '10px 16px 14px', borderTop: '1px solid #333336', position: 'relative', background: '#0f0f11', flexShrink: 0 }}>
      {/* @mention popup */}
      {showMentions && filteredUsers.length > 0 && (
        <div style={{
          position: 'absolute', bottom: '100%', left: 16, right: 16, marginBottom: 6,
          background: '#1c1c1e', border: '1px solid #333336', borderRadius: 12,
          boxShadow: '0 8px 32px rgba(0,0,0,0.5)', overflow: 'hidden', zIndex: 20,
        }}>
          {filteredUsers.map((u, i) => (
            <div
              key={u.id}
              onMouseDown={() => insertMention(u)}
              style={{
                padding: '10px 14px', cursor: 'pointer',
                background: i === mentionIndex ? '#2c2c2e' : 'transparent',
                fontSize: 14, display: 'flex', alignItems: 'center', gap: 10,
                color: '#f2f2f7', transition: 'background 0.1s',
              }}
            >
              <div style={{
                width: 28, height: 28, borderRadius: '50%',
                background: 'linear-gradient(135deg, #636366, #48484a)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 11, fontWeight: 700, color: '#fff', flexShrink: 0,
              }}>
                {getInitials(u.full_name)}
              </div>
              <span>{u.full_name}</span>
            </div>
          ))}
        </div>
      )}

      {/* Emoji picker */}
      {showEmojis && (
        <div
          ref={emojiPickerRef}
          style={{
            position: 'absolute', bottom: '100%', left: 16, marginBottom: 6,
            background: '#1c1c1e', border: '1px solid #333336', borderRadius: 14,
            boxShadow: '0 8px 32px rgba(0,0,0,0.5)', padding: '12px',
            display: 'flex', flexWrap: 'wrap', gap: 4, width: 256,
            zIndex: 20,
          }}
        >
          <div style={{ width: '100%', fontSize: 11, color: '#636366', fontWeight: 600, marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Quick Emojis
          </div>
          {EMOJIS.map(emoji => (
            <button
              key={emoji}
              onMouseDown={e => { e.preventDefault(); insertEmoji(emoji) }}
              style={{
                background: 'none', border: 'none', cursor: 'pointer',
                fontSize: 22, padding: '5px 7px', borderRadius: 8,
                transition: 'background 0.1s', lineHeight: 1,
              }}
              onMouseEnter={e => { (e.currentTarget).style.background = '#2c2c2e' }}
              onMouseLeave={e => { (e.currentTarget).style.background = 'none' }}
            >
              {emoji}
            </button>
          ))}
        </div>
      )}

      {/* Input row */}
      <div style={{
        display: 'flex',
        alignItems: 'flex-end',
        gap: 8,
        background: '#1c1c1e',
        borderRadius: 24,
        padding: '6px 6px 6px 10px',
        border: focused ? '1px solid #007aff' : '1px solid #333336',
        transition: 'border-color 0.2s',
        boxShadow: focused ? '0 0 0 3px rgba(0,122,255,0.15)' : 'none',
      }}>
        {/* Emoji button */}
        <button
          ref={emojiBtnRef}
          onClick={() => setShowEmojis(v => !v)}
          style={{
            background: 'none', border: 'none', cursor: 'pointer',
            fontSize: 20, padding: '4px 6px', borderRadius: 8, flexShrink: 0,
            color: showEmojis ? '#007aff' : '#636366', lineHeight: 1,
            transition: 'color 0.15s', marginBottom: 2,
          }}
          title="Add emoji"
        >
          😊
        </button>

        {/* Textarea */}
        <textarea
          ref={textareaRef}
          value={content}
          onChange={handleInput}
          onKeyDown={handleKeyDown}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          placeholder="Message… (@ to mention, Enter to send)"
          rows={1}
          style={{
            flex: 1, resize: 'none', fontSize: 14,
            padding: '5px 0', background: 'transparent',
            border: 'none', outline: 'none',
            color: '#f2f2f7', lineHeight: 1.5, minHeight: 28,
            maxHeight: 120, overflowY: 'auto', fontFamily: 'inherit',
          }}
        />

        {/* Send button */}
        <button
          onClick={handleSend}
          disabled={!canSend}
          style={{
            width: 34, height: 34, borderRadius: '50%', border: 'none',
            background: canSend ? '#007aff' : '#2c2c2e',
            color: canSend ? '#fff' : '#48484a',
            cursor: canSend ? 'pointer' : 'default',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 16, flexShrink: 0, marginBottom: 1,
            transition: 'background 0.2s, color 0.2s, transform 0.1s',
            transform: canSend ? 'scale(1)' : 'scale(0.9)',
          }}
          title="Send message"
        >
          {sending ? '…' : '↑'}
        </button>
      </div>

      <div style={{ fontSize: 11, color: '#48484a', marginTop: 5, paddingLeft: 14 }}>
        Shift+Enter for new line
      </div>
    </div>
  )
}
