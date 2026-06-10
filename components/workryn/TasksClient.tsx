'use client'

/**
 * TasksClient — Aurora rebuild (coral accent).
 *
 * Same Dashboard-grade pattern used on Time Clock:
 *   - Gradient-mesh hero with 3 drifting orbs + mouse spotlight
 *   - HUGE gradient title (coral→sunset) with subtitle
 *   - Right-side hero capsule with progress ring + stat cluster
 *   - Stat cards row: per-card accent bars (coral/violet/mint/orange),
 *     3D tilt, gradient-text values, count-ups
 *   - Glass filter bar (search + 2 selects)
 *   - 4-column kanban with glass column panels, coral drop highlights,
 *     gradient column accents, drag/drop, drop-line indicators
 *   - Task cards: glass surface, priority accent strip + corner glow,
 *     hover lift, Mantine Menu for per-card actions
 *   - Mantine Modal for create/edit
 *
 * All API endpoints preserved byte-for-byte:
 *   POST   /api/workryn/tasks
 *   PUT    /api/workryn/tasks/:id
 *   DELETE /api/workryn/tasks/:id
 *
 * Status set unchanged: TODO / IN_PROGRESS / IN_REVIEW / DONE
 * Priority set unchanged: URGENT / HIGH / MEDIUM / LOW
 */

import { useState, useRef, useEffect } from 'react'
import {
  ActionIcon,
  Avatar,
  Badge,
  Box,
  Button,
  Card,
  Container,
  Group,
  Menu,
  Modal,
  Paper,
  Select,
  SimpleGrid,
  Stack,
  Text,
  TextInput,
  Textarea,
  ThemeIcon,
  Title,
  Tooltip,
} from '@mantine/core'
import { useDisclosure } from '@mantine/hooks'
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  Filter,
  Flame,
  ListTodo,
  Loader2,
  MessageSquare,
  MoreHorizontal,
  Pencil,
  Plus,
  Search,
  Sparkles,
  Timer,
  Trash2,
  User as UserIcon,
} from 'lucide-react'
import { getPriorityColor, getInitials } from '@/lib/workryn/utils'
import { useCountUp } from '@/hooks/useCountUp'
import { useTilt, useMouseSpotlight } from '@/hooks/workrynEffects'

// ---------- Types ----------

type Task = {
  id: string; title: string; description: string | null
  status: string; priority: string; tags: string | null
  dueDate: string | null; createdAt: string
  assignedTo: { id: string; name: string | null; avatarColor: string } | null
  createdBy: { id: string; name: string | null }
  department: { id: string; name: string; color: string } | null
  _count: { comments: number }
}
type UserType = { id: string; name: string | null; avatarColor: string; jobTitle: string | null }
type Department = { id: string; name: string; color: string }

interface Props {
  initialTasks: Task[]
  users: UserType[]
  departments: Department[]
  currentUserId: string
}

const COLUMNS = [
  { id: 'TODO',        label: 'To Do',       color: '#64748B', gradient: 'linear-gradient(90deg,#94a3b8,#64748B)', icon: ListTodo },
  { id: 'IN_PROGRESS', label: 'In Progress', color: '#06B6D4', gradient: 'linear-gradient(90deg,#67e8f9,#06B6D4)', icon: Timer },
  { id: 'IN_REVIEW',   label: 'In Review',   color: '#F59E0B', gradient: 'linear-gradient(90deg,#fcd34d,#F59E0B)', icon: Clock },
  { id: 'DONE',        label: 'Done',        color: '#10B981', gradient: 'linear-gradient(90deg,#6ee7b7,#10B981)', icon: CheckCircle2 },
] as const

const PRIORITIES = ['URGENT', 'HIGH', 'MEDIUM', 'LOW'] as const

const STAT_THEMES = {
  coral:  { bar: 'linear-gradient(90deg,#fda4af,#FB7185)', glow: 'rgba(251,113,133,0.35)', text: 'linear-gradient(135deg,#fda4af,#FB7185)', color: 'coral'  as const },
  violet: { bar: 'linear-gradient(90deg,#a78bfa,#7C3AED)', glow: 'rgba(124,58,237,0.35)',  text: 'linear-gradient(135deg,#c4b5fd,#7C3AED)', color: 'violet' as const },
  mint:   { bar: 'linear-gradient(90deg,#6ee7b7,#10B981)', glow: 'rgba(52,211,153,0.35)',  text: 'linear-gradient(135deg,#6ee7b7,#10B981)', color: 'mint'   as const },
  amber:  { bar: 'linear-gradient(90deg,#fbbf24,#F59E0B)', glow: 'rgba(245,158,11,0.35)',  text: 'linear-gradient(135deg,#fcd34d,#F59E0B)', color: 'orange' as const },
} as const

