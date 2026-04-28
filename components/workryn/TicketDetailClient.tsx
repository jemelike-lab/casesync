'use client'
import '@/app/workryn-tickets.css'
import { useState, useEffect, useRef, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import {
  ArrowLeft, Send, Mail, Loader2, X, CheckCircle2, Circle, ArrowUpCircle,
  User, Phone, Tag, MessageSquare, StickyNote,
  Zap, ChevronDown, Lock, RefreshCw, Archive,
  Edit2, Check, Sparkles, History,
} from 'lucide-react'
import { getInitials, timeAgo, formatDateTime, getPriorityColor } from '@/lib/workryn/utils'

type Author = { id: string; name: string | null; avatarColor: string; role: string } | null

type Message = {
  id: string
  content: string
  sentViaEmail: boolean
  isFromAgent: boolean
  authorId: string | null
  author: Author
  createdAt: string
}

type InternalNote = {
  id: string
  content: string
  authorId: string
  author: { id: string; name: string | null; avatarColor: string; role: string }
  createdAt: string
}

type Ticket = {
  id: string
  title: string
  description: string | null
  status: string
  priority: string
  category: string | null
  tags: string | null
  requesterFirstName: string | null
  requesterLastName: string | null
  requesterEmail: string | null
  requesterPhone: string | null
  createdAt: string
  updatedAt: string
  resolvedAt: string | null
  archivedAt: string | null
  createdBy: { id: string; name: string | null; email: string | null; avatarColor: string }
  assignedTo: { id: string; name: string | null; email: string | null; avatarColor: string } | null
  department: { id: string; name: string; color: string } | null
  messages: Message[]
  internalNotes: InternalNote[]
}

type User = { id: string; name: string | null; avatarColor: string; role: string }
type Department = { id: string; name: string; color: string }
type ActivityLog = {
  id: string
  action: string
  details: string | null
  createdAt: string
  user: { id: string; name: string | null; avatarColor: string }
}
type CannedResponse = { id: string; title: string; content: string }

const STATUSES = ['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED']
const PRIORITIES = ['URGENT', 'HIGH', 'MEDIUM', 'LOW']
const CATEGORIES = ['Hardware', 'Software', 'Network', 'Access', 'Email', 'Request', 'Question', 'Other']

const STATUS_META: Record<string, { label: string; icon: React.ReactNode; color: string }> = {
  OPEN:        { label: 'Open',        icon: <Circle size={13} />,        color: '#3b82f6' },
  IN_PROGRESS: { label: 'In Progress', icon: <ArrowUpCircle size={13} />, color: '#f59e0b' },
  RESOLVED:    { label: 'Resolved',    icon: <CheckCircle2 size={13} />,  color: '#10b981' },
  CLOSED:      { label: 'Closed',      icon: <X size={13} />,             color: '#64748b' },
}

const PRIORITY_META: Record<string, { label: string; color: string }> = {
  URGENT: { label: 'Urgent', color: '#ef4444' },
  HIGH:   { label: 'High',   color: '#f97316' },
  MEDIUM: { label: 'Medium', color: '#f59e0b' },
  LOW:    { label: 'Low',    color: '#22c55e' },
}

interface Props {
  initialTicket: Ticket
  users: User[]
  departments: Department[]
  initialActivity: ActivityLog[]
  currentUser: { id: string; role: string; name: string | null; avatarColor: string }
}

export default function TicketDetailClient({
  initialTicket, users, departments, initialActivity, currentUser,
}: Props) {
  const router = useRouter()
  const [ticket, setTicket] = useState<Ticket>(initialTicket)
  const [activity, setActivity] = useState<ActivityLog[]>(initialActivity)
  const [replyText, setReplyText] = useState('')
  const [noteText, setNoteText] = useState('')
  const [sendingReply, setSendingReply] = useState(false)
  const [sendingNote, setSendingNote] = useState(false)
  const [markResolvedOnSend, setMarkResolvedOnSend] = useState(false)
  const [cannedResponses, setCannedResponses] = useState<CannedResponse[]>([])
  const [showCannedDropdown, setShowCannedDropdown] = useState(false)
  const [tagsDraft, setTagsDraft] = useState(ticket.tags || '')
  const [editingTags, setEditingTags] = useState(false)
  const [savingField, setSavingField] = useState<string | null>(null)
  const [showActivity, setShowActivity] = useState(false)

  const chatEndRef = useRef<HTMLDivElement>(null)
  const composerRef = useRef<HTMLTextAreaElement>(null)
  const cannedRef = useRef<HTMLDivElement>(null)

  // Scroll to bottom on new messages
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [ticket.messages.length])

  // Load canned responses once
  useEffect(() => {
    fetch('/api/workryn/tickets/canned-responses')
      .then(r => r.json())
      .then(data => setCannedResponses(Array.isArray(data) ? data : []))
      .catch(() => {})
  }, [])

  // Click outside for canned dropdown
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (cannedRef.current && !cannedRef.current.contains(e.target as Node)) {
        setShowCannedDropdown(false)
      }
    }
    if (showCannedDropdown) {
      document.addEventListener('mousedown', handler)
      return () => document.removeEventListener('mousedown', handler)
    }
  }, [showCannedDropdown])

  const statusMeta = STATUS_META[ticket.status] || STATUS_META.OPEN
  const priorityColor = getPriorityColor(ticket.priority)
  const requesterName = [ticket.requesterFirstName, ticket.requesterLastName].filter(Boolean).join(' ') || 'Unknown Requester'

  const tagList = useMemo(
    () => (ticket.tags ? ticket.tags.split(',').map(t => t.trim()).filter(Boolean) : []),
    [ticket.tags]
  )

  async function refreshTicket() {
    const res = await fetch(`/api/workryn/tickets/${ticket.id}`)
    if (res.ok) {
      const data: Ticket = await res.json()
      setTicket(data)
    }
  }

  async function patchTicket(body: Record<string, unknown>, fieldLabel?: string) {
    setSavingField(fieldLabel || 'ticket')
    try {
      const res = await fetch(`/api/workryn/tickets/${ticket.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        alert('Failed to update ticket')
        return
      }
      await refreshTicket()
      // Optimistically log a local activity entry so the timeline stays fresh
      setActivity(prev => [
        {
          id: `local-${Date.now()}`,
          action: 'TICKET_UPDATED',
          details: fieldLabel ? `Updated ${fieldLabel}` : 'Updated ticket',
          createdAt: new Date().toISOString(),
          user: { id: currentUser.id, name: currentUser.name, avatarColor: currentUser.avatarColor },
        },
        ...prev,
      ])
    } finally {
      setSavingField(null)
    }
  }

  async function sendReply(viaEmail: boolean) {
    if (!replyText.trim()) return
    setSendingReply(true)
    try {
      const res = await fetch(`/api/workryn/tickets/${ticket.id}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: replyText.trim(),
          isFromAgent: true,
          sendEmail: viaEmail,
        }),
      })
      if (!res.ok) {
        alert('Failed to send reply')
        return
      }
      const message: Message = await res.json()
      setTicket(t => ({ ...t, messages: [...t.messages, message] }))
      setReplyText('')

      if (markResolvedOnSend && ticket.status !== 'RESOLVED') {
        await patchTicket({ status: 'RESOLVED' }, 'status')
        setMarkResolvedOnSend(false)
      }
    } finally {
      setSendingReply(false)
    }
  }

  async function addNote() {
    if (!noteText.trim()) return
    setSendingNote(true)
    try {
      const res = await fetch(`/api/workryn/tickets/${ticket.id}/notes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: noteText.trim() }),
      })
      if (!res.ok) {
        alert('Failed to add note')
        return
      }
      const note: InternalNote = await res.json()
      setTicket(t => ({ ...t, internalNotes: [...t.internalNotes, note] }))
      setNoteText('')
    } finally {
      setSendingNote(false)
    }
  }

  async function handleCloseTicket() {
    if (!confirm('Close and archive this ticket? It can be reopened later from the archived view.')) return
    await patchTicket({ status: 'CLOSED' }, 'status')
  }

  async function handleReopen() {
    await patchTicket({ status: 'OPEN' }, 'status')
  }

  async function handleSaveTags() {
    await patchTicket({ tags: tagsDraft.trim() || null }, 'tags')
    setEditingTags(false)
  }

  function insertCannedResponse(content: string) {
    setReplyText(prev => prev ? `${prev}\n\n${content}` : content)
    setShowCannedDropdown(false)
    composerRef.current?.focus()
  }

  const isClosed = ticket.status === 'CLOSED' || ticket.archivedAt !== null

  return (
    <>
      {/* Top bar */}
      <div className="td-top-bar">
        <button
          className="btn btn-ghost btn-sm focus-ring"
          onClick={() => router.push('/w/tickets')}
        >
          <ArrowLeft size={15} /> Back
        </button>

        <div className="td-breadcrumb">
          <span style={{ color: 'var(--text-muted)' }}>Ticket</span>
          <span style={{ color: 'var(--text-muted)' }}>/</span>
          <span style={{ color: 'var(--text-secondary)', fontWeight: 600 }}>
            #{ticket.id.slice(-6).toUpperCase()}
          </span>
        </div>

        <div style={{ flex: 1 }} />

        <button
          className="btn btn-ghost btn-sm focus-ring"
          onClick={refreshTicket}
          title="Refresh"
        >
          <RefreshCw size={14} /> Refresh
        </button>

        {!isClosed ? (
          <button className="btn btn-danger btn-sm focus-ring" onClick={handleCloseTicket}>
            <Lock size={14} /> Close Ticket
          </button>
        ) : (
          <button className="btn btn-ghost btn-sm focus-ring" onClick={handleReopen}>
            <RefreshCw size={14} /> Reopen
          </button>
        )}
      </div>

      {/* Main 2-column layout */}
      <div className="td-layout">
        {/* LEFT — thread */}
        <div className="td-main">
          {/* Header card */}
          <div className="gradient-card td-header-card">
            <div className="td-header-top">
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10, flexWrap: 'wrap' }}>
                  <span className="td-badge" style={{ background: statusMeta.color + '22', color: statusMeta.color }}>
                    <span style={{ color: statusMeta.color, display: 'flex' }}>{statusMeta.icon}</span>
                    {statusMeta.label}
                  </span>
                  <span className="td-badge" style={{ background: priorityColor + '22', color: priorityColor }}>
                    <span style={{ width: 6, height: 6, borderRadius: '50%', background: priorityColor, boxShadow: `0 0 6px ${priorityColor}66` }} />
                    {PRIORITY_META[ticket.priority]?.label || ticket.priority}
                  </span>
                  {ticket.category && (
                    <span className="td-badge" style={{ background: 'var(--bg-overlay)', color: 'var(--text-secondary)', border: '1px solid var(--border-subtle)' }}>
                      {ticket.category}
                    </span>
                  )}
                  {ticket.archivedAt && (
                    <span className="td-badge" style={{ background: 'rgba(100,116,139,0.2)', color: '#94a3b8' }}>
                      <Archive size={11} /> Archived
                    </span>
                  )}
                </div>
                <h2 style={{ fontSize: '1.375rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: 6 }}>
                  {ticket.title}
                </h2>
                <div style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                  <span>Created {timeAgo(ticket.createdAt)}</span>
                  <span>·</span>
                  <span>Updated {timeAgo(ticket.updatedAt)}</span>
                  {ticket.resolvedAt && (
                    <>
                      <span>·</span>
                      <span style={{ color: '#10b981' }}>Resolved {timeAgo(ticket.resolvedAt)}</span>
                    </>
                  )}
                </div>
              </div>
            </div>

            {/* Tags row */}
            <div className="td-tags-row">
              <Tag size={13} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
              {editingTags ? (
                <>
                  <input
                    className="input focus-ring"
                    style={{ height: 30, fontSize: '0.8125rem', flex: 1 }}
                    value={tagsDraft}
                    onChange={e => setTagsDraft(e.target.value)}
                    placeholder="comma, separated, tags"
                    autoFocus
                    onKeyDown={e => {
                      if (e.key === 'Enter') handleSaveTags()
                      if (e.key === 'Escape') { setTagsDraft(ticket.tags || ''); setEditingTags(false) }
                    }}
                  />
                  <button className="btn btn-icon btn-ghost" onClick={handleSaveTags} disabled={savingField === 'tags'}>
                    {savingField === 'tags' ? <Loader2 size={13} className="spin" /> : <Check size={13} />}
                  </button>
                  <button className="btn btn-icon btn-ghost" onClick={() => { setTagsDraft(ticket.tags || ''); setEditingTags(false) }}>
                    <X size={13} />
                  </button>
                </>
              ) : (
                <>
                  {tagList.length === 0 ? (
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>No tags</span>
                  ) : (
                    tagList.map(tag => (
                      <span key={tag} className="td-chip">{tag}</span>
                    ))
                  )}
                  <button className="btn btn-icon btn-ghost btn-sm" onClick={() => setEditingTags(true)} title="Edit tags">
                    <Edit2 size={12} />
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Chat thread */}
          <div className="td-thread">
            {ticket.messages.length === 0 ? (
              <div className="empty-state" style={{ padding: '40px 20px' }}>
                <MessageSquare size={32} />
                <p>No messages yet</p>
              </div>
            ) : (
              ticket.messages.map(msg => (
                <MessageBubble key={msg.id} message={msg} requesterName={requesterName} requesterColor={ticket.createdBy.avatarColor} />
              ))
            )}
            <div ref={chatEndRef} />
          </div>

          {/* Composer */}
          {!isClosed ? (
            <div className="td-composer">
              <div className="td-composer-tabs">
                <span style={{ color: 'var(--brand-light)', fontSize: '0.75rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                  <MessageSquare size={13} style={{ display: 'inline', marginRight: 5, verticalAlign: '-2px' }} />
                  Reply
                </span>
                <div style={{ flex: 1 }} />
                <div ref={cannedRef} style={{ position: 'relative' }}>
                  <button
                    className="btn btn-ghost btn-sm focus-ring"
                    onClick={() => setShowCannedDropdown(v => !v)}
                    disabled={cannedResponses.length === 0}
                  >
                    <Sparkles size={13} /> Canned Responses <ChevronDown size={12} />
                  </button>
                  {showCannedDropdown && (
                    <div className="td-canned-menu animate-scale-in">
                      <div style={{ padding: '10px 14px 6px', fontSize: '0.6875rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                        Insert response
                      </div>
                      {cannedResponses.map(cr => (
                        <button
                          key={cr.id}
                          className="td-canned-item"
                          onClick={() => insertCannedResponse(cr.content)}
                        >
                          <Zap size={12} style={{ color: 'var(--brand-light)', flexShrink: 0 }} />
                          <div style={{ minWidth: 0 }}>
                            <div style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--text-primary)' }}>{cr.title}</div>
                            <div style={{ fontSize: '0.6875rem', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {cr.content.slice(0, 60)}…
                            </div>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <textarea
                ref={composerRef}
                className="td-composer-input focus-ring"
                placeholder="Type your reply… It'll be visible in the thread. Use 'Reply via Email' to also send it to the requester."
                value={replyText}
                onChange={e => setReplyText(e.target.value)}
                rows={4}
              />

              <div className="td-composer-actions">
                <label className="td-checkbox-label">
                  <input
                    type="checkbox"
                    checked={markResolvedOnSend}
                    onChange={e => setMarkResolvedOnSend(e.target.checked)}
                  />
                  <span>Mark as resolved on send</span>
                </label>
                <div style={{ flex: 1 }} />
                <button
                  className="btn btn-ghost btn-sm focus-ring"
                  onClick={() => sendReply(false)}
                  disabled={sendingReply || !replyText.trim()}
                >
                  {sendingReply ? <Loader2 size={14} className="spin" /> : <Send size={14} />}
                  Reply
                </button>
                <button
                  className="btn btn-gradient btn-sm focus-ring"
                  onClick={() => sendReply(true)}
                  disabled={sendingReply || !replyText.trim() || !ticket.requesterEmail}
                  title={!ticket.requesterEmail ? 'Requester has no email on file' : 'Send reply to requester via email'}
                >
                  {sendingReply ? <Loader2 size={14} className="spin" /> : <Mail size={14} />}
                  Reply via Email
                </button>
              </div>
            </div>
          ) : (
            <div className="td-closed-banner">
              <Lock size={16} /> This ticket is closed. Reopen it to continue the conversation.
            </div>
          )}
        </div>

        {/* RIGHT — sidebar */}
        <aside className="td-sidebar">
          {/* Requester card */}
          <SidebarCard title="Requester" icon={<User size={14} />}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
              <div className="avatar avatar-lg" style={{ background: ticket.createdBy.avatarColor }}>
                {getInitials(requesterName)}
              </div>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontSize: '0.9375rem', fontWeight: 600, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {requesterName}
                </div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>External contact</div>
              </div>
            </div>
            <div className="td-info-row">
              <Mail size={13} />
              {ticket.requesterEmail ? (
                <a href={`mailto:${ticket.requesterEmail}`} style={{ color: 'var(--brand-light)', fontSize: '0.8125rem', wordBreak: 'break-all' }}>
                  {ticket.requesterEmail}
                </a>
              ) : (
                <span style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>—</span>
              )}
            </div>
            <div className="td-info-row">
              <Phone size={13} />
              {ticket.requesterPhone ? (
                <a href={`tel:${ticket.requesterPhone}`} style={{ color: 'var(--text-primary)', fontSize: '0.8125rem' }}>
                  {ticket.requesterPhone}
                </a>
              ) : (
                <span style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>—</span>
              )}
            </div>
            <div className="td-info-row">
              <User size={13} />
              <span style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)' }}>
                Logged by {ticket.createdBy.name || 'Unknown'}
              </span>
            </div>
          </SidebarCard>

          {/* Properties card */}
          <SidebarCard title="Properties" icon={<Sparkles size={14} />}>
            <PropertyRow label="Status">
              <select
                className="input focus-ring td-prop-select"
                value={ticket.status}
                onChange={e => patchTicket({ status: e.target.value }, 'status')}
                disabled={savingField === 'status'}
              >
                {STATUSES.map(s => (
                  <option key={s} value={s}>{STATUS_META[s].label}</option>
                ))}
              </select>
            </PropertyRow>

            <PropertyRow label="Priority">
              <select
                className="input focus-ring td-prop-select"
                value={ticket.priority}
                onChange={e => patchTicket({ priority: e.target.value }, 'priority')}
                disabled={savingField === 'priority'}
              >
                {PRIORITIES.map(p => (
                  <option key={p} value={p}>{PRIORITY_META[p].label}</option>
                ))}
              </select>
            </PropertyRow>

            <PropertyRow label="Assignee">
              <select
                className="input focus-ring td-prop-select"
                value={ticket.assignedTo?.id || ''}
                onChange={e => patchTicket({ assignedToId: e.target.value || null }, 'assignee')}
                disabled={savingField === 'assignee'}
              >
                <option value="">Unassigned</option>
                {users.map(u => (
                  <option key={u.id} value={u.id}>{u.name}</option>
                ))}
              </select>
            </PropertyRow>

            <PropertyRow label="Department">
              <select
                className="input focus-ring td-prop-select"
                value={ticket.department?.id || ''}
                onChange={e => patchTicket({ departmentId: e.target.value || null }, 'department')}
                disabled={savingField === 'department'}
              >
                <option value="">None</option>
                {departments.map(d => (
                  <option key={d.id} value={d.id}>{d.name}</option>
                ))}
              </select>
            </PropertyRow>

            <PropertyRow label="Category">
              <select
                className="input focus-ring td-prop-select"
                value={ticket.category || ''}
                onChange={e => patchTicket({ category: e.target.value || null }, 'category')}
                disabled={savingField === 'category'}
              >
                <option value="">Uncategorized</option>
                {CATEGORIES.map(c => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </PropertyRow>
          </SidebarCard>

          {/* Internal notes */}
          <SidebarCard
            title="Internal Notes"
            icon={<StickyNote size={14} />}
            accent="#f59e0b"
          >
            <div style={{ fontSize: '0.6875rem', color: 'var(--text-muted)', marginBottom: 10, fontStyle: 'italic' }}>
              Visible to IT staff only — never shared with requester.
            </div>

            <div className="td-notes-list">
              {ticket.internalNotes.length === 0 ? (
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', padding: '8px 0' }}>
                  No internal notes yet.
                </div>
              ) : (
                ticket.internalNotes.map(note => (
                  <div key={note.id} className="td-note">
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                      <div className="avatar avatar-sm" style={{ background: note.author.avatarColor, width: 22, height: 22, fontSize: '0.625rem' }}>
                        {getInitials(note.author.name || 'U')}
                      </div>
                      <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                        {note.author.name || 'Unknown'}
                      </div>
                      <div style={{ flex: 1 }} />
                      <div style={{ fontSize: '0.6875rem', color: 'var(--text-muted)' }}>
                        {timeAgo(note.createdAt)}
                      </div>
                    </div>
                    <div style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)', whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>
                      {note.content}
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="td-note-composer">
              <textarea
                className="input focus-ring"
                style={{ fontSize: '0.8125rem', minHeight: 64, resize: 'vertical' }}
                placeholder="Add an internal note…"
                value={noteText}
                onChange={e => setNoteText(e.target.value)}
              />
              <button
                className="btn btn-sm focus-ring"
                style={{
                  marginTop: 8,
                  background: 'rgba(245,158,11,0.15)',
                  color: '#f59e0b',
                  border: '1px solid rgba(245,158,11,0.3)',
                  width: '100%',
                  justifyContent: 'center',
                }}
                onClick={addNote}
                disabled={sendingNote || !noteText.trim()}
              >
                {sendingNote ? <Loader2 size={13} className="spin" /> : <StickyNote size={13} />}
                Add Note
              </button>
            </div>
          </SidebarCard>

          {/* Activity timeline */}
          <SidebarCard
            title="Activity"
            icon={<History size={14} />}
            collapsible
            collapsed={!showActivity}
            onToggle={() => setShowActivity(v => !v)}
          >
            {showActivity && (
              <div className="td-activity">
                {activity.length === 0 ? (
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>No activity yet</div>
                ) : (
                  activity.map(a => (
                    <div key={a.id} className="td-activity-item">
                      <div className="avatar avatar-sm" style={{ background: a.user.avatarColor, width: 22, height: 22, fontSize: '0.625rem', flexShrink: 0 }}>
                        {getInitials(a.user.name || 'U')}
                      </div>
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                          <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{a.user.name}</span>
                          {' '}
                          {humanizeAction(a.action)}
                        </div>
                        {a.details && (
                          <div style={{ fontSize: '0.6875rem', color: 'var(--text-muted)', marginTop: 2 }}>
                            {a.details}
                          </div>
                        )}
                        <div style={{ fontSize: '0.625rem', color: 'var(--text-muted)', marginTop: 2 }}>
                          {formatDateTime(a.createdAt)}
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}
          </SidebarCard>
        </aside>
      </div>

      <style>{`
        .td-top-bar {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 16px 32px;
          border-bottom: 1px solid var(--border-subtle);
          background: var(--bg-base);
          position: sticky;
          top: 0;
          z-index: 20;
          flex-wrap: wrap;
        }
        .td-breadcrumb {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 0.8125rem;
        }

        .td-layout {
          display: grid;
          grid-template-columns: minmax(0, 1fr) 360px;
          gap: 20px;
          padding: 24px 32px;
          align-items: start;
        }
        @media (max-width: 1100px) {
          .td-layout {
            grid-template-columns: 1fr;
          }
        }
        @media (max-width: 768px) {
          .td-layout { padding: 20px 16px; }
          .td-top-bar { padding: 12px 16px; }
        }

        .td-main {
          display: flex;
          flex-direction: column;
          gap: 16px;
          min-width: 0;
        }

        .td-header-card {
          padding: 20px 22px 16px !important;
        }
        .td-header-top {
          display: flex;
          align-items: flex-start;
          gap: 16px;
        }
        .td-badge {
          display: inline-flex;
          align-items: center;
          gap: 5px;
          padding: 4px 10px;
          border-radius: 99px;
          font-size: 0.6875rem;
          font-weight: 700;
          letter-spacing: 0.02em;
          text-transform: uppercase;
        }
        .td-tags-row {
          display: flex;
          align-items: center;
          gap: 6px;
          flex-wrap: wrap;
          margin-top: 16px;
          padding-top: 16px;
          border-top: 1px solid var(--border-subtle);
        }
        .td-chip {
          display: inline-flex;
          align-items: center;
          padding: 3px 10px;
          background: rgba(99,102,241,0.12);
          color: var(--brand-light);
          border: 1px solid rgba(99,102,241,0.25);
          border-radius: 99px;
          font-size: 0.6875rem;
          font-weight: 600;
        }

        .td-thread {
          display: flex;
          flex-direction: column;
          gap: 14px;
          background: var(--bg-surface);
          border: 1px solid var(--border-subtle);
          border-radius: var(--radius-lg);
          padding: 20px;
          min-height: 200px;
          max-height: 560px;
          overflow-y: auto;
        }

        .td-msg {
          display: flex;
          gap: 12px;
          max-width: 86%;
        }
        .td-msg.agent {
          align-self: flex-end;
          flex-direction: row-reverse;
        }
        .td-msg-bubble {
          padding: 12px 16px;
          border-radius: 14px;
          font-size: 0.875rem;
          line-height: 1.55;
          color: var(--text-primary);
          position: relative;
          white-space: pre-wrap;
          word-break: break-word;
        }
        .td-msg.requester .td-msg-bubble {
          background: var(--bg-elevated);
          border: 1px solid var(--border-subtle);
          border-top-left-radius: 4px;
        }
        .td-msg.agent .td-msg-bubble {
          background: linear-gradient(135deg, rgba(99,102,241,0.18), rgba(139,92,246,0.10));
          border: 1px solid rgba(99,102,241,0.3);
          border-top-right-radius: 4px;
        }
        .td-msg-meta {
          font-size: 0.6875rem;
          color: var(--text-muted);
          margin-top: 6px;
          display: flex;
          align-items: center;
          gap: 6px;
        }
        .td-msg.agent .td-msg-meta {
          justify-content: flex-end;
        }
        .td-msg-email-tag {
          display: inline-flex;
          align-items: center;
          gap: 3px;
          padding: 1px 6px;
          background: rgba(16,185,129,0.15);
          color: #10b981;
          border-radius: 99px;
          font-size: 0.625rem;
          font-weight: 600;
        }

        .td-composer {
          background: var(--bg-surface);
          border: 1px solid var(--border-default);
          border-radius: var(--radius-lg);
          padding: 14px 16px 14px;
          display: flex;
          flex-direction: column;
          gap: 10px;
        }
        .td-composer-tabs {
          display: flex;
          align-items: center;
          gap: 10px;
        }
        .td-composer-input {
          width: 100%;
          background: var(--bg-overlay);
          border: 1px solid var(--border-default);
          border-radius: var(--radius-md);
          padding: 12px 14px;
          color: var(--text-primary);
          font-family: inherit;
          font-size: 0.875rem;
          resize: vertical;
          min-height: 100px;
          outline: none;
          transition: border-color var(--transition), box-shadow var(--transition);
        }
        .td-composer-input:focus {
          border-color: var(--brand);
          box-shadow: 0 0 0 3px var(--brand-glow);
        }
        .td-composer-actions {
          display: flex;
          align-items: center;
          gap: 10px;
          flex-wrap: wrap;
        }
        .td-checkbox-label {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          font-size: 0.8125rem;
          color: var(--text-secondary);
          cursor: pointer;
          user-select: none;
        }
        .td-checkbox-label input { accent-color: var(--brand); }

        .td-canned-menu {
          position: absolute;
          right: 0;
          top: calc(100% + 6px);
          background: var(--bg-elevated);
          border: 1px solid var(--border-default);
          border-radius: var(--radius-md);
          box-shadow: var(--shadow-lg);
          min-width: 320px;
          max-height: 360px;
          overflow-y: auto;
          z-index: 50;
        }
        .td-canned-item {
          display: flex;
          align-items: flex-start;
          gap: 10px;
          padding: 10px 14px;
          width: 100%;
          background: transparent;
          border: none;
          text-align: left;
          cursor: pointer;
          transition: background var(--transition);
          border-bottom: 1px solid var(--border-subtle);
        }
        .td-canned-item:last-child { border-bottom: none; }
        .td-canned-item:hover { background: var(--bg-hover); }

        .td-closed-banner {
          background: var(--bg-surface);
          border: 1px dashed var(--border-default);
          border-radius: var(--radius-lg);
          padding: 18px;
          text-align: center;
          color: var(--text-muted);
          font-size: 0.875rem;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
        }

        .td-sidebar {
          display: flex;
          flex-direction: column;
          gap: 14px;
          position: sticky;
          top: 80px;
        }
        @media (max-width: 1100px) {
          .td-sidebar { position: static; }
        }

        .td-side-card {
          background: var(--bg-surface);
          border: 1px solid var(--border-subtle);
          border-radius: var(--radius-lg);
          padding: 0;
          overflow: hidden;
        }
        .td-side-head {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 12px 16px;
          border-bottom: 1px solid var(--border-subtle);
          background: var(--bg-elevated);
        }
        .td-side-title {
          font-size: 0.75rem;
          font-weight: 700;
          color: var(--text-secondary);
          text-transform: uppercase;
          letter-spacing: 0.06em;
        }
        .td-side-body {
          padding: 14px 16px;
        }

        .td-info-row {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 8px 0;
          border-bottom: 1px solid var(--border-subtle);
          color: var(--text-muted);
        }
        .td-info-row:last-child { border-bottom: none; padding-bottom: 0; }
        .td-info-row:first-of-type { padding-top: 0; }

        .td-prop-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          padding: 8px 0;
        }
        .td-prop-row + .td-prop-row { border-top: 1px solid var(--border-subtle); }
        .td-prop-label {
          font-size: 0.75rem;
          color: var(--text-muted);
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.04em;
        }
        .td-prop-select {
          width: auto !important;
          min-width: 140px;
          height: 32px;
          font-size: 0.8125rem;
          padding: 4px 10px;
        }

        .td-notes-list {
          display: flex;
          flex-direction: column;
          gap: 10px;
          max-height: 240px;
          overflow-y: auto;
          margin-bottom: 12px;
        }
        .td-note {
          background: rgba(245,158,11,0.06);
          border: 1px solid rgba(245,158,11,0.2);
          border-radius: var(--radius-md);
          padding: 10px 12px;
        }
        .td-note-composer {
          padding-top: 12px;
          border-top: 1px solid var(--border-subtle);
        }

        .td-activity {
          display: flex;
          flex-direction: column;
          gap: 10px;
          max-height: 320px;
          overflow-y: auto;
        }
        .td-activity-item {
          display: flex;
          gap: 10px;
          align-items: flex-start;
        }

        .spin { animation: spin 0.7s linear infinite; }
      `}</style>
    </>
  )
}

function MessageBubble({ message, requesterName, requesterColor }: { message: Message; requesterName: string; requesterColor: string }) {
  const isAgent = message.isFromAgent
  const authorName = isAgent
    ? (message.author?.name || 'Agent')
    : requesterName
  const avatarColor = isAgent
    ? (message.author?.avatarColor || '#6366f1')
    : requesterColor

  return (
    <div className={`td-msg ${isAgent ? 'agent' : 'requester'}`}>
      <div className="avatar avatar-sm" style={{ background: avatarColor, flexShrink: 0 }}>
        {getInitials(authorName)}
      </div>
      <div style={{ minWidth: 0 }}>
        <div className="td-msg-bubble">{message.content}</div>
        <div className="td-msg-meta">
          <span style={{ fontWeight: 600, color: 'var(--text-secondary)' }}>{authorName}</span>
          <span>·</span>
          <span>{timeAgo(message.createdAt)}</span>
          {message.sentViaEmail && (
            <span className="td-msg-email-tag">
              <Mail size={10} /> via email
            </span>
          )}
        </div>
      </div>
    </div>
  )
}

function SidebarCard({
  title, icon, children, accent, collapsible, collapsed, onToggle,
}: {
  title: string
  icon?: React.ReactNode
  children: React.ReactNode
  accent?: string
  collapsible?: boolean
  collapsed?: boolean
  onToggle?: () => void
}) {
  return (
    <div className="td-side-card">
      <div
        className="td-side-head"
        style={{
          cursor: collapsible ? 'pointer' : 'default',
          borderLeft: accent ? `3px solid ${accent}` : undefined,
        }}
        onClick={collapsible ? onToggle : undefined}
      >
        {icon && <span style={{ color: accent || 'var(--brand-light)', display: 'flex' }}>{icon}</span>}
        <div className="td-side-title">{title}</div>
        <div style={{ flex: 1 }} />
        {collapsible && (
          <ChevronDown
            size={14}
            style={{
              color: 'var(--text-muted)',
              transform: collapsed ? 'rotate(-90deg)' : 'rotate(0deg)',
              transition: 'transform var(--transition)',
            }}
          />
        )}
      </div>
      <div className="td-side-body">{children}</div>
    </div>
  )
}

function PropertyRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="td-prop-row">
      <div className="td-prop-label">{label}</div>
      {children}
    </div>
  )
}

function humanizeAction(action: string): string {
  switch (action) {
    case 'TICKET_CREATED': return 'created this ticket'
    case 'TICKET_UPDATED': return 'updated the ticket'
    case 'TICKET_REPLY': return 'replied in-app'
    case 'TICKET_REPLY_EMAIL': return 'replied via email'
    case 'TICKET_NOTE_ADDED': return 'added an internal note'
    case 'TICKET_ARCHIVED': return 'archived the ticket'
    default: return action.toLowerCase().replace(/_/g, ' ')
  }
}
