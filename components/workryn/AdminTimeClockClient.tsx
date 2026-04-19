'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Clock, Users, Edit2, Plus, Trash2, Save, X, ChevronLeft, ChevronRight,
  Download, AlertTriangle, Loader2, Search, Calendar, Coffee,
} from 'lucide-react'
import { getInitials } from '@/lib/workryn/utils'
import { isManagerOrAbove } from '@/lib/workryn/permissions'

// ── Types ──────────────────────────────────────────────────────────────
type Department = { id: string; name: string; color: string }

type TimeBreak = {
  id: string
  timeEntryId?: string
  startAt: string
  endAt: string | null
  plannedMinutes: number
  actualMinutes: number | null
  type: string
}

type TimeEntry = {
  id: string
  userId: string
  clockInAt: string
  clockOutAt: string | null
  totalMinutes: number
  breakMinutes: number
  workedMinutes: number
  status: string
  notes: string | null
  breaks: TimeBreak[]
}

type AdminUser = {
  id: string
  name: string | null
  email: string | null
  avatarColor: string
  jobTitle: string | null
  role: string
  departmentId: string | null
  department: Department | null
  currentEntry: TimeEntry | null
  currentBreak: TimeBreak | null
  weekTotal: { workedMinutes: number; breakMinutes: number }
  lastEntry: { clockInAt: string; clockOutAt: string | null } | null
}

type TimesheetData = {
  user: {
    id: string
    name: string | null
    email: string | null
    avatarColor: string
    jobTitle: string | null
    role: string
    department: Department | null
  }
  weekStart: string
  weekEnd: string
  entries: TimeEntry[]
  weekTotal: { workedMinutes: number; breakMinutes: number; days: number }
}

type BreakFormRow = {
  startAt: string
  endAt: string
  plannedMinutes: number
  type: string
}

type EntryFormState = {
  id: string | null
  userId: string
  date: string
  clockInAt: string
  clockOutAt: string
  breaks: BreakFormRow[]
  notes: string
  reason: string
}

// ── Helpers ────────────────────────────────────────────────────────────
function formatDuration(minutes: number): string {
  if (!minutes || minutes < 0) return '0m'
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  if (h === 0) return `${m}m`
  if (m === 0) return `${h}h`
  return `${h}h ${m}m`
}

function formatTime(date: string | Date | null | undefined): string {
  if (!date) return '—'
  return new Date(date).toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  })
}

