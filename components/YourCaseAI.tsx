'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
}

const PLANNER_DASHBOARD_PROMPTS = [
  'Which clients need attention today?',
  'What should I do next today?',
  "What's my compliance score?",
  'Which clients have no contact in 7+ days?',
  'Show me clients with eligibility ending soon',
  'What is the SPM deadline?',
  'How do I submit a POS?',
  'What documents do I need for transition funds?',
  'How many signatures does a POS need?',
  'What is a RUG score?',
]

const MANAGER_DASHBOARD_PROMPTS = [
  'Which planners need manager follow-up right now?',
  'What should I rebalance first?',
  'Who can take more clients right now?',
  'Give me a team compliance summary with next actions',
  'Which clients need attention today?',
  'Which clients have no contact in 7+ days?',
  'What is the SPM deadline?',
  'How do I submit a POS?',
]

const SUPERVISOR_DASHBOARD_PROMPTS = [
  'Which planners need manager follow-up right now?',
  'What should I rebalance first?',
  'Who can take more clients right now?',
  'Give me a team compliance summary with next actions',
  'Who has the most overdue items?',
  'Show me clients with eligibility ending soon',
  'What is the SPM deadline?',
  'What are the CFC service limitations?',
]

function getRotatingPrompts(prompts: string[], count = 4): string[] {
  const shuffled = [...prompts].sort(() => Math.random() - 0.5)
  return shuffled.slice(0, count)
}

function getDashboardPromptsForRole(role: string | null): string[] {
  if (role === 'supervisor' || role === 'admin') return SUPERVISOR_DASHBOARD_PROMPTS
  if (role === 'team_manager') return MANAGER_DASHBOARD_PROMPTS
  return PLANNER_DASHBOARD_PROMPTS
}

const ALL_CLIENT_PROMPTS = [
  "Summarize this client's status",
  "What's overdue for this client?",
  "What should I do next for this client?",
  "When was this client last contacted?",
  "Is this client's POS ready to submit?",
  "What signatures are still needed?",
  "What type of ATP does this client need?",
  "What is this client's RUG group?",
  "How many days until this client's eligibility ends?",
  "What are the next 3 deadlines for this client?",
  "Is this client's LOC still valid?",
  "What is this client's eligibility code?",
]

// Simple markdown renderer (regex-based, no library)
function renderMarkdown(text: string): React.ReactNode[] {
  const lines = text.split('\n')
  const result: React.ReactNode[] = []
  let i = 0

  while (i < lines.length) {
    const line = lines[i]

    if (!line.trim()) {
      result.push(<br key={`br-${i}`} />)
      i++
      continue
    }

    // Bullet list item
    if (/^[-*]\s/.test(line)) {
      const listItems: React.ReactNode[] = []
      while (i < lines.length && /^[-*]\s/.test(lines[i])) {
        const itemText = lines[i].replace(/^[-*]\s/, '')
        listItems.push(<li key={`li-${i}`} style={{ marginBottom: 2 }}>{renderInline(itemText)}</li>)
        i++
      }
      result.push(
        <ul key={`ul-${i}`} style={{ paddingLeft: 20, margin: '4px 0', listStyleType: 'disc' }}>
          {listItems}
        </ul>
      )
      continue
    }

    // Numbered list
    if (/^\d+\.\s/.test(line)) {
      const listItems: React.ReactNode[] = []
      while (i < lines.length && /^\d+\.\s/.test(lines[i])) {
        const itemText = lines[i].replace(/^\d+\.\s/, '')
        listItems.push(<li key={`li-${i}`} style={{ marginBottom: 2 }}>{renderInline(itemText)}</li>)
        i++
      }
      result.push(
        <ol key={`ol-${i}`} style={{ paddingLeft: 20, margin: '4px 0' }}>
          {listItems}
        </ol>
      )
      continue
    }

    result.push(<p key={`p-${i}`} style={{ margin: '4px 0' }}>{renderInline(line)}</p>)
    i++
  }

  return result
}

function renderInline(text: string): React.ReactNode {
  // Bold: **text**
  const parts: React.ReactNode[] = []
  const boldRegex = /\*\*(.*?)\*\*/g
  let lastIndex = 0
  let match

  while ((match = boldRegex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index))
    }
    parts.push(<strong key={match.index}>{match[1]}</strong>)
    lastIndex = match.index + match[0].length
  }
  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex))
  }

  return parts.length > 0 ? <>{parts}</> : text
}

