'use client'
import { useState, useMemo, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import {
  Plus, Search, Ticket, X, Loader2, CheckCircle2, Circle,
  ArrowUpCircle, Users, Mail, Archive, Tag,
  MessageSquare, StickyNote, Inbox, CheckSquare, Square,
  AlertTriangle,
} from 'lucide-react'
import { getPriorityColor, getInitials, timeAgo } from '@/lib/workryn/utils'

type TicketItem = {
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
  createdBy: { id: string; name: string | null; avatarColor: string }
  assignedTo: { id: string; name: string | null; avatarColor: string } | null
  department: { id: string; name: string; color: string } | null
  _count?: { messages: number; internalNotes: number }
}

type User = { id: string; name: string | null; avatarColor: string; role: string }
type Department = { id: string; name: string; color: string }

const STATUSES = ['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED']
const CATEGORIES = ['Hardware', 'Software', 'Network', 'Access', 'Email', 'Request', 'Question', 'Other']
const PRIORITIES = ['URGENT', 'HIGH', 'MEDIUM', 'LOW']

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
  initialTickets: TicketItem[]
  users: User[]
  departments: Department[]
  currentUser: { id: string; role: string }
}

type FilterTab = 'ALL' | 'OPEN' | 'IN_PROGRESS' | 'RESOLVED' | 'CLOSED' | 'ARCHIVED'

