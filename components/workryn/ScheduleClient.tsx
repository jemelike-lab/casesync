'use client'

/**
 * ScheduleClient — Aurora rebuild (sky accent).
 *
 * Structurally distinct from Tasks/TimeClock: the calendar grid IS
 * the page. No stat-tile row; the nav controls + view toggle live
 * inside the hero so the grid below gets all the visual weight.
 *
 *   - Sky gradient-mesh hero with 3 drifting orbs + spotlight.
 *   - HUGE gradient title shows the current period
 *     ('May 25 – May 31, 2026' or 'May 2026' or full date for day view).
 *   - Hero controls row: prev/today/next + SegmentedControl
 *     (Month/Week/Day) + manager-only staff filter +
 *     'New Shift' gradient button.
 *   - Glass calendar panel containing the active view's grid.
 *   - Month view: 7-col grid of day cells with up-to-3 shift chips +
 *     '+N more'. Today cell highlighted with sky ring + glow.
 *   - Week view: sticky 'STAFF' column on the left, 7 day columns;
 *     each cell contains that user's shifts for that day. Optional
 *     'Unassigned' row at the top if there are open shifts that week.
 *   - Day view: vertical list of staff rows with shift chips. Empty
 *     manager rows show '+ Add shift' dashed button.
 *   - Shifts are glass chips that keep their per-shift color as a
 *     left stripe + 12%-alpha background tint.
 *   - Manager-only Mantine Modal for create/edit/delete shift.
 *
 * API contracts preserved:
 *   POST   /api/workryn/shifts            (also handles update; body.id = editing id)
 *   DELETE /api/workryn/shifts/:id
 */

import { useState } from 'react'
import {
  ActionIcon,
  Avatar,
  Badge,
  Box,
  Button,
  Card,
  ColorSwatch,
  Container,
  Group,
  Loader,
  Modal,
  Paper,
  SegmentedControl,
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
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  Clock,
  Plus,
  Trash2,
  Users,
  X,
} from 'lucide-react'
import { getInitials } from '@/lib/workryn/utils'
import { useMouseSpotlight } from '@/hooks/workrynEffects'

// ---------- Types ----------

type ViewMode = 'month' | 'week' | 'day'

type Shift = {
  id: string; title: string; notes: string | null
  startTime: string; endTime: string; color: string
  departmentId: string | null
  user: { id: string; name: string | null; avatarColor: string; jobTitle: string | null } | null
}
type StaffUser = { id: string; name: string | null; avatarColor: string; role: string; jobTitle: string | null }
type Department = { id: string; name: string; color: string }

interface Props {
  initialShifts: Shift[]
  users: StaffUser[]
  departments: Department[]
  currentUser: { id: string; role: string }
  weekStart: string
}

const SHIFT_COLORS = ['#06B6D4', '#10b981', '#F59E0B', '#FB7185', '#7C3AED', '#0EA5E9', '#f97316'] as const
const DAYS_SHORT  = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December']

// ---------- Helpers ----------

function canManageSchedule(role: string): boolean {
  return ['ADMIN', 'MANAGER', 'OWNER', 'SUPERVISOR', 'TEAM_MANAGER'].includes(role)
}
function canViewAllStaff(role: string): boolean {
  return ['ADMIN', 'MANAGER', 'OWNER', 'SUPERVISOR', 'TEAM_MANAGER'].includes(role)
}
function getRoleLabel(role: string): string {
  const map: Record<string, string> = {
    SUPPORT_PLANNER: 'Support Planner', TEAM_MANAGER: 'Team Manager',
    SUPERVISOR: 'Supervisor', STAFF: 'Staff', ADMIN: 'Admin', MANAGER: 'Manager', OWNER: 'Owner',
  }
  return map[role] ?? role
}
function fmt(iso: string) {
  return new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
}
function sameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}
function startOfMonth(d: Date) { return new Date(d.getFullYear(), d.getMonth(), 1) }
function endOfMonth(d: Date)   { return new Date(d.getFullYear(), d.getMonth() + 1, 0) }
function startOfWeek(d: Date) {
  const c = new Date(d); c.setHours(0, 0, 0, 0)
  const day = c.getDay(); const diff = day === 0 ? -6 : 1 - day
  c.setDate(c.getDate() + diff); return c
}
function addDays(d: Date, n: number) { const c = new Date(d); c.setDate(c.getDate() + n); return c }
function addMonths(d: Date, n: number) { return new Date(d.getFullYear(), d.getMonth() + n, 1) }

// =================================================================
// MAIN
// =================================================================