// Render AI message with nav links
function renderAIContent(text: string, onNavigate: (path: string) => void): React.ReactNode {
  // Replace [/path] with clickable links before markdown rendering
  const processedLines = text.split('\n').map((line, lineIdx) => {
    const navRegex = /\[(\/([\w\-/[\]{}]+))\]/g
    const segments: React.ReactNode[] = []
    let lastIdx = 0
    let m

    while ((m = navRegex.exec(line)) !== null) {
      if (m.index > lastIdx) {
        segments.push(line.slice(lastIdx, m.index))
      }
      const path = m[1]
      segments.push(
        <button
          key={`nav-${lineIdx}-${m.index}`}
          onClick={() => onNavigate(path)}
          style={{
            color: '#60a5fa',
            background: 'rgba(96,165,250,0.1)',
            border: '1px solid rgba(96,165,250,0.3)',
            borderRadius: 4,
            padding: '1px 6px',
            fontSize: 12,
            cursor: 'pointer',
            fontFamily: 'monospace',
          }}
        >
          {path}
        </button>
      )
      lastIdx = m.index + m[0].length
    }
    if (lastIdx < line.length) {
      segments.push(line.slice(lastIdx))
    }

    return segments.length > 0 ? segments.join !== undefined ? line : segments : line
  })

  // Now do full markdown render on the original text but handle nav links inline
  const allLines = text.split('\n')
  const result: React.ReactNode[] = []
  let i = 0

  const renderLineWithLinks = (line: string, key: string): React.ReactNode => {
    const navRegex = /\[(\/([\w\-/[\]{}]+))\]/g
    const boldRegex = /\*\*(.*?)\*\*/g
    
    // First collect all special ranges
    interface Segment {
      start: number
      end: number
      node: React.ReactNode
    }
    const specialSegments: Segment[] = []

    let m: RegExpExecArray | null
    navRegex.lastIndex = 0
    while ((m = navRegex.exec(line)) !== null) {
      const path = m[1]
      specialSegments.push({
        start: m.index,
        end: m.index + m[0].length,
        node: (
          <button
            key={`nav-${key}-${m.index}`}
            onClick={() => onNavigate(path)}
            style={{
              color: '#60a5fa',
              background: 'rgba(96,165,250,0.1)',
              border: '1px solid rgba(96,165,250,0.3)',
              borderRadius: 4,
              padding: '1px 6px',
              fontSize: 12,
              cursor: 'pointer',
              fontFamily: 'monospace',
            }}
          >
            {path}
          </button>
        ),
      })
    }

    boldRegex.lastIndex = 0
    while ((m = boldRegex.exec(line)) !== null) {
      const overlaps = specialSegments.some(s => m!.index < s.end && m!.index + m![0].length > s.start)
      if (!overlaps) {
        specialSegments.push({
          start: m.index,
          end: m.index + m[0].length,
          node: <strong key={`bold-${key}-${m.index}`}>{m[1]}</strong>,
        })
      }
    }

    specialSegments.sort((a, b) => a.start - b.start)

    const nodes: React.ReactNode[] = []
    let lastIdx = 0
    for (const seg of specialSegments) {
      if (seg.start > lastIdx) {
        nodes.push(line.slice(lastIdx, seg.start))
      }
      nodes.push(seg.node)
      lastIdx = seg.end
    }
    if (lastIdx < line.length) {
      nodes.push(line.slice(lastIdx))
    }

    return nodes.length > 0 ? <>{nodes}</> : line
  }

  while (i < allLines.length) {
    const line = allLines[i]

    if (!line.trim()) {
      result.push(<br key={`br-${i}`} />)
      i++
      continue
    }

    if (/^[-*]\s/.test(line)) {
      const listItems: React.ReactNode[] = []
      while (i < allLines.length && /^[-*]\s/.test(allLines[i])) {
        const itemText = allLines[i].replace(/^[-*]\s/, '')
        listItems.push(<li key={`li-${i}`} style={{ marginBottom: 2 }}>{renderLineWithLinks(itemText, `li-${i}`)}</li>)
        i++
      }
      result.push(
        <ul key={`ul-${i}`} style={{ paddingLeft: 20, margin: '4px 0', listStyleType: 'disc' }}>
          {listItems}
        </ul>
      )
      continue
    }

    if (/^\d+\.\s/.test(line)) {
      const listItems: React.ReactNode[] = []
      while (i < allLines.length && /^\d+\.\s/.test(allLines[i])) {
        const itemText = allLines[i].replace(/^\d+\.\s/, '')
        listItems.push(<li key={`li-${i}`} style={{ marginBottom: 2 }}>{renderLineWithLinks(itemText, `li-${i}`)}</li>)
        i++
      }
      result.push(
        <ol key={`ol-${i}`} style={{ paddingLeft: 20, margin: '4px 0' }}>
          {listItems}
        </ol>
      )
      continue
    }

    result.push(<p key={`p-${i}`} style={{ margin: '4px 0' }}>{renderLineWithLinks(line, `p-${i}`)}</p>)
    i++
  }

  return result
}

