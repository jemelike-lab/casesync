'use client'
import '@/app/workryn-timeclock.css'
import { useState, useEffect, useCallback, useRef } from 'react'
import { LogIn, LogOut, Coffee, Clock, ChevronLeft, ChevronRight } from 'lucide-react'

//  Types 
type TimeBreak = {
  id: string; entryId: string; startedAt: string; endedAt: string | null
  plannedMinutes: number; type: 'SHORT' | 'LUNCH' | 'OTHER'
}
type TimeEntry = {
  id: string; userId: string; clockInAt: string; clockOutAt: string | null
  totalMinutes: number; breakMinutes: number; workedMinutes: number
  status: 'ACTIVE' | 'COMPLETED' | 'EDITED' | string
  notes: string | null; editedById: string | null; editReason: string | null
  breaks: TimeBreak[]; createdAt: string; updatedAt: string
}
type StatusResponse = {
  isClockedIn: boolean; currentEntry: TimeEntry | null; currentBreak: TimeBreak | null
  weekStart: string; weekTotal: { workedMinutes: number; breakMinutes: number; days: number }
  todayTotal: { workedMinutes: number }
}
type TimesheetResponse = {
  weekStart: string; weekEnd: string; entries: TimeEntry[]
  totals: { workedMinutes: number; breakMinutes: number; totalMinutes: number; daysWorked: number; isOvertime: boolean }
}
type HistoryResponse = {
  entries: TimeEntry[]; total: number; limit: number; offset: number; hasMore: boolean
}
interface Props {
  initialCurrentEntry: TimeEntry | null
  initialWeekEntries: TimeEntry[]
  initialWeekStart: string
  userName: string
}

const LIMIT = 10