export default function ScheduleClient({ initialShifts, users, departments, currentUser }: Props) {
  const [shifts, setShifts] = useState<Shift[]>(initialShifts)
  const [view, setView] = useState<ViewMode>('week')
  const [cursor, setCursor] = useState(new Date())
  const [saving, setSaving] = useState(false)
  const [filterUserId, setFilterUserId] = useState<string | null>(null)
  const [modalOpened, modal] = useDisclosure(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<{
    userId: string; title: string; date: string
    startTime: string; endTime: string
    color: string; departmentId: string; notes: string
  }>({
    userId: '', title: 'Shift', date: '', startTime: '09:00', endTime: '17:00',
    color: SHIFT_COLORS[0], departmentId: '', notes: '',
  })

  const spot = useMouseSpotlight()
  const isManager = canManageSchedule(currentUser.role)
  const canSeeAll = canViewAllStaff(currentUser.role)
  const today = new Date()

  const visibleUsers = canSeeAll
    ? (filterUserId ? users.filter((u) => u.id === filterUserId) : users)
    : users.filter((u) => u.id === currentUser.id)

  // ---------- Navigation ----------
  function prev() {
    if (view === 'month') setCursor((c) => addMonths(c, -1))
    else if (view === 'week') setCursor((c) => addDays(startOfWeek(c), -7))
    else setCursor((c) => addDays(c, -1))
  }
  function next() {
    if (view === 'month') setCursor((c) => addMonths(c, 1))
    else if (view === 'week') setCursor((c) => addDays(startOfWeek(c), 7))
    else setCursor((c) => addDays(c, 1))
  }
  function goToday() { setCursor(new Date()) }

  function headerLabel() {
    if (view === 'month') return `${MONTHS[cursor.getMonth()]} ${cursor.getFullYear()}`
    if (view === 'week') {
      const ws = startOfWeek(cursor)
      const we = addDays(ws, 6)
      return `${ws.toLocaleDateString([], { month: 'short', day: 'numeric' })} – ${we.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })}`
    }
    return cursor.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
  }

  // ---------- Save / Delete (API contracts preserved) ----------
  async function handleSave() {
    setSaving(true)
    const startTime = new Date(`${form.date}T${form.startTime}`).toISOString()
    const endTime   = new Date(`${form.date}T${form.endTime}`).toISOString()
    const body: Record<string, unknown> = {
      userId: form.userId || null,
      title: form.title, startTime, endTime,
      color: form.color, notes: form.notes || null,
      departmentId: form.departmentId || null,
    }
    if (editingId) body.id = editingId
    const res = await fetch('/api/workryn/shifts', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (res.ok) {
      const saved = await res.json()
      setShifts((p) => editingId ? p.map((s) => s.id === editingId ? saved : s) : [...p, saved])
      modal.close(); setEditingId(null)
      setForm({ userId: '', title: 'Shift', date: '', startTime: '09:00', endTime: '17:00', color: SHIFT_COLORS[0], departmentId: '', notes: '' })
    }
    setSaving(false)
  }
  async function handleDelete(id: string) {
    await fetch(`/api/workryn/shifts/${id}`, { method: 'DELETE' })
    setShifts((p) => p.filter((s) => s.id !== id))
  }
  function openNew(userId: string, date: Date) {
    if (!isManager) return
    setForm({
      userId, title: 'Shift',
      date: date.toISOString().split('T')[0],
      startTime: '09:00', endTime: '17:00',
      color: SHIFT_COLORS[Math.floor(Math.random() * SHIFT_COLORS.length)],
      departmentId: '', notes: '',
    })
    setEditingId(null); modal.open()
  }
  function openEdit(s: Shift) {
    if (!isManager) return
    const d = new Date(s.startTime)
    setForm({
      userId: s.user?.id ?? '',
      title: s.title,
      date: d.toISOString().split('T')[0],
      startTime: d.toTimeString().slice(0, 5),
      endTime: new Date(s.endTime).toTimeString().slice(0, 5),
      color: s.color,
      departmentId: s.departmentId || '',
      notes: s.notes || '',
    })
    setEditingId(s.id); modal.open()
  }

  // Hero eyebrow info
  const totalThisPeriod = (() => {
    if (view === 'day') return shifts.filter((s) => sameDay(new Date(s.startTime), cursor)).length
    if (view === 'week') {
      const ws = startOfWeek(cursor)
      const we = addDays(ws, 6)
      return shifts.filter((s) => { const d = new Date(s.startTime); return d >= ws && d <= we }).length
    }
    return shifts.filter((s) => {
      const d = new Date(s.startTime)
      return d.getFullYear() === cursor.getFullYear() && d.getMonth() === cursor.getMonth()
    }).length
  })()

  return (
    <>
      <Container size="xl" py="lg" className="sca-root">

        {/* ============ HERO ============ */}
        <div ref={spot.ref} onMouseMove={spot.onMouseMove} style={{ marginBottom: 20 }}>
          <Paper radius="lg" p="xl" className="sca-hero">
            <div className="sca-hero-mesh" aria-hidden />
            <div className="sca-hero-orbs" aria-hidden>
              <span className="sca-orb sca-orb-1" />
              <span className="sca-orb sca-orb-2" />
              <span className="sca-orb sca-orb-3" />
            </div>
            <div className="sca-hero-spotlight" aria-hidden />

            <img src="/heroes/schedule.svg" alt="" aria-hidden="true" style={{ position: "absolute", right: 0, top: "50%", transform: "translateY(-50%)", height: "85%", zIndex: 1, opacity: 0.7, pointerEvents: "none" }} />

            <Stack gap="md" style={{ position: 'relative', zIndex: 2 }}>
              <Group justify="space-between" align="flex-start" wrap="wrap" gap="md">
                <Stack gap={6} style={{ minWidth: 0, flex: 1 }}>
                  <Group gap={8} align="center">
                    <CalendarIcon size={14} style={{ color: 'rgba(125,211,252,0.85)' }} />
                    <Text size="xs" tt="uppercase" fw={700} c="sky.3" style={{ letterSpacing: '0.12em' }}>
                      Schedule
                    </Text>
                  </Group>
                  <Title order={1} className="sca-hero-title">{headerLabel()}</Title>
                  <Text size="sm" c="dimmed">
                    {totalThisPeriod} {totalThisPeriod === 1 ? 'shift' : 'shifts'} scheduled
                    {visibleUsers.length > 0 && <> · {visibleUsers.length} {visibleUsers.length === 1 ? 'person' : 'people'}</>}
                  </Text>
                </Stack>

                {isManager && (
                  <Button
                    size="md"
                    leftSection={<Plus size={16} />}
                    onClick={() => openNew(visibleUsers[0]?.id ?? '', cursor)}
                    className="sca-btn-primary"
                  >
                    New Shift
                  </Button>
                )}
              </Group>

              {/* Controls row */}
              <Group justify="space-between" align="center" wrap="wrap" gap="sm">
                <Group gap={4} align="center">
                  <Tooltip label="Previous" withArrow>
                    <ActionIcon size="lg" radius="md" variant="default" onClick={prev} className="sca-nav-btn">
                      <ChevronLeft size={16} />
                    </ActionIcon>
                  </Tooltip>
                  <Button size="sm" variant="default" onClick={goToday} className="sca-today-btn">
                    Today
                  </Button>
                  <Tooltip label="Next" withArrow>
                    <ActionIcon size="lg" radius="md" variant="default" onClick={next} className="sca-nav-btn">
                      <ChevronRight size={16} />
                    </ActionIcon>
                  </Tooltip>
                </Group>

                <Group gap="sm" align="center">
                  {canSeeAll && users.length > 5 && (
                    <Select
                      size="sm"
                      value={filterUserId}
                      onChange={setFilterUserId}
                      data={[{ value: '', label: 'All staff' }, ...users.map((u) => ({ value: u.id, label: u.name ?? 'Unnamed' }))]}
                      placeholder="All staff"
                      clearable
                      searchable
                      leftSection={<Users size={14} />}
                      w={200}
                    />
                  )}
                  <SegmentedControl
                    size="sm"
                    value={view}
                    onChange={(v) => setView(v as ViewMode)}
                    data={[
                      { value: 'month', label: 'Month' },
                      { value: 'week',  label: 'Week' },
                      { value: 'day',   label: 'Day' },
                    ]}
                    className="sca-view-toggle"
                  />
                </Group>
              </Group>
            </Stack>
          </Paper>
        </div>

        {/* ============ CALENDAR PANEL ============ */}
        <Card radius="lg" p={0} withBorder className="sca-panel">
          {view === 'month' && (
            <MonthView
              cursor={cursor} today={today} shifts={shifts}
              isManager={isManager}
              onCellClick={(d) => openNew(visibleUsers[0]?.id ?? '', d)}
              onShiftClick={openEdit}
            />
          )}
          {view === 'week' && (
            <WeekView
              cursor={cursor} today={today} shifts={shifts}
              visibleUsers={visibleUsers}
              isManager={isManager}
              onCellAdd={openNew}
              onShiftClick={openEdit}
              onShiftDelete={handleDelete}
            />
          )}
          {view === 'day' && (
            <DayView
              cursor={cursor} shifts={shifts}
              visibleUsers={visibleUsers}
              isManager={isManager}
              onCellAdd={openNew}
              onShiftClick={openEdit}
              onShiftDelete={handleDelete}
            />
          )}
        </Card>
      </Container>

      {/* ============ MODAL ============ */}
      <Modal
        opened={modalOpened}
        onClose={modal.close}
        title={editingId ? 'Edit Shift' : 'New Shift'}
        size="md"
        radius="lg"
        overlayProps={{ backgroundOpacity: 0.55, blur: 4 }}
        classNames={{ content: 'sca-modal-content' }}
      >
        <Stack gap="md">
          <TextInput
            label="Title"
            value={form.title}
            onChange={(e) => setForm((f) => ({ ...f, title: e.currentTarget.value }))}
            required
          />
          <Group grow>
            <Select
              label="Assign to"
              value={form.userId}
              onChange={(v) => setForm((f) => ({ ...f, userId: v ?? '' }))}
              data={[{ value: '', label: 'Unassigned' }, ...users.map((u) => ({ value: u.id, label: u.name ?? 'Unnamed' }))]}
              searchable
            />
            <TextInput
              label="Date"
              type="date"
              value={form.date}
              onChange={(e) => setForm((f) => ({ ...f, date: e.currentTarget.value }))}
              required
            />
          </Group>
          <Group grow>
            <TextInput
              label="Start"
              type="time"
              value={form.startTime}
              onChange={(e) => setForm((f) => ({ ...f, startTime: e.currentTarget.value }))}
            />
            <TextInput
              label="End"
              type="time"
              value={form.endTime}
              onChange={(e) => setForm((f) => ({ ...f, endTime: e.currentTarget.value }))}
            />
          </Group>
          {departments.length > 0 && (
            <Select
              label="Department"
              value={form.departmentId}
              onChange={(v) => setForm((f) => ({ ...f, departmentId: v ?? '' }))}
              data={[{ value: '', label: 'None' }, ...departments.map((d) => ({ value: d.id, label: d.name }))]}
            />
          )}
          <Box>
            <Text size="sm" fw={500} mb={6}>Color</Text>
            <Group gap={8}>
              {SHIFT_COLORS.map((c) => (
                <ColorSwatch
                  key={c}
                  color={c}
                  size={28}
                  onClick={() => setForm((f) => ({ ...f, color: c }))}
                  style={{
                    cursor: 'pointer',
                    outline: form.color === c ? '2px solid #fff' : 'none',
                    outlineOffset: 2,
                  }}
                />
              ))}
            </Group>
          </Box>
          <Textarea
            label="Notes"
            value={form.notes}
            onChange={(e) => setForm((f) => ({ ...f, notes: e.currentTarget.value }))}
            minRows={2}
            autosize
            maxRows={4}
          />

          <Group justify="space-between" mt="sm">
            <div>
              {editingId && (
                <Button
                  variant="light"
                  color="red"
                  leftSection={<Trash2 size={14} />}
                  onClick={() => { handleDelete(editingId); modal.close() }}
                >
                  Delete
                </Button>
              )}
            </div>
            <Group gap="xs">
              <Button variant="subtle" color="gray" onClick={modal.close}>Cancel</Button>
              <Button
                loading={saving}
                disabled={!form.date || !form.title}
                onClick={handleSave}
                className="sca-btn-primary"
              >
                {editingId ? 'Save' : 'Create'}
              </Button>
            </Group>
          </Group>
        </Stack>
      </Modal>

      {/* ============ STYLES ============ */}
      <style>{`
        @keyframes sca-slide-up { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes sca-mesh-drift {
          0%, 100% { transform: translate(0,0) scale(1); }
          50%      { transform: translate(3%, -2%) scale(1.05); }
        }
        @keyframes sca-orb-a { 0%,100%{transform:translate(0,0)} 50%{transform:translate(40px,-30px)} }
        @keyframes sca-orb-b { 0%,100%{transform:translate(0,0)} 50%{transform:translate(-30px,25px)} }
        @keyframes sca-orb-c { 0%,100%{transform:translate(0,0)} 50%{transform:translate(20px,40px)} }
        @media (prefers-reduced-motion: reduce) {
          .sca-root *, .sca-root *::before, .sca-root *::after {
            animation: none !important;
            transition: none !important;
          }
        }

        /* -------------- HERO -------------- */
        .sca-hero {
          position: relative;
          overflow: hidden;
          border: 1px solid rgba(14,165,233,0.30);
          background:
            linear-gradient(135deg, rgba(14,165,233,0.16) 0%, rgba(6,182,212,0.10) 50%, rgba(124,58,237,0.06) 100%),
            rgba(11,15,30,0.55);
          backdrop-filter: blur(14px) saturate(140%);
          -webkit-backdrop-filter: blur(14px) saturate(140%);
          box-shadow: 0 20px 60px -20px rgba(14,165,233,0.35), 0 1px 0 rgba(255,255,255,0.05) inset;
          animation: sca-slide-up 460ms ease-out backwards;
        }
        .sca-hero-mesh {
          position: absolute; inset: -25%;
          background:
            radial-gradient(circle at 22% 30%, rgba(14,165,233,0.45), transparent 42%),
            radial-gradient(circle at 78% 25%, rgba(6,182,212,0.30), transparent 47%),
            radial-gradient(circle at 62% 82%, rgba(124,58,237,0.18), transparent 52%);
          filter: blur(40px);
          animation: sca-mesh-drift 22s ease-in-out infinite;
          z-index: 0; pointer-events: none;
        }
        .sca-hero-orbs { position: absolute; inset: 0; z-index: 0; pointer-events: none; }
        .sca-orb { position: absolute; border-radius: 50%; filter: blur(22px); opacity: 0.55; mix-blend-mode: screen; }
        .sca-orb-1 { width: 130px; height: 130px; top: 12%; left: 8%;
          background: radial-gradient(circle, #7dd3fc 0%, transparent 70%);
          animation: sca-orb-a 14s ease-in-out infinite; }
        .sca-orb-2 { width: 100px; height: 100px; top: 55%; left: 60%;
          background: radial-gradient(circle, #0EA5E9 0%, transparent 70%);
          animation: sca-orb-b 16s ease-in-out infinite; }
        .sca-orb-3 { width: 80px; height: 80px; bottom: 10%; right: 12%;
          background: radial-gradient(circle, #a855f7 0%, transparent 70%);
          animation: sca-orb-c 18s ease-in-out infinite; }
        .sca-hero-spotlight {
          position: absolute; inset: 0; z-index: 1; pointer-events: none;
          background: radial-gradient(circle 360px at var(--mx, 50%) var(--my, 50%), rgba(255,255,255,0.10), transparent 60%);
        }
        .sca-hero-title {
          font-size: clamp(2rem, 5vw, 3.25rem);
          font-weight: 800;
          letter-spacing: -0.035em;
          line-height: 1;
          margin: 0;
          background: linear-gradient(135deg, #ffffff 0%, #7dd3fc 50%, #0EA5E9 100%);
          -webkit-background-clip: text; background-clip: text;
          -webkit-text-fill-color: transparent;
          filter: drop-shadow(0 2px 16px rgba(14,165,233,0.45));
        }
        .sca-btn-primary {
          background: linear-gradient(135deg, #0EA5E9 0%, #06B6D4 100%);
          box-shadow: 0 6px 18px rgba(14,165,233,0.40);
          transition: transform 180ms ease, box-shadow 180ms ease;
          color: #fff;
        }
        .sca-btn-primary:hover {
          transform: translateY(-1px);
          box-shadow: 0 10px 28px rgba(14,165,233,0.55);
        }
        .sca-nav-btn { background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.08); }
        .sca-nav-btn:hover { background: rgba(14,165,233,0.10); border-color: rgba(14,165,233,0.30); }
        .sca-today-btn { background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.08); }
        .sca-today-btn:hover { background: rgba(14,165,233,0.10); border-color: rgba(14,165,233,0.30); }

        /* -------------- Calendar panel -------------- */
        .sca-panel {
          background: rgba(15, 23, 42, 0.55);
          backdrop-filter: blur(14px) saturate(140%);
          -webkit-backdrop-filter: blur(14px) saturate(140%);
          overflow: hidden;
          animation: sca-slide-up 500ms 100ms ease-out backwards;
        }

        /* -------------- Month view -------------- */
        .sca-month { display: flex; flex-direction: column; }
        .sca-month-header {
          display: grid;
          grid-template-columns: repeat(7, 1fr);
          border-bottom: 1px solid rgba(255,255,255,0.06);
        }
        .sca-month-dow {
          padding: 10px 12px;
          font-size: 0.6875rem;
          font-weight: 700;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          color: rgba(148,163,184,0.7);
          text-align: center;
        }
        .sca-month-grid {
          display: grid;
          grid-template-columns: repeat(7, 1fr);
          grid-auto-rows: minmax(110px, auto);
        }
        .sca-month-cell {
          border-right: 1px solid rgba(255,255,255,0.04);
          border-bottom: 1px solid rgba(255,255,255,0.04);
          padding: 6px;
          display: flex; flex-direction: column;
          gap: 4px;
          cursor: pointer;
          transition: background 140ms ease;
          position: relative;
        }
        .sca-month-cell:hover { background: rgba(14,165,233,0.04); }
        .sca-month-cell:nth-child(7n) { border-right: none; }
        .sca-month-other { opacity: 0.42; }
        .sca-month-today {
          background: linear-gradient(180deg, rgba(14,165,233,0.10), rgba(14,165,233,0.04));
          box-shadow: inset 0 2px 0 #0EA5E9;
        }
        .sca-month-date {
          font-size: 0.8125rem;
          font-weight: 600;
          color: rgba(226,232,240,0.8);
          padding: 2px 4px;
          align-self: flex-start;
        }
        .sca-month-date-today {
          background: linear-gradient(135deg, #0EA5E9, #06B6D4);
          color: #fff;
          border-radius: 6px;
          padding: 2px 7px;
          box-shadow: 0 4px 12px rgba(14,165,233,0.4);
        }
        .sca-month-chips {
          display: flex; flex-direction: column;
          gap: 3px;
        }
        .sca-month-chip {
          font-size: 0.6875rem;
          padding: 2px 6px;
          border-radius: 4px;
          display: flex;
          align-items: center;
          gap: 5px;
          cursor: pointer;
          transition: transform 140ms ease;
          overflow: hidden;
          white-space: nowrap;
        }
        .sca-month-chip:hover { transform: translateX(2px); }
        .sca-month-chip-time { font-weight: 700; color: rgba(241,245,249,0.85); flex-shrink: 0; }
        .sca-month-chip-name { color: rgba(226,232,240,0.75); overflow: hidden; text-overflow: ellipsis; flex: 1; min-width: 0; }
        .sca-month-more {
          font-size: 0.625rem;
          color: rgba(148,163,184,0.6);
          padding: 2px 4px;
          font-weight: 600;
        }

        /* -------------- Week view -------------- */
        .sca-week-wrap { overflow-x: auto; }
        .sca-week-grid {
          display: grid;
          min-width: 800px;
        }
        .sca-week-corner, .sca-week-col-head {
          padding: 10px 12px;
          font-size: 0.6875rem;
          font-weight: 700;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          color: rgba(148,163,184,0.7);
          border-bottom: 1px solid rgba(255,255,255,0.06);
        }
        .sca-week-corner {
          position: sticky; left: 0; z-index: 3;
          background: rgba(11,15,30,0.95);
          border-right: 1px solid rgba(255,255,255,0.06);
          display: flex; align-items: center;
        }
        .sca-week-col-head {
          text-align: center;
          background: rgba(15,23,42,0.65);
          border-right: 1px solid rgba(255,255,255,0.04);
          display: flex; flex-direction: column; align-items: center; gap: 2px;
        }
        .sca-week-col-today {
          background: linear-gradient(180deg, rgba(14,165,233,0.16), rgba(14,165,233,0.04)) !important;
          color: #7dd3fc !important;
          box-shadow: inset 0 2px 0 #0EA5E9;
        }
        .sca-week-col-num {
          font-size: 1.125rem;
          font-weight: 700;
          color: rgba(226,232,240,0.9);
          text-transform: none;
          letter-spacing: 0;
        }
        .sca-week-col-num-today {
          background: linear-gradient(135deg, #0EA5E9, #06B6D4);
          color: #fff;
          border-radius: 8px;
          padding: 2px 10px;
          box-shadow: 0 4px 12px rgba(14,165,233,0.4);
        }
        .sca-week-row { display: contents; }
        .sca-week-user-cell {
          position: sticky; left: 0; z-index: 2;
          background: rgba(11,15,30,0.95);
          border-right: 1px solid rgba(255,255,255,0.06);
          border-bottom: 1px solid rgba(255,255,255,0.04);
          padding: 10px 14px;
          display: flex; align-items: center; gap: 10px;
        }
        .sca-week-cell {
          border-right: 1px solid rgba(255,255,255,0.04);
          border-bottom: 1px solid rgba(255,255,255,0.04);
          padding: 6px;
          min-height: 64px;
          display: flex; flex-direction: column; gap: 4px;
          cursor: pointer;
          transition: background 140ms ease;
        }
        .sca-week-cell:hover { background: rgba(14,165,233,0.04); }
        .sca-week-cell-today { background: rgba(14,165,233,0.04); }

        /* -------------- Day view -------------- */
        .sca-day { display: flex; flex-direction: column; }
        .sca-day-row {
          display: flex;
          align-items: stretch;
          border-bottom: 1px solid rgba(255,255,255,0.04);
        }
        .sca-day-row:last-child { border-bottom: none; }
        .sca-day-user-cell {
          min-width: 220px;
          padding: 14px 18px;
          display: flex; align-items: center; gap: 10px;
          border-right: 1px solid rgba(255,255,255,0.06);
        }
        .sca-day-shifts-cell {
          flex: 1;
          padding: 12px 14px;
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
          align-items: flex-start;
        }

        /* -------------- Shift chip (used in week + day) -------------- */
        .sca-chip {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 4px 9px;
          border-radius: 6px;
          font-size: 0.75rem;
          cursor: pointer;
          transition: transform 160ms ease, box-shadow 160ms ease;
          backdrop-filter: blur(8px);
          -webkit-backdrop-filter: blur(8px);
        }
        .sca-chip:hover {
          transform: translateY(-1px);
          box-shadow: 0 6px 16px rgba(0,0,0,0.25);
        }
        .sca-chip-time {
          font-weight: 700;
          color: rgba(241,245,249,0.85);
          font-variant-numeric: tabular-nums;
        }
        .sca-chip-title { color: rgba(226,232,240,0.85); }
        .sca-chip-del {
          background: none; border: none; cursor: pointer; padding: 2px;
          color: rgba(148,163,184,0.55);
          transition: color 140ms ease;
        }
        .sca-chip-del:hover { color: #ef4444; }

        .sca-add-btn {
          padding: 4px 12px;
          border: 1px dashed rgba(255,255,255,0.12);
          border-radius: 6px;
          background: transparent;
          color: rgba(148,163,184,0.65);
          font-size: 0.75rem;
          cursor: pointer;
          display: inline-flex; align-items: center; gap: 4px;
          transition: all 140ms ease;
        }
        .sca-add-btn:hover {
          border-color: rgba(14,165,233,0.45);
          background: rgba(14,165,233,0.06);
          color: rgba(125,211,252,0.9);
        }

        .sca-empty {
          padding: 40px 24px;
          text-align: center;
          color: rgba(148,163,184,0.65);
        }

        /* Modal */
        .sca-modal-content {
          background: rgba(15, 23, 42, 0.85) !important;
          backdrop-filter: blur(18px) saturate(140%);
          -webkit-backdrop-filter: blur(18px) saturate(140%);
          border: 1px solid rgba(14,165,233,0.25);
        }

        .sca-view-toggle [data-active] {
          background: linear-gradient(135deg, #0EA5E9, #06B6D4) !important;
          color: #fff !important;
        }
      `}</style>
    </>
  )
}

// =================================================================
// VIEW SUB-COMPONENTS
// =================================================================

function MonthView({
  cursor, today, shifts, isManager, onCellClick, onShiftClick,
}: {
  cursor: Date; today: Date; shifts: Shift[]; isManager: boolean
  onCellClick: (d: Date) => void
  onShiftClick: (s: Shift) => void
}) {
  const monthStart = startOfMonth(cursor)
  const monthEnd = endOfMonth(cursor)
  const gridStart = startOfWeek(monthStart)
  const gridEnd = addDays(startOfWeek(monthEnd), 6)
  const days: Date[] = []
  let d = new Date(gridStart)
  while (d <= gridEnd) { days.push(new Date(d)); d = addDays(d, 1) }

  return (
    <div className="sca-month">
      <div className="sca-month-header">
        {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((n) => (
          <div key={n} className="sca-month-dow">{n}</div>
        ))}
      </div>
      <div className="sca-month-grid">
        {days.map((day, i) => {
          const isToday = sameDay(day, today)
          const isOtherMonth = day.getMonth() !== cursor.getMonth()
          const dayShifts = shifts.filter((s) => sameDay(new Date(s.startTime), day))
          return (
            <div
              key={i}
              className={`sca-month-cell${isToday ? ' sca-month-today' : ''}${isOtherMonth ? ' sca-month-other' : ''}`}
              onClick={() => isManager && onCellClick(day)}
            >
              <span className={`sca-month-date${isToday ? ' sca-month-date-today' : ''}`}>{day.getDate()}</span>
              <div className="sca-month-chips">
                {dayShifts.slice(0, 3).map((shift) => (
                  <div
                    key={shift.id}
                    className="sca-month-chip"
                    style={{ background: shift.color + '24', borderLeft: `3px solid ${shift.color}` }}
                    onClick={(e) => { e.stopPropagation(); onShiftClick(shift) }}
                  >
                    <span className="sca-month-chip-time">{fmt(shift.startTime)}</span>
                    <span className="sca-month-chip-name">{shift.user?.name?.split(' ')[0] ?? 'Unassigned'}</span>
                  </div>
                ))}
                {dayShifts.length > 3 && <div className="sca-month-more">+{dayShifts.length - 3} more</div>}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function WeekView({
  cursor, today, shifts, visibleUsers, isManager, onCellAdd, onShiftClick, onShiftDelete,
}: {
  cursor: Date; today: Date; shifts: Shift[]
  visibleUsers: StaffUser[]
  isManager: boolean
  onCellAdd: (userId: string, date: Date) => void
  onShiftClick: (s: Shift) => void
  onShiftDelete: (id: string) => void
}) {
  const ws = startOfWeek(cursor)
  const weekDates = Array.from({ length: 7 }, (_, i) => addDays(ws, i))
  const unassignedThisWeek = shifts.filter(
    (s) => !s.user && weekDates.some((day) => sameDay(new Date(s.startTime), day))
  )

  return (
    <div className="sca-week-wrap">
      <div className="sca-week-grid" style={{ gridTemplateColumns: `220px repeat(7, minmax(110px, 1fr))` }}>
        {/* Header row */}
        <div className="sca-week-corner">STAFF</div>
        {weekDates.map((day, i) => {
          const isToday = sameDay(day, today)
          return (
            <div key={i} className={`sca-week-col-head${isToday ? ' sca-week-col-today' : ''}`}>
              <span>{DAYS_SHORT[day.getDay()]}</span>
              <span className={`sca-week-col-num${isToday ? ' sca-week-col-num-today' : ''}`}>{day.getDate()}</span>
            </div>
          )
        })}

        {/* Unassigned row */}
        {unassignedThisWeek.length > 0 && (
          <>
            <div className="sca-week-user-cell">
              <Avatar size="sm" radius="xl" color="gray">?</Avatar>
              <Stack gap={0}>
                <Text size="xs" fw={600}>Unassigned</Text>
                <Text size="xs" c="dimmed">Open shifts</Text>
              </Stack>
            </div>
            {weekDates.map((day, di) => {
              const dayShifts = unassignedThisWeek.filter((s) => sameDay(new Date(s.startTime), day))
              const isToday = sameDay(day, today)
              return (
                <div
                  key={di}
                  className={`sca-week-cell${isToday ? ' sca-week-cell-today' : ''}`}
                  onClick={() => isManager && onCellAdd('', day)}
                >
                  {dayShifts.map((s) => (
                    <ShiftChip key={s.id} shift={s} isManager={isManager} onClick={onShiftClick} onDelete={onShiftDelete} compact />
                  ))}
                </div>
              )
            })}
          </>
        )}

        {/* User rows */}
        {visibleUsers.map((u) => (
          <UserWeekRow
            key={u.id}
            user={u} weekDates={weekDates} today={today} shifts={shifts}
            isManager={isManager}
            onCellAdd={onCellAdd} onShiftClick={onShiftClick} onShiftDelete={onShiftDelete}
          />
        ))}

        {visibleUsers.length === 0 && unassignedThisWeek.length === 0 && (
          <div style={{ gridColumn: '1 / -1' }} className="sca-empty">No staff to display.</div>
        )}
      </div>
    </div>
  )
}

function UserWeekRow({
  user, weekDates, today, shifts, isManager, onCellAdd, onShiftClick, onShiftDelete,
}: {
  user: StaffUser; weekDates: Date[]; today: Date; shifts: Shift[]
  isManager: boolean
  onCellAdd: (userId: string, date: Date) => void
  onShiftClick: (s: Shift) => void
  onShiftDelete: (id: string) => void
}) {
  return (
    <>
      <div className="sca-week-user-cell">
        <Avatar size="sm" radius="xl" style={{ background: user.avatarColor, color: '#fff' }}>
          {getInitials(user.name ?? '?')}
        </Avatar>
        <Stack gap={0} style={{ minWidth: 0 }}>
          <Text size="xs" fw={600} truncate>{user.name ?? 'Unnamed'}</Text>
          <Text size="xs" c="dimmed" truncate>{user.jobTitle || getRoleLabel(user.role)}</Text>
        </Stack>
      </div>
      {weekDates.map((day, di) => {
        const dayShifts = shifts.filter((s) => s.user?.id === user.id && sameDay(new Date(s.startTime), day))
        const isToday = sameDay(day, today)
        return (
          <div
            key={di}
            className={`sca-week-cell${isToday ? ' sca-week-cell-today' : ''}`}
            onClick={() => isManager && dayShifts.length === 0 && onCellAdd(user.id, day)}
          >
            {dayShifts.map((s) => (
              <ShiftChip key={s.id} shift={s} isManager={isManager} onClick={onShiftClick} onDelete={onShiftDelete} compact />
            ))}
          </div>
        )
      })}
    </>
  )
}

function DayView({
  cursor, shifts, visibleUsers, isManager, onCellAdd, onShiftClick, onShiftDelete,
}: {
  cursor: Date; shifts: Shift[]; visibleUsers: StaffUser[]
  isManager: boolean
  onCellAdd: (userId: string, date: Date) => void
  onShiftClick: (s: Shift) => void
  onShiftDelete: (id: string) => void
}) {
  const dayShiftsAll = shifts.filter((s) => sameDay(new Date(s.startTime), cursor))
  const unassigned = dayShiftsAll.filter((s) => !s.user)

  return (
    <div className="sca-day">
      {unassigned.length > 0 && (
        <div className="sca-day-row">
          <div className="sca-day-user-cell">
            <Avatar size="md" radius="xl" color="gray">?</Avatar>
            <Stack gap={0}>
              <Text size="sm" fw={600}>Unassigned</Text>
              <Text size="xs" c="dimmed">Open shifts</Text>
            </Stack>
          </div>
          <div className="sca-day-shifts-cell">
            {unassigned.map((s) => (
              <ShiftChip key={s.id} shift={s} isManager={isManager} onClick={onShiftClick} onDelete={onShiftDelete} />
            ))}
          </div>
        </div>
      )}
      {visibleUsers.map((user) => {
        const userShifts = dayShiftsAll.filter((s) => s.user?.id === user.id)
        return (
          <div key={user.id} className="sca-day-row">
            <div className="sca-day-user-cell">
              <Avatar size="md" radius="xl" style={{ background: user.avatarColor, color: '#fff' }}>
                {getInitials(user.name ?? '?')}
              </Avatar>
              <Stack gap={0}>
                <Text size="sm" fw={600}>{user.name ?? 'Unnamed'}</Text>
                <Text size="xs" c="dimmed">{user.jobTitle || getRoleLabel(user.role)}</Text>
              </Stack>
            </div>
            <div className="sca-day-shifts-cell">
              {userShifts.length === 0 && isManager && (
                <button className="sca-add-btn" onClick={() => onCellAdd(user.id, cursor)}>
                  <Plus size={14} /> Add shift
                </button>
              )}
              {userShifts.map((s) => (
                <ShiftChip key={s.id} shift={s} isManager={isManager} onClick={onShiftClick} onDelete={onShiftDelete} />
              ))}
            </div>
          </div>
        )
      })}
      {visibleUsers.length === 0 && unassigned.length === 0 && (
        <div className="sca-empty">No staff to display.</div>
      )}
    </div>
  )
}

function ShiftChip({
  shift, isManager, onClick, onDelete, compact,
}: {
  shift: Shift; isManager: boolean
  onClick: (s: Shift) => void
  onDelete: (id: string) => void
  compact?: boolean
}) {
  return (
    <div
      className="sca-chip"
      style={{
        background: shift.color + '22',
        borderLeft: `3px solid ${shift.color}`,
        boxShadow: `0 0 0 1px ${shift.color}33`,
        minWidth: compact ? 0 : 140,
        flexShrink: compact ? 1 : 0,
      }}
      onClick={(e) => { e.stopPropagation(); onClick(shift) }}
    >
      <span className="sca-chip-time">
        {compact ? fmt(shift.startTime) : `${fmt(shift.startTime)}–${fmt(shift.endTime)}`}
      </span>
      {!compact && <span className="sca-chip-title">{shift.title}</span>}
      {isManager && !compact && (
        <button
          className="sca-chip-del"
          onClick={(e) => { e.stopPropagation(); onDelete(shift.id) }}
          aria-label="Delete shift"
        >
          <X size={11} />
        </button>
      )}
    </div>
  )
}
