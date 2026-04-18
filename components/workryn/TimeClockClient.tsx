'use client'
import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import {
  Clock, Play, Pause, Square, Coffee, Calendar,
  ChevronLeft, ChevronRight, AlertTriangle, Check, Loader2, X,
} from 'lucide-react'

// ───────────────────────── Types ─────────────────────────

type TimeBreak = {
  id: string
  timeEntryId: string
  startAt: string
  endAt: string | null
  plannedMinutes: number
  actualMinutes: number | null
  type: 'LUNCH' | 'SHORT' | 'OTHER' | string
  createdAt: string
}

type TimeEntry = {
  id: string
  userId: string
  clockInAt: string
  clockOutAt: string | null
  totalMinutes: number
  breakMinutes: number
  workedMinutes: number
  status: 'ACTIVE' | 'COMPLETED' | 'EDITED' | string
  notes: string | null
  editedById: string | null
  editReason: string | null
  breaks: TimeBreak[]
  createdAt: string
  updatedAt: string
}

type StatusResponse = {
  isClockedIn: boolean
  currentEntry: TimeEntry | null
  currentBreak: TimeBreak | null
  weekStart: string
  weekTotal: { workedMinutes: number; breakMinutes: number; days: number }
  todayTotal: { workedMinutes: number }
}

type TimesheetResponse = {
  weekStart: string
  weekEnd: string
  entries: TimeEntry[]
  totals: {
    workedMinutes: number
    breakMinutes: number
    totalMinutes: number
    daysWorked: number
    isOvertime: boolean
  }
}

type HistoryResponse = {
  entries: TimeEntry[]
  total: number
  limit: number
  offset: number
  hasMore: boolean
}

interface Props {
  initialCurrentEntry: TimeEntry | null
  initialWeekEntries: TimeEntry[]
  initialWeekStart: string
  userName: string
}

// ───────────────────────── Helpers ─────────────────────────

function formatDuration(minutes: number): string {
  if (!Number.isFinite(minutes) || minutes < 0) minutes = 0
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  if (h === 0) return `${m}m`
  if (m === 0) return `${h}h`
  return `${h}h ${m}m`
}

function formatHMS(totalSeconds: number): string {
  if (!Number.isFinite(totalSeconds) || totalSeconds < 0) totalSeconds = 0
  const h = Math.floor(totalSeconds / 3600)
  const m = Math.floor((totalSeconds % 3600) / 60)
  const s = Math.floor(totalSeconds % 60)
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

function formatTime(d: Date | string | null | undefined): string {
  if (!d) return '—'
  const date = typeof d === 'string' ? new Date(d) : d
  return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
}

function formatDate(d: Date | string): string {
  const date = typeof d === 'string' ? new Date(d) : d
  return date.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
}

function formatShortDate(d: Date | string): string {
  const date = typeof d === 'string' ? new Date(d) : d
  return date.toLocaleDateString([], { month: 'short', day: 'numeric' })
}

function getWeekStart(date: Date): Date {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  const day = d.getDay()
  const diff = day === 0 ? -6 : 1 - day
  d.setDate(d.getDate() + diff)
  return d
}

function sameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}

function computeLiveEntryMinutes(entry: TimeEntry, now: Date): { worked: number; breakMins: number; total: number } {
  if (entry.status !== 'ACTIVE') {
    return {
      worked: entry.workedMinutes,
      breakMins: entry.breakMinutes,
      total: entry.totalMinutes,
    }
  }
  const clockInMs = new Date(entry.clockInAt).getTime()
  const total = Math.max(0, Math.floor((now.getTime() - clockInMs) / 60000))
  let breakMins = 0
  for (const b of entry.breaks) {
    if (b.endAt) {
      breakMins += b.actualMinutes ?? 0
    } else {
      breakMins += Math.max(0, Math.floor((now.getTime() - new Date(b.startAt).getTime()) / 60000))
    }
  }
  return { worked: Math.max(0, total - breakMins), breakMins, total }
}

// ───────────────────────── Main component ─────────────────────────