export default function BLHAssistant() {
  const router = useRouter()
  const pathname = usePathname()
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [userId, setUserId] = useState<string | null>(null)
  const [userRole, setUserRole] = useState<string | null>(null)
  const [clientName, setClientName] = useState<string | null>(null)
  const [hasOpenedBefore, setHasOpenedBefore] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const streamingIdRef = useRef<string | null>(null)

  // Detect if on client detail page
  const clientIdMatch = pathname.match(/^\/clients\/([^/]+)$/)
  const currentClientId = clientIdMatch ? clientIdMatch[1] : null

  // Determine context-aware prompts
  const isClientPage = !!currentClientId
  const suggestedPrompts = getRotatingPrompts(isClientPage ? ALL_CLIENT_PROMPTS : getDashboardPromptsForRole(userRole))

  // Fetch current user
  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) return
      setUserId(user.id)

      const { data: profile } = await supabase
        .from('users')
        .select('role')
        .eq('id', user.id)
        .single()

      if (profile?.role) setUserRole(profile.role)
    })
  }, [])

  // Fetch client name when on client page
  useEffect(() => {
    if (!currentClientId) {
      setClientName(null)
      return
    }
    const supabase = createClient()
    supabase
      .from('clients')
      .select('first_name, last_name')
      .eq('id', currentClientId)
      .single()
      .then(({ data }) => {
        if (data) {
          setClientName(`${data.first_name ?? ''} ${data.last_name ?? ''}`.trim())
        }
      })
  }, [currentClientId])

  // Auto-scroll to bottom
  useEffect(() => {
    if (open) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [messages, open])

  // Focus input when opened
  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 100)
    }
  }, [open])

  const handleOpen = () => {
    setOpen(true)
    setHasOpenedBefore(true)
  }

  const sendMessage = useCallback(async (content: string) => {
    if (!content.trim() || loading || !userId) return

    const userMsg: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: content.trim(),
    }

    const assistantId = (Date.now() + 1).toString()
    streamingIdRef.current = assistantId

    setMessages(prev => [...prev, userMsg, { id: assistantId, role: 'assistant', content: '' }])
    setInput('')
    setLoading(true)

    try {
      const conversationMessages = [...messages, userMsg].map(m => ({
        role: m.role,
        content: m.content,
      }))

      const res = await fetch('/api/case-ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: conversationMessages,
          userId,
          clientId: currentClientId,
        }),
      })

      if (res.status === 429) {
        const errData = await res.json().catch(() => ({}))
        const busyMsg = errData.error ?? 'BLH Bot is currently busy — please try again in a moment'
        setMessages(prev =>
          prev.map(m =>
            m.id === assistantId
              ? { ...m, content: busyMsg }
              : m
          )
        )
        return
      }

      if (!res.ok) {
        throw new Error(`API error: ${res.status}`)
      }

      const reader = res.body!.getReader()
      const decoder = new TextDecoder()
      let fullText = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        const chunk = decoder.decode(value, { stream: true })
        fullText += chunk

        setMessages(prev =>
          prev.map(m =>
            m.id === assistantId ? { ...m, content: fullText } : m
          )
        )
      }
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : 'Something went wrong'
      setMessages(prev =>
        prev.map(m =>
          m.id === assistantId
            ? { ...m, content: `Sorry, I encountered an error: ${errMsg}` }
            : m
        )
      )
    } finally {
      setLoading(false)
      streamingIdRef.current = null
    }
  }, [messages, loading, userId, currentClientId])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    sendMessage(input)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage(input)
    }
  }

  const clearConversation = () => {
    setMessages([])
  }

  const showPulse = !hasOpenedBefore

  return (
    <>
      {/* Styles */}
      <style>{`
        @keyframes pulse-ring {
          0% { transform: scale(1); opacity: 0.7; }
          70% { transform: scale(1.5); opacity: 0; }
          100% { transform: scale(1.5); opacity: 0; }
        }
        @keyframes slide-up {
          from { opacity: 0; transform: translateY(20px) scale(0.95); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes typing-dot {
          0%, 60%, 100% { opacity: 0.2; transform: translateY(0); }
          30% { opacity: 1; transform: translateY(-4px); }
        }
        .blh-bot-panel {
          animation: slide-up 0.25s ease;
        }
        .typing-dot:nth-child(1) { animation: typing-dot 1.2s infinite 0s; }
        .typing-dot:nth-child(2) { animation: typing-dot 1.2s infinite 0.2s; }
        .typing-dot:nth-child(3) { animation: typing-dot 1.2s infinite 0.4s; }
        .blh-bot-msg::-webkit-scrollbar { width: 4px; }
        .blh-bot-msg::-webkit-scrollbar-track { background: transparent; }
        .blh-bot-msg::-webkit-scrollbar-thumb { background: rgba(139,92,246,0.3); border-radius: 2px; }
        .blh-bot-prompt-btn:hover { background: rgba(139,92,246,0.25) !important; border-color: rgba(139,92,246,0.5) !important; }
        .blh-bot-send:hover:not(:disabled) { background: rgba(37,99,235,0.9) !important; }
        .blh-bot-send:disabled { opacity: 0.5; cursor: not-allowed; }
        @media (max-width: 480px) {
          .blh-bot-panel {
            bottom: 0 !important;
            right: 0 !important;
            left: 0 !important;
            width: 100% !important;
            border-radius: 20px 20px 0 0 !important;
            height: 80vh !important;
          }
        }
      `}</style>

      {/* FAB Button */}
      {!open && (
        <div
          style={{
            position: 'fixed',
            bottom: typeof window !== 'undefined' && window.innerWidth <= 768
              ? 'calc(230px + env(safe-area-inset-bottom))'
              : 148,
            right: 20,
            zIndex: 600,
          }}
        >
          {/* Pulse ring */}
          {showPulse && (
            <div
              style={{
                position: 'absolute',
                inset: 0,
                borderRadius: '50%',
                background: 'rgba(37,99,235,0.4)',
                animation: 'pulse-ring 2s cubic-bezier(0.455, 0.03, 0.515, 0.955) infinite',
              }}
            />
          )}
          <div style={{ position: 'relative' }} title="BLH Bot">
            <button
              onClick={handleOpen}
              style={{
                width: 52,
                height: 52,
                borderRadius: '50%',
                background: 'linear-gradient(135deg, #2563eb, #1d4ed8)',
                border: 'none',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 22,
                boxShadow: '0 4px 20px rgba(124, 58, 237, 0.4)',
                transition: 'transform 0.2s ease, box-shadow 0.2s ease',
                color: 'white',
                position: 'relative',
                zIndex: 1,
              }}
              aria-label="Open BLH Bot"
              onMouseEnter={e => {
                (e.currentTarget as HTMLButtonElement).style.transform = 'scale(1.1)'
                ;(e.currentTarget as HTMLButtonElement).style.boxShadow = '0 6px 24px rgba(124, 58, 237, 0.6)'
              }}
              onMouseLeave={e => {
                (e.currentTarget as HTMLButtonElement).style.transform = 'scale(1)'
                ;(e.currentTarget as HTMLButtonElement).style.boxShadow = '0 4px 20px rgba(124, 58, 237, 0.4)'
              }}
            >
              ✨
            </button>
            {/* Tooltip */}
            <div style={{
              position: 'absolute',
              right: 60,
              top: '50%',
              transform: 'translateY(-50%)',
              background: 'rgba(26,26,46,0.95)',
              border: '1px solid rgba(139,92,246,0.3)',
              borderRadius: 8,
              padding: '5px 10px',
              fontSize: 12,
              color: '#e2e8f0',
              whiteSpace: 'nowrap',
              pointerEvents: 'none',
              opacity: 0,
              transition: 'opacity 0.2s',
            }}
              className="fab-tooltip"
            >
              BLH Bot
            </div>
          </div>
        </div>
      )}

      {/* Chat Panel */}
      {open && (
        <div
          className="blh-bot-panel"
          style={{
            position: 'fixed',
            bottom: typeof window !== 'undefined' && window.innerWidth <= 768
              ? 'calc(150px + env(safe-area-inset-bottom))'
              : 80,
            right: 20,
            width: 380,
            height: 520,
            zIndex: 600,
            background: 'linear-gradient(180deg, #1a1a2e 0%, #16213e 100%)',
            border: '1px solid rgba(139, 92, 246, 0.3)',
            borderRadius: 20,
            boxShadow: '0 20px 60px rgba(0,0,0,0.5), 0 0 0 1px rgba(139,92,246,0.1)',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
          }}
        >
          {/* Header */}
          <div style={{
            padding: '14px 16px 12px',
            borderBottom: '1px solid rgba(139,92,246,0.2)',
            background: 'rgba(0,0,0,0.2)',
            flexShrink: 0,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {/* BLH Logo small */}
                <div style={{
                  width: 28,
                  height: 28,
                  borderRadius: '50%',
                  background: 'linear-gradient(135deg, #2563eb, #1d4ed8)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 14,
                  flexShrink: 0,
                }}>
                  ✨
                </div>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: '#f1f5f9' }}>BLH Bot</div>
                  <div style={{ fontSize: 11, color: 'rgba(139,92,246,0.8)' }}>
                    Ask me anything about your cases or BLH programs
                  </div>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {messages.length > 0 && (
                  <button
                    onClick={clearConversation}
                    style={{
                      background: 'none',
                      border: '1px solid rgba(255,255,255,0.1)',
                      borderRadius: 6,
                      padding: '3px 8px',
                      fontSize: 11,
                      color: 'rgba(255,255,255,0.4)',
                      cursor: 'pointer',
                    }}
                    title="Clear conversation"
                  >
                    Clear
                  </button>
                )}
                <button
                  onClick={() => setOpen(false)}
                  style={{
                    background: 'rgba(255,255,255,0.05)',
                    border: '1px solid rgba(255,255,255,0.1)',
                    borderRadius: '50%',
                    width: 28,
                    height: 28,
                    cursor: 'pointer',
                    color: 'rgba(255,255,255,0.5)',
                    fontSize: 14,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  ✕
                </button>
              </div>
            </div>

            {/* Context badge */}
            {clientName && (
              <div style={{
                marginTop: 8,
                display: 'inline-flex',
                alignItems: 'center',
                gap: 5,
                background: 'rgba(139,92,246,0.15)',
                border: '1px solid rgba(139,92,246,0.3)',
                borderRadius: 20,
                padding: '3px 10px',
                fontSize: 11,
                color: '#a78bfa',
              }}>
                📋 Context: {clientName}
              </div>
            )}
          </div>

          {/* Messages area */}
          <div
            className="blh-bot-msg"
            style={{
              flex: 1,
              overflowY: 'auto',
              padding: '12px 14px',
              display: 'flex',
              flexDirection: 'column',
              gap: 10,
            }}
          >
            {messages.length === 0 ? (
              /* Empty state with suggested prompts */
              <div>
                <div style={{
                  textAlign: 'center',
                  padding: '20px 0 16px',
                  color: 'rgba(255,255,255,0.5)',
                  fontSize: 13,
                }}>
                  <div style={{ fontSize: 32, marginBottom: 8 }}>✨</div>
                  <div style={{ fontWeight: 500, color: 'rgba(255,255,255,0.7)', marginBottom: 4 }}>
                    Hi {userId ? 'there' : ''}! I&apos;m BLH Bot
                  </div>
                  <div style={{ fontSize: 12 }}>
                    {isClientPage
                      ? 'I have full context for this client.'
                      : userRole === 'team_manager'
                        ? 'Ask me about team pressure, follow-up, or rebalance moves.'
                        : userRole === 'supervisor' || userRole === 'admin'
                          ? 'Ask me about org pressure, staffing balance, or intervention points.'
                          : 'Ask me about your caseload.'}
                  </div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                  {suggestedPrompts.map((prompt, idx) => (
                    <button
                      key={idx}
                      className="blh-bot-prompt-btn"
                      onClick={() => sendMessage(prompt)}
                      style={{
                        background: 'rgba(139,92,246,0.1)',
                        border: '1px solid rgba(139,92,246,0.25)',
                        borderRadius: 10,
                        padding: '9px 13px',
                        fontSize: 12,
                        color: '#c4b5fd',
                        textAlign: 'left',
                        cursor: 'pointer',
                        transition: 'all 0.15s ease',
                      }}
                    >
                      {prompt}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              messages.map(msg => (
                <div
                  key={msg.id}
                  style={{
                    display: 'flex',
                    justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start',
                  }}
                >
                  {msg.role === 'user' ? (
                    <div style={{
                      background: 'linear-gradient(135deg, #3b82f6, #1d4ed8)',
                      borderRadius: '16px 16px 4px 16px',
                      padding: '10px 14px',
                      maxWidth: '80%',
                      fontSize: 13,
                      color: '#fff',
                      lineHeight: 1.5,
                      boxShadow: '0 2px 8px rgba(59,130,246,0.3)',
                    }}>
                      {msg.content}
                    </div>
                  ) : (
                    <div style={{
                      background: '#1e1e2e',
                      border: '1px solid rgba(139, 92, 246, 0.2)',
                      borderRadius: '4px 16px 16px 16px',
                      padding: '12px 16px',
                      maxWidth: '90%',
                      fontSize: 13,
                      color: '#e2e8f0',
                      lineHeight: 1.6,
                    }}>
                      {msg.content === '' && loading && streamingIdRef.current === msg.id ? (
                        /* Typing dots */
                        <div style={{ display: 'flex', gap: 4, padding: '2px 0' }}>
                          {[0, 1, 2].map(i => (
                            <div
                              key={i}
                              className="typing-dot"
                              style={{
                                width: 6,
                                height: 6,
                                borderRadius: '50%',
                                background: '#a78bfa',
                              }}
                            />
                          ))}
                        </div>
                      ) : (
                        renderAIContent(msg.content, (path) => {
                          router.push(path)
                          setOpen(false)
                        })
                      )}
                    </div>
                  )}
                </div>
              ))
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input area */}
          <div style={{
            padding: '10px 12px 12px',
            borderTop: '1px solid rgba(139,92,246,0.15)',
            background: 'rgba(0,0,0,0.15)',
            flexShrink: 0,
          }}>
            <form onSubmit={handleSubmit} style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
              <input
                ref={inputRef}
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Ask about your cases..."
                disabled={loading}
                style={{
                  flex: 1,
                  background: 'rgba(255,255,255,0.05)',
                  border: '1px solid rgba(139,92,246,0.25)',
                  borderRadius: 12,
                  padding: '9px 13px',
                  fontSize: 13,
                  color: '#f1f5f9',
                  outline: 'none',
                  resize: 'none',
                  fontFamily: 'inherit',
                  transition: 'border-color 0.15s',
                }}
                onFocus={e => (e.target.style.borderColor = 'rgba(139,92,246,0.6)')}
                onBlur={e => (e.target.style.borderColor = 'rgba(139,92,246,0.25)')}
              />
              <button
                type="submit"
                className="blh-bot-send"
                disabled={!input.trim() || loading || !userId}
                style={{
                  width: 38,
                  height: 38,
                  borderRadius: 10,
                  background: 'linear-gradient(135deg, #2563eb, #1d4ed8)',
                  border: 'none',
                  cursor: 'pointer',
                  fontSize: 16,
                  color: 'white',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                  transition: 'background 0.15s',
                  boxShadow: '0 2px 8px rgba(37,99,235,0.3)',
                }}
                title="Send"
              >
                ➤
              </button>
            </form>
            <div style={{
              marginTop: 6,
              fontSize: 10,
              color: 'rgba(255,255,255,0.2)',
              textAlign: 'center',
            }}>
              Powered by Claude · HIPAA-compliant
            </div>
          </div>
        </div>
      )}
    </>
  )
}
