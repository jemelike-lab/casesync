'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import MessageInput from './MessageInput'

interface Message {
  id: string
  channel_id: string
  sender_id: string
  content: string
  mentions: string[]
  read_by: string[]
  created_at: string
  profiles?: { full_name: string | null } | null
}

interface UserInfo {
  id: string
  full_name: string | null
}

interface Props {
  channelId: string
  channelName: string
  currentUserId: string
  users: UserInfo[]
}

function timeStr(dateStr: string) {
  const d = new Date(dateStr)
  const today = new Date()
  const isToday = d.toDateString() === today.toDateString()
  if (isToday) return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

function renderContent(content: string) {
  // Highlight @mentions
  const parts = content.split(/(@\S+(?:\s\S+)?)/g)
  return parts.map((part, i) =>
    part.startsWith('@')
      ? <span key={i} style={{ color: 'var(--accent)', fontWeight: 600 }}>{part}</span>
      : part
  )
}

export default function ChatWindow({ channelId, channelName, currentUserId, users }: Props) {
  const supabase = createClient()
  const [messages, setMessages] = useState<Message[]>([])
  const [loading, setLoading] = useState(true)
  const bottomRef = useRef<HTMLDivElement>(null)

  const fetchMessages = useCallback(async () => {
    const { data } = await supabase
      .from('chat_messages')
      .select('*, profiles!chat_messages_sender_id_fkey(full_name)')
      .eq('channel_id', channelId)
      .order('created_at', { ascending: true })
      .limit(100)
    setMessages((data as Message[]) ?? [])
    setLoading(false)
  }, [channelId])

  useEffect(() => {
    setLoading(true)
    fetchMessages()

    const channel = supabase
      .channel(`chat:${channelId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'chat_messages', filter: `channel_id=eq.${channelId}` },
        async (payload) => {
          const newMsg = payload.new as Message
          // Fetch sender profile
          const { data: profile } = await supabase.from('profiles').select('full_name').eq('id', newMsg.sender_id).single()
          setMessages(prev => [...prev, { ...newMsg, profiles: profile }])
          // Mark as read
          if (newMsg.sender_id !== currentUserId) {
            const currentReadBy = newMsg.read_by ?? []
            if (!currentReadBy.includes(currentUserId)) {
              await supabase.from('chat_messages').update({
                read_by: [...currentReadBy, currentUserId]
              }).eq('id', newMsg.id)
            }
          }
        }
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [channelId, currentUserId])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Mark unread messages as read on open
  useEffect(() => {
    messages.forEach(async (m) => {
      if (m.sender_id !== currentUserId && !(m.read_by ?? []).includes(currentUserId)) {
        await supabase.from('chat_messages').update({
          read_by: [...(m.read_by ?? []), currentUserId]
        }).eq('id', m.id)
      }
    })
  }, [channelId])

  let lastSender = ''

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)', fontWeight: 600, fontSize: 15 }}>
        # {channelName}
      </div>

      {/* Messages */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 2 }}>
        {loading ? (
          <div style={{ fontSize: 13, color: 'var(--text-secondary)', textAlign: 'center', marginTop: 40 }}>Loading messages…</div>
        ) : messages.length === 0 ? (
          <div style={{ fontSize: 13, color: 'var(--text-secondary)', textAlign: 'center', marginTop: 40 }}>No messages yet. Say hello! 👋</div>
        ) : (
          messages.map((msg, idx) => {
            const isMe = msg.sender_id === currentUserId
            const showSender = msg.sender_id !== lastSender
            lastSender = msg.sender_id
            const seenBy = (msg.read_by ?? []).filter(id => id !== msg.sender_id)
            const seenNames = seenBy.map(id => users.find(u => u.id === id)?.full_name ?? 'Someone').filter(Boolean)
            const isLast = idx === messages.length - 1

            return (
              <div key={msg.id} style={{ marginTop: showSender ? 12 : 0 }}>
                {showSender && (
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 2, paddingLeft: 2 }}>
                    <span style={{ fontWeight: 600, color: isMe ? 'var(--accent)' : 'var(--text)' }}>
                      {isMe ? 'You' : (msg.profiles?.full_name ?? 'Unknown')}
                    </span>
                    {' '}
                    <span style={{ fontSize: 11 }}>{timeStr(msg.created_at)}</span>
                  </div>
                )}
                <div style={{
                  background: isMe ? 'rgba(0,122,255,0.15)' : 'var(--surface-2)',
                  borderRadius: 10, padding: '8px 14px', fontSize: 13, lineHeight: 1.5,
                  maxWidth: '80%', alignSelf: isMe ? 'flex-end' : 'flex-start',
                  marginLeft: isMe ? 'auto' : 0,
                  borderBottomRightRadius: isMe ? 2 : 10,
                  borderBottomLeftRadius: isMe ? 10 : 2,
                }}>
                  {renderContent(msg.content)}
                </div>
                {isLast && seenNames.length > 0 && (
                  <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 2, textAlign: isMe ? 'right' : 'left' }}>
                    Seen by {seenNames.join(', ')}
                  </div>
                )}
              </div>
            )
          })
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <MessageInput
        channelId={channelId}
        senderId={currentUserId}
        users={users}
        onSent={fetchMessages}
      />
    </div>
  )
}
