'use client'

/**
 * TimeClockClient — Aurora rebuild.
 *
 * Cyan-accented page (per the Aurora ROUTE_ACCENT mapping). All API
 * endpoints and state machinery are preserved byte-for-byte from the
 * previous version:
 *   GET  /api/workryn/time-clock/status
 *   POST /api/workryn/time-clock/clock-in
 *   POST /api/workryn/time-clock/clock-out
 *   POST /api/workryn/time-clock/break/start    body { plannedMinutes, type }
 *   POST /api/workryn/time-clock/break/end
 *   GET  /api/workryn/time-clock/timesheet?weekStart=...
 *   GET  /api/workryn/time-clock/history?limit=10&offset=N
 *
 * Same break options (30 SHORT, 45 LUNCH, 60 LUNCH).
 * Same three tabs (Clock / Timesheet / History).
 * Same expandable history rows with notes/breaks/status detail.
 *
 * Visual: glass paper hero with a custom SVG clock face (cyan accents,
 * matched to the page accent), gradient-text HH:MM:SS live timer,
 * cyan pulse ring when clocked in / amber when on break. Mantine
 * components for buttons, badges, tabs, and data rows. Stats animate
 * with useCountUp.
 */

import { useState, useEffect, useCallback, useRef } from 'react'
import {
  Alert,
  Badge,
  Box,
  Button,
  Card,
  Container,
  Group,
  Loader,
  Paper,
  SimpleGrid,
  Stack,
  Tabs,
  Text,
  ThemeIcon,
  Title,
  Tooltip,
} from '@mantine/core'
import {
  Activity,
  ChevronLeft,
  ChevronRight,
  Coffee,
  Clock as ClockIcon,
  History as HistoryIcon,
  LogIn,
  LogOut,
  Pause,
  Play,
  Calendar as CalendarIcon,
} from 'lucide-react'
import { useCountUp } from '@/hooks/useCountUp'

// ---------- Types (unchanged contract) ----------

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

// ---------- Formatters (preserved) ----------

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
function sameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}

// ---------- SVG Clock Face ----------

function ClockFace({
  elapsed,
  isOnBreak,
  isClockedIn,
}: {
  elapsed: number
  isOnBreak: boolean
  isClockedIn: boolean
}) {
  const cx = 100
  const cy = 100
  const radius = 88
  const [now, setNow] = useState<Date | null>(null)

  useEffect(() => {
    setNow(new Date())
    const id = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(id)
  }, [])

  if (!now) {
    return <svg viewBox="0 0 200 200" className="tca-clock-svg" />
  }

  const hour = now.getHours() % 12
  const minute = now.getMinutes()
  const second = now.getSeconds()
  const hourAngle = ((hour + minute / 60) / 12) * 360 - 90
  const minAngle = ((minute + second / 60) / 60) * 360 - 90
  const secAngle = (second / 60) * 360 - 90

  function point(angle: number, len: number) {
    const rad = (angle * Math.PI) / 180
    return { x: cx + len * Math.cos(rad), y: cy + len * Math.sin(rad) }
  }
  const hourPt = point(hourAngle, radius * 0.55)
  const minPt = point(minAngle, radius * 0.78)
  const secPt = point(secAngle, radius * 0.85)

  const accent = isOnBreak ? '#F59E0B' : isClockedIn ? '#06B6D4' : '#475569'

  return (
    <svg viewBox="0 0 200 200" className="tca-clock-svg">
      <defs>
        <radialGradient id="tcaFace">
          <stop offset="0%" stopColor="rgba(11,15,30,0.85)" />
          <stop offset="100%" stopColor="rgba(11,15,30,0.95)" />
        </radialGradient>
        <linearGradient id="tcaRingActive" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#67e8f9" />
          <stop offset="100%" stopColor="#06B6D4" />
        </linearGradient>
        <linearGradient id="tcaRingBreak" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#fcd34d" />
          <stop offset="100%" stopColor="#F59E0B" />
        </linearGradient>
      </defs>

      {/* Background face */}
      <circle cx={cx} cy={cy} r={radius} fill="url(#tcaFace)" />

      {/* Outer ring */}
      <circle
        cx={cx}
        cy={cy}
        r={radius}
        fill="none"
        stroke={
          isOnBreak
            ? 'url(#tcaRingBreak)'
            : isClockedIn
            ? 'url(#tcaRingActive)'
            : 'rgba(148,163,184,0.18)'
        }
        strokeWidth={isClockedIn || isOnBreak ? 3 : 2}
        style={{
          filter:
            isClockedIn && !isOnBreak
              ? 'drop-shadow(0 0 8px rgba(6,182,212,0.6))'
              : isOnBreak
              ? 'drop-shadow(0 0 8px rgba(245,158,11,0.6))'
              : 'none',
        }}
      />

      {/* Hour ticks */}
      {Array.from({ length: 12 }).map((_, i) => {
        const a = (i / 12) * 360 - 90
        const p1 = point(a, radius - 6)
        const p2 = point(a, radius - (i % 3 === 0 ? 14 : 10))
        return (
          <line
            key={i}
            x1={p1.x}
            y1={p1.y}
            x2={p2.x}
            y2={p2.y}
            stroke="rgba(148,163,184,0.45)"
            strokeWidth={i % 3 === 0 ? 2 : 1}
          />
        )
      })}

      {/* Hour hand */}
      <line
        x1={cx}
        y1={cy}
        x2={hourPt.x}
        y2={hourPt.y}
        stroke="#f1f5f9"
        strokeWidth="4"
        strokeLinecap="round"
      />
      {/* Minute hand */}
      <line
        x1={cx}
        y1={cy}
        x2={minPt.x}
        y2={minPt.y}
        stroke="#e2e8f0"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
      {/* Second hand */}
      <line
        x1={cx}
        y1={cy}
        x2={secPt.x}
        y2={secPt.y}
        stroke={accent}
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <circle cx={cx} cy={cy} r={4} fill={accent} />
      <circle cx={cx} cy={cy} r={2} fill="#0b0f1e" />

      {/* Elapsed time below center when clocked in */}
      {isClockedIn && (
        <text
          x={cx}
          y={cy + 36}
          textAnchor="middle"
          fontSize="9"
          fill={accent}
          fontFamily="ui-monospace, monospace"
          fontWeight="700"
        >
          {formatHMS(elapsed)}
        </text>
      )}
    </svg>
  )
}