export default function TimeClockClient({
  initialCurrentEntry,
  initialWeekEntries,
  initialWeekStart,
  userName,
}: Props) {
  const [tab, setTab] = useState<'clock' | 'timesheet' | 'history'>('clock')
  const [currentEntry, setCurrentEntry] = useState<TimeEntry | null>(initialCurrentEntry)
  const [weekEntries, setWeekEntries] = useState<TimeEntry[]>(initialWeekEntries)
  const [now, setNow] = useState<Date>(() => new Date())
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showBreakPicker, setShowBreakPicker] = useState(false)
  const [showClockOutConfirm, setShowClockOutConfirm] = useState(false)

  // Live ticking clock (1 Hz)
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(id)
  }, [])

  // Poll /status every 30 seconds
  const refreshStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/workryn/time-clock/status', { cache: 'no-store' })
      if (!res.ok) return
      const data: StatusResponse = await res.json()
      setCurrentEntry(data.currentEntry)
      // Merge: replace current-week entries if found
      // We also pull timesheet for current week separately via tab state
    } catch {
      // silent
    }
  }, [])

  const refreshWeek = useCallback(async (weekStartIso?: string) => {
    try {
      const url = weekStartIso
        ? `/api/time-clock/timesheet?weekStart=${encodeURIComponent(weekStartIso)}`
        : '/api/time-clock/timesheet'
      const res = await fetch(url, { cache: 'no-store' })
      if (!res.ok) return null
      const data: TimesheetResponse = await res.json()
      return data
    } catch {
      return null
    }
  }, [])

  useEffect(() => {
    const id = setInterval(() => {
      refreshStatus()
    }, 30_000)
    return () => clearInterval(id)
  }, [refreshStatus])

  // Derived: current active break
  const currentBreak = useMemo(
    () => currentEntry?.breaks.find((b) => !b.endAt) ?? null,
    [currentEntry],
  )

  const isClockedIn = Boolean(currentEntry)
  const isOnBreak = Boolean(currentBreak)

  // Shift elapsed (seconds)
  const shiftElapsedSec = useMemo(() => {
    if (!currentEntry) return 0
    return Math.max(0, Math.floor((now.getTime() - new Date(currentEntry.clockInAt).getTime()) / 1000))
  }, [currentEntry, now])

  // Break elapsed (seconds)
  const breakElapsedSec = useMemo(() => {
    if (!currentBreak) return 0
    return Math.max(0, Math.floor((now.getTime() - new Date(currentBreak.startAt).getTime()) / 1000))
  }, [currentBreak, now])

  const breakOver = currentBreak && breakElapsedSec > currentBreak.plannedMinutes * 60

  // ─── API actions ───

  async function handleClockIn() {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/workryn/time-clock/clock-in', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => null)
        throw new Error(data?.error || 'Failed to clock in')
      }
      const entry: TimeEntry = await res.json()
      setCurrentEntry(entry)
      // Refresh week summary
      const ts = await refreshWeek(initialWeekStart)
      if (ts) setWeekEntries(ts.entries)
    } catch (e: any) {
      setError(e?.message ?? 'Failed to clock in')
    } finally {
      setBusy(false)
    }
  }

  async function handleClockOut() {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/workryn/time-clock/clock-out', { method: 'POST' })
      if (!res.ok) {
        const data = await res.json().catch(() => null)
        throw new Error(data?.error || 'Failed to clock out')
      }
      setCurrentEntry(null)
      setShowClockOutConfirm(false)
      const ts = await refreshWeek(initialWeekStart)
      if (ts) setWeekEntries(ts.entries)
    } catch (e: any) {
      setError(e?.message ?? 'Failed to clock out')
    } finally {
      setBusy(false)
    }
  }

  async function handleStartBreak(plannedMinutes: 30 | 45 | 60, type: 'SHORT' | 'LUNCH' | 'OTHER') {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/workryn/time-clock/break/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plannedMinutes, type }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => null)
        throw new Error(data?.error || 'Failed to start break')
      }
      setShowBreakPicker(false)
      await refreshStatus()
    } catch (e: any) {
      setError(e?.message ?? 'Failed to start break')
    } finally {
      setBusy(false)
    }
  }

  async function handleEndBreak() {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/workryn/time-clock/break/end', { method: 'POST' })
      if (!res.ok) {
        const data = await res.json().catch(() => null)
        throw new Error(data?.error || 'Failed to end break')
      }
      await refreshStatus()
    } catch (e: any) {
      setError(e?.message ?? 'Failed to end break')
    } finally {
      setBusy(false)
    }
  }

  // ─── Week totals (live) ───
  const weekTotals = useMemo(() => {
    let worked = 0
    let breakMins = 0
    const daysSet = new Set<string>()
    const allEntries = [...weekEntries]
    // If current active entry is not in weekEntries, include its live worked time
    if (currentEntry && !weekEntries.some((e) => e.id === currentEntry.id)) {
      allEntries.push(currentEntry)
    } else if (currentEntry) {
      // Replace with live version
      const idx = allEntries.findIndex((e) => e.id === currentEntry.id)
      if (idx >= 0) allEntries[idx] = currentEntry
    }
    for (const e of allEntries) {
      const m = computeLiveEntryMinutes(e, now)
      worked += m.worked
      breakMins += m.breakMins
      const d = new Date(e.clockInAt)
      daysSet.add(`${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`)
    }
    return { worked, breakMins, days: daysSet.size }
  }, [weekEntries, currentEntry, now])

  const weekProgress = Math.min(100, (weekTotals.worked / 2400) * 100)
  const overtimeMinutes = Math.max(0, weekTotals.worked - 2400)

  // ─── Today's entries ───
  const todayEntries = useMemo(() => {
    const allEntries = [...weekEntries]
    if (currentEntry && !weekEntries.some((e) => e.id === currentEntry.id)) {
      allEntries.push(currentEntry)
    } else if (currentEntry) {
      const idx = allEntries.findIndex((e) => e.id === currentEntry.id)
      if (idx >= 0) allEntries[idx] = currentEntry
    }
    return allEntries
      .filter((e) => sameDay(new Date(e.clockInAt), now))
      .sort((a, b) => new Date(a.clockInAt).getTime() - new Date(b.clockInAt).getTime())
  }, [weekEntries, currentEntry, now])

  return (
    <div style={{ padding: '1.5rem 2rem', maxWidth: 1400, margin: '0 auto' }}>
      <header style={{ marginBottom: '1.5rem' }}>
        <h1 className="gradient-text" style={{ fontSize: '2rem', fontWeight: 800, margin: 0 }}>
          Time Clock
        </h1>
        <p style={{ color: 'var(--text-secondary)', marginTop: '.25rem' }}>
          Clock in, take breaks, and track your weekly hours.
        </p>
      </header>

      {/* Tabs */}
      <div
        role="tablist"
        style={{
          display: 'flex',
          gap: '.5rem',
          marginBottom: '1.5rem',
          borderBottom: '1px solid var(--border-subtle)',
          paddingBottom: '.25rem',
        }}
      >
        {([
          { id: 'clock', label: 'Clock', icon: Clock },
          { id: 'timesheet', label: 'My Timesheet', icon: Calendar },
          { id: 'history', label: 'History', icon: Check },
        ] as const).map(({ id, label, icon: Icon }) => {
          const active = tab === id
          return (
            <button
              key={id}
              role="tab"
              aria-selected={active}
              className="focus-ring"
              onClick={() => setTab(id)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '.5rem',
                padding: '.75rem 1.25rem',
                background: active ? 'var(--brand-gradient-subtle)' : 'transparent',
                color: active ? 'var(--text-primary)' : 'var(--text-secondary)',
                border: 'none',
                borderBottom: active ? '2px solid var(--brand)' : '2px solid transparent',
                borderRadius: 'var(--radius-md) var(--radius-md) 0 0',
                fontWeight: 600,
                fontSize: '.925rem',
                cursor: 'pointer',
                transition: 'var(--transition-smooth)',
              }}
            >
              <Icon size={16} />
              {label}
            </button>
          )
        })}
      </div>

      {error && (
        <div
          className="animate-slide-up"
          style={{
            marginBottom: '1rem',
            padding: '.875rem 1rem',
            borderRadius: 'var(--radius-md)',
            background: 'color-mix(in srgb, var(--danger) 12%, transparent)',
            border: '1px solid color-mix(in srgb, var(--danger) 40%, transparent)',
            color: 'var(--danger)',
            display: 'flex',
            alignItems: 'center',
            gap: '.5rem',
            fontSize: '.875rem',
          }}
        >
          <AlertTriangle size={16} />
          {error}
          <button
            onClick={() => setError(null)}
            style={{ marginLeft: 'auto', background: 'transparent', border: 'none', color: 'inherit', cursor: 'pointer' }}
            aria-label="Dismiss"
          >
            <X size={16} />
          </button>
        </div>
      )}

      {tab === 'clock' && (
        <ClockTab
          now={now}
          userName={userName}
          isClockedIn={isClockedIn}
          isOnBreak={isOnBreak}
          currentEntry={currentEntry}
          currentBreak={currentBreak}
          shiftElapsedSec={shiftElapsedSec}
          breakElapsedSec={breakElapsedSec}
          breakOver={!!breakOver}
          busy={busy}
          onClockIn={handleClockIn}
          onClockOut={() => setShowClockOutConfirm(true)}
          onStartBreak={() => setShowBreakPicker(true)}
          onEndBreak={handleEndBreak}
          weekTotals={weekTotals}
          weekProgress={weekProgress}
          overtimeMinutes={overtimeMinutes}
          todayEntries={todayEntries}
        />
      )}

      {tab === 'timesheet' && (
        <TimesheetTab refreshWeek={refreshWeek} initialWeekStart={initialWeekStart} />
      )}

      {tab === 'history' && <HistoryTab />}

      {/* Break picker modal */}
      {showBreakPicker && (
        <div className="modal-overlay" onClick={() => setShowBreakPicker(false)}>
          <div
            className="modal animate-scale-in"
            onClick={(e) => e.stopPropagation()}
            style={{ maxWidth: 560 }}
          >
            <div className="modal-header">
              <h2 style={{ margin: 0, fontSize: '1.125rem', fontWeight: 700 }}>Choose break duration</h2>
              <button
                className="btn btn-icon btn-ghost"
                onClick={() => setShowBreakPicker(false)}
                aria-label="Close"
              >
                <X size={18} />
              </button>
            </div>
            <div className="modal-body">
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '.875rem' }}>
                {[
                  { mins: 30 as const, type: 'SHORT' as const, label: 'Short Break', sub: '30 minutes' },
                  { mins: 45 as const, type: 'LUNCH' as const, label: 'Lunch', sub: '45 minutes' },
                  { mins: 60 as const, type: 'LUNCH' as const, label: 'Lunch', sub: '60 minutes' },
                ].map((opt) => (
                  <button
                    key={opt.mins}
                    disabled={busy}
                    onClick={() => handleStartBreak(opt.mins, opt.type)}
                    className="focus-ring"
                    style={{
                      padding: '1.25rem 1rem',
                      background: 'var(--bg-elevated)',
                      border: '1px solid var(--border-default)',
                      borderRadius: 'var(--radius-lg)',
                      cursor: busy ? 'not-allowed' : 'pointer',
                      textAlign: 'center',
                      transition: 'var(--transition-smooth)',
                      color: 'var(--text-primary)',
                      opacity: busy ? 0.7 : 1,
                    }}
                    onMouseEnter={(e) => {
                      if (!busy) {
                        e.currentTarget.style.borderColor = 'var(--brand)'
                        e.currentTarget.style.boxShadow = 'var(--shadow-glow)'
                      }
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.borderColor = 'var(--border-default)'
                      e.currentTarget.style.boxShadow = 'none'
                    }}
                  >
                    <Coffee size={28} style={{ color: 'var(--brand)', marginBottom: '.5rem' }} />
                    <div style={{ fontWeight: 700, fontSize: '1rem' }}>{opt.label}</div>
                    <div style={{ color: 'var(--text-muted)', fontSize: '.8125rem', marginTop: '.125rem' }}>
                      {opt.sub}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Clock out confirm */}
      {showClockOutConfirm && (
        <div className="modal-overlay" onClick={() => setShowClockOutConfirm(false)}>
          <div
            className="modal animate-scale-in"
            onClick={(e) => e.stopPropagation()}
            style={{ maxWidth: 440 }}
          >
            <div className="modal-header">
              <h2 style={{ margin: 0, fontSize: '1.125rem', fontWeight: 700 }}>Clock out?</h2>
              <button
                className="btn btn-icon btn-ghost"
                onClick={() => setShowClockOutConfirm(false)}
                aria-label="Close"
              >
                <X size={18} />
              </button>
            </div>
            <div className="modal-body">
              <p style={{ margin: 0, color: 'var(--text-secondary)' }}>
                You have worked <strong style={{ color: 'var(--text-primary)' }}>{formatHMS(shiftElapsedSec)}</strong>{' '}
                since clocking in. Are you sure you want to clock out?
              </p>
              {isOnBreak && (
                <p style={{ marginTop: '.75rem', color: 'var(--warning)', fontSize: '.875rem' }}>
                  You are currently on break. It will be ended automatically.
                </p>
              )}
            </div>
            <div className="modal-footer">
              <button
                className="btn btn-ghost"
                onClick={() => setShowClockOutConfirm(false)}
                disabled={busy}
              >
                Cancel
              </button>
              <button
                className="btn btn-danger"
                onClick={handleClockOut}
                disabled={busy}
              >
                {busy ? <Loader2 size={16} className="spinner" /> : <Square size={16} />}
                Clock Out
              </button>
            </div>
          </div>
        </div>
      )}

      <style jsx>{`
        @keyframes pulseDot {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: .5; transform: scale(.85); }
        }
      `}</style>
    </div>
  )
}