//  Helpers 
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
  return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`
}
function formatTime(d: Date | string | null | undefined): string {
  if (!d) return ''
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
  const d = new Date(date); d.setHours(0,0,0,0)
  const day = d.getDay()
  const diff = day === 0 ? -6 : 1 - day
  d.setDate(d.getDate() + diff)
  return d
}
function sameDay(a: Date, b: Date): boolean {
  return a.getFullYear()===b.getFullYear() && a.getMonth()===b.getMonth() && a.getDate()===b.getDate()
}

// SVG Clock Face  v5b: numbered, thin border
function ClockFace({ elapsed, isOnBreak, isClockedIn }: { elapsed: number; isOnBreak: boolean; isClockedIn: boolean }) {
  const now = new Date()
  const secs = now.getSeconds() + now.getMilliseconds() / 1000
  const mins = now.getMinutes() + secs / 60
  const hrs  = (now.getHours() % 12) + mins / 60

  const cx = 100; const cy = 100; const r = 82
  const circumference = 2 * Math.PI * r
  const progress = Math.min(elapsed / (8 * 3600), 1)
  const dashOffset = circumference * (1 - progress)

  const accent = isOnBreak ? '#f59e0b' : isClockedIn ? '#2563eb' : 'rgba(148,163,184,0.3)'

  function toXY(angleDeg: number, radius: number) {
    const rad = ((angleDeg - 90) * Math.PI) / 180
    return { x: cx + radius * Math.cos(rad), y: cy + radius * Math.sin(rad) }
  }

  const hrPt  = toXY((hrs  % 12) * 30, 52)
  const minPt = toXY(mins * 6,          66)
  const secPt = toXY(secs * 6,          72)

  const hourNums = Array.from({ length: 12 }, (_, i) => {
    const n = i + 1
    const pt = toXY(n * 30, 68)
    return { n, x: pt.x, y: pt.y }
  })

  return (
    <svg viewBox="0 0 200 200" className="tc-clock-svg">
      {/* Outer rim  thin */}
      <circle cx={cx} cy={cy} r={93} fill="none" stroke="rgba(148,163,184,0.15)" strokeWidth="1" />
      {/* Face fill */}
      <circle cx={cx} cy={cy} r={92} fill="rgba(10,11,30,0.7)" />
      {/* Track ring */}
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="rgba(148,163,184,0.08)" strokeWidth="3" />
      {/* Progress arc */}
      {isClockedIn && (
        <circle cx={cx} cy={cy} r={r} fill="none"
          stroke={accent} strokeWidth="3"
          strokeDasharray={circumference}
          strokeDashoffset={dashOffset}
          strokeLinecap="round"
          transform="rotate(-90 100 100)"
          style={{ transition: 'stroke-dashoffset 1s linear, stroke 0.3s' }}
        />
      )}
      {/* Tick marks */}
      {Array.from({ length: 60 }, (_, i) => {
        const isHour = i % 5 === 0
        const inner = isHour ? 75 : 79
        const p1 = toXY(i * 6, inner)
        const p2 = toXY(i * 6, 85)
        return <line key={i} x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y}
          stroke={isHour ? 'rgba(148,163,184,0.5)' : 'rgba(148,163,184,0.18)'}
          strokeWidth={isHour ? 1.5 : 0.6} strokeLinecap="round" />
      })}
      {/* Hour numbers 112 */}
      {hourNums.map(({ n, x, y }) => (
        <text key={n} x={x} y={y} textAnchor="middle" dominantBaseline="central"
          fontSize="10" fontWeight="500" fontFamily="system-ui,sans-serif"
          fill="rgba(148,163,184,0.75)">{n}</text>
      ))}
      {/* Hour hand */}
      <line x1={cx} y1={cy} x2={hrPt.x} y2={hrPt.y}
        stroke="var(--text-primary)" strokeWidth="3" strokeLinecap="round" />
      {/* Minute hand */}
      <line x1={cx} y1={cy} x2={minPt.x} y2={minPt.y}
        stroke="var(--text-primary)" strokeWidth="2" strokeLinecap="round" />
      {/* Second hand */}
      <line x1={cx} y1={cy} x2={secPt.x} y2={secPt.y}
        stroke={accent} strokeWidth="1" strokeLinecap="round" />
      {/* Center pip */}
      <circle cx={cx} cy={cy} r={3.5} fill={accent} />
      <circle cx={cx} cy={cy} r={1.5} fill="var(--bg-primary)" />
      {/* Elapsed time when clocked in */}
      {isClockedIn && (
        <text x={cx} y={cy + 26} textAnchor="middle" fontSize="9"
          fill="rgba(148,163,184,0.55)" fontFamily="monospace">
          {formatHMS(elapsed)}
        </text>
      )}
    </svg>
  )
}

export default function TimeClockClient({ initialCurrentEntry, initialWeekEntries, initialWeekStart, userName }: Props) {
  //  Clock-in state 
  const [status, setStatus] = useState<StatusResponse | null>(null)
  const [currentEntry, setCurrentEntry] = useState<TimeEntry | null>(initialCurrentEntry)
  const [currentBreak, setCurrentBreak] = useState<TimeBreak | null>(null)
  const [isClockedIn, setIsClockedIn] = useState(!!initialCurrentEntry)
  const [isOnBreak, setIsOnBreak] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showClockOutConfirm, setShowClockOutConfirm] = useState(false)
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null)

  //  Timesheet state 
  const [weekStart, setWeekStart] = useState<Date>(() => new Date(initialWeekStart))
  const [tsData, setTsData] = useState<TimesheetResponse | null>(null)
  const [tsLoading, setTsLoading] = useState(true)

  //  History state 
  const [histData, setHistData] = useState<HistoryResponse | null>(null)
  const [histLoading, setHistLoading] = useState(true)
  const [offset, setOffset] = useState(0)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  //  Active tab 
  const [tab, setTab] = useState<'clock'|'timesheet'|'history'>('clock')

  //  Status refresh 
  const refreshStatus = useCallback(async () => {
    const res = await fetch('/api/workryn/time-clock/status', { cache: 'no-store' })
    if (!res.ok) return
    const s: StatusResponse = await res.json()
    setStatus(s)
    setCurrentEntry(s.currentEntry)
    setCurrentBreak(s.currentBreak)
    setIsClockedIn(s.isClockedIn)
    setIsOnBreak(!!s.currentBreak)
  }, [])

  //  Timesheet refresh 
  const refreshWeek = useCallback(async (ws?: Date) => {
    setTsLoading(true)
    const weekStartIso = (ws ?? weekStart).toISOString()
    const url = weekStartIso
      ? `/api/workryn/time-clock/timesheet?weekStart=${encodeURIComponent(weekStartIso)}`
      : '/api/workryn/time-clock/timesheet'
    const res = await fetch(url, { cache: 'no-store' })
    if (res.ok) setTsData(await res.json())
    setTsLoading(false)
  }, [weekStart])

  //  Live ticker 
  useEffect(() => {
    if (isClockedIn && currentEntry && !isOnBreak) {
      const update = () => {
        const now = Date.now()
        const raw = Math.max(0, Math.floor((now - new Date(currentEntry.clockInAt).getTime()) / 1000))
        const breakSecs = (currentEntry.breakMinutes ?? 0) * 60
        setElapsed(Math.max(0, raw - breakSecs))
      }
      update()
      tickRef.current = setInterval(update, 1000)
    } else {
      if (tickRef.current) clearInterval(tickRef.current)
      if (!isClockedIn) setElapsed(0)
    }
    return () => { if (tickRef.current) clearInterval(tickRef.current) }
  }, [isClockedIn, isOnBreak, currentEntry])

  //  Initial load 
  useEffect(() => {
    refreshStatus()
    refreshWeek()
    ;(async () => {
      setHistLoading(true)
      const res = await fetch(`/api/workryn/time-clock/history?limit=${LIMIT}&offset=${offset}`, { cache: 'no-store' })
      if (res.ok) setHistData(await res.json())
      setHistLoading(false)
    })()
  }, [])

  //  History pagination 
  useEffect(() => {
    ;(async () => {
      setHistLoading(true)
      const res = await fetch(`/api/workryn/time-clock/history?limit=${LIMIT}&offset=${offset}`, { cache: 'no-store' })
      if (res.ok) setHistData(await res.json())
      setHistLoading(false)
    })()
  }, [offset])

  //  Clock in 
  async function handleClockIn() {
    setLoading(true); setError(null)
    const res = await fetch('/api/workryn/time-clock/clock-in', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }
    })
    if (res.ok) { await refreshStatus() } else { setError('Failed to clock in') }
    setLoading(false)
  }

  //  Clock out 
  async function handleClockOut() {
    setLoading(true); setError(null)
    const res = await fetch('/api/workryn/time-clock/clock-out', { method: 'POST' })
    if (res.ok) { await refreshStatus(); await refreshWeek(); setShowClockOutConfirm(false) }
    else { setError('Failed to clock out') }
    setLoading(false)
  }

  //  Start break 
  async function handleStartBreak(plannedMinutes: 30 | 45 | 60, type: 'SHORT' | 'LUNCH' | 'OTHER') {
    setLoading(true); setError(null)
    const res = await fetch('/api/workryn/time-clock/break/start', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ plannedMinutes, type })
    })
    if (res.ok) { await refreshStatus() } else { setError('Failed to start break') }
    setLoading(false)
  }

  //  End break 
  async function handleEndBreak() {
    setLoading(true); setError(null)
    const res = await fetch('/api/workryn/time-clock/break/end', { method: 'POST' })
    if (res.ok) { await refreshStatus() } else { setError('Failed to end break') }
    setLoading(false)
  }

  //  Week nav 
  function shiftWeek(dir: number) {
    const next = new Date(weekStart); next.setDate(next.getDate() + dir * 7)
    setWeekStart(next); refreshWeek(next)
  }

  const todayEntries = tsData?.entries.filter(e => sameDay(new Date(e.clockInAt), new Date())) ?? []

  //  RENDER 
  return (
    <div className="tc-root">
      {/* Tab bar */}
      <div className="tc-tabs">
        {(['clock','timesheet','history'] as const).map(t => (
          <button key={t} className={`tc-tab${tab===t?' tc-tab-active':''}`} onClick={() => setTab(t)}>
            {t === 'clock' ? 'Clock' : t === 'timesheet' ? 'Timesheet' : 'History'}
          </button>
        ))}
      </div>

      {error && <div className="tc-error">{error}</div>}

      {/*  CLOCK TAB  */}
      {tab === 'clock' && (
        <div className="tc-clock-panel">
          <div className="tc-clock-hero">
            <div className="tc-clock-wrap">
              <ClockFace elapsed={elapsed} isOnBreak={isOnBreak} isClockedIn={isClockedIn} />
            </div>
            <div className="tc-clock-meta">
              <div className="tc-clock-status">
                {!isClockedIn && <span className="tc-badge tc-badge-off">Clocked Out</span>}
                {isClockedIn && !isOnBreak && <span className="tc-badge tc-badge-in">Clocked In</span>}
                {isOnBreak && <span className="tc-badge tc-badge-break">On Break</span>}
              </div>
              {isClockedIn && currentEntry && (
                <div className="tc-clock-intime">
                  Since {formatTime(currentEntry.clockInAt)}
                </div>
              )}
              <div className="tc-clock-elapsed">
                {isClockedIn && !isOnBreak ? formatHMS(elapsed) : ''}
              </div>
              {status?.todayTotal && (
                <div className="tc-today-total">
                  Today: {formatDuration(status.todayTotal.workedMinutes)}
                </div>
              )}
            </div>
          </div>

          {/* Action buttons */}
          <div className="tc-actions">
            {!isClockedIn && (
              <button className="tc-btn tc-btn-clockin" onClick={handleClockIn} disabled={loading}>
                <LogIn size={16} /> Clock In
              </button>
            )}
            {isClockedIn && !isOnBreak && !showClockOutConfirm && (
              <>
                <div className="tc-break-row">
                  <span className="tc-break-label">Break:</span>
                  <button className="tc-btn tc-btn-break" onClick={() => handleStartBreak(30,'SHORT')} disabled={loading}>
                    <Coffee size={14} /> 30m
                  </button>
                  <button className="tc-btn tc-btn-break" onClick={() => handleStartBreak(45,'LUNCH')} disabled={loading}>
                    <Coffee size={14} /> 45m
                  </button>
                  <button className="tc-btn tc-btn-break" onClick={() => handleStartBreak(60,'LUNCH')} disabled={loading}>
                    <Coffee size={14} /> 1h
                  </button>
                </div>
                <button className="tc-btn tc-btn-clockout" onClick={() => setShowClockOutConfirm(true)} disabled={loading}>
                  <LogOut size={16} /> Clock Out
                </button>
              </>
            )}
            {showClockOutConfirm && (
              <div className="tc-confirm">
                <p>Clock out now?</p>
                <div className="tc-confirm-btns">
                  <button className="tc-btn tc-btn-clockout" onClick={handleClockOut} disabled={loading}>
                    Confirm
                  </button>
                  <button className="tc-btn tc-btn-ghost" onClick={() => setShowClockOutConfirm(false)}>
                    Cancel
                  </button>
                </div>
              </div>
            )}
            {isOnBreak && (
              <button className="tc-btn tc-btn-endbreak" onClick={handleEndBreak} disabled={loading}>
                End Break
              </button>
            )}
          </div>

          {/* Today's entries mini-list */}
          {todayEntries.length > 0 && (
            <div className="tc-today-list">
              <div className="tc-section-label">Today's Entries</div>
              {todayEntries.map(e => (
                <div key={e.id} className="tc-today-entry">
                  <Clock size={12} />
                  <span>{formatTime(e.clockInAt)}  {e.clockOutAt ? formatTime(e.clockOutAt) : 'now'}</span>
                  <span className="tc-today-dur">{formatDuration(e.workedMinutes)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/*  TIMESHEET TAB  */}
      {tab === 'timesheet' && (
        <div className="tc-timesheet-panel">
          <div className="tc-week-nav">
            <button className="tc-btn tc-btn-ghost tc-icon-btn" onClick={() => shiftWeek(-1)}>
              <ChevronLeft size={16} />
            </button>
            <span className="tc-week-label">
              {formatShortDate(weekStart)}  {formatShortDate(new Date(weekStart.getTime() + 6*86400000))}
            </span>
            <button className="tc-btn tc-btn-ghost tc-icon-btn" onClick={() => shiftWeek(1)}>
              <ChevronRight size={16} />
            </button>
          </div>
          {tsLoading ? (
            <div className="tc-loading">Loading</div>
          ) : tsData ? (
            <>
              <div className="tc-ts-totals">
                <div className="tc-ts-stat">
                  <span className="tc-ts-stat-val">{formatDuration(tsData.totals.workedMinutes)}</span>
                  <span className="tc-ts-stat-label">Worked</span>
                </div>
                <div className="tc-ts-stat">
                  <span className="tc-ts-stat-val">{formatDuration(tsData.totals.breakMinutes)}</span>
                  <span className="tc-ts-stat-label">Breaks</span>
                </div>
                <div className="tc-ts-stat">
                  <span className="tc-ts-stat-val">{tsData.totals.daysWorked}</span>
                  <span className="tc-ts-stat-label">Days</span>
                </div>
              </div>
              <div className="tc-ts-entries">
                {tsData.entries.length === 0 && <div className="tc-empty">No entries this week.</div>}
                {tsData.entries
                  .filter(e => sameDay(new Date(e.clockInAt), new Date()) || true)
                  .sort((a,b) => new Date(a.clockInAt).getTime() - new Date(b.clockInAt).getTime())
                  .map(e => (
                    <div key={e.id} className="tc-ts-row">
                      <div className="tc-ts-row-date">
                        {new Date(e.clockInAt).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })}
                      </div>
                      <div className="tc-ts-row-time">
                        {formatTime(e.clockInAt)}  {e.clockOutAt ? formatTime(e.clockOutAt) : 'active'}
                      </div>
                      <div className="tc-ts-row-dur">{formatDuration(e.workedMinutes)}</div>
                    </div>
                  ))}
              </div>
            </>
          ) : <div className="tc-empty">No data.</div>}
        </div>
      )}

      {/*  HISTORY TAB  */}
      {tab === 'history' && (
        <div className="tc-history-panel">
          {histLoading ? (
            <div className="tc-loading">Loading</div>
          ) : histData ? (
            <>
              <div className="tc-hist-entries">
                {histData.entries.length === 0 && <div className="tc-empty">No history yet.</div>}
                {histData.entries.map(e => {
                  const isExp = expanded.has(e.id)
                  return (
                    <div key={e.id} className="tc-hist-row" onClick={() => {
                      const s = new Set(expanded)
                      isExp ? s.delete(e.id) : s.add(e.id)
                      setExpanded(s)
                    }}>
                      <div className="tc-hist-row-main">
                        <span className="tc-hist-date">
                          {new Date(e.clockInAt).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })}
                        </span>
                        <span className="tc-hist-time">
                          {formatTime(e.clockInAt)}  {e.clockOutAt ? formatTime(e.clockOutAt) : 'active'}
                        </span>
                        <span className="tc-hist-dur">{formatDuration(e.workedMinutes)}</span>
                      </div>
                      {isExp && (
                        <div className="tc-hist-detail">
                          <span>Break: {formatDuration(e.breakMinutes)}</span>
                          {e.notes && <span>Notes: {e.notes}</span>}
                          <span className={`tc-badge-sm tc-badge-${e.status.toLowerCase()}`}>{e.status}</span>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
              <div className="tc-hist-pagination">
                <span className="tc-hist-count">
                  {histData.offset + 1}{histData.offset + histData.entries.length} of {histData.total}
                </span>
                <div className="tc-hist-pg-btns">
                  <button className="tc-btn tc-btn-ghost tc-icon-btn"
                    disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - LIMIT))}>
                    <ChevronLeft size={14} /> Prev
                  </button>
                  <button className="tc-btn tc-btn-ghost tc-icon-btn"
                    disabled={!histData.hasMore} onClick={() => setOffset(offset + LIMIT)}>
                    Next <ChevronRight size={14} />
                  </button>
                </div>
              </div>
            </>
          ) : <div className="tc-empty">No data.</div>}
        </div>
      )}
    </div>
  )
}