function formatDate(date: string | Date): string {
  return new Date(date).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

function formatDayLabel(date: Date): string {
  return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
}

function toLocalDateInput(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

function toLocalTimeInput(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function toLocalDateTimeInput(d: Date): string {
  return `${toLocalDateInput(d)}T${toLocalTimeInput(d)}`
}

function combineDateTime(dateStr: string, timeStr: string): string {
  if (!dateStr || !timeStr) return ''
  const d = new Date(`${dateStr}T${timeStr}`)
  return d.toISOString()
}

function getWeekStart(date: Date): Date {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  const day = d.getDay()
  const diff = day === 0 ? -6 : 1 - day
  d.setDate(d.getDate() + diff)
  return d
}

function addDays(d: Date, n: number): Date {
  const x = new Date(d)
  x.setDate(x.getDate() + n)
  return x
}

function sameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  )
}

// Live worked minutes for a possibly-active entry
function liveEntryMinutes(entry: TimeEntry, now: Date) {
  if (entry.status !== 'ACTIVE') {
    return { workedMinutes: entry.workedMinutes, breakMinutes: entry.breakMinutes }
  }
  const clockIn = new Date(entry.clockInAt).getTime()
  const total = Math.max(0, Math.floor((now.getTime() - clockIn) / 60000))
  let bMins = 0
  for (const b of entry.breaks) {
    if (b.endAt) bMins += b.actualMinutes ?? 0
    else bMins += Math.max(0, Math.floor((now.getTime() - new Date(b.startAt).getTime()) / 60000))
  }
  return { workedMinutes: Math.max(0, total - bMins), breakMinutes: bMins }
}

// ── Component ──────────────────────────────────────────────────────────
interface Props {
  initialUsers: AdminUser[]
  departments: Department[]
  initialWeekStart: string
  session: { user: { id: string; role: string } } | null
}

type Tab = 'live' | 'timesheets' | 'reports'
type StatusPill = 'all' | 'active' | 'on_break' | 'clocked_out'

export default function AdminTimeClockClient({ initialUsers, departments, initialWeekStart, session }: Props) {
  
  const canManage = isManagerOrAbove(session?.user?.role)

  const [tab, setTab] = useState<Tab>('live')
  const [users, setUsers] = useState<AdminUser[]>(initialUsers)
  const [loadingUsers, setLoadingUsers] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [now, setNow] = useState(() => new Date())

  // Live tab filters
  const [search, setSearch] = useState('')
  const [deptFilter, setDeptFilter] = useState('')
  const [statusPill, setStatusPill] = useState<StatusPill>('all')

  // Timesheet tab state
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null)
  const [userPickerSearch, setUserPickerSearch] = useState('')
  const [weekStartISO, setWeekStartISO] = useState<string>(initialWeekStart)
  const [timesheet, setTimesheet] = useState<TimesheetData | null>(null)
  const [loadingTimesheet, setLoadingTimesheet] = useState(false)

  // Entry modal state
  const [showEntryModal, setShowEntryModal] = useState(false)
  const [entryForm, setEntryForm] = useState<EntryFormState | null>(null)
  const [savingEntry, setSavingEntry] = useState(false)
  const [entryError, setEntryError] = useState<string | null>(null)

  // Delete modal state
  const [deleteEntryId, setDeleteEntryId] = useState<string | null>(null)
  const [deleteReason, setDeleteReason] = useState('')
  const [deleting, setDeleting] = useState(false)

  // Reports tab state
  const [reportRangeStart, setReportRangeStart] = useState<string>(() => {
    const d = getWeekStart(new Date())
    d.setDate(d.getDate() - 21)
    return toLocalDateInput(d)
  })
  const [reportRangeEnd, setReportRangeEnd] = useState<string>(() => {
    const d = getWeekStart(new Date())
    d.setDate(d.getDate() + 7)
    return toLocalDateInput(d)
  })
  const [reportDeptFilter, setReportDeptFilter] = useState('')
  const [reportSort, setReportSort] = useState<{ key: string; dir: 'asc' | 'desc' }>({
    key: 'workedMinutes',
    dir: 'desc',
  })

  // ── Tick the clock every second for live durations ──
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(id)
  }, [])

  // ── Auto-refresh live status every 30s ──
  const refreshUsers = useCallback(async () => {
    try {
      setLoadingUsers(true)
      const params = new URLSearchParams()
      if (deptFilter) params.set('departmentId', deptFilter)
      if (statusPill !== 'all') params.set('status', statusPill)
      if (search) params.set('search', search)
      const res = await fetch(`/api/workryn/time-clock/admin/users?${params.toString()}`, { cache: 'no-store' })
      if (!res.ok) throw new Error('Failed to load users')
      const data = await res.json()
      setUsers(data.users)
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load users')
    } finally {
      setLoadingUsers(false)
    }
  }, [deptFilter, statusPill, search])

  useEffect(() => {
    if (tab !== 'live') return
    const id = setInterval(() => {
      refreshUsers()
    }, 30000)
    return () => clearInterval(id)
  }, [tab, refreshUsers])

  // Re-fetch whenever filter changes (except initial mount which already has data)
  const firstFilterMount = useRef(true)
  useEffect(() => {
    if (firstFilterMount.current) {
      firstFilterMount.current = false
      return
    }
    refreshUsers()
  }, [refreshUsers])

  // ── Load timesheet for selected user ──
  const loadTimesheet = useCallback(
    async (userId: string, weekStart: string) => {
      try {
        setLoadingTimesheet(true)
        const res = await fetch(
          `/api/time-clock/admin/users/${userId}/timesheet?weekStart=${encodeURIComponent(weekStart)}`,
          { cache: 'no-store' }
        )
        if (!res.ok) throw new Error('Failed to load timesheet')
        const data = await res.json()
        setTimesheet(data)
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to load timesheet')
      } finally {
        setLoadingTimesheet(false)
      }
    },
    []
  )

  useEffect(() => {
    if (selectedUserId) {
      loadTimesheet(selectedUserId, weekStartISO)
    } else {
      setTimesheet(null)
    }
  }, [selectedUserId, weekStartISO, loadTimesheet])

  // ── Stats ──
  const stats = useMemo(() => {
    const activeCount = users.filter((u) => u.currentEntry && !u.currentBreak).length
    const breakCount = users.filter((u) => u.currentBreak).length
    const outCount = users.filter((u) => !u.currentEntry).length
    const overtimeCount = users.filter((u) => u.weekTotal.workedMinutes > 40 * 60).length
    return { activeCount, breakCount, outCount, overtimeCount }
  }, [users])

  // ── Filtered users list for the live board ──
  const filteredLiveUsers = useMemo(() => {
    return users.filter((u) => {
      if (deptFilter && u.departmentId !== deptFilter) return false
      if (search) {
        const hay = `${u.name ?? ''} ${u.email ?? ''} ${u.jobTitle ?? ''}`.toLowerCase()
        if (!hay.includes(search.toLowerCase())) return false
      }
      if (statusPill === 'active') return Boolean(u.currentEntry) && !u.currentBreak
      if (statusPill === 'on_break') return Boolean(u.currentBreak)
      if (statusPill === 'clocked_out') return !u.currentEntry
      return true
    })
  }, [users, deptFilter, search, statusPill])

  const filteredPickerUsers = useMemo(() => {
    const q = userPickerSearch.trim().toLowerCase()
    if (!q) return users
    return users.filter((u) => {
      const hay = `${u.name ?? ''} ${u.email ?? ''}`.toLowerCase()
      return hay.includes(q)
    })
  }, [users, userPickerSearch])

  // ── Entry modal handlers ──
  function openAddEntry() {
    if (!selectedUserId) return
    const today = new Date()
    setEntryForm({
      id: null,
      userId: selectedUserId,
      date: toLocalDateInput(today),
      clockInAt: '09:00',
      clockOutAt: '17:00',
      breaks: [],
      notes: '',
      reason: '',
    })
    setEntryError(null)
    setShowEntryModal(true)
  }

  function openEditEntry(entry: TimeEntry) {
    const inDate = new Date(entry.clockInAt)
    const outDate = entry.clockOutAt ? new Date(entry.clockOutAt) : null
    setEntryForm({
      id: entry.id,
      userId: entry.userId,
      date: toLocalDateInput(inDate),
      clockInAt: toLocalTimeInput(inDate),
      clockOutAt: outDate ? toLocalTimeInput(outDate) : '',
      breaks: entry.breaks.map((b) => ({
        startAt: toLocalDateTimeInput(new Date(b.startAt)),
        endAt: b.endAt ? toLocalDateTimeInput(new Date(b.endAt)) : '',
        plannedMinutes: b.plannedMinutes || 30,
        type: b.type || 'LUNCH',
      })),
      notes: entry.notes ?? '',
      reason: '',
    })
    setEntryError(null)
    setShowEntryModal(true)
  }

  function closeEntryModal() {
    setShowEntryModal(false)
    setEntryForm(null)
    setEntryError(null)
  }

  function addBreakRow() {
    if (!entryForm) return
    const defaultStart = `${entryForm.date}T12:00`
    const defaultEnd = `${entryForm.date}T12:30`
    setEntryForm({
      ...entryForm,
      breaks: [
        ...entryForm.breaks,
        { startAt: defaultStart, endAt: defaultEnd, plannedMinutes: 30, type: 'LUNCH' },
      ],
    })
  }

  function removeBreakRow(idx: number) {
    if (!entryForm) return
    const next = entryForm.breaks.slice()
    next.splice(idx, 1)
    setEntryForm({ ...entryForm, breaks: next })
  }

  function updateBreakRow(idx: number, patch: Partial<BreakFormRow>) {
    if (!entryForm) return
    const next = entryForm.breaks.slice()
    next[idx] = { ...next[idx], ...patch }
    setEntryForm({ ...entryForm, breaks: next })
  }

  async function saveEntry() {
    if (!entryForm) return
    if (!entryForm.reason.trim()) {
      setEntryError('Reason is required')
      return
    }
    if (!entryForm.date || !entryForm.clockInAt) {
      setEntryError('Date and clock-in time are required')
      return
    }
    if (!entryForm.id && !entryForm.clockOutAt) {
      setEntryError('Clock-out time is required when creating a manual entry')
      return
    }
    setSavingEntry(true)
    setEntryError(null)
    try {
      const clockInISO = combineDateTime(entryForm.date, entryForm.clockInAt)
      const clockOutISO = entryForm.clockOutAt
        ? combineDateTime(entryForm.date, entryForm.clockOutAt)
        : null
      const breaksPayload = entryForm.breaks.map((b) => ({
        startAt: b.startAt ? new Date(b.startAt).toISOString() : '',
        endAt: b.endAt ? new Date(b.endAt).toISOString() : null,
        plannedMinutes: Number(b.plannedMinutes) || 0,
        type: b.type,
      }))
      const payload = {
        userId: entryForm.userId,
        clockInAt: clockInISO,
        clockOutAt: clockOutISO,
        breaks: breaksPayload,
        notes: entryForm.notes,
        reason: entryForm.reason,
      }
      const res = await fetch(
        entryForm.id
          ? `/api/time-clock/admin/entries/${entryForm.id}`
          : '/api/time-clock/admin/entries',
        {
          method: entryForm.id ? 'PATCH' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        }
      )
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || 'Failed to save entry')
      }
      closeEntryModal()
      if (selectedUserId) loadTimesheet(selectedUserId, weekStartISO)
      refreshUsers()
    } catch (e) {
      setEntryError(e instanceof Error ? e.message : 'Failed to save entry')
    } finally {
      setSavingEntry(false)
    }
  }

  async function confirmDelete() {
    if (!deleteEntryId) return
    if (!deleteReason.trim()) {
      setError('Reason is required')
      return
    }
    setDeleting(true)
    try {
      const res = await fetch(`/api/workryn/time-clock/admin/entries/${deleteEntryId}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: deleteReason }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || 'Failed to delete')
      }
      setDeleteEntryId(null)
      setDeleteReason('')
      if (selectedUserId) loadTimesheet(selectedUserId, weekStartISO)
      refreshUsers()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to delete entry')
    } finally {
      setDeleting(false)
    }
  }

  function handleSelectUser(userId: string) {
    setSelectedUserId(userId)
    setTab('timesheets')
  }

  function shiftWeek(offset: number) {
    const d = new Date(weekStartISO)
    d.setDate(d.getDate() + offset * 7)
    setWeekStartISO(d.toISOString())
  }

  function goToThisWeek() {
    setWeekStartISO(getWeekStart(new Date()).toISOString())
  }

  function handleExportCsv() {
    if (!selectedUserId || !timesheet) return
    const url = `/api/time-clock/admin/export?userId=${selectedUserId}&weekStart=${encodeURIComponent(
      timesheet.weekStart
    )}&weekEnd=${encodeURIComponent(timesheet.weekEnd)}`
    window.open(url, '_blank')
  }

  // ── Reports tab data ──
  type ReportRow = {
    userId: string
    name: string
    department: string
    workedMinutes: number
    breakMinutes: number
    daysWorked: number
    overtimeMinutes: number
    status: 'on_track' | 'overtime'
  }

  const [reportRows, setReportRows] = useState<ReportRow[]>([])
  const [loadingReport, setLoadingReport] = useState(false)

  const loadReport = useCallback(async () => {
    if (tab !== 'reports') return
    setLoadingReport(true)
    try {
      const rangeStart = new Date(reportRangeStart)
      const rangeEnd = new Date(reportRangeEnd)
      rangeEnd.setHours(23, 59, 59, 999)

      const targetUsers = reportDeptFilter
        ? users.filter((u) => u.departmentId === reportDeptFilter)
        : users

      const rows = await Promise.all(
        targetUsers.map(async (u) => {
          const res = await fetch(
            `/api/time-clock/admin/users/${u.id}/timesheet?weekStart=${encodeURIComponent(
              rangeStart.toISOString()
            )}`,
            { cache: 'no-store' }
          )
          // Fallback: use the aggregated weekly total from the initial users
          const weekTotal = res.ok ? (await res.json()).weekTotal : u.weekTotal
          return {
            userId: u.id,
            name: u.name ?? 'Unknown',
            department: u.department?.name ?? '—',
            workedMinutes: weekTotal.workedMinutes ?? 0,
            breakMinutes: weekTotal.breakMinutes ?? 0,
            daysWorked: weekTotal.days ?? 0,
            overtimeMinutes: Math.max(0, (weekTotal.workedMinutes ?? 0) - 40 * 60),
            status:
              (weekTotal.workedMinutes ?? 0) > 40 * 60 ? ('overtime' as const) : ('on_track' as const),
          }
        })
      )
      setReportRows(rows)
    } finally {
      setLoadingReport(false)
    }
  }, [tab, reportRangeStart, reportRangeEnd, reportDeptFilter, users])

  useEffect(() => {
    if (tab === 'reports') loadReport()
  }, [tab, loadReport])

  const sortedReportRows = useMemo(() => {
    const rows = reportRows.slice()
    rows.sort((a, b) => {
      const dir = reportSort.dir === 'asc' ? 1 : -1
      const ka = (a as unknown as Record<string, unknown>)[reportSort.key]
      const kb = (b as unknown as Record<string, unknown>)[reportSort.key]
      if (typeof ka === 'number' && typeof kb === 'number') return (ka - kb) * dir
      return String(ka).localeCompare(String(kb)) * dir
    })
    return rows
  }, [reportRows, reportSort])

  function handleExportAllCsv() {
    const sp = new URLSearchParams()
    const rangeStart = new Date(reportRangeStart)
    const rangeEnd = new Date(reportRangeEnd)
    sp.set('weekStart', rangeStart.toISOString())
    sp.set('weekEnd', rangeEnd.toISOString())
    window.open(`/api/time-clock/admin/export?${sp.toString()}`, '_blank')
  }

  // ── Timesheet day buckets ──
  const daysForWeek = useMemo(() => {
    if (!timesheet) return []
    const start = new Date(timesheet.weekStart)
    const days: { date: Date; entries: TimeEntry[] }[] = []
    for (let i = 0; i < 7; i++) {
      const d = addDays(start, i)
      const entries = timesheet.entries.filter((e) => sameDay(new Date(e.clockInAt), d))
      days.push({ date: d, entries })
    }
    return days
  }, [timesheet])

  // ── Render guards ──
  if (!canManage) {
    return (
      <div style={{ padding: 32 }}>
        <div className="empty-state">
          <AlertTriangle size={40} />
          <h2 style={{ fontSize: '1.25rem', color: 'var(--text-primary)' }}>Not authorized</h2>
          <p>You need manager privileges to view this page.</p>
        </div>
      </div>
    )
  }

  return (
    <div style={{ padding: 32, maxWidth: 1400, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <h1 className="gradient-text" style={{ fontSize: '2rem', fontWeight: 800, letterSpacing: '-0.02em' }}>
          Time Tracking Admin
        </h1>
        <p style={{ color: 'var(--text-secondary)', marginTop: 4 }}>
          Monitor and edit team time entries
        </p>
      </div>

      {/* Tabs */}
      <div
        style={{
          display: 'flex',
          gap: 4,
          borderBottom: '1px solid var(--border-subtle)',
          marginBottom: 24,
        }}
      >
        {[
          { id: 'live' as Tab, label: 'Live Status Board', icon: <Clock size={16} /> },
          { id: 'timesheets' as Tab, label: 'Timesheets', icon: <Calendar size={16} /> },
          { id: 'reports' as Tab, label: 'Reports', icon: <Users size={16} /> },
        ].map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className="focus-ring"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '12px 20px',
              background: 'transparent',
              border: 'none',
              borderBottom: `2px solid ${tab === t.id ? 'var(--brand)' : 'transparent'}`,
              color: tab === t.id ? 'var(--text-primary)' : 'var(--text-secondary)',
              fontWeight: 600,
              fontSize: 14,
              transition: 'var(--transition-smooth)',
              marginBottom: -1,
            }}
          >
            {t.icon}
            {t.label}
          </button>
        ))}
      </div>

      {error && (
        <div
          style={{
            padding: 12,
            borderRadius: 'var(--radius-md)',
            background: 'rgba(239,68,68,0.1)',
            border: '1px solid rgba(239,68,68,0.3)',
            color: 'var(--danger)',
            marginBottom: 16,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}
        >
          <AlertTriangle size={16} />
          {error}
          <button
            onClick={() => setError(null)}
            className="btn-icon btn-sm"
            style={{ marginLeft: 'auto' }}
            aria-label="Dismiss error"
            title="Dismiss"
          >
            <X size={14} />
          </button>
        </div>
      )}

      {/* ── Live Status Tab ────────────────────────── */}
      {tab === 'live' && (
        <div>
          {/* Stats row */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
              gap: 16,
              marginBottom: 24,
            }}
          >
            <div className="stat-card">
              <div className="stat-icon" style={{ background: 'rgba(16,185,129,0.15)', color: 'var(--success)' }}>
                <Clock size={20} />
              </div>
              <div className="stat-value">{stats.activeCount}</div>
              <div className="stat-label">On Shift</div>
            </div>
            <div className="stat-card">
              <div className="stat-icon" style={{ background: 'rgba(245,158,11,0.15)', color: 'var(--warning)' }}>
                <Coffee size={20} />
              </div>
              <div className="stat-value">{stats.breakCount}</div>
              <div className="stat-label">On Break</div>
            </div>
            <div className="stat-card">
              <div className="stat-icon" style={{ background: 'rgba(100,116,139,0.15)', color: 'var(--text-muted)' }}>
                <Users size={20} />
              </div>
              <div className="stat-value">{stats.outCount}</div>
              <div className="stat-label">Clocked Out</div>
            </div>
            <div className="stat-card">
              <div className="stat-icon" style={{ background: 'rgba(239,68,68,0.15)', color: 'var(--danger)' }}>
                <AlertTriangle size={20} />
              </div>
              <div className="stat-value">{stats.overtimeCount}</div>
              <div className="stat-label">In Overtime (&gt;40h)</div>
            </div>
          </div>

          {/* Filter bar */}
          <div
            className="glass-card"
            style={{
              padding: 12,
              marginBottom: 16,
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              flexWrap: 'wrap',
            }}
          >
            <div style={{ position: 'relative', flex: '1 1 260px' }}>
              <Search
                size={14}
                style={{
                  position: 'absolute',
                  left: 12,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  color: 'var(--text-muted)',
                }}
              />
              <input
                className="input focus-ring"
                placeholder="Search users..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                style={{ width: '100%', paddingLeft: 32 }}
              />
            </div>
            <select
              className="input focus-ring"
              value={deptFilter}
              onChange={(e) => setDeptFilter(e.target.value)}
              style={{ minWidth: 180 }}
            >
              <option value="">All Departments</option>
              {departments.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
            <div style={{ display: 'flex', gap: 4 }}>
              {(['all', 'active', 'on_break', 'clocked_out'] as StatusPill[]).map((s) => (
                <button
                  key={s}
                  onClick={() => setStatusPill(s)}
                  className={`focus-ring ${statusPill === s ? 'btn-gradient' : 'btn-ghost'} btn-sm`}
                  style={{ textTransform: 'capitalize' }}
                >
                  {s === 'on_break' ? 'On Break' : s === 'clocked_out' ? 'Clocked Out' : s}
                </button>
              ))}
            </div>
            {loadingUsers && <Loader2 size={16} className="spinner" />}
          </div>

          {/* Agent cards grid */}
          {filteredLiveUsers.length === 0 ? (
            <div className="empty-state">
              <Users size={40} />
              <p>No users match the current filters.</p>
            </div>
          ) : (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
                gap: 16,
              }}
            >
              {filteredLiveUsers.map((u) => (
                <LiveUserCard
                  key={u.id}
                  user={u}
                  now={now}
                  onOpen={() => handleSelectUser(u.id)}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Timesheets Tab ────────────────────────── */}
      {tab === 'timesheets' && (
        <div style={{ display: 'grid', gridTemplateColumns: '280px 1fr', gap: 20 }}>
          {/* Sidebar user picker */}
          <div
            className="glass-card"
            style={{
              padding: 12,
              position: 'sticky',
              top: 20,
              alignSelf: 'start',
              maxHeight: 'calc(100vh - 120px)',
              overflowY: 'auto',
            }}
          >
            <div style={{ position: 'relative', marginBottom: 8 }}>
              <Search
                size={14}
                style={{
                  position: 'absolute',
                  left: 10,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  color: 'var(--text-muted)',
                }}
              />
              <input
                className="input focus-ring"
                placeholder="Search users..."
                value={userPickerSearch}
                onChange={(e) => setUserPickerSearch(e.target.value)}
                style={{ width: '100%', paddingLeft: 30 }}
              />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {filteredPickerUsers.map((u) => (
                <button
                  key={u.id}
                  onClick={() => setSelectedUserId(u.id)}
                  className="focus-ring"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    padding: '8px 10px',
                    borderRadius: 'var(--radius-md)',
                    background: selectedUserId === u.id ? 'var(--bg-hover)' : 'transparent',
                    border: '1px solid transparent',
                    textAlign: 'left',
                    color: 'var(--text-primary)',
                    transition: 'var(--transition-smooth)',
                    width: '100%',
                  }}
                >
                  <Avatar user={u} size={28} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        fontSize: 13,
                        fontWeight: 600,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {u.name || 'Unknown'}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                      {u.currentEntry ? (u.currentBreak ? 'On Break' : 'On Shift') : 'Clocked Out'}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Right pane */}
          <div>
            {!selectedUserId || !timesheet ? (
              <div className="empty-state" style={{ minHeight: 240 }}>
                <Users size={40} />
                <p>
                  {loadingTimesheet
                    ? 'Loading timesheet...'
                    : 'Select a user from the list to view their timesheet.'}
                </p>
              </div>
            ) : (
              <div>
                {/* User header card */}
                <div
                  className="glass-card"
                  style={{
                    padding: 16,
                    marginBottom: 16,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 16,
                    flexWrap: 'wrap',
                  }}
                >
                  <Avatar user={timesheet.user} size={48} />
                  <div style={{ flex: 1, minWidth: 200 }}>
                    <div style={{ fontSize: 18, fontWeight: 700 }}>{timesheet.user.name}</div>
                    <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                      {timesheet.user.jobTitle ?? '—'}
                      {timesheet.user.department ? ` · ${timesheet.user.department.name}` : ''}
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <button
                      className="btn-ghost btn-sm focus-ring"
                      onClick={() => shiftWeek(-1)}
                      aria-label="Previous week"
                      title="Previous week"
                    >
                      <ChevronLeft size={16} />
                    </button>
                    <button className="btn-ghost btn-sm focus-ring" onClick={goToThisWeek}>
                      This Week
                    </button>
                    <button
                      className="btn-ghost btn-sm focus-ring"
                      onClick={() => shiftWeek(1)}
                      aria-label="Next week"
                      title="Next week"
                    >
                      <ChevronRight size={16} />
                    </button>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                      Week Total
                    </div>
                    <div style={{ fontSize: 20, fontWeight: 700 }}>
                      {formatDuration(timesheet.weekTotal.workedMinutes)}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button className="btn-gradient btn-sm focus-ring" onClick={openAddEntry}>
                      <Plus size={14} /> Add Entry
                    </button>
                    <button className="btn-ghost btn-sm focus-ring" onClick={handleExportCsv}>
                      <Download size={14} /> Export CSV
                    </button>
                  </div>
                </div>

                {/* Week grid */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {daysForWeek.map((day) => {
                    const dayTotal = day.entries.reduce((acc, e) => {
                      const m = liveEntryMinutes(e, now)
                      return acc + m.workedMinutes
                    }, 0)
                    const isOvertime = dayTotal > 8 * 60
                    return (
                      <div key={day.date.toISOString()} className="glass-card" style={{ padding: 14 }}>
                        <div
                          style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            marginBottom: 8,
                          }}
                        >
                          <div style={{ fontWeight: 600 }}>{formatDayLabel(day.date)}</div>
                          <div
                            style={{
                              fontSize: 13,
                              color: isOvertime ? 'var(--warning)' : 'var(--text-secondary)',
                              display: 'flex',
                              alignItems: 'center',
                              gap: 6,
                            }}
                          >
                            {isOvertime && <AlertTriangle size={13} />}
                            {formatDuration(dayTotal)}
                          </div>
                        </div>
                        {day.entries.length === 0 ? (
                          <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>No entries</div>
                        ) : (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                            {day.entries.map((e) => {
                              const m = liveEntryMinutes(e, now)
                              return (
                                <div
                                  key={e.id}
                                  style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 12,
                                    padding: 10,
                                    borderRadius: 'var(--radius-md)',
                                    background: 'var(--bg-surface)',
                                    border: '1px solid var(--border-subtle)',
                                  }}
                                >
                                  <div style={{ flex: 1, display: 'flex', flexWrap: 'wrap', gap: 12 }}>
                                    <div>
                                      <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>In</div>
                                      <div style={{ fontSize: 13, fontWeight: 600 }}>
                                        {formatTime(e.clockInAt)}
                                      </div>
                                    </div>
                                    <div>
                                      <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Out</div>
                                      <div style={{ fontSize: 13, fontWeight: 600 }}>
                                        {e.clockOutAt ? formatTime(e.clockOutAt) : '—'}
                                      </div>
                                    </div>
                                    <div>
                                      <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Breaks</div>
                                      <div style={{ fontSize: 13, fontWeight: 600 }}>
                                        {formatDuration(m.breakMinutes)}
                                      </div>
                                    </div>
                                    <div>
                                      <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Worked</div>
                                      <div style={{ fontSize: 13, fontWeight: 600 }}>
                                        {formatDuration(m.workedMinutes)}
                                      </div>
                                    </div>
                                    {e.status === 'EDITED' && (
                                      <span className="badge badge-warning" style={{ alignSelf: 'center' }}>
                                        Edited
                                      </span>
                                    )}
                                    {e.status === 'ACTIVE' && (
                                      <span className="badge badge-success" style={{ alignSelf: 'center' }}>
                                        Active
                                      </span>
                                    )}
                                  </div>
                                  <button
                                    className="btn-icon btn-sm focus-ring"
                                    onClick={() => openEditEntry(e)}
                                    aria-label="Edit entry"
                                    title="Edit entry"
                                  >
                                    <Edit2 size={14} />
                                  </button>
                                  <button
                                    className="btn-icon btn-sm focus-ring"
                                    onClick={() => {
                                      setDeleteEntryId(e.id)
                                      setDeleteReason('')
                                    }}
                                    aria-label="Delete entry"
                                    title="Delete entry"
                                  >
                                    <Trash2 size={14} />
                                  </button>
                                </div>
                              )
                            })}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>

                {/* Week total footer */}
                <div
                  className="glass-card"
                  style={{
                    marginTop: 16,
                    padding: 14,
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                  }}
                >
                  <div style={{ fontWeight: 600 }}>Week Total</div>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      fontSize: 16,
                      fontWeight: 700,
                      color:
                        timesheet.weekTotal.workedMinutes > 40 * 60
                          ? 'var(--warning)'
                          : 'var(--text-primary)',
                    }}
                  >
                    {timesheet.weekTotal.workedMinutes > 40 * 60 && <AlertTriangle size={16} />}
                    {formatDuration(timesheet.weekTotal.workedMinutes)}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Reports Tab ────────────────────────── */}
      {tab === 'reports' && (
        <div>
          <div
            className="glass-card"
            style={{
              padding: 14,
              marginBottom: 16,
              display: 'flex',
              gap: 12,
              alignItems: 'center',
              flexWrap: 'wrap',
            }}
          >
            <div className="form-group" style={{ margin: 0 }}>
              <label className="label">Start</label>
              <input
                type="date"
                className="input focus-ring"
                value={reportRangeStart}
                onChange={(e) => setReportRangeStart(e.target.value)}
              />
            </div>
            <div className="form-group" style={{ margin: 0 }}>
              <label className="label">End</label>
              <input
                type="date"
                className="input focus-ring"
                value={reportRangeEnd}
                onChange={(e) => setReportRangeEnd(e.target.value)}
              />
            </div>
            <div className="form-group" style={{ margin: 0 }}>
              <label className="label">Department</label>
              <select
                className="input focus-ring"
                value={reportDeptFilter}
                onChange={(e) => setReportDeptFilter(e.target.value)}
              >
                <option value="">All</option>
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </div>
            <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
              <button className="btn-ghost btn-sm focus-ring" onClick={loadReport}>
                Refresh
              </button>
              <button className="btn-gradient btn-sm focus-ring" onClick={handleExportAllCsv}>
                <Download size={14} /> Export CSV
              </button>
            </div>
          </div>

          <div className="glass-card" style={{ padding: 0, overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: 'var(--bg-surface)', borderBottom: '1px solid var(--border-subtle)' }}>
                  {[
                    { key: 'name', label: 'User' },
                    { key: 'department', label: 'Department' },
                    { key: 'workedMinutes', label: 'Worked' },
                    { key: 'breakMinutes', label: 'Break' },
                    { key: 'daysWorked', label: 'Days' },
                    { key: 'overtimeMinutes', label: 'Overtime' },
                    { key: 'status', label: 'Status' },
                  ].map((col) => (
                    <th
                      key={col.key}
                      onClick={() =>
                        setReportSort((prev) =>
                          prev.key === col.key
                            ? { key: col.key, dir: prev.dir === 'asc' ? 'desc' : 'asc' }
                            : { key: col.key, dir: 'desc' }
                        )
                      }
                      style={{
                        padding: '12px 14px',
                        textAlign: 'left',
                        fontSize: 12,
                        fontWeight: 600,
                        color: 'var(--text-secondary)',
                        textTransform: 'uppercase',
                        letterSpacing: '0.03em',
                        cursor: 'pointer',
                      }}
                    >
                      {col.label}
                      {reportSort.key === col.key && (reportSort.dir === 'asc' ? ' ↑' : ' ↓')}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loadingReport ? (
                  <tr>
                    <td colSpan={7} style={{ padding: 24, textAlign: 'center' }}>
                      <Loader2 size={16} className="spinner" />
                    </td>
                  </tr>
                ) : sortedReportRows.length === 0 ? (
                  <tr>
                    <td colSpan={7} style={{ padding: 24, textAlign: 'center', color: 'var(--text-muted)' }}>
                      No data for the selected range.
                    </td>
                  </tr>
                ) : (
                  sortedReportRows.map((r) => (
                    <tr key={r.userId} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                      <td style={{ padding: '12px 14px', fontWeight: 600 }}>{r.name}</td>
                      <td style={{ padding: '12px 14px', color: 'var(--text-secondary)' }}>{r.department}</td>
                      <td style={{ padding: '12px 14px' }}>{formatDuration(r.workedMinutes)}</td>
                      <td style={{ padding: '12px 14px' }}>{formatDuration(r.breakMinutes)}</td>
                      <td style={{ padding: '12px 14px' }}>{r.daysWorked}</td>
                      <td style={{ padding: '12px 14px' }}>{formatDuration(r.overtimeMinutes)}</td>
                      <td style={{ padding: '12px 14px' }}>
                        {r.status === 'overtime' ? (
                          <span className="badge badge-warning">Overtime</span>
                        ) : (
                          <span className="badge badge-success">On Track</span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Entry Modal ────────────────────────── */}
      {showEntryModal && entryForm && (
        <div className="modal-overlay" onClick={closeEntryModal}>
          <div
            className="modal animate-scale-in"
            onClick={(e) => e.stopPropagation()}
            style={{ maxWidth: 640, width: '95%' }}
          >
            <div className="modal-header">
              <h2 style={{ fontSize: 18, fontWeight: 700 }}>
                {entryForm.id ? 'Edit Time Entry' : 'Add Time Entry'}
              </h2>
              <button
                className="btn-icon btn-sm focus-ring"
                onClick={closeEntryModal}
                aria-label="Close"
                title="Close"
              >
                <X size={16} />
              </button>
            </div>
            <div className="modal-body">
              {entryError && (
                <div
                  style={{
                    marginBottom: 12,
                    padding: 10,
                    borderRadius: 'var(--radius-md)',
                    background: 'rgba(239,68,68,0.1)',
                    border: '1px solid rgba(239,68,68,0.3)',
                    color: 'var(--danger)',
                    fontSize: 13,
                  }}
                >
                  {entryError}
                </div>
              )}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
                <div className="form-group">
                  <label className="label">Date</label>
                  <input
                    type="date"
                    className="input focus-ring"
                    value={entryForm.date}
                    onChange={(e) => setEntryForm({ ...entryForm, date: e.target.value })}
                  />
                </div>
                <div className="form-group">
                  <label className="label">Clock In</label>
                  <input
                    type="time"
                    className="input focus-ring"
                    value={entryForm.clockInAt}
                    onChange={(e) => setEntryForm({ ...entryForm, clockInAt: e.target.value })}
                  />
                </div>
                <div className="form-group">
                  <label className="label">Clock Out</label>
                  <input
                    type="time"
                    className="input focus-ring"
                    value={entryForm.clockOutAt}
                    onChange={(e) => setEntryForm({ ...entryForm, clockOutAt: e.target.value })}
                  />
                </div>
              </div>

              <div style={{ marginTop: 16 }}>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: 8,
                  }}
                >
                  <label className="label" style={{ margin: 0 }}>
                    Breaks
                  </label>
                  <button className="btn-ghost btn-sm focus-ring" onClick={addBreakRow}>
                    <Plus size={12} /> Add Break
                  </button>
                </div>
                {entryForm.breaks.length === 0 ? (
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', padding: 8 }}>No breaks</div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {entryForm.breaks.map((b, idx) => (
                      <div
                        key={idx}
                        style={{
                          display: 'grid',
                          gridTemplateColumns: '1fr 1fr 110px 120px auto',
                          gap: 8,
                          alignItems: 'end',
                        }}
                      >
                        <div className="form-group" style={{ margin: 0 }}>
                          <label className="label" style={{ fontSize: 10 }}>
                            Start
                          </label>
                          <input
                            type="datetime-local"
                            className="input focus-ring"
                            value={b.startAt}
                            onChange={(e) => updateBreakRow(idx, { startAt: e.target.value })}
                          />
                        </div>
                        <div className="form-group" style={{ margin: 0 }}>
                          <label className="label" style={{ fontSize: 10 }}>
                            End
                          </label>
                          <input
                            type="datetime-local"
                            className="input focus-ring"
                            value={b.endAt}
                            onChange={(e) => updateBreakRow(idx, { endAt: e.target.value })}
                          />
                        </div>
                        <div className="form-group" style={{ margin: 0 }}>
                          <label className="label" style={{ fontSize: 10 }}>
                            Planned
                          </label>
                          <select
                            className="input focus-ring"
                            value={b.plannedMinutes}
                            onChange={(e) =>
                              updateBreakRow(idx, { plannedMinutes: Number(e.target.value) })
                            }
                          >
                            <option value={30}>30 min</option>
                            <option value={45}>45 min</option>
                            <option value={60}>60 min</option>
                          </select>
                        </div>
                        <div className="form-group" style={{ margin: 0 }}>
                          <label className="label" style={{ fontSize: 10 }}>
                            Type
                          </label>
                          <select
                            className="input focus-ring"
                            value={b.type}
                            onChange={(e) => updateBreakRow(idx, { type: e.target.value })}
                          >
                            <option value="LUNCH">Lunch</option>
                            <option value="SHORT">Short</option>
                            <option value="OTHER">Other</option>
                          </select>
                        </div>
                        <button
                          className="btn-icon btn-sm focus-ring"
                          onClick={() => removeBreakRow(idx)}
                          aria-label="Remove break"
                          title="Remove break"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="form-group" style={{ marginTop: 16 }}>
                <label className="label">Notes</label>
                <textarea
                  className="input focus-ring"
                  rows={2}
                  value={entryForm.notes}
                  onChange={(e) => setEntryForm({ ...entryForm, notes: e.target.value })}
                />
              </div>

              <div className="form-group">
                <label className="label">
                  Reason <span style={{ color: 'var(--danger)' }}>*</span>
                </label>
                <textarea
                  className="input focus-ring"
                  rows={2}
                  placeholder="Why are you creating/editing this entry?"
                  value={entryForm.reason}
                  onChange={(e) => setEntryForm({ ...entryForm, reason: e.target.value })}
                />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn-ghost focus-ring" onClick={closeEntryModal} disabled={savingEntry}>
                Cancel
              </button>
              <button
                className="btn-gradient focus-ring"
                onClick={saveEntry}
                disabled={savingEntry || !entryForm.reason.trim()}
              >
                {savingEntry ? <Loader2 size={14} className="spinner" /> : <Save size={14} />}
                Save Entry
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Delete Modal ────────────────────────── */}
      {deleteEntryId && (
        <div
          className="modal-overlay"
          onClick={() => {
            setDeleteEntryId(null)
            setDeleteReason('')
          }}
        >
          <div
            className="modal animate-scale-in"
            onClick={(e) => e.stopPropagation()}
            style={{ maxWidth: 460, width: '95%' }}
          >
            <div className="modal-header">
              <h2 style={{ fontSize: 18, fontWeight: 700 }}>Delete Time Entry</h2>
              <button
                className="btn-icon btn-sm focus-ring"
                onClick={() => {
                  setDeleteEntryId(null)
                  setDeleteReason('')
                }}
                aria-label="Close"
                title="Close"
              >
                <X size={16} />
              </button>
            </div>
            <div className="modal-body">
              <p style={{ marginBottom: 12, color: 'var(--text-secondary)' }}>
                This action cannot be undone. A reason is required for the audit log.
              </p>
              <div className="form-group">
                <label className="label">
                  Reason <span style={{ color: 'var(--danger)' }}>*</span>
                </label>
                <textarea
                  className="input focus-ring"
                  rows={3}
                  value={deleteReason}
                  onChange={(e) => setDeleteReason(e.target.value)}
                />
              </div>
            </div>
            <div className="modal-footer">
              <button
                className="btn-ghost focus-ring"
                onClick={() => {
                  setDeleteEntryId(null)
                  setDeleteReason('')
                }}
                disabled={deleting}
              >
                Cancel
              </button>
              <button
                className="btn-danger focus-ring"
                onClick={confirmDelete}
                disabled={deleting || !deleteReason.trim()}
              >
                {deleting ? <Loader2 size={14} className="spinner" /> : <Trash2 size={14} />}
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Subcomponents ──────────────────────────────────────────────────────
function Avatar({
  user,
  size = 32,
}: {
  user: { name: string | null; avatarColor: string }
  size?: number
}) {
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        background: user.avatarColor,
        color: '#fff',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontWeight: 700,
        fontSize: size * 0.4,
        flexShrink: 0,
      }}
    >
      {getInitials(user.name || '?')}
    </div>
  )
}

function LiveUserCard({
  user,
  now,
  onOpen,
}: {
  user: AdminUser
  now: Date
  onOpen: () => void
}) {
  const onShift = Boolean(user.currentEntry) && !user.currentBreak
  const onBreak = Boolean(user.currentBreak)
  const liveStatus: 'on_shift' | 'on_break' | 'clocked_out' = onShift
    ? 'on_shift'
    : onBreak
      ? 'on_break'
      : 'clocked_out'

  // Elapsed on-shift time
  let elapsedMinutes = 0
  if (user.currentEntry) {
    elapsedMinutes = Math.max(
      0,
      Math.floor((now.getTime() - new Date(user.currentEntry.clockInAt).getTime()) / 60000)
    )
  }

  // Break elapsed
  let breakElapsed = 0
  let breakOverPlanned = false
  if (user.currentBreak) {
    breakElapsed = Math.max(
      0,
      Math.floor((now.getTime() - new Date(user.currentBreak.startAt).getTime()) / 60000)
    )
    breakOverPlanned = breakElapsed > (user.currentBreak.plannedMinutes || 0)
  }

  const dotColor =
    liveStatus === 'on_shift' ? 'var(--success)' : liveStatus === 'on_break' ? 'var(--warning)' : 'var(--text-muted)'
  const statusLabel =
    liveStatus === 'on_shift' ? 'On Shift' : liveStatus === 'on_break' ? 'On Break' : 'Clocked Out'

  const weekHours = user.weekTotal.workedMinutes / 60
  const weekPct = Math.min(100, (weekHours / 40) * 100)
  const overtime = user.weekTotal.workedMinutes > 40 * 60

  return (
    <div
      className="glass-card"
      style={{
        padding: 16,
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
        cursor: 'pointer',
        transition: 'var(--transition-smooth)',
      }}
      onClick={onOpen}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <Avatar user={user} size={44} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontSize: 15,
              fontWeight: 700,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {user.name || 'Unknown'}
          </div>
          <div style={{ display: 'flex', gap: 6, marginTop: 2, flexWrap: 'wrap' }}>
            <span className="badge badge-muted">{user.role}</span>
            {user.department && (
              <span
                className="badge"
                style={{
                  background: `${user.department.color}20`,
                  color: user.department.color,
                  border: `1px solid ${user.department.color}40`,
                }}
              >
                {user.department.name}
              </span>
            )}
          </div>
        </div>
      </div>

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: '8px 12px',
          borderRadius: 'var(--radius-md)',
          background: 'var(--bg-surface)',
          border: '1px solid var(--border-subtle)',
        }}
      >
        <span
          style={{
            width: 10,
            height: 10,
            borderRadius: '50%',
            background: dotColor,
            boxShadow: liveStatus !== 'clocked_out' ? `0 0 10px ${dotColor}` : undefined,
          }}
        />
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 13, fontWeight: 600 }}>{statusLabel}</div>
          {liveStatus === 'on_shift' && user.currentEntry && (
            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
              Since {formatTime(user.currentEntry.clockInAt)} · {formatDuration(elapsedMinutes)}
            </div>
          )}
          {liveStatus === 'on_break' && user.currentBreak && (
            <div style={{ fontSize: 11, color: breakOverPlanned ? 'var(--warning)' : 'var(--text-muted)' }}>
              {user.currentBreak.type.toLowerCase()} · {formatDuration(breakElapsed)}
              {breakOverPlanned && ' · Over planned!'}
            </div>
          )}
          {liveStatus === 'clocked_out' && user.lastEntry && (
            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
              Last: {formatDate(user.lastEntry.clockInAt)}
            </div>
          )}
        </div>
      </div>

      {/* Week progress bar */}
      <div>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 4,
          }}
        >
          <span style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
            This Week
          </span>
          <span
            style={{
              fontSize: 12,
              fontWeight: 600,
              color: overtime ? 'var(--warning)' : 'var(--text-primary)',
              display: 'flex',
              alignItems: 'center',
              gap: 4,
            }}
          >
            {overtime && <AlertTriangle size={11} />}
            {formatDuration(user.weekTotal.workedMinutes)}
          </span>
        </div>
        <div
          style={{
            height: 6,
            background: 'var(--bg-surface)',
            borderRadius: 99,
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              width: `${weekPct}%`,
              height: '100%',
              background: overtime ? 'var(--warning)' : 'var(--brand-gradient)',
              transition: 'width 300ms ease',
            }}
          />
        </div>
      </div>

      <button
        className="btn-ghost btn-sm focus-ring"
        onClick={(e) => {
          e.stopPropagation()
          onOpen()
        }}
      >
        View Timesheet
      </button>
    </div>
  )
}