// ───────────────────────── Clock Tab ─────────────────────────

function ClockTab({
  now, userName, isClockedIn, isOnBreak, currentEntry, currentBreak,
  shiftElapsedSec, breakElapsedSec, breakOver, busy,
  onClockIn, onClockOut, onStartBreak, onEndBreak,
  weekTotals, weekProgress, overtimeMinutes, todayEntries,
}: {
  now: Date
  userName: string
  isClockedIn: boolean
  isOnBreak: boolean
  currentEntry: TimeEntry | null
  currentBreak: TimeBreak | null
  shiftElapsedSec: number
  breakElapsedSec: number
  breakOver: boolean
  busy: boolean
  onClockIn: () => void
  onClockOut: () => void
  onStartBreak: () => void
  onEndBreak: () => void
  weekTotals: { worked: number; breakMins: number; days: number }
  weekProgress: number
  overtimeMinutes: number
  todayEntries: TimeEntry[]
}) {
  const statusColor = isOnBreak ? 'var(--warning)' : isClockedIn ? 'var(--success)' : 'var(--text-muted)'
  const statusLabel = isOnBreak ? 'On Break' : isClockedIn ? 'On Shift' : 'Clocked Out'

  const breakOverByMin = currentBreak
    ? Math.max(0, Math.floor(breakElapsedSec / 60) - currentBreak.plannedMinutes)
    : 0

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'minmax(0, 2fr) minmax(280px, 1fr)',
        gap: '1.5rem',
        alignItems: 'start',
      }}
    >
      {/* LEFT — big status card + today's activity */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', minWidth: 0 }}>
        {/* BIG STATUS CARD */}
        <div
          className="glass-card animate-slide-up"
          style={{
            position: 'relative',
            padding: '2.25rem 2rem',
            borderRadius: 'var(--radius-xl)',
            overflow: 'hidden',
          }}
        >
          {/* Gradient top border */}
          <div
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              height: 3,
              background: 'var(--brand-gradient)',
            }}
          />

          <div
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              justifyContent: 'space-between',
              gap: '1rem',
              flexWrap: 'wrap',
            }}
          >
            <div style={{ minWidth: 0 }}>
              <div
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '.5rem',
                  padding: '.375rem .75rem',
                  borderRadius: 999,
                  background: `color-mix(in srgb, ${statusColor} 15%, transparent)`,
                  color: statusColor,
                  border: `1px solid color-mix(in srgb, ${statusColor} 40%, transparent)`,
                  fontSize: '.8125rem',
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  letterSpacing: '.04em',
                  marginBottom: '1rem',
                }}
              >
                {isClockedIn && !isOnBreak && (
                  <span
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: '50%',
                      background: statusColor,
                      animation: 'pulseDot 1.6s ease-in-out infinite',
                    }}
                  />
                )}
                {!isClockedIn && <span style={{ width: 8, height: 8, borderRadius: '50%', background: statusColor }} />}
                {isOnBreak && <Coffee size={12} />}
                {statusLabel}
              </div>

              <div
                style={{
                  fontSize: 'clamp(2.25rem, 5vw, 3.25rem)',
                  fontWeight: 800,
                  lineHeight: 1,
                  fontVariantNumeric: 'tabular-nums',
                  letterSpacing: '-.02em',
                }}
              >
                {now.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', second: '2-digit' })}
              </div>
              <div
                style={{
                  marginTop: '.5rem',
                  color: 'var(--text-secondary)',
                  fontSize: '.9375rem',
                }}
              >
                {formatDate(now)}
              </div>
              {userName && (
                <div style={{ marginTop: '.125rem', color: 'var(--text-muted)', fontSize: '.8125rem' }}>
                  {userName}
                </div>
              )}
            </div>

            {/* Live shift / break timer */}
            {isClockedIn && currentEntry && (
              <div
                style={{
                  textAlign: 'right',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '.5rem',
                  minWidth: 200,
                }}
              >
                <div>
                  <div style={{ color: 'var(--text-muted)', fontSize: '.75rem', textTransform: 'uppercase', letterSpacing: '.06em', fontWeight: 700 }}>
                    Shift duration
                  </div>
                  <div
                    style={{
                      fontSize: '1.75rem',
                      fontWeight: 800,
                      fontVariantNumeric: 'tabular-nums',
                      color: 'var(--text-primary)',
                    }}
                  >
                    {formatHMS(shiftElapsedSec)}
                  </div>
                  <div style={{ color: 'var(--text-muted)', fontSize: '.8125rem' }}>
                    Clocked in at {formatTime(currentEntry.clockInAt)}
                  </div>
                </div>

                {isOnBreak && currentBreak && (
                  <div
                    style={{
                      marginTop: '.5rem',
                      padding: '.75rem .875rem',
                      borderRadius: 'var(--radius-md)',
                      background: breakOver
                        ? 'color-mix(in srgb, var(--danger) 10%, transparent)'
                        : 'color-mix(in srgb, var(--warning) 10%, transparent)',
                      border: `1px solid ${
                        breakOver
                          ? 'color-mix(in srgb, var(--danger) 40%, transparent)'
                          : 'color-mix(in srgb, var(--warning) 40%, transparent)'
                      }`,
                    }}
                  >
                    <div
                      style={{
                        color: breakOver ? 'var(--danger)' : 'var(--warning)',
                        fontSize: '.6875rem',
                        fontWeight: 700,
                        textTransform: 'uppercase',
                        letterSpacing: '.06em',
                      }}
                    >
                      Break ({currentBreak.plannedMinutes}m planned)
                    </div>
                    <div
                      style={{
                        fontSize: '1.375rem',
                        fontWeight: 800,
                        fontVariantNumeric: 'tabular-nums',
                        color: breakOver ? 'var(--danger)' : 'var(--text-primary)',
                      }}
                    >
                      {formatHMS(breakElapsedSec)}
                    </div>
                    {breakOver && (
                      <div style={{ color: 'var(--danger)', fontSize: '.75rem', fontWeight: 600, marginTop: '.125rem' }}>
                        Over by {breakOverByMin} min
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* ACTION BUTTONS */}
          <div style={{ marginTop: '1.75rem', display: 'flex', gap: '.75rem', flexWrap: 'wrap' }}>
            {!isClockedIn && (
              <button
                className="btn btn-gradient focus-ring"
                disabled={busy}
                onClick={onClockIn}
                style={{
                  fontSize: '1rem',
                  padding: '1rem 2rem',
                  minHeight: 56,
                  fontWeight: 700,
                  borderRadius: 'var(--radius-lg)',
                  boxShadow: 'var(--shadow-glow)',
                }}
              >
                {busy ? <Loader2 size={20} className="spinner" /> : <Play size={20} />}
                Clock In
              </button>
            )}

            {isClockedIn && !isOnBreak && (
              <>
                <button
                  className="btn focus-ring"
                  disabled={busy}
                  onClick={onStartBreak}
                  style={{
                    fontSize: '.9375rem',
                    padding: '.875rem 1.5rem',
                    minHeight: 48,
                    fontWeight: 700,
                    background: 'color-mix(in srgb, var(--warning) 15%, var(--bg-elevated))',
                    color: 'var(--warning)',
                    border: '1px solid color-mix(in srgb, var(--warning) 40%, transparent)',
                    borderRadius: 'var(--radius-lg)',
                  }}
                >
                  <Coffee size={18} />
                  Start Break
                </button>
                <button
                  className="btn btn-danger focus-ring"
                  disabled={busy}
                  onClick={onClockOut}
                  style={{
                    fontSize: '.9375rem',
                    padding: '.875rem 1.5rem',
                    minHeight: 48,
                    fontWeight: 700,
                    borderRadius: 'var(--radius-lg)',
                  }}
                >
                  <Square size={18} />
                  Clock Out
                </button>
              </>
            )}

            {isClockedIn && isOnBreak && (
              <button
                className="btn btn-gradient focus-ring"
                disabled={busy}
                onClick={onEndBreak}
                style={{
                  fontSize: '1rem',
                  padding: '1rem 2rem',
                  minHeight: 56,
                  fontWeight: 700,
                  borderRadius: 'var(--radius-lg)',
                  boxShadow: 'var(--shadow-glow)',
                }}
              >
                {busy ? <Loader2 size={20} className="spinner" /> : <Play size={20} />}
                End Break
              </button>
            )}
          </div>

          {breakOver && (
            <div
              style={{
                marginTop: '1rem',
                padding: '.75rem 1rem',
                borderRadius: 'var(--radius-md)',
                background: 'color-mix(in srgb, var(--danger) 12%, transparent)',
                border: '1px solid color-mix(in srgb, var(--danger) 40%, transparent)',
                color: 'var(--danger)',
                fontSize: '.8125rem',
                display: 'flex',
                alignItems: 'center',
                gap: '.5rem',
              }}
            >
              <AlertTriangle size={14} />
              Your break has exceeded the planned duration by {breakOverByMin} minutes.
            </div>
          )}
        </div>

        {/* TODAY'S ACTIVITY */}
        <div className="glass-card animate-slide-up" style={{ padding: '1.5rem', borderRadius: 'var(--radius-xl)' }}>
          <h3 style={{ margin: '0 0 1rem 0', fontSize: '1rem', fontWeight: 700 }}>Today&apos;s Activity</h3>
          {todayEntries.length === 0 ? (
            <div className="empty-state" style={{ padding: '1.5rem 0', color: 'var(--text-muted)' }}>
              <Clock size={28} style={{ opacity: .5, marginBottom: '.5rem' }} />
              <div>No entries yet today</div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '.75rem' }}>
              {todayEntries.map((e) => (
                <EntryRow key={e.id} entry={e} now={now} />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* RIGHT — week summary */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', minWidth: 0 }}>
        <div className="gradient-card animate-slide-up" style={{ padding: '1.5rem', borderRadius: 'var(--radius-xl)' }}>
          <div style={{ color: 'var(--text-muted)', fontSize: '.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: '.75rem' }}>
            This Week
          </div>
          <div
            style={{
              fontSize: '2.5rem',
              fontWeight: 800,
              lineHeight: 1,
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            {formatDuration(weekTotals.worked)}
          </div>
          <div style={{ color: 'var(--text-secondary)', fontSize: '.875rem', marginTop: '.25rem' }}>
            worked across {weekTotals.days} {weekTotals.days === 1 ? 'day' : 'days'}
          </div>

          {/* Progress bar */}
          <div style={{ marginTop: '1.25rem' }}>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                fontSize: '.75rem',
                color: 'var(--text-muted)',
                marginBottom: '.375rem',
              }}
            >
              <span>{Math.round(weekProgress)}% of 40h</span>
              <span>{formatDuration(Math.max(0, 2400 - weekTotals.worked))} left</span>
            </div>
            <div
              style={{
                height: 10,
                background: 'var(--bg-elevated)',
                borderRadius: 999,
                overflow: 'hidden',
                border: '1px solid var(--border-subtle)',
              }}
            >
              <div
                style={{
                  width: `${weekProgress}%`,
                  height: '100%',
                  background: 'var(--brand-gradient)',
                  transition: 'width .4s ease',
                }}
              />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '.75rem', marginTop: '1.25rem' }}>
            <div
              style={{
                padding: '.75rem',
                background: 'var(--bg-elevated)',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--border-subtle)',
              }}
            >
              <div style={{ color: 'var(--text-muted)', fontSize: '.6875rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em' }}>
                Breaks
              </div>
              <div style={{ fontSize: '1.125rem', fontWeight: 700, marginTop: '.125rem' }}>
                {formatDuration(weekTotals.breakMins)}
              </div>
            </div>
            <div
              style={{
                padding: '.75rem',
                background: overtimeMinutes > 0
                  ? 'color-mix(in srgb, var(--danger) 12%, var(--bg-elevated))'
                  : 'var(--bg-elevated)',
                borderRadius: 'var(--radius-md)',
                border: `1px solid ${overtimeMinutes > 0 ? 'color-mix(in srgb, var(--danger) 40%, transparent)' : 'var(--border-subtle)'}`,
              }}
            >
              <div style={{ color: overtimeMinutes > 0 ? 'var(--danger)' : 'var(--text-muted)', fontSize: '.6875rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em' }}>
                Overtime
              </div>
              <div
                style={{
                  fontSize: '1.125rem',
                  fontWeight: 700,
                  marginTop: '.125rem',
                  color: overtimeMinutes > 0 ? 'var(--danger)' : 'var(--text-primary)',
                }}
              >
                {formatDuration(overtimeMinutes)}
              </div>
            </div>
          </div>
        </div>

        {/* Quick help card */}
        <div
          className="glass-card animate-slide-up"
          style={{ padding: '1.25rem', borderRadius: 'var(--radius-xl)', fontSize: '.8125rem', color: 'var(--text-secondary)', lineHeight: 1.6 }}
        >
          <strong style={{ color: 'var(--text-primary)', display: 'block', marginBottom: '.5rem' }}>Quick tips</strong>
          Click <em>Clock In</em> when you start your shift. Use <em>Start Break</em> for lunches and short breaks — your planned time is tracked and you&apos;ll be warned if you go over.
        </div>
      </div>
    </div>
  )
}

// ───────────────────────── Entry row ─────────────────────────

function EntryRow({ entry, now }: { entry: TimeEntry; now: Date }) {
  const live = computeLiveEntryMinutes(entry, now)
  const isActive = entry.status === 'ACTIVE'
  return (
    <div
      style={{
        padding: '.875rem 1rem',
        background: 'var(--bg-elevated)',
        border: '1px solid var(--border-subtle)',
        borderRadius: 'var(--radius-md)',
        display: 'flex',
        alignItems: 'center',
        gap: '1rem',
        flexWrap: 'wrap',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '.5rem', minWidth: 140 }}>
        <Clock size={14} style={{ color: 'var(--brand)' }} />
        <span style={{ fontWeight: 600, fontSize: '.875rem' }}>
          {formatTime(entry.clockInAt)} → {entry.clockOutAt ? formatTime(entry.clockOutAt) : 'now'}
        </span>
      </div>

      {entry.breaks.length > 0 && (
        <div style={{ display: 'flex', gap: '.375rem', flexWrap: 'wrap', flex: 1 }}>
          {entry.breaks.map((b) => {
            const mins = b.endAt
              ? (b.actualMinutes ?? 0)
              : Math.max(0, Math.floor((now.getTime() - new Date(b.startAt).getTime()) / 60000))
            const over = mins > b.plannedMinutes
            return (
              <span
                key={b.id}
                className="badge"
                style={{
                  background: over ? 'color-mix(in srgb, var(--danger) 15%, transparent)' : 'color-mix(in srgb, var(--warning) 15%, transparent)',
                  color: over ? 'var(--danger)' : 'var(--warning)',
                  border: `1px solid ${over ? 'color-mix(in srgb, var(--danger) 35%, transparent)' : 'color-mix(in srgb, var(--warning) 35%, transparent)'}`,
                  fontSize: '.6875rem',
                  fontWeight: 700,
                }}
              >
                <Coffee size={10} /> {b.type.toLowerCase()} {mins}m
                {!b.endAt && ' (active)'}
              </span>
            )
          })}
        </div>
      )}

      <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '.625rem' }}>
        {isActive ? (
          <span className="badge badge-success" style={{ fontSize: '.6875rem' }}>
            ACTIVE
          </span>
        ) : (
          <span className="badge badge-muted" style={{ fontSize: '.6875rem' }}>
            {entry.status}
          </span>
        )}
        <div style={{ fontWeight: 700, fontSize: '.9375rem', fontVariantNumeric: 'tabular-nums' }}>
          {formatDuration(live.worked)}
        </div>
      </div>
    </div>
  )
}

// ───────────────────────── Timesheet Tab ─────────────────────────

function TimesheetTab({
  refreshWeek,
  initialWeekStart,
}: {
  refreshWeek: (weekStartIso?: string) => Promise<TimesheetResponse | null>
  initialWeekStart: string
}) {
  const [weekStart, setWeekStart] = useState<Date>(() => new Date(initialWeekStart))
  const [data, setData] = useState<TimesheetResponse | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(
    async (ws: Date) => {
      setLoading(true)
      const result = await refreshWeek(ws.toISOString())
      setData(result)
      setLoading(false)
    },
    [refreshWeek],
  )

  useEffect(() => {
    load(weekStart)
  }, [weekStart, load])

  const goPrev = () => {
    const d = new Date(weekStart)
    d.setDate(d.getDate() - 7)
    setWeekStart(d)
  }
  const goNext = () => {
    const d = new Date(weekStart)
    d.setDate(d.getDate() + 7)
    setWeekStart(d)
  }
  const goThisWeek = () => setWeekStart(getWeekStart(new Date()))

  const weekEnd = useMemo(() => {
    const d = new Date(weekStart)
    d.setDate(d.getDate() + 6)
    return d
  }, [weekStart])

  const days = useMemo(() => {
    const arr: Date[] = []
    for (let i = 0; i < 7; i++) {
      const d = new Date(weekStart)
      d.setDate(d.getDate() + i)
      arr.push(d)
    }
    return arr
  }, [weekStart])

  const entriesByDay = useMemo(() => {
    const map = new Map<string, TimeEntry[]>()
    if (!data) return map
    for (const e of data.entries) {
      const d = new Date(e.clockInAt)
      const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(e)
    }
    return map
  }, [data])

  const isThisWeek = useMemo(() => {
    const current = getWeekStart(new Date())
    return sameDay(current, weekStart)
  }, [weekStart])

  return (
    <div>
      <div
        className="glass-card"
        style={{
          padding: '1rem 1.25rem',
          borderRadius: 'var(--radius-lg)',
          marginBottom: '1rem',
          display: 'flex',
          alignItems: 'center',
          gap: '.75rem',
          flexWrap: 'wrap',
        }}
      >
        <button className="btn btn-ghost btn-icon" onClick={goPrev} aria-label="Previous week">
          <ChevronLeft size={18} />
        </button>
        <div style={{ fontWeight: 700, fontSize: '1rem' }}>
          {formatShortDate(weekStart)} – {formatShortDate(weekEnd)}
        </div>
        <button className="btn btn-ghost btn-icon" onClick={goNext} aria-label="Next week">
          <ChevronRight size={18} />
        </button>
        {!isThisWeek && (
          <button className="btn btn-ghost btn-sm" onClick={goThisWeek} style={{ marginLeft: '.5rem' }}>
            This Week
          </button>
        )}
        {loading && <Loader2 size={16} className="spinner" style={{ marginLeft: 'auto', color: 'var(--text-muted)' }} />}
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(7, minmax(0, 1fr))',
          gap: '.75rem',
        }}
      >
        {days.map((day, i) => {
          const key = `${day.getFullYear()}-${day.getMonth()}-${day.getDate()}`
          const dayEntries = entriesByDay.get(key) ?? []
          const dayWorked = dayEntries.reduce((s, e) => s + e.workedMinutes, 0)
          const isOT = dayWorked > 480
          const isToday = sameDay(day, new Date())
          return (
            <div
              key={key}
              className="glass-card animate-slide-up"
              style={{
                padding: '.875rem',
                borderRadius: 'var(--radius-md)',
                minHeight: 180,
                display: 'flex',
                flexDirection: 'column',
                gap: '.5rem',
                border: isToday ? '1px solid var(--brand)' : undefined,
                animationDelay: `${i * 40}ms`,
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: '.8125rem', textTransform: 'uppercase', letterSpacing: '.04em' }}>
                    {day.toLocaleDateString([], { weekday: 'short' })}
                  </div>
                  <div style={{ color: 'var(--text-muted)', fontSize: '.75rem' }}>
                    {day.getDate()}
                  </div>
                </div>
                {dayEntries.length > 0 && (
                  <div
                    style={{
                      fontWeight: 700,
                      fontSize: '.875rem',
                      color: isOT ? 'var(--danger)' : 'var(--text-primary)',
                      fontVariantNumeric: 'tabular-nums',
                    }}
                  >
                    {formatDuration(dayWorked)}
                  </div>
                )}
              </div>

              {dayEntries.length === 0 ? (
                <div
                  style={{
                    flex: 1,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: 'var(--text-muted)',
                    fontSize: '.75rem',
                    fontStyle: 'italic',
                  }}
                >
                  No entries
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '.375rem' }}>
                  {dayEntries.map((e) => (
                    <div
                      key={e.id}
                      style={{
                        padding: '.375rem .5rem',
                        background: 'var(--bg-elevated)',
                        borderRadius: 'var(--radius-sm)',
                        fontSize: '.6875rem',
                        border: '1px solid var(--border-subtle)',
                      }}
                    >
                      <div style={{ fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
                        {formatTime(e.clockInAt)} – {e.clockOutAt ? formatTime(e.clockOutAt) : 'active'}
                      </div>
                      {e.breaks.length > 0 && (
                        <div style={{ color: 'var(--text-muted)', marginTop: '.125rem' }}>
                          {e.breaks.length} break{e.breaks.length > 1 ? 's' : ''} · {formatDuration(e.breakMinutes)}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Weekly totals */}
      {data && (
        <div
          className="glass-card"
          style={{
            marginTop: '1rem',
            padding: '1.25rem',
            borderRadius: 'var(--radius-lg)',
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
            gap: '1rem',
          }}
        >
          <Stat label="Worked" value={formatDuration(data.totals.workedMinutes)} highlight={data.totals.isOvertime} />
          <Stat label="Breaks" value={formatDuration(data.totals.breakMinutes)} />
          <Stat label="Total" value={formatDuration(data.totals.totalMinutes)} />
          <Stat label="Days worked" value={String(data.totals.daysWorked)} />
          {data.totals.isOvertime && (
            <Stat
              label="Overtime"
              value={formatDuration(data.totals.workedMinutes - 2400)}
              highlight
            />
          )}
        </div>
      )}
    </div>
  )
}

function Stat({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div>
      <div style={{ color: 'var(--text-muted)', fontSize: '.6875rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em' }}>
        {label}
      </div>
      <div
        style={{
          fontSize: '1.375rem',
          fontWeight: 800,
          marginTop: '.25rem',
          color: highlight ? 'var(--danger)' : 'var(--text-primary)',
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {value}
      </div>
    </div>
  )
}

// ───────────────────────── History Tab ─────────────────────────

function HistoryTab() {
  const [data, setData] = useState<HistoryResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [offset, setOffset] = useState(0)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const LIMIT = 20

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setLoading(true)
      try {
        const res = await fetch(`/api/workryn/time-clock/history?limit=${LIMIT}&offset=${offset}`, { cache: 'no-store' })
        if (!res.ok) throw new Error('Failed to load history')
        const json: HistoryResponse = await res.json()
        if (!cancelled) setData(json)
      } catch {
        // ignore
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [offset])

  const toggle = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  if (loading && !data) {
    return (
      <div className="empty-state" style={{ padding: '3rem 0', textAlign: 'center' }}>
        <Loader2 size={28} className="spinner" style={{ color: 'var(--text-muted)' }} />
      </div>
    )
  }

  if (!data || data.entries.length === 0) {
    return (
      <div className="empty-state glass-card" style={{ padding: '3rem 2rem', textAlign: 'center', borderRadius: 'var(--radius-xl)' }}>
        <Clock size={40} style={{ color: 'var(--text-muted)', opacity: .5, marginBottom: '.75rem' }} />
        <h3 style={{ margin: '0 0 .25rem 0', fontSize: '1rem', fontWeight: 700 }}>No history yet</h3>
        <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '.875rem' }}>
          Your completed shifts will appear here.
        </p>
      </div>
    )
  }

  return (
    <div>
      <div className="glass-card" style={{ borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1.2fr 1fr 1fr 1fr 1fr .7fr',
            padding: '.75rem 1rem',
            background: 'var(--bg-elevated)',
            borderBottom: '1px solid var(--border-subtle)',
            fontSize: '.6875rem',
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: '.06em',
            color: 'var(--text-muted)',
          }}
        >
          <div>Date</div>
          <div>Clock in</div>
          <div>Clock out</div>
          <div>Breaks</div>
          <div>Worked</div>
          <div>Status</div>
        </div>

        {data.entries.map((e) => {
          const isExpanded = expanded.has(e.id)
          return (
            <div key={e.id}>
              <button
                onClick={() => toggle(e.id)}
                className="focus-ring"
                style={{
                  width: '100%',
                  display: 'grid',
                  gridTemplateColumns: '1.2fr 1fr 1fr 1fr 1fr .7fr',
                  padding: '.875rem 1rem',
                  background: 'transparent',
                  border: 'none',
                  borderBottom: '1px solid var(--border-subtle)',
                  cursor: 'pointer',
                  color: 'var(--text-primary)',
                  fontSize: '.875rem',
                  textAlign: 'left',
                  alignItems: 'center',
                  transition: 'var(--transition-smooth)',
                }}
                onMouseEnter={(ev) => {
                  ev.currentTarget.style.background = 'var(--bg-hover)'
                }}
                onMouseLeave={(ev) => {
                  ev.currentTarget.style.background = 'transparent'
                }}
              >
                <div style={{ fontWeight: 600 }}>
                  {new Date(e.clockInAt).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })}
                </div>
                <div style={{ fontVariantNumeric: 'tabular-nums', color: 'var(--text-secondary)' }}>
                  {formatTime(e.clockInAt)}
                </div>
                <div style={{ fontVariantNumeric: 'tabular-nums', color: 'var(--text-secondary)' }}>
                  {formatTime(e.clockOutAt)}
                </div>
                <div style={{ color: 'var(--text-secondary)' }}>
                  {e.breaks.length > 0 ? `${e.breaks.length} · ${formatDuration(e.breakMinutes)}` : '—'}
                </div>
                <div style={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
                  {formatDuration(e.workedMinutes)}
                </div>
                <div>
                  <span
                    className={`badge ${e.status === 'EDITED' ? 'badge-warning' : 'badge-success'}`}
                    style={{ fontSize: '.625rem' }}
                  >
                    {e.status}
                  </span>
                </div>
              </button>
              {isExpanded && (
                <div
                  className="animate-slide-up"
                  style={{
                    padding: '1rem 1.25rem 1.25rem 1.25rem',
                    background: 'var(--bg-elevated)',
                    borderBottom: '1px solid var(--border-subtle)',
                  }}
                >
                  {e.breaks.length === 0 ? (
                    <div style={{ color: 'var(--text-muted)', fontSize: '.8125rem', fontStyle: 'italic' }}>
                      No breaks taken during this shift.
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '.5rem' }}>
                      <div style={{ fontSize: '.6875rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--text-muted)' }}>
                        Breaks
                      </div>
                      {e.breaks.map((b) => {
                        const over = (b.actualMinutes ?? 0) > b.plannedMinutes
                        return (
                          <div
                            key={b.id}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: '.75rem',
                              fontSize: '.8125rem',
                              padding: '.5rem .75rem',
                              background: 'var(--bg-surface)',
                              borderRadius: 'var(--radius-sm)',
                              border: '1px solid var(--border-subtle)',
                            }}
                          >
                            <Coffee size={14} style={{ color: 'var(--warning)' }} />
                            <div style={{ fontWeight: 600 }}>{String(b.type).toLowerCase()}</div>
                            <div style={{ color: 'var(--text-muted)' }}>
                              {formatTime(b.startAt)} – {formatTime(b.endAt)}
                            </div>
                            <div style={{ marginLeft: 'auto', color: over ? 'var(--danger)' : 'var(--text-secondary)', fontVariantNumeric: 'tabular-nums' }}>
                              {b.actualMinutes ?? 0}m / {b.plannedMinutes}m {over && '(over)'}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}
                  {e.notes && (
                    <div style={{ marginTop: '.75rem', fontSize: '.8125rem', color: 'var(--text-secondary)' }}>
                      <strong style={{ color: 'var(--text-primary)' }}>Notes: </strong>{e.notes}
                    </div>
                  )}
                  {e.editReason && (
                    <div style={{ marginTop: '.5rem', fontSize: '.75rem', color: 'var(--warning)' }}>
                      Edited: {e.editReason}
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Pagination */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginTop: '1rem',
          color: 'var(--text-muted)',
          fontSize: '.8125rem',
        }}
      >
        <div>
          Showing {data.offset + 1}–{data.offset + data.entries.length} of {data.total}
        </div>
        <div style={{ display: 'flex', gap: '.5rem' }}>
          <button
            className="btn btn-ghost btn-sm"
            disabled={offset === 0}
            onClick={() => setOffset(Math.max(0, offset - LIMIT))}
          >
            <ChevronLeft size={14} />
            Prev
          </button>
          <button
            className="btn btn-ghost btn-sm"
            disabled={!data.hasMore}
            onClick={() => setOffset(offset + LIMIT)}
          >
            Next
            <ChevronRight size={14} />
          </button>
        </div>
      </div>
    </div>
  )
}