// ---------- SVG Progress Ring ----------

function ProgressRing({ percent, size = 100, stroke = 8 }: { percent: number; size?: number; stroke?: number }) {
  const r = (size - stroke) / 2
  const circ = 2 * Math.PI * r
  const offset = circ - (percent / 100) * circ
  return (
    <svg width={size} height={size} className="tka-ring">
      <defs>
        <linearGradient id="tkaRingGrad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%"   stopColor="#fda4af" />
          <stop offset="100%" stopColor="#FB7185" />
        </linearGradient>
      </defs>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={stroke} />
      <circle
        cx={size / 2} cy={size / 2} r={r} fill="none"
        stroke="url(#tkaRingGrad)" strokeWidth={stroke}
        strokeDasharray={circ} strokeDashoffset={offset} strokeLinecap="round"
        style={{ transition: 'stroke-dashoffset 1.5s cubic-bezier(0.34,1.56,0.64,1) 0.3s', transform: 'rotate(-90deg)', transformOrigin: '50% 50%' }}
      />
    </svg>
  )
}

// =================================================================
// MAIN
// =================================================================

export default function TasksClient({ initialTasks, users, departments, currentUserId: _currentUserId }: Props) {
  const [tasks, setTasks] = useState<Task[]>(initialTasks)
  const [search, setSearch] = useState('')
  const [filterPriority, setFilterPriority] = useState<string | null>(null)
  const [filterAssignee, setFilterAssignee] = useState<string | null>(null)
  const [modalOpened, modal] = useDisclosure(false)
  const [editTask, setEditTask] = useState<Task | null>(null)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({ title: '', description: '', priority: 'MEDIUM', assignedToId: '', departmentId: '', dueDate: '', tags: '' })

  // Drag state
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [dragOverCol, setDragOverCol] = useState<string | null>(null)
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null)

  const spot = useMouseSpotlight()

  const filtered = tasks.filter((t) => {
    const q = search.toLowerCase()
    if (search && !t.title.toLowerCase().includes(q)) return false
    if (filterPriority && t.priority !== filterPriority) return false
    if (filterAssignee && t.assignedTo?.id !== filterAssignee) return false
    return true
  })
  const byStatus = (status: string) => filtered.filter((t) => t.status === status)

  // Stats
  const totalDone = tasks.filter((t) => t.status === 'DONE').length
  const totalInProgress = tasks.filter((t) => t.status === 'IN_PROGRESS').length
  const urgentCount = tasks.filter((t) => t.priority === 'URGENT' || t.priority === 'HIGH').length
  const pct = tasks.length > 0 ? Math.round((totalDone / tasks.length) * 100) : 0

  const animTotal  = useCountUp(tasks.length, 800)
  const animActive = useCountUp(totalInProgress, 800)
  const animDone   = useCountUp(totalDone, 800)
  const animPct    = useCountUp(pct, 1000)
  const animUrgent = useCountUp(urgentCount, 800)

  // ---------- Handlers (API contracts preserved) ----------

  function openCreate() {
    setEditTask(null)
    setForm({ title: '', description: '', priority: 'MEDIUM', assignedToId: '', departmentId: '', dueDate: '', tags: '' })
    modal.open()
  }
  function openEdit(task: Task) {
    setEditTask(task)
    setForm({
      title: task.title,
      description: task.description ?? '',
      priority: task.priority,
      assignedToId: task.assignedTo?.id ?? '',
      departmentId: task.department?.id ?? '',
      dueDate: task.dueDate ? task.dueDate.slice(0, 10) : '',
      tags: task.tags ?? '',
    })
    modal.open()
  }
  async function handleSave() {
    if (!form.title.trim()) return
    setSaving(true)
    try {
      if (editTask) {
        const res = await fetch(`/api/workryn/tasks/${editTask.id}`, {
          method: 'PUT', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(form),
        })
        const updated = await res.json()
        setTasks((t) => t.map((x) => (x.id === editTask.id ? { ...x, ...updated } : x)))
      } else {
        const res = await fetch('/api/workryn/tasks', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(form),
        })
        const created = await res.json()
        setTasks((t) => [created, ...t])
      }
      modal.close()
    } finally { setSaving(false) }
  }
  async function handleStatusChange(taskId: string, newStatus: string) {
    setTasks((t) => t.map((x) => (x.id === taskId ? { ...x, status: newStatus } : x)))
    const res = await fetch(`/api/workryn/tasks/${taskId}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: newStatus }),
    })
    if (res.ok) {
      const updated = await res.json()
      setTasks((t) => t.map((x) => (x.id === taskId ? { ...x, ...updated } : x)))
    }
  }
  async function handleDelete(taskId: string) {
    await fetch(`/api/workryn/tasks/${taskId}`, { method: 'DELETE' })
    setTasks((t) => t.filter((x) => x.id !== taskId))
  }

  // Drag handlers
  function handleDragOver(e: React.DragEvent, colId: string, idx: number) {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    setDragOverCol(colId)
    setDragOverIndex(idx)
  }
  function handleDrop(e: React.DragEvent, colId: string) {
    e.preventDefault()
    const taskId = e.dataTransfer.getData('taskId')
    if (!taskId) return
    setDraggingId(null); setDragOverCol(null); setDragOverIndex(null)
    handleStatusChange(taskId, colId)
  }
  function handleDragLeave(e: React.DragEvent) {
    const rel = e.relatedTarget as Node | null
    if (!rel || !(e.currentTarget as HTMLElement).contains(rel)) {
      setDragOverCol(null); setDragOverIndex(null)
    }
  }

  return (
    <>
      <Container size="xl" py="lg" className="tka-root">

        {/* ============ HERO ============ */}
        <div ref={spot.ref} onMouseMove={spot.onMouseMove} style={{ marginBottom: 20 }}>
          <Paper radius="lg" p="xl" className="tka-hero">
            <div className="tka-hero-mesh" aria-hidden />
            <div className="tka-hero-orbs" aria-hidden>
              <span className="tka-orb tka-orb-1" />
              <span className="tka-orb tka-orb-2" />
              <span className="tka-orb tka-orb-3" />
            </div>
            <div className="tka-hero-spotlight" aria-hidden />

            <img src="/heroes/tasks.svg" alt="" aria-hidden="true" style={{ position: "absolute", right: "8%", top: "50%", transform: "translateY(-50%)", height: "75%", zIndex: 0, opacity: 0.45, pointerEvents: "none" }} />

            <Group justify="space-between" align="flex-start" wrap="wrap" gap="lg" style={{ position: 'relative', zIndex: 2 }}>
              <Stack gap={6} style={{ minWidth: 0, flex: 1 }}>
                <Group gap={8} align="center">
                  <ListTodo size={14} style={{ color: 'rgba(253,164,175,0.85)' }} />
                  <Text size="xs" tt="uppercase" fw={700} c="coral.3" style={{ letterSpacing: '0.12em' }}>
                    Tasks
                  </Text>
                </Group>
                <Title order={1} className="tka-hero-title">
                  {animTotal} {animTotal === 1 ? 'task' : 'tasks'}
                </Title>
                <Text size="sm" c="dimmed">
                  {animDone} done · {animActive} in progress · across {COLUMNS.length} stages
                </Text>
                <Button
                  size="md"
                  mt="sm"
                  leftSection={<Plus size={16} />}
                  onClick={openCreate}
                  className="tka-btn-primary"
                  style={{ alignSelf: 'flex-start' }}
                >
                  New Task
                </Button>
              </Stack>

              {/* Progress ring capsule */}
              <Paper radius="md" p="md" className="tka-ring-capsule">
                <Group gap="md" align="center">
                  <div className="tka-ring-wrap">
                    <ProgressRing percent={pct} size={88} stroke={7} />
                    <div className="tka-ring-label">
                      <Text size="lg" fw={800} style={{ lineHeight: 1 }}>{animPct}%</Text>
                      <Text size="xs" c="dimmed" tt="uppercase" fw={700}>done</Text>
                    </div>
                  </div>
                  <Stack gap={2}>
                    <Text size="xs" c="dimmed" tt="uppercase" fw={700}>Completion</Text>
                    <Text size="sm" fw={700}>{totalDone}/{tasks.length}</Text>
                    <Text size="xs" c="dimmed">{tasks.length - totalDone} remaining</Text>
                  </Stack>
                </Group>
              </Paper>
            </Group>
          </Paper>
        </div>

        {/* ============ STAT CARDS ============ */}
        <SimpleGrid cols={{ base: 2, md: 4 }} spacing="sm" mb="md">
          <StatCard label="Total"        value={String(animTotal)}    icon={ListTodo}     theme="coral"  delay={0}   />
          <StatCard label="In Progress"  value={String(animActive)}   icon={Timer}        theme="violet" delay={80}  />
          <StatCard label="Done"         value={String(animDone)}     icon={CheckCircle2} theme="mint"   delay={160} />
          <StatCard label="Urgent"       value={String(animUrgent)}   icon={Flame}        theme="amber"  delay={240} />
        </SimpleGrid>

        {/* ============ FILTER BAR ============ */}
        <Card radius="lg" p="md" withBorder mb="md" className="tka-panel">
          <Group gap="sm" align="center" wrap="wrap">
            <TextInput
              placeholder="Search tasks..."
              value={search}
              onChange={(e) => setSearch(e.currentTarget.value)}
              leftSection={<Search size={14} />}
              style={{ flex: 1, minWidth: 180 }}
            />
            <Group gap="xs" wrap="nowrap">
              <Filter size={14} style={{ color: 'rgba(148,163,184,0.6)' }} />
              <Select
                value={filterPriority}
                onChange={setFilterPriority}
                data={[{ value: '', label: 'All priorities' }, ...PRIORITIES.map((p) => ({ value: p, label: p.charAt(0) + p.slice(1).toLowerCase() }))]}
                placeholder="All priorities"
                clearable
                w={140}
              />
              <Select
                value={filterAssignee}
                onChange={setFilterAssignee}
                data={[{ value: '', label: 'All assignees' }, ...users.map((u) => ({ value: u.id, label: u.name ?? 'Unnamed' }))]}
                placeholder="All assignees"
                clearable
                w={160}
                searchable
              />
            </Group>
          </Group>
        </Card>

        {/* ============ KANBAN BOARD ============ */}
        <div className="tka-board">
          {COLUMNS.map((col, colIdx) => {
            const colTasks = byStatus(col.id)
            const isDragTarget = dragOverCol === col.id
            const ColIcon = col.icon
            return (
              <div
                key={col.id}
                className={`tka-col${isDragTarget ? ' tka-col-drop' : ''}`}
                style={{ animationDelay: `${colIdx * 70}ms` }}
                onDragOver={(e) => handleDragOver(e, col.id, colTasks.length)}
                onDragLeave={handleDragLeave}
                onDrop={(e) => handleDrop(e, col.id)}
              >
                <div className="tka-col-accent" style={{ background: col.gradient }} />
                <Group justify="space-between" align="center" px="sm" py="xs" className="tka-col-header">
                  <Group gap={8} align="center">
                    <ThemeIcon size="sm" radius="md" variant="light" style={{ background: `${col.color}20`, color: col.color }}>
                      <ColIcon size={12} />
                    </ThemeIcon>
                    <Text size="sm" fw={600} c="white">{col.label}</Text>
                    <Badge variant="light" size="xs" color="gray">{colTasks.length}</Badge>
                  </Group>
                  <Tooltip label={`New ${col.label} task`} withArrow>
                    <ActionIcon size="sm" variant="subtle" color="coral" onClick={openCreate}>
                      <Plus size={14} />
                    </ActionIcon>
                  </Tooltip>
                </Group>

                <div className="tka-col-cards">
                  {colTasks.length === 0 && (
                    <div className={`tka-empty${isDragTarget ? ' tka-empty-active' : ''}`}>
                      {isDragTarget ? 'Drop here' : 'No tasks'}
                    </div>
                  )}
                  {colTasks.map((task, i) => (
                    <div
                      key={task.id}
                      className={`tka-card-wrap${draggingId === task.id ? ' tka-dragging' : ''}`}
                      onDragOver={(e) => { e.preventDefault(); setDragOverCol(col.id); setDragOverIndex(i) }}
                    >
                      {isDragTarget && dragOverIndex === i && draggingId !== task.id && <div className="tka-drop-line" />}
                      <TaskCard
                        task={task}
                        columns={COLUMNS as unknown as { id: string; label: string }[]}
                        onClick={() => openEdit(task)}
                        onMove={(s) => handleStatusChange(task.id, s)}
                        onEdit={() => openEdit(task)}
                        onDelete={() => handleDelete(task.id)}
                        onDragStart={() => setDraggingId(task.id)}
                        onDragEnd={() => { setDraggingId(null); setDragOverCol(null); setDragOverIndex(null) }}
                      />
                    </div>
                  ))}
                  {isDragTarget && colTasks.length > 0 && dragOverIndex === colTasks.length && <div className="tka-drop-line" />}
                </div>
              </div>
            )
          })}
        </div>
      </Container>

      {/* ============ MODAL ============ */}
      <Modal
        opened={modalOpened}
        onClose={modal.close}
        title={editTask ? 'Edit Task' : 'New Task'}
        size="lg"
        radius="lg"
        overlayProps={{ backgroundOpacity: 0.55, blur: 4 }}
        classNames={{ content: 'tka-modal-content' }}
      >
        <Stack gap="md">
          <TextInput
            label="Title"
            placeholder="What needs to be done?"
            value={form.title}
            onChange={(e) => setForm((f) => ({ ...f, title: e.currentTarget.value }))}
            required
            autoFocus
          />
          <Textarea
            label="Description"
            value={form.description}
            onChange={(e) => setForm((f) => ({ ...f, description: e.currentTarget.value }))}
            minRows={3}
            autosize
            maxRows={6}
          />
          <Group grow>
            <Select
              label="Priority"
              value={form.priority}
              onChange={(v) => setForm((f) => ({ ...f, priority: v ?? 'MEDIUM' }))}
              data={PRIORITIES.map((p) => ({ value: p, label: p.charAt(0) + p.slice(1).toLowerCase() }))}
            />
            <TextInput
              label="Due Date"
              type="date"
              value={form.dueDate}
              onChange={(e) => setForm((f) => ({ ...f, dueDate: e.currentTarget.value }))}
            />
          </Group>
          <Group grow>
            <Select
              label="Assign to"
              value={form.assignedToId}
              onChange={(v) => setForm((f) => ({ ...f, assignedToId: v ?? '' }))}
              data={[{ value: '', label: 'Unassigned' }, ...users.map((u) => ({ value: u.id, label: u.name ?? 'Unnamed' }))]}
              searchable
            />
            <Select
              label="Department"
              value={form.departmentId}
              onChange={(v) => setForm((f) => ({ ...f, departmentId: v ?? '' }))}
              data={[{ value: '', label: 'None' }, ...departments.map((d) => ({ value: d.id, label: d.name }))]}
            />
          </Group>
          <TextInput
            label="Tags"
            description="Comma separated"
            value={form.tags}
            onChange={(e) => setForm((f) => ({ ...f, tags: e.currentTarget.value }))}
          />
          <Group justify="flex-end" mt="sm">
            <Button variant="subtle" color="gray" onClick={modal.close}>Cancel</Button>
            <Button
              loading={saving}
              disabled={!form.title.trim()}
              onClick={handleSave}
              className="tka-btn-primary"
            >
              {editTask ? 'Save Changes' : 'Create Task'}
            </Button>
          </Group>
        </Stack>
      </Modal>

      {/* ============ STYLES ============ */}
      <style>{`
        @keyframes tka-slide-up { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes tka-mesh-drift {
          0%, 100% { transform: translate(0,0) scale(1); }
          50%      { transform: translate(3%, -2%) scale(1.05); }
        }
        @keyframes tka-orb-a { 0%,100%{transform:translate(0,0)} 50%{transform:translate(40px,-30px)} }
        @keyframes tka-orb-b { 0%,100%{transform:translate(0,0)} 50%{transform:translate(-30px,25px)} }
        @keyframes tka-orb-c { 0%,100%{transform:translate(0,0)} 50%{transform:translate(20px,40px)} }
        @media (prefers-reduced-motion: reduce) {
          .tka-root *, .tka-root *::before, .tka-root *::after {
            animation: none !important;
            transition: none !important;
          }
        }

        /* -------------- HERO -------------- */
        .tka-hero {
          position: relative;
          overflow: hidden;
          border: 1px solid rgba(251,113,133,0.30);
          background:
            linear-gradient(135deg, rgba(251,113,133,0.16) 0%, rgba(244,114,182,0.10) 50%, rgba(124,58,237,0.06) 100%),
            rgba(11,15,30,0.55);
          backdrop-filter: blur(14px) saturate(140%);
          -webkit-backdrop-filter: blur(14px) saturate(140%);
          box-shadow: 0 20px 60px -20px rgba(251,113,133,0.35), 0 1px 0 rgba(255,255,255,0.05) inset;
          animation: tka-slide-up 460ms ease-out backwards;
        }
        .tka-hero-mesh {
          position: absolute; inset: -25%;
          background:
            radial-gradient(circle at 22% 30%, rgba(251,113,133,0.45), transparent 42%),
            radial-gradient(circle at 78% 25%, rgba(244,114,182,0.30), transparent 47%),
            radial-gradient(circle at 62% 82%, rgba(124,58,237,0.20), transparent 52%);
          filter: blur(40px);
          animation: tka-mesh-drift 22s ease-in-out infinite;
          z-index: 0;
          pointer-events: none;
        }
        .tka-hero-orbs { position: absolute; inset: 0; z-index: 0; pointer-events: none; }
        .tka-orb { position: absolute; border-radius: 50%; filter: blur(22px); opacity: 0.55; mix-blend-mode: screen; }
        .tka-orb-1 { width: 130px; height: 130px; top: 12%; left: 8%;
          background: radial-gradient(circle, #fda4af 0%, transparent 70%);
          animation: tka-orb-a 14s ease-in-out infinite; }
        .tka-orb-2 { width: 100px; height: 100px; top: 55%; left: 60%;
          background: radial-gradient(circle, #f472b6 0%, transparent 70%);
          animation: tka-orb-b 16s ease-in-out infinite; }
        .tka-orb-3 { width: 80px; height: 80px; bottom: 10%; right: 12%;
          background: radial-gradient(circle, #a855f7 0%, transparent 70%);
          animation: tka-orb-c 18s ease-in-out infinite; }
        .tka-hero-spotlight {
          position: absolute; inset: 0; z-index: 1; pointer-events: none;
          background: radial-gradient(circle 360px at var(--mx, 50%) var(--my, 50%), rgba(255,255,255,0.10), transparent 60%);
        }
        .tka-hero-title {
          font-size: clamp(2.25rem, 6vw, 4rem);
          font-weight: 800;
          letter-spacing: -0.035em;
          line-height: 1;
          margin: 0;
          font-variant-numeric: tabular-nums;
          background: linear-gradient(135deg, #ffffff 0%, #fda4af 50%, #FB7185 100%);
          -webkit-background-clip: text; background-clip: text;
          -webkit-text-fill-color: transparent;
          filter: drop-shadow(0 2px 16px rgba(251,113,133,0.45));
        }

        /* Ring capsule */
        .tka-ring-capsule {
          background: rgba(15,23,42,0.65);
          backdrop-filter: blur(12px) saturate(140%);
          -webkit-backdrop-filter: blur(12px) saturate(140%);
          border: 1px solid rgba(255,255,255,0.08);
        }
        .tka-ring-wrap { position: relative; width: 88px; height: 88px; }
        .tka-ring { display: block; }
        .tka-ring-label {
          position: absolute; inset: 0;
          display: flex; flex-direction: column; align-items: center; justify-content: center;
        }

        /* Primary action button */
        .tka-btn-primary {
          background: linear-gradient(135deg, #FB7185 0%, #f472b6 100%);
          box-shadow: 0 6px 18px rgba(251,113,133,0.40);
          transition: transform 180ms ease, box-shadow 180ms ease;
          color: #fff;
        }
        .tka-btn-primary:hover {
          transform: translateY(-1px);
          box-shadow: 0 10px 28px rgba(251,113,133,0.55);
        }

        /* -------------- Stat cards -------------- */
        .tka-stat-card {
          position: relative;
          overflow: hidden;
          background: rgba(15, 23, 42, 0.55);
          backdrop-filter: blur(12px) saturate(140%);
          -webkit-backdrop-filter: blur(12px) saturate(140%);
          transition: box-shadow 260ms ease, border-color 220ms ease;
          animation: tka-slide-up 500ms ease-out backwards;
          will-change: transform;
        }
        .tka-stat-card::before {
          content: ''; position: absolute; top: 0; left: 0; right: 0; height: 3px;
          background: var(--tka-bar);
        }
        .tka-stat-card:hover {
          box-shadow: 0 14px 36px var(--tka-glow, rgba(251,113,133,0.35));
        }
        .tka-stat-value {
          font-size: clamp(1.5rem, 2.5vw, 1.9rem);
          font-weight: 800;
          line-height: 1;
          letter-spacing: -0.03em;
          font-variant-numeric: tabular-nums;
          background: var(--tka-text);
          -webkit-background-clip: text; background-clip: text;
          -webkit-text-fill-color: transparent;
        }

        /* -------------- Glass panel -------------- */
        .tka-panel {
          background: rgba(15, 23, 42, 0.55);
          backdrop-filter: blur(14px) saturate(140%);
          -webkit-backdrop-filter: blur(14px) saturate(140%);
          animation: tka-slide-up 500ms ease-out backwards;
        }

        /* -------------- Board -------------- */
        .tka-board {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 14px;
        }
        @media (max-width: 1100px) { .tka-board { grid-template-columns: repeat(2, 1fr); } }
        @media (max-width: 640px)  { .tka-board { grid-template-columns: 1fr; } }

        .tka-col {
          background: rgba(15, 23, 42, 0.45);
          backdrop-filter: blur(12px) saturate(140%);
          -webkit-backdrop-filter: blur(12px) saturate(140%);
          border: 1px solid rgba(255, 255, 255, 0.06);
          border-radius: 16px;
          display: flex;
          flex-direction: column;
          overflow: hidden;
          transition: border-color 0.25s ease, box-shadow 0.25s ease;
          animation: tka-slide-up 460ms ease-out backwards;
          min-height: 280px;
        }
        .tka-col:hover {
          border-color: rgba(251,113,133,0.25);
          box-shadow: 0 8px 26px rgba(251,113,133,0.10);
        }
        .tka-col-drop {
          border-color: rgba(251,113,133,0.55) !important;
          box-shadow: 0 0 0 2px rgba(251,113,133,0.18), 0 0 30px rgba(251,113,133,0.15) !important;
        }
        .tka-col-accent { height: 3px; flex-shrink: 0; }
        .tka-col-header { border-bottom: 1px solid rgba(255,255,255,0.05); }
        .tka-col-cards {
          flex: 1;
          padding: 8px;
          display: flex;
          flex-direction: column;
          gap: 6px;
          overflow-y: auto;
          max-height: calc(100vh - 480px);
          min-height: 200px;
        }
        .tka-empty {
          display: flex; align-items: center; justify-content: center;
          height: 70px; font-size: 0.8125rem; color: rgba(148,163,184,0.6);
          border: 2px dashed rgba(255,255,255,0.08); border-radius: 12px;
          transition: all 0.2s ease;
        }
        .tka-empty-active {
          border-color: rgba(251,113,133,0.55);
          background: rgba(251,113,133,0.06);
          color: rgba(251,113,133,0.85);
        }
        .tka-card-wrap { position: relative; }
        .tka-dragging { opacity: 0.3; }
        .tka-drop-line {
          height: 3px;
          background: linear-gradient(90deg, rgba(251,113,133,0.2), rgba(251,113,133,0.8), rgba(251,113,133,0.2));
          border-radius: 99px;
          margin: 2px 0;
          box-shadow: 0 0 8px rgba(251,113,133,0.4);
        }

        /* -------------- Task card -------------- */
        .tka-card {
          position: relative;
          overflow: hidden;
          background: rgba(255,255,255,0.05);
          border: 1px solid rgba(255,255,255,0.06);
          border-radius: 12px;
          padding: 11px 11px 11px 16px;
          cursor: grab;
          user-select: none;
          transition: all 0.2s cubic-bezier(0.4,0,0.2,1);
        }
        .tka-card:active { cursor: grabbing; }
        .tka-card:hover {
          border-color: rgba(251,113,133,0.30);
          transform: translateY(-2px);
          box-shadow: 0 10px 28px rgba(0,0,0,0.25), 0 0 18px rgba(251,113,133,0.10);
          background: rgba(255,255,255,0.07);
        }
        .tka-card-accent {
          position: absolute; top: 0; left: 0;
          width: 3px; height: 100%;
          border-radius: 10px 0 0 10px;
          opacity: 0.85;
        }
        .tka-card-glow {
          position: absolute; top: 50%; left: -6px;
          width: 12px; height: 40%;
          border-radius: 50%;
          filter: blur(12px);
          opacity: 0.25;
          transform: translateY(-50%);
          pointer-events: none;
        }
        .tka-card:hover .tka-card-glow { opacity: 0.50; }
        .tka-card-title {
          font-size: 0.8125rem;
          font-weight: 500;
          color: #f1f5f9;
          line-height: 1.35;
          flex: 1; min-width: 0;
        }
        .tka-card-desc {
          font-size: 0.75rem;
          color: rgba(148,163,184,0.85);
          line-height: 1.35;
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
          overflow: hidden;
        }

        .tka-due-overdue { color: #ef4444 !important; font-weight: 600; }

        /* Modal */
        .tka-modal-content {
          background: rgba(15, 23, 42, 0.85) !important;
          backdrop-filter: blur(18px) saturate(140%);
          -webkit-backdrop-filter: blur(18px) saturate(140%);
          border: 1px solid rgba(251,113,133,0.25);
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
        radius="lg"
        p="md"
        withBorder
        className="tka-stat-card"
        style={{
          animationDelay: `${delay}ms`,
          ['--tka-bar' as string]: cfg.bar,
          ['--tka-glow' as string]: cfg.glow,
          ['--tka-text' as string]: cfg.text,
        } as React.CSSProperties}
      >
        <Group gap="sm" align="center" wrap="nowrap">
          <ThemeIcon size="lg" radius="md" variant="light" color={cfg.color}>
            <Icon size={16} />
          </ThemeIcon>
          <Stack gap={2} style={{ minWidth: 0, flex: 1 }}>
            <Text className="tka-stat-value">{value}</Text>
            <Text size="xs" c="dimmed" tt="uppercase" fw={700}>{label}</Text>
          </Stack>
        </Group>
      </Card>
    </div>
  )
}

function TaskCard({
  task, columns, onClick, onMove, onEdit, onDelete, onDragStart, onDragEnd,
}: {
  task: Task
  columns: { id: string; label: string }[]
  onClick: () => void
  onMove: (status: string) => void
  onEdit: () => void
  onDelete: () => void
  onDragStart: () => void
  onDragEnd: () => void
}) {
  const isOverdue = task.dueDate && task.status !== 'DONE' && new Date(task.dueDate) < new Date()
  const tags = task.tags ? task.tags.split(',').map((t) => t.trim()).filter(Boolean) : []
  const prioColor = getPriorityColor(task.priority)

  return (
    <div
      className="tka-card"
      draggable
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = 'move'
        e.dataTransfer.setData('taskId', task.id)
        onDragStart()
        e.dataTransfer.setDragImage(e.currentTarget as HTMLElement, (e.currentTarget as HTMLElement).offsetWidth / 2, 20)
      }}
      onDragEnd={onDragEnd}
      onClick={onClick}
    >
      <div className="tka-card-accent" style={{ background: prioColor }} />
      <div className="tka-card-glow" style={{ background: prioColor }} />

      <Group gap={6} align="flex-start" wrap="nowrap" mb={4}>
        <span
          style={{
            width: 8, height: 8, borderRadius: '50%', flexShrink: 0, marginTop: 5,
            background: prioColor, boxShadow: `0 0 8px ${prioColor}88`,
          }}
        />
        <Text className="tka-card-title" style={{ flex: 1 }}>{task.title}</Text>

        <Menu shadow="md" position="bottom-end" withinPortal>
          <Menu.Target>
            <ActionIcon
              size="sm"
              variant="subtle"
              color="gray"
              onClick={(e) => e.stopPropagation()}
            >
              <MoreHorizontal size={14} />
            </ActionIcon>
          </Menu.Target>
          <Menu.Dropdown onClick={(e) => e.stopPropagation()}>
            <Menu.Label>Move to</Menu.Label>
            {columns.filter((c) => c.id !== task.status).map((c) => (
              <Menu.Item key={c.id} onClick={() => onMove(c.id)}>{c.label}</Menu.Item>
            ))}
            <Menu.Divider />
            <Menu.Item leftSection={<Pencil size={13} />} onClick={onEdit}>Edit</Menu.Item>
            <Menu.Item leftSection={<Trash2 size={13} />} color="red" onClick={onDelete}>Delete</Menu.Item>
          </Menu.Dropdown>
        </Menu>
      </Group>

      {task.description && <Text className="tka-card-desc" mb={6}>{task.description}</Text>}

      {tags.length > 0 && (
        <Group gap={4} mb={6}>
          {tags.slice(0, 3).map((tag) => (
            <Badge key={tag} size="xs" variant="light" color="gray">{tag}</Badge>
          ))}
        </Group>
      )}

      {task.department && (
        <Box mb={6}>
          <Badge
            size="xs"
            variant="light"
            style={{
              background: task.department.color + '20',
              color: task.department.color,
              border: `1px solid ${task.department.color}40`,
            }}
          >
            {task.department.name}
          </Badge>
        </Box>
      )}

      <Group justify="space-between" align="center" mt={6} pt={6} style={{ borderTop: '1px solid rgba(255,255,255,0.04)' }}>
        <Group gap={6} align="center">
          {task.assignedTo ? (
            <Tooltip label={task.assignedTo.name ?? 'Unnamed'} withArrow>
              <Avatar
                size="xs"
                radius="xl"
                style={{ background: task.assignedTo.avatarColor, color: '#fff', fontSize: '0.5625rem', fontWeight: 600 }}
              >
                {getInitials(task.assignedTo.name ?? 'U')}
              </Avatar>
            </Tooltip>
          ) : (
            <UserIcon size={14} color="rgba(148,163,184,0.6)" />
          )}
          {task._count.comments > 0 && (
            <Group gap={3} align="center">
              <MessageSquare size={11} color="rgba(148,163,184,0.6)" />
              <Text size="xs" c="dimmed">{task._count.comments}</Text>
            </Group>
          )}
        </Group>
        {task.dueDate && (
          <Group gap={3} align="center" className={isOverdue ? 'tka-due-overdue' : ''}>
            {isOverdue && <AlertCircle size={11} color="#ef4444" />}
            <Clock size={11} color={isOverdue ? '#ef4444' : 'rgba(148,163,184,0.6)'} />
            <Text size="xs" c={isOverdue ? 'red' : 'dimmed'} fw={isOverdue ? 600 : 400}>
              {new Date(task.dueDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
            </Text>
          </Group>
        )}
      </Group>
    </div>
  )
}
