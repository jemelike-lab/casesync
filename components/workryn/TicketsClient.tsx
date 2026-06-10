'use client'

/**
 * TicketsClient — Aurora rebuild (orange accent).
 *
 * Structurally distinct from Tasks (kanban) and Schedule (calendar):
 *   - Inbox-style vertical list, not a board.
 *   - Filter tabs live in the list panel header, NOT in the hero —
 *     they act like an inbox folder switcher with live counts.
 *   - A bulk-action bar appears at the top of the list when rows
 *     are selected (slides down, gradient bg, slide actions).
 *   - Rows are glass cards with: checkbox, priority dot, requester
 *     avatar, title + requester meta + badges row, assignee cluster,
 *     and a colored status badge on the right.
 *
 * API contracts preserved:
 *   GET    /api/workryn/tickets?archived=true
 *   POST   /api/workryn/tickets
 *   PATCH  /api/workryn/tickets/:id    body { status }
 *   DELETE /api/workryn/tickets/:id    (archives)
 *
 * Status set unchanged (OPEN / IN_PROGRESS / RESOLVED / CLOSED).
 * Priority set unchanged (URGENT / HIGH / MEDIUM / LOW).
 * Categories unchanged.
 */

import { useState, useMemo, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import {
  ActionIcon, Alert, Avatar, Badge, Box, Button, Card, Container,
  Group, Loader, Menu, Modal, Paper, Select, SimpleGrid,
  Stack, Text, TextInput, Textarea, ThemeIcon, Title, Tooltip,
} from '@mantine/core'
import { useDisclosure } from '@mantine/hooks'
import {
  AlertTriangle, Archive, ArrowUpCircle, CheckCircle2, CheckSquare,
  Circle, Flame, Inbox, Mail, MessageSquare, Plus, Search, Square,
  StickyNote, Tag, Ticket as TicketIcon, Trash2, Users, X,
} from 'lucide-react'
import { getPriorityColor, getInitials, timeAgo } from '@/lib/workryn/utils'
import { useCountUp } from '@/hooks/useCountUp'
import { useTilt, useMouseSpotlight } from '@/hooks/workrynEffects'

// ---------- Types ----------

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
type FilterTab = 'ALL' | 'OPEN' | 'IN_PROGRESS' | 'RESOLVED' | 'CLOSED' | 'ARCHIVED'

interface Props {
  initialTickets: TicketItem[]
  users: User[]
  departments: Department[]
  currentUser: { id: string; role: string }
}

// ---------- Constants ----------

const STATUSES = ['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED']
const CATEGORIES = ['Hardware', 'Software', 'Network', 'Access', 'Email', 'Request', 'Question', 'Other']
const PRIORITIES = ['URGENT', 'HIGH', 'MEDIUM', 'LOW']

const STATUS_META: Record<string, { label: string; icon: React.ReactNode; color: string; gradient: string }> = {
  OPEN:        { label: 'Open',        icon: <Circle size={11} />,        color: '#0EA5E9', gradient: 'linear-gradient(135deg,#7dd3fc,#0EA5E9)' },
  IN_PROGRESS: { label: 'In Progress', icon: <ArrowUpCircle size={11} />, color: '#F59E0B', gradient: 'linear-gradient(135deg,#fcd34d,#F59E0B)' },
  RESOLVED:    { label: 'Resolved',    icon: <CheckCircle2 size={11} />,  color: '#10B981', gradient: 'linear-gradient(135deg,#6ee7b7,#10B981)' },
  CLOSED:      { label: 'Closed',      icon: <X size={11} />,             color: '#64748B', gradient: 'linear-gradient(135deg,#cbd5e1,#64748B)' },
}
const PRIORITY_META: Record<string, { label: string; color: string }> = {
  URGENT: { label: 'Urgent', color: '#ef4444' },
  HIGH:   { label: 'High',   color: '#f97316' },
  MEDIUM: { label: 'Medium', color: '#f59e0b' },
  LOW:    { label: 'Low',    color: '#22c55e' },
}
const STAT_THEMES = {
  sky:    { bar: 'linear-gradient(90deg,#7dd3fc,#0EA5E9)', glow: 'rgba(14,165,233,0.35)', text: 'linear-gradient(135deg,#7dd3fc,#0EA5E9)', color: 'sky'    as const },
  amber:  { bar: 'linear-gradient(90deg,#fbbf24,#F59E0B)', glow: 'rgba(245,158,11,0.35)', text: 'linear-gradient(135deg,#fcd34d,#F59E0B)', color: 'orange' as const },
  mint:   { bar: 'linear-gradient(90deg,#6ee7b7,#10B981)', glow: 'rgba(52,211,153,0.35)', text: 'linear-gradient(135deg,#6ee7b7,#10B981)', color: 'mint'   as const },
  coral:  { bar: 'linear-gradient(90deg,#fda4af,#FB7185)', glow: 'rgba(251,113,133,0.35)',text: 'linear-gradient(135deg,#fda4af,#FB7185)', color: 'coral'  as const },
} as const

// =================================================================
// MAIN
// =================================================================

export default function TicketsClient({ initialTickets, users, departments, currentUser }: Props) {
  const router = useRouter()
  const [tickets, setTickets] = useState<TicketItem[]>(initialTickets)
  const [archivedTickets, setArchivedTickets] = useState<TicketItem[] | null>(null)
  const [modalOpened, modal] = useDisclosure(false)
  const [search, setSearch] = useState('')
  const [filterTab, setFilterTab] = useState<FilterTab>('ALL')
  const [filterPriority, setFilterPriority] = useState<string | null>(null)
  const [filterAssignee, setFilterAssignee] = useState<string | null>(null)
  const [filterDepartment, setFilterDepartment] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [bulkSaving, setBulkSaving] = useState(false)

  const spot = useMouseSpotlight()

  const [form, setForm] = useState({
    title: '', description: '', priority: 'MEDIUM', category: 'Request',
    assignedToId: '', departmentId: '', tags: '',
    requesterFirstName: '', requesterLastName: '', requesterEmail: '', requesterPhone: '',
  })

  // Lazy-load archived tickets
  useEffect(() => {
    if (filterTab === 'ARCHIVED' && archivedTickets === null) {
      fetch('/api/workryn/tickets?archived=true')
        .then((r) => r.json())
        .then((data: TicketItem[]) => setArchivedTickets(data.filter((t) => t.archivedAt !== null)))
    }
  }, [filterTab, archivedTickets])

  const sourceList = filterTab === 'ARCHIVED' ? (archivedTickets ?? []) : tickets

  const filtered = useMemo(() => {
    return sourceList.filter((t) => {
      if (filterTab !== 'ALL' && filterTab !== 'ARCHIVED' && t.status !== filterTab) return false
      if (search) {
        const q = search.toLowerCase()
        const hay = [t.title, t.description || '', t.requesterEmail || '',
          t.requesterFirstName || '', t.requesterLastName || '', t.tags || '', t.id]
          .join(' ').toLowerCase()
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

  const countByStatus = (s: string) => tickets.filter((t) => t.status === s).length
  const openCount = countByStatus('OPEN')
  const inProgCount = countByStatus('IN_PROGRESS')
  const resolvedCount = countByStatus('RESOLVED')
  const closedCount = countByStatus('CLOSED')
  const urgentCount = tickets.filter((t) => (t.priority === 'URGENT' || t.priority === 'HIGH') && t.status !== 'RESOLVED' && t.status !== 'CLOSED').length

  const animOpen = useCountUp(openCount, 800)
  const animProgress = useCountUp(inProgCount, 800)
  const animResolved = useCountUp(resolvedCount, 800)
  const animUrgent = useCountUp(urgentCount, 800)

  function resetForm() {
    setForm({
      title: '', description: '', priority: 'MEDIUM', category: 'Request',
      assignedToId: '', departmentId: '', tags: '',
      requesterFirstName: '', requesterLastName: '', requesterEmail: '', requesterPhone: '',
    })
    setCreateError(null)
  }

  async function handleCreate() {
    if (!form.title.trim())              { setCreateError('Title is required');      return }
    if (!form.description.trim())        { setCreateError('Description is required');return }
    if (!form.requesterFirstName.trim()) { setCreateError('First name is required'); return }
    if (!form.requesterLastName.trim())  { setCreateError('Last name is required');  return }
    if (!form.requesterEmail.trim())     { setCreateError('Email is required');      return }
    if (!form.requesterPhone.trim())     { setCreateError('Phone is required');      return }

    setSaving(true); setCreateError(null)
    try {
      const res = await fetch('/api/workryn/tickets', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        setCreateError(err.error || 'Failed to create ticket')
        return
      }
      const created: TicketItem = await res.json()
      setTickets((t) => [created, ...t])
      modal.close(); resetForm()
    } finally { setSaving(false) }
  }

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }
  function clearSelection() { setSelectedIds(new Set()) }
  function toggleSelectAll() {
    if (selectedIds.size === filtered.length) clearSelection()
    else setSelectedIds(new Set(filtered.map((t) => t.id)))
  }
  async function bulkUpdateStatus(status: string) {
    if (selectedIds.size === 0) return
    setBulkSaving(true)
    try {
      const ids = Array.from(selectedIds)
      await Promise.all(ids.map((id) =>
        fetch(`/api/workryn/tickets/${id}`, {
          method: 'PATCH', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status }),
        })))
      setTickets((t) => t.map((x) => ids.includes(x.id)
        ? { ...x, status, ...(status === 'CLOSED' ? { archivedAt: new Date().toISOString() } : {}) }
        : x))
      if (status === 'CLOSED') {
        setTickets((t) => t.filter((x) => !ids.includes(x.id)))
        setArchivedTickets(null)
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
      await Promise.all(ids.map((id) => fetch(`/api/workryn/tickets/${id}`, { method: 'DELETE' })))
      setTickets((t) => t.filter((x) => !ids.includes(x.id)))
      setArchivedTickets(null)
      clearSelection()
    } finally { setBulkSaving(false) }
  }

  const canArchive = currentUser.role === 'ADMIN' || currentUser.role === 'OWNER'
  const allSelected = selectedIds.size > 0 && selectedIds.size === filtered.length
  const tabs: { id: FilterTab; label: string; count?: number; icon: React.ReactNode }[] = [
    { id: 'ALL',         label: 'All',         count: tickets.length, icon: <Inbox size={13} /> },
    { id: 'OPEN',        label: 'Open',        count: openCount,      icon: <Circle size={13} /> },
    { id: 'IN_PROGRESS', label: 'In Progress', count: inProgCount,    icon: <ArrowUpCircle size={13} /> },
    { id: 'RESOLVED',    label: 'Resolved',    count: resolvedCount,  icon: <CheckCircle2 size={13} /> },
    { id: 'CLOSED',      label: 'Closed',      count: closedCount,    icon: <X size={13} /> },
    { id: 'ARCHIVED',    label: 'Archived',                            icon: <Archive size={13} /> },
  ]

  return (
    <>
      <Container size="xl" py="lg" className="tia-root">

        {/* ============ HERO ============ */}
        <div ref={spot.ref} onMouseMove={spot.onMouseMove} style={{ marginBottom: 20 }}>
          <Paper radius="lg" p="xl" className="tia-hero">
            <div className="tia-hero-mesh" aria-hidden />
            <div className="tia-hero-orbs" aria-hidden>
              <span className="tia-orb tia-orb-1" />
              <span className="tia-orb tia-orb-2" />
              <span className="tia-orb tia-orb-3" />
            </div>
            <div className="tia-hero-spotlight" aria-hidden />

            <img src="/heroes/tickets.svg" alt="" aria-hidden="true" style={{ position: "absolute", left: "50%", top: "50%", transform: "translate(-50%, -50%)", height: "70%", zIndex: 0, opacity: 0.22, pointerEvents: "none" }} />

            <Group justify="space-between" align="flex-start" wrap="wrap" gap="lg" style={{ position: 'relative', zIndex: 2 }}>
              <Stack gap={6} style={{ minWidth: 0, flex: 1 }}>
                <Group gap={8} align="center">
                  <TicketIcon size={14} style={{ color: 'rgba(252,211,77,0.9)' }} />
                  <Text size="xs" tt="uppercase" fw={700} c="orange.3" style={{ letterSpacing: '0.12em' }}>
                    Help Desk
                  </Text>
                </Group>
                <Title order={1} className="tia-hero-title">
                  {tickets.length} {tickets.length === 1 ? 'ticket' : 'tickets'}
                </Title>
                <Text size="sm" c="dimmed">
                  {openCount} open · {inProgCount} in progress · {resolvedCount} resolved
                  {urgentCount > 0 && <> · <Text component="span" c="red.4" fw={700}>{urgentCount} urgent</Text></>}
                </Text>
                <Button
                  size="md" mt="sm"
                  leftSection={<Plus size={16} />}
                  onClick={() => { resetForm(); modal.open() }}
                  className="tia-btn-primary"
                  style={{ alignSelf: 'flex-start' }}
                >
                  New Ticket
                </Button>
              </Stack>
            </Group>
          </Paper>
        </div>

        {/* ============ STAT CARDS ============ */}
        <SimpleGrid cols={{ base: 2, md: 4 }} spacing="sm" mb="md">
          <StatCard label="Open"        value={String(animOpen)}     icon={Circle}        theme="sky"   delay={0}   />
          <StatCard label="In Progress" value={String(animProgress)} icon={ArrowUpCircle} theme="amber" delay={80}  />
          <StatCard label="Resolved"    value={String(animResolved)} icon={CheckCircle2}  theme="mint"  delay={160} />
          <StatCard label="Urgent"      value={String(animUrgent)}   icon={Flame}         theme="coral" delay={240} />
        </SimpleGrid>

        {/* ============ MAIN PANEL ============ */}
        <Card radius="lg" p={0} withBorder className="tia-panel">

          {/* Filter tabs (inbox-style) */}
          <div className="tia-tabs">
            {tabs.map((t) => (
              <button
                key={t.id}
                className={`tia-tab${filterTab === t.id ? ' tia-tab-active' : ''}`}
                onClick={() => setFilterTab(t.id)}
              >
                <span className="tia-tab-icon">{t.icon}</span>
                <span className="tia-tab-label">{t.label}</span>
                {typeof t.count === 'number' && (
                  <span className="tia-tab-count">{t.count}</span>
                )}
              </button>
            ))}
          </div>

          {/* Search + filters */}
          <Group gap="sm" align="center" wrap="wrap" p="md" className="tia-filter-bar">
            <TextInput
              placeholder="Search tickets, requester, email…"
              value={search}
              onChange={(e) => setSearch(e.currentTarget.value)}
              leftSection={<Search size={14} />}
              style={{ flex: 1, minWidth: 220 }}
            />
            <Select
              value={filterPriority} onChange={setFilterPriority}
              data={[{ value: '', label: 'Any priority' }, ...PRIORITIES.map((p) => ({ value: p, label: PRIORITY_META[p].label }))]}
              placeholder="Any priority" clearable w={140}
            />
            <Select
              value={filterAssignee} onChange={setFilterAssignee}
              data={[
                { value: '', label: 'Any assignee' },
                { value: 'unassigned', label: 'Unassigned' },
                ...users.map((u) => ({ value: u.id, label: u.name ?? 'Unnamed' })),
              ]}
              placeholder="Any assignee" clearable searchable w={170}
            />
            {departments.length > 0 && (
              <Select
                value={filterDepartment} onChange={setFilterDepartment}
                data={[{ value: '', label: 'Any department' }, ...departments.map((d) => ({ value: d.id, label: d.name }))]}
                placeholder="Any department" clearable w={170}
              />
            )}
            {(search || filterPriority || filterAssignee || filterDepartment) && (
              <Button variant="subtle" color="gray" size="sm" onClick={() => {
                setSearch(''); setFilterPriority(null); setFilterAssignee(null); setFilterDepartment(null)
              }}>
                Clear
              </Button>
            )}
          </Group>

          {/* Bulk action bar (animated reveal) */}
          {selectedIds.size > 0 && (
            <div className="tia-bulk-bar">
              <Group justify="space-between" wrap="wrap" gap="sm">
                <Group gap="sm" align="center">
                  <ThemeIcon size="md" radius="md" variant="filled" color="orange">
                    <CheckSquare size={14} />
                  </ThemeIcon>
                  <Text fw={700} size="sm">
                    {selectedIds.size} selected
                  </Text>
                </Group>
                <Group gap="xs" wrap="wrap">
                  <Menu shadow="md" withinPortal>
                    <Menu.Target>
                      <Button size="sm" variant="light" color="orange" loading={bulkSaving}>
                        Change status
                      </Button>
                    </Menu.Target>
                    <Menu.Dropdown>
                      {STATUSES.map((s) => (
                        <Menu.Item
                          key={s}
                          leftSection={STATUS_META[s].icon}
                          onClick={() => bulkUpdateStatus(s)}
                        >
                          Mark as {STATUS_META[s].label}
                        </Menu.Item>
                      ))}
                    </Menu.Dropdown>
                  </Menu>
                  {canArchive && (
                    <Button
                      size="sm" variant="light" color="red"
                      leftSection={<Archive size={14} />}
                      loading={bulkSaving}
                      onClick={bulkArchive}
                    >
                      Archive
                    </Button>
                  )}
                  <Button size="sm" variant="subtle" color="gray" onClick={clearSelection}>
                    Clear
                  </Button>
                </Group>
              </Group>
            </div>
          )}

          {/* List */}
          {filtered.length === 0 ? (
            <Stack align="center" gap="xs" py={48}>
              <ThemeIcon size={48} radius="xl" variant="light" color="orange">
                <Inbox size={22} />
              </ThemeIcon>
              <Text c="dimmed">
                {search || filterPriority || filterAssignee || filterDepartment
                  ? 'No tickets match your filters'
                  : filterTab === 'ARCHIVED'
                  ? 'No archived tickets yet'
                  : 'No tickets yet — create your first one above'}
              </Text>
            </Stack>
          ) : (
            <div className="tia-list">
              {/* Select all header */}
              <div className="tia-list-header">
                <button
                  className="tia-checkbox"
                  onClick={toggleSelectAll}
                  aria-label={allSelected ? 'Unselect all' : 'Select all'}
                >
                  {allSelected ? <CheckSquare size={15} style={{ color: '#F59E0B' }} /> : <Square size={15} />}
                </button>
                <Text size="xs" c="dimmed" fw={700} tt="uppercase" style={{ letterSpacing: '0.06em' }}>
                  {filtered.length} {filtered.length === 1 ? 'ticket' : 'tickets'}
                </Text>
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
        </Card>
      </Container>

      {/* ============ MODAL ============ */}
      <Modal
        opened={modalOpened}
        onClose={() => { modal.close(); resetForm() }}
        title="New Support Ticket"
        size="lg"
        radius="lg"
        overlayProps={{ backgroundOpacity: 0.55, blur: 4 }}
        classNames={{ content: 'tia-modal-content' }}
      >
        <Stack gap="md">
          <Text size="xs" tt="uppercase" fw={700} c="orange.3" style={{ letterSpacing: '0.08em' }}>
            Contact details
          </Text>
          <Group grow>
            <TextInput label="First name" required value={form.requesterFirstName}
              onChange={(e) => setForm((f) => ({ ...f, requesterFirstName: e.currentTarget.value }))} autoFocus />
            <TextInput label="Last name" required value={form.requesterLastName}
              onChange={(e) => setForm((f) => ({ ...f, requesterLastName: e.currentTarget.value }))} />
          </Group>
          <Group grow>
            <TextInput label="Email" type="email" required value={form.requesterEmail}
              onChange={(e) => setForm((f) => ({ ...f, requesterEmail: e.currentTarget.value }))} />
            <TextInput label="Phone" type="tel" required value={form.requesterPhone}
              onChange={(e) => setForm((f) => ({ ...f, requesterPhone: e.currentTarget.value }))} />
          </Group>

          <Box style={{ height: 1, background: 'rgba(255,255,255,0.06)', margin: '4px 0' }} />

          <Text size="xs" tt="uppercase" fw={700} c="orange.3" style={{ letterSpacing: '0.08em' }}>
            Ticket details
          </Text>
          <TextInput label="Subject" required placeholder="Brief summary of the issue…" value={form.title}
            onChange={(e) => setForm((f) => ({ ...f, title: e.currentTarget.value }))} />
          <Textarea label="Description" required placeholder="Provide as much detail as possible…"
            value={form.description}
            onChange={(e) => setForm((f) => ({ ...f, description: e.currentTarget.value }))}
            minRows={3} autosize maxRows={8} />
          <Group grow>
            <Select label="Priority" value={form.priority}
              onChange={(v) => setForm((f) => ({ ...f, priority: v ?? 'MEDIUM' }))}
              data={PRIORITIES.map((p) => ({ value: p, label: PRIORITY_META[p].label }))} />
            <Select label="Category" value={form.category}
              onChange={(v) => setForm((f) => ({ ...f, category: v ?? 'Request' }))}
              data={CATEGORIES.map((c) => ({ value: c, label: c }))} />
          </Group>
          <Group grow>
            <Select label="Assign to" value={form.assignedToId}
              onChange={(v) => setForm((f) => ({ ...f, assignedToId: v ?? '' }))}
              data={[{ value: '', label: 'Unassigned' }, ...users.map((u) => ({ value: u.id, label: u.name ?? 'Unnamed' }))]}
              searchable />
            <Select label="Department" value={form.departmentId}
              onChange={(v) => setForm((f) => ({ ...f, departmentId: v ?? '' }))}
              data={[{ value: '', label: 'None' }, ...departments.map((d) => ({ value: d.id, label: d.name }))]} />
          </Group>
          <TextInput label="Tags" description="Comma separated" placeholder="vpn, laptop, urgent"
            value={form.tags}
            onChange={(e) => setForm((f) => ({ ...f, tags: e.currentTarget.value }))} />

          {createError && (
            <Alert color="red" variant="light" icon={<AlertTriangle size={14} />}>
              {createError}
            </Alert>
          )}

          <Group justify="flex-end" mt="sm">
            <Button variant="subtle" color="gray" onClick={() => { modal.close(); resetForm() }}>Cancel</Button>
            <Button loading={saving} onClick={handleCreate} className="tia-btn-primary">
              Create Ticket
            </Button>
          </Group>
        </Stack>
      </Modal>

      {/* ============ STYLES ============ */}
      <style>{`
        @keyframes tia-slide-up { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes tia-slide-down { from { opacity: 0; transform: translateY(-8px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes tia-mesh-drift {
          0%, 100% { transform: translate(0,0) scale(1); }
          50%      { transform: translate(3%, -2%) scale(1.05); }
        }
        @keyframes tia-orb-a { 0%,100%{transform:translate(0,0)} 50%{transform:translate(40px,-30px)} }
        @keyframes tia-orb-b { 0%,100%{transform:translate(0,0)} 50%{transform:translate(-30px,25px)} }
        @keyframes tia-orb-c { 0%,100%{transform:translate(0,0)} 50%{transform:translate(20px,40px)} }
        @media (prefers-reduced-motion: reduce) {
          .tia-root *, .tia-root *::before, .tia-root *::after {
            animation: none !important; transition: none !important;
          }
        }

        /* -------------- HERO -------------- */
        .tia-hero {
          position: relative; overflow: hidden;
          border: 1px solid rgba(245,158,11,0.32);
          background:
            linear-gradient(135deg, rgba(245,158,11,0.16) 0%, rgba(249,115,22,0.10) 50%, rgba(239,68,68,0.06) 100%),
            rgba(11,15,30,0.55);
          backdrop-filter: blur(14px) saturate(140%);
          -webkit-backdrop-filter: blur(14px) saturate(140%);
          box-shadow: 0 20px 60px -20px rgba(245,158,11,0.35), 0 1px 0 rgba(255,255,255,0.05) inset;
          animation: tia-slide-up 460ms ease-out backwards;
        }
        .tia-hero-mesh {
          position: absolute; inset: -25%;
          background:
            radial-gradient(circle at 22% 30%, rgba(245,158,11,0.45), transparent 42%),
            radial-gradient(circle at 78% 25%, rgba(249,115,22,0.30), transparent 47%),
            radial-gradient(circle at 62% 82%, rgba(239,68,68,0.18), transparent 52%);
          filter: blur(40px);
          animation: tia-mesh-drift 22s ease-in-out infinite;
          z-index: 0; pointer-events: none;
        }
        .tia-hero-orbs { position: absolute; inset: 0; z-index: 0; pointer-events: none; }
        .tia-orb { position: absolute; border-radius: 50%; filter: blur(22px); opacity: 0.55; mix-blend-mode: screen; }
        .tia-orb-1 { width: 130px; height: 130px; top: 12%; left: 8%;
          background: radial-gradient(circle, #fcd34d 0%, transparent 70%);
          animation: tia-orb-a 14s ease-in-out infinite; }
        .tia-orb-2 { width: 100px; height: 100px; top: 55%; left: 60%;
          background: radial-gradient(circle, #F59E0B 0%, transparent 70%);
          animation: tia-orb-b 16s ease-in-out infinite; }
        .tia-orb-3 { width: 80px; height: 80px; bottom: 10%; right: 12%;
          background: radial-gradient(circle, #fb7185 0%, transparent 70%);
          animation: tia-orb-c 18s ease-in-out infinite; }
        .tia-hero-spotlight {
          position: absolute; inset: 0; z-index: 1; pointer-events: none;
          background: radial-gradient(circle 360px at var(--mx, 50%) var(--my, 50%), rgba(255,255,255,0.10), transparent 60%);
        }
        .tia-hero-title {
          font-size: clamp(2.25rem, 6vw, 4rem);
          font-weight: 800;
          letter-spacing: -0.035em;
          line-height: 1;
          margin: 0;
          font-variant-numeric: tabular-nums;
          background: linear-gradient(135deg, #ffffff 0%, #fcd34d 50%, #F59E0B 100%);
          -webkit-background-clip: text; background-clip: text;
          -webkit-text-fill-color: transparent;
          filter: drop-shadow(0 2px 16px rgba(245,158,11,0.45));
        }
        .tia-btn-primary {
          background: linear-gradient(135deg, #F59E0B 0%, #f97316 100%);
          box-shadow: 0 6px 18px rgba(245,158,11,0.40);
          transition: transform 180ms ease, box-shadow 180ms ease;
          color: #fff;
        }
        .tia-btn-primary:hover {
          transform: translateY(-1px);
          box-shadow: 0 10px 28px rgba(245,158,11,0.55);
        }

        /* -------------- Stat cards -------------- */
        .tia-stat-card {
          position: relative; overflow: hidden;
          background: rgba(15, 23, 42, 0.55);
          backdrop-filter: blur(12px) saturate(140%);
          -webkit-backdrop-filter: blur(12px) saturate(140%);
          transition: box-shadow 260ms ease, border-color 220ms ease;
          animation: tia-slide-up 500ms ease-out backwards;
          will-change: transform;
        }
        .tia-stat-card::before {
          content: ''; position: absolute; top: 0; left: 0; right: 0; height: 3px;
          background: var(--tia-bar);
        }
        .tia-stat-card:hover {
          box-shadow: 0 14px 36px var(--tia-glow, rgba(245,158,11,0.35));
        }
        .tia-stat-value {
          font-size: clamp(1.5rem, 2.5vw, 1.9rem);
          font-weight: 800;
          line-height: 1;
          letter-spacing: -0.03em;
          font-variant-numeric: tabular-nums;
          background: var(--tia-text);
          -webkit-background-clip: text; background-clip: text;
          -webkit-text-fill-color: transparent;
        }

        /* -------------- Main panel -------------- */
        .tia-panel {
          background: rgba(15, 23, 42, 0.55);
          backdrop-filter: blur(14px) saturate(140%);
          -webkit-backdrop-filter: blur(14px) saturate(140%);
          overflow: hidden;
          animation: tia-slide-up 500ms 100ms ease-out backwards;
        }

        /* Inbox tabs */
        .tia-tabs {
          display: flex;
          gap: 4px;
          padding: 10px 12px;
          border-bottom: 1px solid rgba(255,255,255,0.06);
          overflow-x: auto;
        }
        .tia-tab {
          display: inline-flex; align-items: center; gap: 6px;
          padding: 6px 12px;
          border-radius: 8px;
          font-size: 0.8125rem; font-weight: 600;
          color: rgba(148,163,184,0.75);
          background: transparent;
          border: 1px solid transparent;
          cursor: pointer;
          transition: all 140ms ease;
          white-space: nowrap;
        }
        .tia-tab:hover { background: rgba(245,158,11,0.06); color: #fcd34d; }
        .tia-tab-active {
          background: linear-gradient(135deg, rgba(245,158,11,0.18), rgba(249,115,22,0.10));
          color: #fff;
          border-color: rgba(245,158,11,0.40);
          box-shadow: 0 4px 14px rgba(245,158,11,0.25);
        }
        .tia-tab-icon { display: inline-flex; align-items: center; }
        .tia-tab-count {
          font-size: 0.6875rem; font-weight: 700;
          padding: 2px 7px;
          border-radius: 99px;
          background: rgba(255,255,255,0.08);
          color: rgba(226,232,240,0.9);
          margin-left: 2px;
        }
        .tia-tab-active .tia-tab-count {
          background: rgba(245,158,11,0.30);
          color: #fff;
        }

        /* Filter bar */
        .tia-filter-bar { border-bottom: 1px solid rgba(255,255,255,0.04); }

        /* Bulk bar (slides in) */
        .tia-bulk-bar {
          padding: 12px 16px;
          background: linear-gradient(135deg, rgba(245,158,11,0.14), rgba(249,115,22,0.08));
          border-bottom: 1px solid rgba(245,158,11,0.30);
          animation: tia-slide-down 200ms ease-out;
        }

        /* List */
        .tia-list { display: flex; flex-direction: column; }
        .tia-list-header {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 10px 16px;
          border-bottom: 1px solid rgba(255,255,255,0.04);
          background: rgba(255,255,255,0.015);
        }
        .tia-checkbox {
          background: none; border: none; padding: 4px; cursor: pointer;
          color: rgba(148,163,184,0.65);
          display: flex; align-items: center; justify-content: center;
          border-radius: 6px;
          transition: background 140ms ease, color 140ms ease;
        }
        .tia-checkbox:hover { background: rgba(255,255,255,0.06); color: #f1f5f9; }

        /* Ticket row */
        .tia-row {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 12px 16px;
          border-bottom: 1px solid rgba(255,255,255,0.04);
          cursor: pointer;
          transition: background 140ms ease;
          animation: tia-slide-up 360ms ease-out backwards;
        }
        .tia-row:hover { background: rgba(245,158,11,0.05); }
        .tia-row-selected { background: rgba(245,158,11,0.08); }
        .tia-row:last-child { border-bottom: none; }
        .tia-row-main { flex: 1; min-width: 0; }
        .tia-row-title {
          font-size: 0.875rem; font-weight: 600;
          color: #f1f5f9;
          line-height: 1.3;
          overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
        }
        .tia-row-sub {
          display: flex; align-items: center; gap: 8px;
          margin-top: 3px;
          font-size: 0.75rem;
          color: rgba(148,163,184,0.75);
          flex-wrap: wrap;
        }
        .tia-row-meta {
          display: flex; align-items: center; gap: 6px;
          margin-top: 6px;
          flex-wrap: wrap;
        }

        /* Modal */
        .tia-modal-content {
          background: rgba(15, 23, 42, 0.85) !important;
          backdrop-filter: blur(18px) saturate(140%);
          -webkit-backdrop-filter: blur(18px) saturate(140%);
          border: 1px solid rgba(245,158,11,0.28);
        }
      `}</style>
    </>
  )
}

// =================================================================
// SUB-COMPONENTS
// =================================================================

function StatCard({
  label, value, icon: Icon, theme, delay,
}: {
  label: string
  value: string
  icon: React.ComponentType<{ size?: number }>
  theme: keyof typeof STAT_THEMES
  delay: number
}) {
  const tilt = useTilt(5)
  const cfg = STAT_THEMES[theme]
  return (
    <div
      ref={tilt.ref}
      onMouseMove={tilt.onMouseMove}
      onMouseLeave={tilt.onMouseLeave}
      style={{ transition: 'transform 260ms cubic-bezier(0.3, 0.5, 0.3, 1)' }}
    >
      <Card
        radius="lg" p="md" withBorder
        className="tia-stat-card"
        style={{
          animationDelay: `${delay}ms`,
          ['--tia-bar' as string]: cfg.bar,
          ['--tia-glow' as string]: cfg.glow,
          ['--tia-text' as string]: cfg.text,
        } as React.CSSProperties}
      >
        <Group gap="sm" align="center" wrap="nowrap">
          <ThemeIcon size="lg" radius="md" variant="light" color={cfg.color}>
            <Icon size={16} />
          </ThemeIcon>
          <Stack gap={2} style={{ minWidth: 0, flex: 1 }}>
            <Text className="tia-stat-value">{value}</Text>
            <Text size="xs" c="dimmed" tt="uppercase" fw={700}>{label}</Text>
          </Stack>
        </Group>
      </Card>
    </div>
  )
}

function TicketRow({
  ticket, index, selected, onToggleSelect, onOpen,
}: {
  ticket: TicketItem; index: number; selected: boolean
  onToggleSelect: () => void; onOpen: () => void
}) {
  const statusMeta = STATUS_META[ticket.status] || STATUS_META.OPEN
  const priorityColor = getPriorityColor(ticket.priority)
  const tags = ticket.tags ? ticket.tags.split(',').map((t) => t.trim()).filter(Boolean) : []
  const requesterName = [ticket.requesterFirstName, ticket.requesterLastName].filter(Boolean).join(' ') || 'Unknown'
  const msgCount = ticket._count?.messages ?? 0
  const noteCount = ticket._count?.internalNotes ?? 0

  return (
    <div
      className={`tia-row${selected ? ' tia-row-selected' : ''}`}
      style={{ animationDelay: `${Math.min(index * 25, 400)}ms` }}
      id={`ticket-${ticket.id}`}
    >
      <button
        className="tia-checkbox"
        onClick={(e) => { e.stopPropagation(); onToggleSelect() }}
        aria-label={selected ? 'Deselect' : 'Select'}
      >
        {selected
          ? <CheckSquare size={15} style={{ color: '#F59E0B' }} />
          : <Square size={15} />}
      </button>

      <Tooltip label={`Priority: ${ticket.priority}`} withArrow>
        <span
          style={{
            width: 10, height: 10, borderRadius: '50%', flexShrink: 0,
            background: priorityColor,
            boxShadow: `0 0 8px ${priorityColor}66`,
          }}
        />
      </Tooltip>

      <Avatar size="sm" radius="xl" style={{ background: ticket.createdBy.avatarColor, color: '#fff' }}>
        {getInitials(requesterName)}
      </Avatar>

      <div className="tia-row-main" onClick={onOpen}>
        <div className="tia-row-title">{ticket.title}</div>
        <div className="tia-row-sub">
          <Text component="span" size="xs" fw={500} c="gray.3">{requesterName}</Text>
          {ticket.requesterEmail && (
            <Group gap={3} component="span">
              <Mail size={10} style={{ color: 'rgba(148,163,184,0.6)' }} />
              <Text component="span" size="xs" c="dimmed">{ticket.requesterEmail}</Text>
            </Group>
          )}
          <Text component="span" size="xs" c="dimmed">#{ticket.id.slice(-6).toUpperCase()}</Text>
          <Text component="span" size="xs" c="dimmed">· {timeAgo(ticket.updatedAt)}</Text>
        </div>
        <div className="tia-row-meta">
          <Badge size="xs" variant="light" style={{ background: priorityColor + '24', color: priorityColor }}>
            {PRIORITY_META[ticket.priority]?.label || ticket.priority}
          </Badge>
          {ticket.category && (
            <Badge size="xs" variant="light" color="gray">{ticket.category}</Badge>
          )}
          {ticket.department && (
            <Badge
              size="xs"
              variant="light"
              style={{
                background: ticket.department.color + '20',
                color: ticket.department.color,
                border: `1px solid ${ticket.department.color}40`,
              }}
            >
              {ticket.department.name}
            </Badge>
          )}
          {tags.slice(0, 3).map((tag) => (
            <Badge key={tag} size="xs" variant="default" leftSection={<Tag size={9} />}>
              {tag}
            </Badge>
          ))}
          {msgCount > 0 && (
            <Group gap={3} component="span">
              <MessageSquare size={11} color="rgba(148,163,184,0.6)" />
              <Text component="span" size="xs" c="dimmed">{msgCount}</Text>
            </Group>
          )}
          {noteCount > 0 && (
            <Group gap={3} component="span">
              <StickyNote size={11} color="rgba(148,163,184,0.6)" />
              <Text component="span" size="xs" c="dimmed">{noteCount}</Text>
            </Group>
          )}
        </div>
      </div>

      <Group gap={6} align="center" wrap="nowrap" style={{ flexShrink: 0 }}>
        {ticket.assignedTo ? (
          <Tooltip label={ticket.assignedTo.name ?? 'Unnamed'} withArrow>
            <Avatar size="sm" radius="xl" style={{ background: ticket.assignedTo.avatarColor, color: '#fff' }}>
              {getInitials(ticket.assignedTo.name ?? 'U')}
            </Avatar>
          </Tooltip>
        ) : (
          <Group gap={4} align="center">
            <Users size={13} color="rgba(148,163,184,0.6)" />
            <Text component="span" size="xs" c="dimmed">Unassigned</Text>
          </Group>
        )}
      </Group>

      <Badge
        size="md"
        variant="light"
        style={{
          background: statusMeta.color + '24',
          color: statusMeta.color,
          flexShrink: 0,
          border: `1px solid ${statusMeta.color}40`,
        }}
        leftSection={statusMeta.icon}
      >
        {statusMeta.label}
      </Badge>
    </div>
  )
}
