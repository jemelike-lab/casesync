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
  isNew?: boolean
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

function getInitials(name: string | null | undefined) {
  if (!name) return '?'
  return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
}

function renderContent(content: string) {
  const parts = content.split(/(@\S+(?:\s\S+)?)/g)
  return parts.map((part, i) =>
    part.startsWith('@')
      ? <span key={i} style={{ color: '#5ac8fa', fontWeight: 600 }}>{part}</span>
      : part
  )
}

function isSameGroup(a: Message, b: Message) {
  if (a.sender_id !== b.sender_id) return false
  const diff = Math.abs(new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
  return diff < 5 * 60 * 1000
}

const AVATAR_COLORS = [
  'linear-gradient(135deg, #636366, #48484a)',
  'linear-gradient(135deg, #30b0c7, #1a7a90)',
  'linear-gradient(135deg, #32ade6, #1a6fa0)',
  'linear-gradient(135deg, #30d158, #1a9033)',
  'linear-gradient(135deg, #ff9f0a, #cc7000)',
  'linear-gradient(135deg, #ff375f, #cc0030)',
  'linear-gradient(135deg, #bf5af2, #8833cc)',
]

function avatarColor(id: string) {
  let hash = 0
  for (let i = 0; i < id.length; i++) hash = (hash + id.charCodeAt(i)) % AVATAR_COLORS.length
  return AVATAR_COLORS[hash]
}

export default function ChatWindow({ channelId, channelName, currentUserId, users }: Props) {
  const supabase = createClient()
  const [messages, setMessages] = useState<Message[]>([])
  const [loading, setLoading] = useState(true)
  const [hoveredId, setHoveredId] = useState<string | null>(null)
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
          const { data: profile } = await supabase.from('profiles').select('full_name').eq('id', newMsg.sender_id).single()
          setMessages(prev => [...prev, { ...newMsg, profiles: profile, isNew: true }])
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

  const onlineCount = users.length

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: '#0f0f11' }}>
      <style>{`
        @keyframes msgSlideIn {
          from { opacity: 0; transform: translateY(8px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .msg-bubble { transition: filter 0.15s; }
        .msg-bubble:hover { filter: brightness(1.08); }
        .chat-scroll::-webkit-scrollbar { width: 4px; }
        .chat-scroll::-webkit-scrollbar-track { background: transparent; }
        .chat-scroll::-webkit-scrollbar-thumb { background: #333336; border-radius: 4px; }
      `}</style>

      {/* Header */}
      <div style={{
        padding: '12px 20px',
        borderBottom: '1px solid #333336',
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        background: '#1c1c1e',
        boxShadow: '0 1px 8px rgba(0,0,0,0.3)',
        flexShrink: 0,
      }}>
        <div style={{
          width: 36, height: 36, borderRadius: 10,
          background: 'linear-gradient(135deg, #007aff, #0050a0)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 16, color: '#fff', fontWeight: 700, flexShrink: 0,
        }}>
          #
        </div>
        <div>
          <div style={{ fontWeight: 700, fontSize: 15, color: '#fff' }}>{channelName}</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 1 }}>
            <div style={{ width: 7, height: 7, borderRadius: '50%', background: '#30d158', boxShadow: '0 0 4px #30d158' }} />
            <span style={{ fontSize: 12, color: '#8e8e93' }}>
              {onlineCount} member{onlineCount !== 1 ? 's' : ''}
            </span>
          </div>
        </div>
      </div>

      {/* Messages */}
      <div
        className="chat-scroll"
        style={{ flex: 1, overflowY: 'auto', padding: '20px 16px 8px', display: 'flex', flexDirection: 'column' }}
      >
        {loading ? (
          <div style={{ fontSize: 13, color: '#636366', textAlign: 'center', marginTop: 60 }}>
            Loading messages…
          </div>
        ) : messages.length === 0 ? (
          <div style={{ fontSize: 14, color: '#636366', textAlign: 'center', marginTop: 60, lineHeight: 1.8 }}>
            <div style={{ fontSize: 36, marginBottom: 12 }}>💬</div>
            No messages yet. Say hello! 👋
          </div>
        ) : (
          messages.map((msg, idx) => {
            const isMe = msg.sender_id === currentUserId
            const prevMsg = idx > 0 ? messages[idx - 1] : null
            const nextMsg = idx < messages.length - 1 ? messages[idx + 1] : null
            const isFirstInGroup = !prevMsg || !isSameGroup(prevMsg, msg)
            const isLastInGroup = !nextMsg || !isSameGroup(msg, nextMsg)
            const isLast = idx === messages.length - 1
            const seenBy = (msg.read_by ?? []).filter(id => id !== msg.sender_id)
            const seenUsers = seenBy.map(id => users.find(u => u.id === id)).filter(Boolean) as UserInfo[]
            const senderName = msg.profiles?.full_name ?? 'Unknown'
            const isHovered = hoveredId === msg.id
            const aColor = avatarColor(msg.sender_id)

            return (
              <div
                key={msg.id}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: isMe ? 'flex-end' : 'flex-start',
                  marginTop: isFirstInGroup ? 18 : 2,
                  animation: msg.isNew ? 'msgSlideIn 0.25s ease-out' : undefined,
                }}
                onMouseEnter={() => setHoveredId(msg.id)}
                onMouseLeave={() => setHoveredId(null)}
              >
                {/* Sender name (first in group, non-me) */}
                {!isMe && isFirstInGroup && (
                  <div style={{ marginLeft: 44, marginBottom: 3 }}>
                    <span style={{ fontSize: 12, fontWeight: 600, color: '#8e8e93' }}>{senderName}</span>
                  </div>
                )}

                <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, maxWidth: '72%' }}>
                  {/* Avatar (other users) */}
                  {!isMe && (
                    <div style={{ width: 32, height: 32, flexShrink: 0, alignSelf: 'flex-end' }}>
                      {isLastInGroup ? (
                        <div style={{
                          width: 32, height: 32, borderRadius: '50%',
                          background: aColor,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: 11, fontWeight: 700, color: '#fff',
                        }}>
                          {getInitials(senderName)}
                        </div>
                      ) : (
                        <div style={{ width: 32, height: 32 }} />
                      )}
                    </div>
                  )}

                  {/* Bubble */}
                  <div
                    className="msg-bubble"
                    style={{
                      background: isMe ? '#007aff' : '#2c2c2e',
                      color: isMe ? '#fff' : '#f2f2f7',
                      borderRadius: 18,
                      borderBottomRightRadius: isMe ? 4 : 18,
                      borderBottomLeftRadius: !isMe ? 4 : 18,
                      padding: '9px 14px',
                      fontSize: 14,
                      lineHeight: 1.5,
                      wordBreak: 'break-word',
                      whiteSpace: 'pre-wrap',
                      boxShadow: isMe
                        ? '0 2px 8px rgba(0,122,255,0.25)'
                        : '0 1px 3px rgba(0,0,0,0.3)',
                    }}
                  >
                    {renderContent(msg.content)}
                  </div>
                </div>

                {/* Timestamp (hover or last in group) */}
                {(isHovered || isLastInGroup) && (
                  <div style={{
                    fontSize: 11,
                    color: '#636366',
                    marginTop: 3,
                    marginLeft: isMe ? 0 : 44,
                    marginRight: 4,
                    opacity: isHovered ? 1 : 0.65,
                    transition: 'opacity 0.15s',
                    textAlign: isMe ? 'right' : 'left',
                  }}>
                    {isMe ? `You · ${timeStr(msg.created_at)}` : timeStr(msg.created_at)}
                  </div>
                )}

                {/* Read receipts — only on last message from me */}
                {isLast && isMe && seenUsers.length > 0 && (
                  <div style={{ display: 'flex', gap: 3, marginTop: 4, justifyContent: 'flex-end' }}>
                    {seenUsers.slice(0, 5).map(u => (
                      <div
                        key={u.id}
                        title={`Seen by ${u.full_name ?? 'Someone'}`}
                        style={{
                          width: 16, height: 16, borderRadius: '50%',
                          background: avatarColor(u.id),
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: 8, fontWeight: 700, color: '#fff',
                        }}
                      >
                        {getInitials(u.full_name)}
                      </div>
                    ))}
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