export default function TicketsClient({ initialTickets, users, departments, currentUser }: Props) {
  const router = useRouter()
  const [tickets, setTickets] = useState<TicketItem[]>(initialTickets)
  const [archivedTickets, setArchivedTickets] = useState<TicketItem[] | null>(null)
  const [showModal, setShowModal] = useState(false)
  const [search, setSearch] = useState('')
  const [filterTab, setFilterTab] = useState<FilterTab>('ALL')
  const [filterPriority, setFilterPriority] = useState('')
  const [filterAssignee, setFilterAssignee] = useState('')
  const [filterDepartment, setFilterDepartment] = useState('')
  const [saving, setSaving] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [bulkSaving, setBulkSaving] = useState(false)

  const [form, setForm] = useState({
    title: '',
    description: '',
    priority: 'MEDIUM',
    category: 'Request',
    assignedToId: '',
    departmentId: '',
    tags: '',
    requesterFirstName: '',
    requesterLastName: '',
    requesterEmail: '',
    requesterPhone: '',
  })

  // Load archived tickets on demand
  useEffect(() => {
    if (filterTab === 'ARCHIVED' && archivedTickets === null) {
      fetch('/api/workryn/tickets?archived=true')
        .then(r => r.json())
        .then((data: TicketItem[]) => {
          setArchivedTickets(data.filter(t => t.archivedAt !== null))
        })
        .catch(() => setArchivedTickets([]))
    }
  }, [filterTab, archivedTickets])

  const sourceList = filterTab === 'ARCHIVED' ? (archivedTickets ?? []) : tickets

  const filtered = useMemo(() => {
    return sourceList.filter(t => {
      // Tab filter
      if (filterTab !== 'ALL' && filterTab !== 'ARCHIVED' && t.status !== filterTab) return false

      // Search
      if (search) {
        const q = search.toLowerCase()
        const hay = [
          t.title,
          t.description || '',
          t.requesterEmail || '',
          t.requesterFirstName || '',
          t.requesterLastName || '',
          t.tags || '',
          t.id,
        ].join(' ').toLowerCase()
        if (!hay.includes(q)) return false
      }

      if (filterPriority && t.priority !== filterPriority) return false
      if (filterAssignee) {
        if (filterAssignee === 'unassigned' && t.assignedTo) return false
        if (filterAssignee !== 'unassigned' && t.assignedTo?.id !== filterAssignee) return false
      }
      if (filterDepartment && t.department?.id !== filterDepartment) return false
      return true
    })
  }, [sourceList, filterTab, search, filterPriority, filterAssignee, filterDepartment])

  const countByStatus = (s: string) => tickets.filter(t => t.status === s).length
  const openCount = countByStatus('OPEN')
  const inProgCount = countByStatus('IN_PROGRESS')
  const resolvedCount = countByStatus('RESOLVED')
  const totalCount = tickets.length

  function resetForm() {
    setForm({
      title: '', description: '', priority: 'MEDIUM', category: 'Request',
      assignedToId: '', departmentId: '', tags: '',
      requesterFirstName: '', requesterLastName: '', requesterEmail: '', requesterPhone: '',
    })
    setCreateError(null)
  }

  function openCreate() {
    resetForm()
    setShowModal(true)
  }

  async function handleCreate() {
    // Client-side validation
    if (!form.title.trim()) { setCreateError('Title is required'); return }
    if (!form.description.trim()) { setCreateError('Description is required'); return }
    if (!form.requesterFirstName.trim()) { setCreateError('First name is required'); return }
    if (!form.requesterLastName.trim()) { setCreateError('Last name is required'); return }
    if (!form.requesterEmail.trim()) { setCreateError('Email is required'); return }
    if (!form.requesterPhone.trim()) { setCreateError('Phone is required'); return }

    setSaving(true)
    setCreateError(null)
    try {
      const res = await fetch('/api/workryn/tickets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        setCreateError(err.error || 'Failed to create ticket')
        return
      }
      const created: TicketItem = await res.json()
      setTickets(t => [created, ...t])
      setShowModal(false)
      resetForm()
    } finally { setSaving(false) }
  }

  function toggleSelect(id: string) {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function clearSelection() {
    setSelectedIds(new Set())
  }

  function toggleSelectAll() {
    if (selectedIds.size === filtered.length) {
      clearSelection()
    } else {
      setSelectedIds(new Set(filtered.map(t => t.id)))
    }
  }

  async function bulkUpdateStatus(status: string) {
    if (selectedIds.size === 0) return
    setBulkSaving(true)
    try {
      const ids = Array.from(selectedIds)
      await Promise.all(ids.map(id =>
        fetch(`/api/workryn/tickets/${id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status }),
        })
      ))
      setTickets(t => t.map(x => ids.includes(x.id)
        ? { ...x, status, ...(status === 'CLOSED' ? { archivedAt: new Date().toISOString() } : {}) }
        : x
      ))
      // If closing in bulk, those rows will move to archived
      if (status === 'CLOSED') {
        setTickets(t => t.filter(x => !ids.includes(x.id)))
        setArchivedTickets(null) // invalidate archived cache
      }
      clearSelection()
    } finally { setBulkSaving(false) }
  }

  async function bulkArchive() {
    if (selectedIds.size === 0) return
    if (!confirm(`Archive ${selectedIds.size} ticket(s)?`)) return
    setBulkSaving(true)
    try {
      const ids = Array.from(selectedIds)
      await Promise.all(ids.map(id =>
        fetch(`/api/workryn/tickets/${id}`, { method: 'DELETE' })
      ))
      setTickets(t => t.filter(x => !ids.includes(x.id)))
      setArchivedTickets(null)
      clearSelection()
    } finally { setBulkSaving(false) }
  }

  const canArchive = currentUser.role === 'ADMIN' || currentUser.role === 'OWNER'

  return (
    <>
      {/* Header */}
      <div className="page-header" style={{ padding: '24px 32px 20px' }}>
        <div className="flex items-center justify-between" style={{ marginBottom: 20 }}>
          <div>
            <h1 className="gradient-text" style={{ marginBottom: 4 }}>Help Desk</h1>
            <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>
              Zoho Desk-style ticket management for IT Support
            </p>
          </div>
          <button className="btn btn-gradient focus-ring" onClick={openCreate} id="btn-create-ticket">
            <Plus size={18} /> New Ticket
          </button>
        </div>

        {/* Stats cards */}
        <div className="td-stats">
          <StatCard icon={<Inbox size={18} />} color="#3b82f6" label="Open" value={openCount} />
          <StatCard icon={<ArrowUpCircle size={18} />} color="#f59e0b" label="In Progress" value={inProgCount} />
          <StatCard icon={<CheckCircle2 size={18} />} color="#10b981" label="Resolved" value={resolvedCount} />
          <StatCard icon={<Ticket size={18} />} color="#8b5cf6" label="Total Active" value={totalCount} />
        </div>

        {/* Filter tabs */}
        <div className="flex gap-2" style={{ marginTop: 16, marginBottom: 12, flexWrap: 'wrap' }}>
          <FilterTabBtn active={filterTab === 'ALL'} onClick={() => setFilterTab('ALL')} label="All" count={tickets.length} />
          {STATUSES.map(s => (
            <FilterTabBtn
              key={s}
              active={filterTab === s}
              onClick={() => setFilterTab(s as FilterTab)}
              label={STATUS_META[s].label}
              count={countByStatus(s)}
              color={STATUS_META[s].color}
            />
          ))}
          <FilterTabBtn
            active={filterTab === 'ARCHIVED'}
            onClick={() => setFilterTab('ARCHIVED')}
            label="Archived"
            color="#64748b"
            icon={<Archive size={13} />}
          />
        </div>

        {/* Search + dropdowns */}
        <div className="glass-card" style={{ padding: '12px 16px', borderRadius: 'var(--radius-md)' }}>
          <div className="flex gap-2 items-center" style={{ flexWrap: 'wrap' }}>
            <div style={{ position: 'relative', flex: 1, minWidth: 240, maxWidth: 360 }}>
              <Search size={15} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
              <input
                className="input focus-ring"
                style={{ paddingLeft: 36, height: 38, fontSize: '0.875rem' }}
                placeholder="Search by title, requester, email, tag…"
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>

            <select className="input focus-ring td-filter-select" value={filterPriority} onChange={e => setFilterPriority(e.target.value)}>
              <option value="">All priorities</option>
              {PRIORITIES.map(p => <option key={p} value={p}>{PRIORITY_META[p].label}</option>)}
            </select>

            <select className="input focus-ring td-filter-select" value={filterAssignee} onChange={e => setFilterAssignee(e.target.value)}>
              <option value="">All assignees</option>
              <option value="unassigned">Unassigned</option>
              {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>

            <select className="input focus-ring td-filter-select" value={filterDepartment} onChange={e => setFilterDepartment(e.target.value)}>
              <option value="">All departments</option>
              {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>

            {(search || filterPriority || filterAssignee || filterDepartment) && (
              <button
                className="btn btn-ghost btn-sm focus-ring"
                onClick={() => { setSearch(''); setFilterPriority(''); setFilterAssignee(''); setFilterDepartment('') }}
              >
                <X size={14} /> Clear
              </button>
            )}
          </div>
        </div>

        {/* Bulk action bar */}
        {selectedIds.size > 0 && (
          <div className="td-bulk-bar animate-slide-up">
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <CheckSquare size={16} style={{ color: 'var(--brand-light)' }} />
              <span style={{ fontSize: '0.875rem', fontWeight: 600 }}>
                {selectedIds.size} selected
              </span>
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <select
                className="input focus-ring"
                style={{ height: 34, fontSize: '0.8125rem', width: 'auto' }}
                disabled={bulkSaving}
                onChange={e => {
                  if (e.target.value) {
                    bulkUpdateStatus(e.target.value)
                    e.target.value = ''
                  }
                }}
                defaultValue=""
              >
                <option value="">Change status…</option>
                {STATUSES.map(s => <option key={s} value={s}>{STATUS_META[s].label}</option>)}
              </select>
              {canArchive && (
                <button
                  className="btn btn-danger btn-sm focus-ring"
                  onClick={bulkArchive}
                  disabled={bulkSaving}
                >
                  {bulkSaving ? <Loader2 size={14} className="spin" /> : <Archive size={14} />}
                  Archive
                </button>
              )}
              <button className="btn btn-ghost btn-sm focus-ring" onClick={clearSelection}>
                <X size={14} /> Clear
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Body */}
      <div className="page-body" style={{ paddingTop: 20 }}>
        {filtered.length === 0 ? (
          <div className="empty-state">
            <Ticket size={42} />
            <p>{search || filterPriority || filterAssignee || filterDepartment
              ? 'No tickets match your filters'
              : filterTab === 'ARCHIVED'
                ? 'No archived tickets yet'
                : 'No tickets yet — create your first one above'}</p>
          </div>
        ) : (
          <div className="td-list">
            {/* Select-all row */}
            <div className="td-list-header">
              <button
                className="td-checkbox"
                onClick={toggleSelectAll}
                title={selectedIds.size === filtered.length ? 'Unselect all' : 'Select all'}
              >
                {selectedIds.size === filtered.length && filtered.length > 0
                  ? <CheckSquare size={16} style={{ color: 'var(--brand-light)' }} />
                  : <Square size={16} />}
              </button>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                {filtered.length} {filtered.length === 1 ? 'ticket' : 'tickets'}
              </div>
            </div>

            {filtered.map((ticket, i) => (
              <TicketRow
                key={ticket.id}
                ticket={ticket}
                index={i}
                selected={selectedIds.has(ticket.id)}
                onToggleSelect={() => toggleSelect(ticket.id)}
                onOpen={() => router.push(`/w/tickets/${ticket.id}`)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Create Ticket Modal */}
      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal animate-scale-in" onClick={e => e.stopPropagation()} style={{ maxWidth: 640 }}>
            <div style={{ height: 3, background: 'var(--brand-gradient)', borderRadius: '24px 24px 0 0' }} />
            <div className="modal-header" style={{ padding: '20px 24px 16px', borderBottom: '1px solid var(--border-subtle)' }}>
              <h3>New Support Ticket</h3>
              <button className="btn btn-icon btn-ghost focus-ring" onClick={() => setShowModal(false)}><X size={18} /></button>
            </div>

            <div className="modal-body" style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>
              {/* Requester Contact */}
              <div className="td-section-title">Contact Details</div>
              <div className="flex gap-3">
                <div className="form-group flex-1">
                  <label className="label">First name *</label>
                  <input className="input focus-ring" placeholder="Jane" value={form.requesterFirstName} onChange={e => setForm(f => ({ ...f, requesterFirstName: e.target.value }))} autoFocus />
                </div>
                <div className="form-group flex-1">
                  <label className="label">Last name *</label>
                  <input className="input focus-ring" placeholder="Doe" value={form.requesterLastName} onChange={e => setForm(f => ({ ...f, requesterLastName: e.target.value }))} />
                </div>
              </div>
              <div className="flex gap-3">
                <div className="form-group flex-1">
                  <label className="label">Email *</label>
                  <input className="input focus-ring" type="email" placeholder="jane@company.com" value={form.requesterEmail} onChange={e => setForm(f => ({ ...f, requesterEmail: e.target.value }))} />
                </div>
                <div className="form-group flex-1">
                  <label className="label">Phone *</label>
                  <input className="input focus-ring" type="tel" placeholder="+1 555 123 4567" value={form.requesterPhone} onChange={e => setForm(f => ({ ...f, requesterPhone: e.target.value }))} />
                </div>
              </div>

              <div style={{ height: 1, background: 'var(--border-subtle)', margin: '4px 0' }} />

              {/* Ticket Info */}
              <div className="td-section-title">Ticket Details</div>
              <div className="form-group">
                <label className="label">Subject *</label>
                <input id="ticket-title" className="input focus-ring" placeholder="Brief summary of the issue…" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} />
              </div>

              <div className="form-group">
                <label className="label">Description *</label>
                <textarea className="input focus-ring" style={{ minHeight: 96, resize: 'vertical' }} placeholder="Provide as much detail as possible…" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
              </div>

              <div className="flex gap-3">
                <div className="form-group flex-1">
                  <label className="label">Priority</label>
                  <select className="input focus-ring" value={form.priority} onChange={e => setForm(f => ({ ...f, priority: e.target.value }))}>
                    {PRIORITIES.map(p => <option key={p} value={p}>{PRIORITY_META[p].label}</option>)}
                  </select>
                </div>
                <div className="form-group flex-1">
                  <label className="label">Category</label>
                  <select className="input focus-ring" value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))}>
                    {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
              </div>

              <div className="flex gap-3">
                <div className="form-group flex-1">
                  <label className="label">Assign to</label>
                  <select className="input focus-ring" value={form.assignedToId} onChange={e => setForm(f => ({ ...f, assignedToId: e.target.value }))}>
                    <option value="">Unassigned</option>
                    {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                  </select>
                </div>
                <div className="form-group flex-1">
                  <label className="label">Department</label>
                  <select className="input focus-ring" value={form.departmentId} onChange={e => setForm(f => ({ ...f, departmentId: e.target.value }))}>
                    <option value="">None</option>
                    {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                  </select>
                </div>
              </div>

              <div className="form-group">
                <label className="label">Tags <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>(comma separated)</span></label>
                <input className="input focus-ring" placeholder="vpn, laptop, urgent" value={form.tags} onChange={e => setForm(f => ({ ...f, tags: e.target.value }))} />
              </div>

              {createError && (
                <div style={{ padding: '10px 14px', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 'var(--radius-md)', color: '#f87171', fontSize: '0.8125rem', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <AlertTriangle size={14} /> {createError}
                </div>
              )}
            </div>

            <div className="modal-footer" style={{ padding: '16px 24px 20px', borderTop: '1px solid var(--border-subtle)' }}>
              <button className="btn btn-ghost focus-ring" onClick={() => setShowModal(false)}>Cancel</button>
              <button className="btn btn-gradient focus-ring" onClick={handleCreate} disabled={saving} id="btn-save-ticket">
                {saving ? <Loader2 size={16} className="spin" /> : <>Create Ticket</>}
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        .td-stats {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 12px;
        }
        @media (max-width: 900px) {
          .td-stats { grid-template-columns: repeat(2, 1fr); }
        }
        .td-stat-card {
          background: var(--bg-surface);
          border: 1px solid var(--border-subtle);
          border-radius: var(--radius-lg);
          padding: 16px 18px;
          display: flex;
          align-items: center;
          gap: 14px;
          transition: all var(--transition-smooth);
          position: relative;
          overflow: hidden;
        }
        .td-stat-card::before {
          content: '';
          position: absolute;
          top: 0; left: 0; right: 0;
          height: 3px;
          background: var(--brand-gradient);
          opacity: 0;
          transition: opacity var(--transition-smooth);
        }
        .td-stat-card:hover {
          border-color: var(--border-default);
          transform: translateY(-1px);
          box-shadow: var(--shadow-glow);
        }
        .td-stat-card:hover::before { opacity: 1; }
        .td-stat-icon {
          width: 42px; height: 42px;
          border-radius: var(--radius-md);
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }
        .td-stat-value {
          font-size: 1.5rem;
          font-weight: 700;
          color: var(--text-primary);
          line-height: 1;
        }
        .td-stat-label {
          font-size: 0.75rem;
          color: var(--text-muted);
          margin-top: 4px;
          text-transform: uppercase;
          letter-spacing: 0.04em;
          font-weight: 600;
        }

        .td-filter-tab {
          display: inline-flex;
          align-items: center;
          gap: 7px;
          padding: 7px 14px;
          border-radius: 99px;
          font-size: 0.8125rem;
          font-weight: 500;
          color: var(--text-muted);
          background: var(--bg-elevated);
          border: 1px solid var(--border-subtle);
          cursor: pointer;
          transition: all var(--transition-smooth);
        }
        .td-filter-tab:hover {
          border-color: var(--border-default);
          color: var(--text-primary);
          background: var(--bg-hover);
          transform: translateY(-1px);
        }
        .td-filter-tab.active {
          border-color: var(--brand);
          color: var(--text-primary);
          background: rgba(99,102,241,0.12);
          box-shadow: 0 0 12px rgba(99,102,241,0.15);
        }
        .td-filter-tab-count {
          min-width: 20px;
          height: 18px;
          border-radius: 99px;
          background: var(--bg-overlay);
          font-size: 0.6875rem;
          font-weight: 700;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 0 6px;
        }
        .td-filter-tab.active .td-filter-tab-count {
          background: rgba(99,102,241,0.25);
          color: var(--brand-light);
        }
        .td-filter-select {
          width: auto;
          height: 38px;
          font-size: 0.875rem;
          min-width: 140px;
        }

        .td-bulk-bar {
          margin-top: 12px;
          padding: 10px 16px;
          background: rgba(99,102,241,0.08);
          border: 1px solid rgba(99,102,241,0.25);
          border-radius: var(--radius-md);
          display: flex;
          align-items: center;
          justify-content: space-between;
          box-shadow: 0 0 20px rgba(99,102,241,0.08);
        }

        .td-list {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        .td-list-header {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 6px 16px;
        }
        .td-checkbox {
          display: inline-flex;
          background: transparent;
          border: none;
          color: var(--text-muted);
          padding: 6px;
          border-radius: var(--radius-sm);
          transition: all var(--transition);
          cursor: pointer;
        }
        .td-checkbox:hover { color: var(--text-primary); background: var(--bg-hover); }

        .td-row {
          background: var(--bg-surface);
          border: 1px solid var(--border-subtle);
          border-radius: var(--radius-lg);
          padding: 14px 18px;
          display: flex;
          align-items: center;
          gap: 14px;
          transition: all var(--transition-smooth);
          position: relative;
        }
        .td-row::before {
          content: '';
          position: absolute;
          top: 0; left: 0;
          width: 3px;
          height: 100%;
          border-radius: 16px 0 0 16px;
          opacity: 0;
          background: var(--brand-gradient);
          transition: opacity var(--transition-smooth);
        }
        .td-row:hover {
          border-color: var(--glass-border);
          background: var(--glass-bg);
          backdrop-filter: var(--glass-blur);
          -webkit-backdrop-filter: var(--glass-blur);
          box-shadow: var(--shadow-md), 0 0 20px rgba(99,102,241,0.06);
          transform: translateY(-1px);
        }
        .td-row:hover::before { opacity: 1; }
        .td-row.selected {
          border-color: rgba(99,102,241,0.4);
          background: rgba(99,102,241,0.05);
        }
        .td-row.selected::before { opacity: 1; }

        .td-row-main {
          flex: 1;
          min-width: 0;
          cursor: pointer;
        }
        .td-row-title {
          font-size: 0.9375rem;
          font-weight: 600;
          color: var(--text-primary);
          margin-bottom: 4px;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          transition: color var(--transition-smooth);
        }
        .td-row:hover .td-row-title {
          color: var(--brand-light);
        }
        .td-row-sub {
          font-size: 0.75rem;
          color: var(--text-muted);
          display: flex;
          align-items: center;
          gap: 10px;
          flex-wrap: wrap;
        }
        .td-row-meta {
          display: flex;
          align-items: center;
          gap: 10px;
          flex-wrap: wrap;
          margin-top: 8px;
        }
        .td-badge {
          display: inline-flex;
          align-items: center;
          gap: 5px;
          padding: 3px 9px;
          border-radius: 99px;
          font-size: 0.6875rem;
          font-weight: 600;
          letter-spacing: 0.02em;
        }
        .td-tag {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          padding: 2px 7px;
          border-radius: 4px;
          font-size: 0.6875rem;
          color: var(--text-muted);
          background: var(--bg-overlay);
          border: 1px solid var(--border-subtle);
        }

        .td-section-title {
          font-size: 0.6875rem;
          font-weight: 700;
          color: var(--text-muted);
          text-transform: uppercase;
          letter-spacing: 0.08em;
        }

        .spin { animation: spin 0.7s linear infinite; }
      `}</style>
    </>
  )
}

function StatCard({ icon, color, label, value }: { icon: React.ReactNode; color: string; label: string; value: number }) {
  return (
    <div className="td-stat-card">
      <div className="td-stat-icon" style={{ background: `${color}18`, color }}>
        {icon}
      </div>
      <div>
        <div className="td-stat-value">{value}</div>
        <div className="td-stat-label">{label}</div>
      </div>
    </div>
  )
}

function FilterTabBtn({
  active, onClick, label, count, color, icon,
}: {
  active: boolean
  onClick: () => void
  label: string
  count?: number
  color?: string
  icon?: React.ReactNode
}) {
  return (
    <button className={`td-filter-tab focus-ring ${active ? 'active' : ''}`} onClick={onClick}>
      {color && !icon && (
        <span style={{
          width: 8, height: 8, borderRadius: '50%',
          background: color,
          boxShadow: active ? `0 0 8px ${color}66` : 'none',
        }} />
      )}
      {icon && <span style={{ color: active ? 'var(--brand-light)' : color, display: 'flex' }}>{icon}</span>}
      {label}
      {count !== undefined && <span className="td-filter-tab-count">{count}</span>}
    </button>
  )
}

function TicketRow({
  ticket, index, selected, onToggleSelect, onOpen,
}: {
  ticket: TicketItem
  index: number
  selected: boolean
  onToggleSelect: () => void
  onOpen: () => void
}) {
  const statusMeta = STATUS_META[ticket.status] || STATUS_META.OPEN
  const priorityColor = getPriorityColor(ticket.priority)
  const tags = ticket.tags ? ticket.tags.split(',').map(t => t.trim()).filter(Boolean) : []
  const requesterName = [ticket.requesterFirstName, ticket.requesterLastName].filter(Boolean).join(' ') || 'Unknown'
  const msgCount = ticket._count?.messages ?? 0
  const noteCount = ticket._count?.internalNotes ?? 0

  return (
    <div
      className={`td-row animate-slide-up ${selected ? 'selected' : ''}`}
      id={`ticket-${ticket.id}`}
      style={{ animationDelay: `${Math.min(index * 25, 400)}ms` }}
    >
      <button className="td-checkbox" onClick={(e) => { e.stopPropagation(); onToggleSelect() }}>
        {selected ? <CheckSquare size={16} style={{ color: 'var(--brand-light)' }} /> : <Square size={16} />}
      </button>

      {/* Priority dot */}
      <span
        title={ticket.priority}
        style={{
          width: 10, height: 10, borderRadius: '50%', flexShrink: 0,
          background: priorityColor,
          boxShadow: `0 0 8px ${priorityColor}55`,
        }}
      />

      {/* Avatar */}
      <div className="avatar avatar-sm" style={{ background: ticket.createdBy.avatarColor, flexShrink: 0 }}>
        {getInitials(requesterName)}
      </div>

      <div className="td-row-main" onClick={onOpen}>
        <div className="td-row-title">{ticket.title}</div>
        <div className="td-row-sub">
          <span style={{ fontWeight: 500, color: 'var(--text-secondary)' }}>{requesterName}</span>
          {ticket.requesterEmail && (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              <Mail size={11} /> {ticket.requesterEmail}
            </span>
          )}
          <span>#{ticket.id.slice(-6).toUpperCase()}</span>
          <span>· {timeAgo(ticket.updatedAt)}</span>
        </div>
        <div className="td-row-meta">
          <span className="td-badge" style={{ background: priorityColor + '20', color: priorityColor }}>
            {PRIORITY_META[ticket.priority]?.label || ticket.priority}
          </span>
          {ticket.category && (
            <span className="td-badge" style={{ background: 'var(--bg-overlay)', color: 'var(--text-secondary)', border: '1px solid var(--border-subtle)' }}>
              {ticket.category}
            </span>
          )}
          {ticket.department && (
            <span className="td-badge" style={{
              background: ticket.department.color + '18',
              color: ticket.department.color,
              border: `1px solid ${ticket.department.color}30`,
            }}>
              {ticket.department.name}
            </span>
          )}
          {tags.slice(0, 3).map(tag => (
            <span key={tag} className="td-tag"><Tag size={10} /> {tag}</span>
          ))}
          {msgCount > 0 && (
            <span style={{ fontSize: '0.6875rem', color: 'var(--text-muted)', display: 'inline-flex', alignItems: 'center', gap: 3 }}>
              <MessageSquare size={11} /> {msgCount}
            </span>
          )}
          {noteCount > 0 && (
            <span style={{ fontSize: '0.6875rem', color: 'var(--text-muted)', display: 'inline-flex', alignItems: 'center', gap: 3 }}>
              <StickyNote size={11} /> {noteCount}
            </span>
          )}
        </div>
      </div>

      {/* Assignee */}
      <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 6 }}>
        {ticket.assignedTo ? (
          <>
            <div className="avatar avatar-sm" style={{
              background: ticket.assignedTo.avatarColor,
              boxShadow: '0 0 0 2px var(--bg-surface)',
            }}>
              {getInitials(ticket.assignedTo.name ?? 'U')}
            </div>
            <span style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
              {ticket.assignedTo.name}
            </span>
          </>
        ) : (
          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 5 }}>
            <Users size={13} /> Unassigned
          </span>
        )}
      </div>

      {/* Status badge */}
      <span
        className="td-badge"
        style={{
          background: statusMeta.color + '20',
          color: statusMeta.color,
          flexShrink: 0,
          padding: '5px 11px',
          fontSize: '0.75rem',
        }}
      >
        <span style={{ color: statusMeta.color, display: 'flex' }}>{statusMeta.icon}</span>
        {statusMeta.label}
      </span>
    </div>
  )
}