// =================================================================
// MAIN
// =================================================================

export default function TimeClockClient({
  initialCurrentEntry,
  initialWeekEntries,
  initialWeekStart,
  userName,
}: Props) {
  const [status, setStatus] = useState<StatusResponse | null>(null)
  const [currentEntry, setCurrentEntry] = useState<TimeEntry | null>(initialCurrentEntry)
  const [currentBreak, setCurrentBreak] = useState<TimeBreak | null>(null)
  const [isClockedIn, setIsClockedIn] = useState(!!initialCurrentEntry)
  const [isOnBreak, setIsOnBreak] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const [weekStart, setWeekStart] = useState<Date>(() => new Date(initialWeekStart))
  const [tsData, setTsData] = useState<TimesheetResponse | null>(null)
  const [tsLoading, setTsLoading] = useState(true)

  const [histData, setHistData] = useState<HistoryResponse | null>(null)
  const [histLoading, setHistLoading] = useState(true)
  const [offset, setOffset] = useState(0)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  const [tab, setTab] = useState<'clock' | 'timesheet' | 'history'>('clock')

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

  const refreshWeek = useCallback(async (ws?: Date) => {
    setTsLoading(true)
    const weekStartIso = (ws ?? weekStart).toISOString()
    const url = `/api/workryn/time-clock/timesheet?weekStart=${encodeURIComponent(weekStartIso)}`
    const res = await fetch(url, { cache: 'no-store' })
    if (res.ok) setTsData(await res.json())
    setTsLoading(false)
  }, [weekStart])

  // Live ticker
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

  // Initial load
  useEffect(() => {
    refreshStatus()
    refreshWeek()
    ;(async () => {
      setHistLoading(true)
      const res = await fetch(`/api/workryn/time-clock/history?limit=${LIMIT}&offset=${offset}`, { cache: 'no-store' })
      if (res.ok) setHistData(await res.json())
      setHistLoading(false)
    })()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // History pagination
  useEffect(() => {
    ;(async () => {
      setHistLoading(true)
      const res = await fetch(`/api/workryn/time-clock/history?limit=${LIMIT}&offset=${offset}`, { cache: 'no-store' })
      if (res.ok) setHistData(await res.json())
      setHistLoading(false)
    })()
  }, [offset])

  // ---------- Action handlers (preserved) ----------

  async function handleClockIn() {
    setLoading(true); setError(null)
    const res = await fetch('/api/workryn/time-clock/clock-in', { method: 'POST', headers: { 'Content-Type': 'application/json' } })
    if (res.ok) await refreshStatus()
    else setError('Failed to clock in')
    setLoading(false)
  }
  async function handleClockOut() {
    setLoading(true); setError(null)
    const res = await fetch('/api/workryn/time-clock/clock-out', { method: 'POST' })
    if (res.ok) { await refreshStatus(); await refreshWeek() }
    else setError('Failed to clock out')
    setLoading(false)
  }
  async function handleStartBreak(plannedMinutes: 30 | 45 | 60, type: 'SHORT' | 'LUNCH' | 'OTHER') {
    setLoading(true); setError(null)
    const res = await fetch('/api/workryn/time-clock/break/start', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ plannedMinutes, type }),
    })
    if (res.ok) await refreshStatus()
    else setError('Failed to start break')
    setLoading(false)
  }
  async function handleEndBreak() {
    setLoading(true); setError(null)
    const res = await fetch('/api/workryn/time-clock/break/end', { method: 'POST' })
    if (res.ok) await refreshStatus()
    else setError('Failed to end break')
    setLoading(false)
  }
  function shiftWeek(dir: number) {
    const next = new Date(weekStart); next.setDate(next.getDate() + dir * 7)
    setWeekStart(next); refreshWeek(next)
  }

  const todayEntries = tsData?.entries.filter((e) => sameDay(new Date(e.clockInAt), new Date())) ?? []
  const animWeek = useCountUp(status?.weekTotal.workedMinutes ?? 0, 800)
  const animDays = useCountUp(status?.weekTotal.days ?? 0, 700)
  const animBreaks = useCountUp(status?.weekTotal.breakMinutes ?? 0, 800)
  const animToday = useCountUp(status?.todayTotal.workedMinutes ?? 0, 700)

  return (
    <>
      <Container size="xl" py="lg" className="tca-root">
        {error && (
          <Alert color="coral" variant="light" mb="md" onClose={() => setError(null)} withCloseButton>
            {error}
          </Alert>
        )}

        <Tabs
          value={tab}
          onChange={(v) => setTab((v ?? 'clock') as 'clock' | 'timesheet' | 'history')}
          variant="pills"
          radius="md"
          color="cyan"
          className="tca-tabs"
        >
          <Tabs.List mb="md">
            <Tabs.Tab value="clock" leftSection={<ClockIcon size={14} />}>Clock</Tabs.Tab>
            <Tabs.Tab value="timesheet" leftSection={<CalendarIcon size={14} />}>Timesheet</Tabs.Tab>
            <Tabs.Tab value="history" leftSection={<HistoryIcon size={14} />}>History</Tabs.Tab>
          </Tabs.List>

          {/* ============ CLOCK TAB ============ */}
          <Tabs.Panel value="clock">
            <SimpleGrid cols={{ base: 1, md: 2 }} spacing="md">
              {/* LEFT — clock hero + actions */}
              <Paper radius="lg" p="xl" className="tca-clock-hero">
                <Stack align="center" gap="md">
                  <Box className={`tca-clock-wrap${isClockedIn ? ' tca-clock-active' : ''}${isOnBreak ? ' tca-clock-break' : ''}`}>
                    <ClockFace elapsed={elapsed} isOnBreak={isOnBreak} isClockedIn={isClockedIn} />
                  </Box>

                  {/* Status badge */}
                  {!isClockedIn && (
                    <Badge size="lg" variant="light" color="gray" leftSection={<Pause size={12} />}>
                      Clocked Out
                    </Badge>
                  )}
                  {isClockedIn && !isOnBreak && (
                    <Badge size="lg" variant="light" color="cyan" leftSection={<Activity size={12} />} className="tca-status-active">
                      Clocked In
                    </Badge>
                  )}
                  {isOnBreak && (
                    <Badge size="lg" variant="light" color="orange" leftSection={<Coffee size={12} />} className="tca-status-break">
                      On Break
                    </Badge>
                  )}

                  {/* Live timer + meta */}
                  {isClockedIn && currentEntry && (
                    <Stack gap={4} align="center">
                      <Text size="xs" c="dimmed">
                        Since {formatTime(currentEntry.clockInAt)}
                      </Text>
                      <Text className="tca-timer">{formatHMS(elapsed)}</Text>
                      <Text size="xs" c="dimmed">
                        Today: {formatDuration(status?.todayTotal.workedMinutes ?? 0)}
                      </Text>
                    </Stack>
                  )}
                  {!isClockedIn && (
                    <Stack gap={4} align="center">
                      <Text size="xs" c="dimmed" tt="uppercase" fw={600}>Today</Text>
                      <Text className="tca-timer-idle">{formatDuration(status?.todayTotal.workedMinutes ?? 0)}</Text>
                    </Stack>
                  )}

                  {/* Action buttons */}
                  <Stack gap="sm" w="100%" align="stretch" mt="md">
                    {!isClockedIn && (
                      <Button
                        size="lg"
                        leftSection={<LogIn size={18} />}
                        loading={loading}
                        onClick={handleClockIn}
                        className="tca-btn-primary"
                      >
                        Clock In
                      </Button>
                    )}
                    {isClockedIn && !isOnBreak && (
                      <>
                        <Group grow gap="xs">
                          <Tooltip label="30-minute short break" withArrow>
                            <Button size="sm" variant="light" color="orange" leftSection={<Coffee size={14} />}
                              loading={loading} onClick={() => handleStartBreak(30, 'SHORT')}>
                              30m
                            </Button>
                          </Tooltip>
                          <Tooltip label="45-minute lunch" withArrow>
                            <Button size="sm" variant="light" color="orange" leftSection={<Coffee size={14} />}
                              loading={loading} onClick={() => handleStartBreak(45, 'LUNCH')}>
                              45m
                            </Button>
                          </Tooltip>
                          <Tooltip label="60-minute lunch" withArrow>
                            <Button size="sm" variant="light" color="orange" leftSection={<Coffee size={14} />}
                              loading={loading} onClick={() => handleStartBreak(60, 'LUNCH')}>
                              60m
                            </Button>
                          </Tooltip>
                        </Group>
                        <Button
                          size="lg"
                          variant="light"
                          color="coral"
                          leftSection={<LogOut size={18} />}
                          loading={loading}
                          onClick={handleClockOut}
                        >
                          Clock Out
                        </Button>
                      </>
                    )}
                    {isOnBreak && (
                      <Button
                        size="lg"
                        color="orange"
                        leftSection={<Play size={18} />}
                        loading={loading}
                        onClick={handleEndBreak}
                        className="tca-btn-primary"
                      >
                        End Break — Resume Work
                      </Button>
                    )}
                  </Stack>

                  <Text size="xs" c="dimmed" mt="sm">
                    {formatDate(new Date())}
                  </Text>
                </Stack>
              </Paper>

              {/* RIGHT — week stats + chart + today */}
              <Stack gap="md">
                {/* Stats grid */}
                {status && (
                  <SimpleGrid cols={2} spacing="sm">
                    <StatTile label="This Week"  value={formatDuration(animWeek)}   icon={ClockIcon}    color="cyan" />
                    <StatTile label="Days"       value={String(animDays)}            icon={CalendarIcon} color="violet" />
                    <StatTile label="Breaks"     value={formatDuration(animBreaks)}  icon={Coffee}       color="orange" />
                    <StatTile label="Today"      value={formatDuration(animToday)}   icon={Activity}     color="mint" />
                  </SimpleGrid>
                )}

                {/* Weekly bars */}
                <Card radius="lg" p="lg" withBorder className="tca-panel">
                  <Text size="xs" c="dimmed" tt="uppercase" fw={700} mb="sm">Weekly Hours</Text>
                  <Group align="flex-end" gap={8} h={120} mb="sm">
                    {(['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const).map((day, i) => {
                      const dayEntries = initialWeekEntries.filter((e) => {
                        const d = new Date(e.clockInAt)
                        return d.getDay() === (i === 6 ? 0 : i + 1)
                      })
                      const mins = dayEntries.reduce((sum, e) => sum + e.workedMinutes, 0)
                      const pct = Math.min((mins / 480) * 100, 100)
                      const isToday = new Date().getDay() === (i === 6 ? 0 : i + 1)
                      return (
                        <Stack key={day} gap={4} align="center" style={{ flex: 1, height: '100%' }}>
                          <Box style={{ flex: 1, width: '100%', display: 'flex', alignItems: 'flex-end' }}>
                            <Box
                              className="tca-bar"
                              style={{
                                height: `${pct}%`,
                                background: isToday
                                  ? 'linear-gradient(180deg, #67e8f9, #06B6D4)'
                                  : 'rgba(255,255,255,0.06)',
                                boxShadow: isToday ? '0 0 12px rgba(6,182,212,0.55)' : 'none',
                              }}
                            />
                          </Box>
                          <Text size="xs" c={isToday ? 'cyan.4' : 'dimmed'} fw={isToday ? 700 : 500}>
                            {day}
                          </Text>
                        </Stack>
                      )
                    })}
                  </Group>
                </Card>

                {/* Today's activity */}
                <Card radius="lg" p="lg" withBorder className="tca-panel">
                  <Text size="xs" c="dimmed" tt="uppercase" fw={700} mb="sm">Today's Activity</Text>
                  {todayEntries.length > 0 ? (
                    <Stack gap={6}>
                      {todayEntries.map((e) => (
                        <Group key={e.id} gap="sm" className="tca-activity-row">
                          <ThemeIcon size="sm" radius="md" variant="light" color="cyan">
                            <ClockIcon size={11} />
                          </ThemeIcon>
                          <Text size="sm" style={{ flex: 1 }}>
                            {formatTime(e.clockInAt)} — {e.clockOutAt ? formatTime(e.clockOutAt) : 'now'}
                          </Text>
                          <Badge variant="light" color="cyan">{formatDuration(e.workedMinutes)}</Badge>
                        </Group>
                      ))}
                    </Stack>
                  ) : (
                    <Stack align="center" gap="xs" py="md">
                      <ThemeIcon size={32} radius="xl" variant="light" color="cyan">
                        <ClockIcon size={16} />
                      </ThemeIcon>
                      <Text size="sm" c="dimmed">No activity yet today</Text>
                      <Text size="xs" c="dimmed">Clock in to start tracking</Text>
                    </Stack>
                  )}
                </Card>
              </Stack>
            </SimpleGrid>
          </Tabs.Panel>

          {/* ============ TIMESHEET TAB ============ */}
          <Tabs.Panel value="timesheet">
            <Card radius="lg" p="lg" withBorder className="tca-panel">
              <Group justify="space-between" mb="md">
                <Button variant="subtle" color="cyan" size="sm" leftSection={<ChevronLeft size={14} />} onClick={() => shiftWeek(-1)}>
                  Prev
                </Button>
                <Text fw={700}>
                  {formatShortDate(weekStart)} — {formatShortDate(new Date(weekStart.getTime() + 6 * 86400000))}
                </Text>
                <Button variant="subtle" color="cyan" size="sm" rightSection={<ChevronRight size={14} />} onClick={() => shiftWeek(1)}>
                  Next
                </Button>
              </Group>

              {tsLoading ? (
                <Group justify="center" py="xl"><Loader color="cyan" /></Group>
              ) : tsData ? (
                <>
                  <SimpleGrid cols={3} spacing="md" mb="md">
                    <StatTile label="Worked" value={formatDuration(tsData.totals.workedMinutes)} icon={ClockIcon}  color="cyan" />
                    <StatTile label="Breaks" value={formatDuration(tsData.totals.breakMinutes)}  icon={Coffee}     color="orange" />
                    <StatTile label="Days"   value={String(tsData.totals.daysWorked)}            icon={CalendarIcon} color="violet" />
                  </SimpleGrid>

                  {tsData.entries.length === 0 ? (
                    <Text c="dimmed" ta="center" py="md">No entries this week.</Text>
                  ) : (
                    <Stack gap={6}>
                      {tsData.entries
                        .slice()
                        .sort((a, b) => new Date(a.clockInAt).getTime() - new Date(b.clockInAt).getTime())
                        .map((e) => (
                          <Group key={e.id} className="tca-ts-row" wrap="nowrap">
                            <Text size="sm" fw={600} style={{ minWidth: 120 }}>
                              {new Date(e.clockInAt).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })}
                            </Text>
                            <Text size="sm" c="dimmed" style={{ flex: 1 }}>
                              {formatTime(e.clockInAt)} — {e.clockOutAt ? formatTime(e.clockOutAt) : 'active'}
                            </Text>
                            <Badge variant="light" color="cyan">{formatDuration(e.workedMinutes)}</Badge>
                          </Group>
                        ))}
                    </Stack>
                  )}
                </>
              ) : (
                <Text c="dimmed" ta="center" py="md">No data.</Text>
              )}
            </Card>
          </Tabs.Panel>

          {/* ============ HISTORY TAB ============ */}
          <Tabs.Panel value="history">
            <Card radius="lg" p="lg" withBorder className="tca-panel">
              {histLoading ? (
                <Group justify="center" py="xl"><Loader color="cyan" /></Group>
              ) : histData ? (
                <>
                  {histData.entries.length === 0 ? (
                    <Text c="dimmed" ta="center" py="md">No history yet.</Text>
                  ) : (
                    <Stack gap={6} mb="md">
                      {histData.entries.map((e) => {
                        const isExp = expanded.has(e.id)
                        return (
                          <Card
                            key={e.id}
                            radius="md"
                            p="sm"
                            withBorder
                            className="tca-hist-row"
                            onClick={() => {
                              const s = new Set(expanded)
                              if (isExp) s.delete(e.id); else s.add(e.id)
                              setExpanded(s)
                            }}
                            style={{ cursor: 'pointer' }}
                          >
                            <Group justify="space-between" wrap="nowrap">
                              <Text size="sm" fw={600} style={{ minWidth: 120 }}>
                                {new Date(e.clockInAt).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })}
                              </Text>
                              <Text size="sm" c="dimmed" style={{ flex: 1 }}>
                                {formatTime(e.clockInAt)} — {e.clockOutAt ? formatTime(e.clockOutAt) : 'active'}
                              </Text>
                              <Badge variant="light" color="cyan">{formatDuration(e.workedMinutes)}</Badge>
                            </Group>
                            {isExp && (
                              <Group gap="md" mt="sm" pt="sm" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                                <Text size="xs" c="dimmed">
                                  Break: <strong>{formatDuration(e.breakMinutes)}</strong>
                                </Text>
                                {e.notes && (
                                  <Text size="xs" c="dimmed">
                                    Notes: <em>{e.notes}</em>
                                  </Text>
                                )}
                                <Badge size="xs" variant="light" color={e.status === 'EDITED' ? 'orange' : 'mint'}>
                                  {e.status}
                                </Badge>
                              </Group>
                            )}
                          </Card>
                        )
                      })}
                    </Stack>
                  )}

                  {/* Pagination */}
                  <Group justify="space-between" pt="sm" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                    <Text size="xs" c="dimmed">
                      {histData.offset + 1}–{histData.offset + histData.entries.length} of {histData.total}
                    </Text>
                    <Group gap="xs">
                      <Button
                        size="xs"
                        variant="subtle"
                        color="cyan"
                        leftSection={<ChevronLeft size={12} />}
                        disabled={offset === 0}
                        onClick={() => setOffset(Math.max(0, offset - LIMIT))}
                      >
                        Prev
                      </Button>
                      <Button
                        size="xs"
                        variant="subtle"
                        color="cyan"
                        rightSection={<ChevronRight size={12} />}
                        disabled={!histData.hasMore}
                        onClick={() => setOffset(offset + LIMIT)}
                      >
                        Next
                      </Button>
                    </Group>
                  </Group>
                </>
              ) : (
                <Text c="dimmed" ta="center" py="md">No data.</Text>
              )}
            </Card>
          </Tabs.Panel>
        </Tabs>
      </Container>

      {/* ============ STYLES ============ */}
      <style>{`
        @keyframes tca-slide-up { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes tca-pulse-cyan {
          0%, 100% { box-shadow: 0 0 0 0 rgba(6,182,212,0.5), 0 0 40px rgba(6,182,212,0.35); }
          50%      { box-shadow: 0 0 0 12px rgba(6,182,212,0), 0 0 60px rgba(6,182,212,0.5); }
        }
        @keyframes tca-pulse-amber {
          0%, 100% { box-shadow: 0 0 0 0 rgba(245,158,11,0.5), 0 0 40px rgba(245,158,11,0.35); }
          50%      { box-shadow: 0 0 0 12px rgba(245,158,11,0), 0 0 60px rgba(245,158,11,0.55); }
        }
        @media (prefers-reduced-motion: reduce) {
          .tca-root *, .tca-root *::before, .tca-root *::after {
            animation: none !important;
            transition: none !important;
          }
        }

        /* Clock hero */
        .tca-clock-hero {
          background: rgba(15, 23, 42, 0.55);
          backdrop-filter: blur(14px) saturate(140%);
          -webkit-backdrop-filter: blur(14px) saturate(140%);
          border: 1px solid rgba(6, 182, 212, 0.25);
          animation: tca-slide-up 500ms ease-out backwards;
        }
        .tca-clock-wrap {
          width: 240px;
          height: 240px;
          border-radius: 50%;
          padding: 6px;
        }
        .tca-clock-wrap.tca-clock-active { animation: tca-pulse-cyan 2.6s ease-in-out infinite; border-radius: 50%; }
        .tca-clock-wrap.tca-clock-break  { animation: tca-pulse-amber 2.0s ease-in-out infinite; border-radius: 50%; }
        .tca-clock-svg { width: 100%; height: 100%; display: block; }

        .tca-timer {
          font-size: 2.5rem;
          font-weight: 800;
          letter-spacing: -0.02em;
          font-variant-numeric: tabular-nums;
          background: linear-gradient(135deg, #67e8f9 0%, #06B6D4 100%);
          -webkit-background-clip: text; background-clip: text;
          -webkit-text-fill-color: transparent;
          line-height: 1;
          filter: drop-shadow(0 0 12px rgba(6,182,212,0.35));
        }
        .tca-timer-idle {
          font-size: 1.75rem;
          font-weight: 800;
          letter-spacing: -0.02em;
          font-variant-numeric: tabular-nums;
          color: #94a3b8;
          line-height: 1;
        }
        .tca-status-active { box-shadow: 0 0 12px rgba(6,182,212,0.35); }
        .tca-status-break  { box-shadow: 0 0 12px rgba(245,158,11,0.35); }

        /* Primary action button */
        .tca-btn-primary {
          background: linear-gradient(135deg, #06B6D4 0%, #0EA5E9 100%);
          box-shadow: 0 6px 18px rgba(6,182,212,0.40);
        }

        /* Glass panels */
        .tca-panel {
          background: rgba(15, 23, 42, 0.55);
          backdrop-filter: blur(14px) saturate(140%);
          -webkit-backdrop-filter: blur(14px) saturate(140%);
          animation: tca-slide-up 500ms ease-out backwards;
        }

        /* Bar chart */
        .tca-bar {
          width: 100%;
          border-radius: 6px 6px 0 0;
          transition: height 600ms cubic-bezier(0.2, 0.8, 0.2, 1);
        }

        /* Activity row hover */
        .tca-activity-row {
          padding: 6px 8px;
          border-radius: 8px;
          transition: background 140ms ease;
        }
        .tca-activity-row:hover { background: rgba(6,182,212,0.06); }

        /* Timesheet rows */
        .tca-ts-row {
          padding: 10px 12px;
          border-radius: 10px;
          background: rgba(255,255,255,0.02);
          border: 1px solid rgba(255,255,255,0.04);
          transition: background 140ms ease, border-color 140ms ease;
        }
        .tca-ts-row:hover {
          background: rgba(6,182,212,0.06);
          border-color: rgba(6,182,212,0.25);
        }

        /* History row hover */
        .tca-hist-row { transition: border-color 140ms ease; }
        .tca-hist-row:hover { border-color: rgba(6,182,212,0.30); }
      `}</style>
    </>
  )
}

// =================================================================
// SUB-COMPONENTS
// =================================================================

function StatTile({
  label,
  value,
  icon: Icon,
  color,
}: {
  label: string
  value: string
  icon: React.ComponentType<{ size?: number }>
  color: string
}) {
  return (
    <Card radius="lg" p="sm" withBorder className="tca-panel">
      <Group gap="sm" align="center">
        <ThemeIcon size="md" radius="md" variant="light" color={color}>
          <Icon size={14} />
        </ThemeIcon>
        <Stack gap={0}>
          <Text size="lg" fw={800} style={{ fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>
            {value}
          </Text>
          <Text size="xs" c="dimmed" tt="uppercase" fw={600}>{label}</Text>
        </Stack>
      </Group>
    </Card>
  )
}
