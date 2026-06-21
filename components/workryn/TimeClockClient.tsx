'use client'

/**
 * TimeClockClient — Aurora rebuild v2 (Dashboard-level energy pass).
 *
 * v2 lifts this page to the same visual bar as DashboardClient:
 *   - Gradient-mesh hero with 3 drifting orbs + mouse spotlight
 *   - HUGE dynamic gradient-text title that becomes the live timer
 *     when clocked in (or the elapsed break time when on break)
 *   - Status pill with pulsing accent dot
 *   - Stat cards: per-card gradient accent bars + 3D tilt + gradient
 *     text values + count-ups
 *   - Glass panels everywhere with hover border-color shift
 *   - Activity feed with staggered slide-up entrance
 *   - Quick break selector + clock-out as gradient buttons with hover lift
 *
 * Cyan is the page accent per ROUTE_ACCENT['/w/time-clock'].
 *
 * All API endpoints and state machinery are preserved byte-for-byte:
 *   GET  /api/workryn/time-clock/status
 *   POST /api/workryn/time-clock/clock-in
 *   POST /api/workryn/time-clock/clock-out
 *   POST /api/workryn/time-clock/break/start    body { plannedMinutes, type }
 *   POST /api/workryn/time-clock/break/end
 *   GET  /api/workryn/time-clock/timesheet?weekStart=...
 *   GET  /api/workryn/time-clock/history?limit=10&offset=N
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
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  Coffee,
  Clock as ClockIcon,
  History as HistoryIcon,
  LogIn,
  LogOut,
  Pause,
  Play,
  Sparkles,
  TrendingUp,
} from 'lucide-react'
import { useCountUp } from '@/hooks/useCountUp'
import { useTilt, useMouseSpotlight } from '@/hooks/workrynEffects'

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
  bannerUrl?: string | null
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

// ---------- Per-stat-card themes (matches Dashboard pattern) ----------

const STAT_THEMES = {
  cyan:   { bar: 'linear-gradient(90deg, #67e8f9, #06B6D4)', glow: 'rgba(6,182,212,0.35)',    text: 'linear-gradient(135deg, #67e8f9, #06B6D4)', color: 'cyan'   as const },
  violet: { bar: 'linear-gradient(90deg, #a78bfa, #7C3AED)', glow: 'rgba(124,58,237,0.35)',   text: 'linear-gradient(135deg, #c4b5fd, #7C3AED)', color: 'violet' as const },
  orange: { bar: 'linear-gradient(90deg, #fbbf24, #f59e0b)', glow: 'rgba(245,158,11,0.35)',   text: 'linear-gradient(135deg, #fcd34d, #f59e0b)', color: 'orange' as const },
  mint:   { bar: 'linear-gradient(90deg, #6ee7b7, #10b981)', glow: 'rgba(52,211,153,0.35)',   text: 'linear-gradient(135deg, #6ee7b7, #10b981)', color: 'mint'   as const },
} as const

// ---------- SVG Clock Face ----------

function ClockFace({ elapsed, isOnBreak, isClockedIn }: { elapsed: number; isOnBreak: boolean; isClockedIn: boolean }) {
  const cx = 100, cy = 100, radius = 86
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
  const minAngle  = ((minute + second / 60) / 60) * 360 - 90
  const secAngle  = (second / 60) * 360 - 90

  const point = (a: number, len: number) => {
    const r = (a * Math.PI) / 180
    return { x: cx + len * Math.cos(r), y: cy + len * Math.sin(r) }
  }
  const hourPt = point(hourAngle, radius * 0.52)
  const minPt  = point(minAngle,  radius * 0.74)
  const secPt  = point(secAngle,  radius * 0.82)

  const accent = isOnBreak ? '#F59E0B' : isClockedIn ? '#06B6D4' : '#475569'

  return (
    <svg viewBox="0 0 200 200" className="tca-clock-svg">
      <defs>
        <radialGradient id="tcaFace">
          <stop offset="0%"   stopColor="rgba(15,23,42,0.85)" />
          <stop offset="60%"  stopColor="rgba(11,15,30,0.92)" />
          <stop offset="100%" stopColor="rgba(7,9,18,0.98)" />
        </radialGradient>
        <linearGradient id="tcaRingActive" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%"   stopColor="#67e8f9" />
          <stop offset="100%" stopColor="#06B6D4" />
        </linearGradient>
        <linearGradient id="tcaRingBreak" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%"   stopColor="#fcd34d" />
          <stop offset="100%" stopColor="#F59E0B" />
        </linearGradient>
      </defs>

      <circle cx={cx} cy={cy} r={radius} fill="url(#tcaFace)" />
      <circle
        cx={cx} cy={cy} r={radius}
        fill="none"
        stroke={isOnBreak ? 'url(#tcaRingBreak)' : isClockedIn ? 'url(#tcaRingActive)' : 'rgba(148,163,184,0.18)'}
        strokeWidth={isClockedIn || isOnBreak ? 3.5 : 2}
        style={{
          filter: isClockedIn && !isOnBreak
            ? 'drop-shadow(0 0 10px rgba(6,182,212,0.65))'
            : isOnBreak
            ? 'drop-shadow(0 0 10px rgba(245,158,11,0.65))'
            : 'none',
        }}
      />

      {/* Hour ticks */}
      {Array.from({ length: 60 }).map((_, i) => {
        const a = (i / 60) * 360 - 90
        const p1 = point(a, radius - 4)
        const p2 = point(a, radius - (i % 5 === 0 ? 12 : 7))
        return (
          <line
            key={i}
            x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y}
            stroke={i % 5 === 0 ? 'rgba(203,213,225,0.55)' : 'rgba(148,163,184,0.22)'}
            strokeWidth={i % 5 === 0 ? 1.8 : 0.8}
          />
        )
      })}

      {/* Hour hand */}
      <line x1={cx} y1={cy} x2={hourPt.x} y2={hourPt.y} stroke="#f1f5f9" strokeWidth="4" strokeLinecap="round" />
      {/* Minute hand */}
      <line x1={cx} y1={cy} x2={minPt.x}  y2={minPt.y}  stroke="#e2e8f0" strokeWidth="2.5" strokeLinecap="round" />
      {/* Second hand */}
      <line x1={cx} y1={cy} x2={secPt.x}  y2={secPt.y}  stroke={accent} strokeWidth="1.5" strokeLinecap="round" />
      <circle cx={cx} cy={cy} r={4.5} fill={accent} />
      <circle cx={cx} cy={cy} r={2}   fill="#070912" />
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
  bannerUrl,
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

  const spot = useMouseSpotlight()

  const refreshStatus = useCallback(async () => {
    const res = await fetch('/api/workryn/time-clock/status', { cache: 'no-store' })
    if (!res.ok) return
    const s: StatusResponse = await res.json()
    setStatus(s); setCurrentEntry(s.currentEntry); setCurrentBreak(s.currentBreak)
    setIsClockedIn(s.isClockedIn); setIsOnBreak(!!s.currentBreak)
  }, [])

  const refreshWeek = useCallback(async (ws?: Date) => {
    setTsLoading(true)
    const url = `/api/workryn/time-clock/timesheet?weekStart=${encodeURIComponent((ws ?? weekStart).toISOString())}`
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

  // Break ticker (separate counter for on-break elapsed time)
  const [breakElapsed, setBreakElapsed] = useState(0)
  useEffect(() => {
    if (isOnBreak && currentBreak) {
      const update = () => {
        const now = Date.now()
        setBreakElapsed(Math.max(0, Math.floor((now - new Date(currentBreak.startedAt).getTime()) / 1000)))
      }
      update()
      const id = setInterval(update, 1000)
      return () => clearInterval(id)
    } else {
      setBreakElapsed(0)
    }
  }, [isOnBreak, currentBreak])

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

  useEffect(() => {
    ;(async () => {
      setHistLoading(true)
      const res = await fetch(`/api/workryn/time-clock/history?limit=${LIMIT}&offset=${offset}`, { cache: 'no-store' })
      if (res.ok) setHistData(await res.json())
      setHistLoading(false)
    })()
  }, [offset])

  // Action handlers (preserved)
  async function handleClockIn() {
    setLoading(true); setError(null)
    const res = await fetch('/api/workryn/time-clock/clock-in', { method: 'POST', headers: { 'Content-Type': 'application/json' } })
    if (res.ok) await refreshStatus(); else setError('Failed to clock in')
    setLoading(false)
  }
  async function handleClockOut() {
    setLoading(true); setError(null)
    const res = await fetch('/api/workryn/time-clock/clock-out', { method: 'POST' })
    if (res.ok) { await refreshStatus(); await refreshWeek() } else setError('Failed to clock out')
    setLoading(false)
  }
  async function handleStartBreak(plannedMinutes: 30 | 45 | 60, type: 'SHORT' | 'LUNCH' | 'OTHER') {
    setLoading(true); setError(null)
    const res = await fetch('/api/workryn/time-clock/break/start', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ plannedMinutes, type }),
    })
    if (res.ok) await refreshStatus(); else setError('Failed to start break')
    setLoading(false)
  }
  async function handleEndBreak() {
    setLoading(true); setError(null)
    const res = await fetch('/api/workryn/time-clock/break/end', { method: 'POST' })
    if (res.ok) await refreshStatus(); else setError('Failed to end break')
    setLoading(false)
  }
  function shiftWeek(dir: number) {
    const next = new Date(weekStart); next.setDate(next.getDate() + dir * 7)
    setWeekStart(next); refreshWeek(next)
  }

  const todayEntries = tsData?.entries.filter((e) => sameDay(new Date(e.clockInAt), new Date())) ?? []
  const animWeek   = useCountUp(status?.weekTotal.workedMinutes ?? 0, 900)
  const animDays   = useCountUp(status?.weekTotal.days ?? 0, 700)
  const animBreaks = useCountUp(status?.weekTotal.breakMinutes ?? 0, 800)
  const animToday  = useCountUp(status?.todayTotal.workedMinutes ?? 0, 700)

  // Hero "big text" — dynamically becomes the live timer when clocked in
  const heroBig = isOnBreak
    ? formatHMS(breakElapsed)
    : isClockedIn
    ? formatHMS(elapsed)
    : 'Ready'

  const heroEyebrow = 'Time Clock'
  const heroSubtitle = isOnBreak
    ? `On break — ${currentBreak?.plannedMinutes ?? 0} minute ${currentBreak?.type?.toLowerCase() ?? 'pause'}`
    : isClockedIn
    ? `Clocked in since ${formatTime(currentEntry?.clockInAt)} • ${formatDate(new Date())}`
    : formatDate(new Date())

  const statusColor: 'mint' | 'orange' | 'gray' = isOnBreak ? 'orange' : isClockedIn ? 'mint' : 'gray'
  const statusText = isOnBreak ? 'On Break' : isClockedIn ? 'Clocked In' : 'Clocked Out'

  return (
    <>
      <Container size="xl" py="lg" className="tca-root">

        {/* =========================== HERO =========================== */}
        <div ref={spot.ref} onMouseMove={spot.onMouseMove} style={{ marginBottom: 20 }}>
          <Paper radius="lg" p="xl" className="tca-hero" style={{ minHeight: 260 }}>
            <div className="tca-hero-mesh" aria-hidden />
            <div className="tca-hero-orbs" aria-hidden>
              <span className="tca-orb tca-orb-1" />
              <span className="tca-orb tca-orb-2" />
              <span className="tca-orb tca-orb-3" />
            </div>
            <div className="tca-hero-spotlight" aria-hidden />

            {bannerUrl ? (
              <>
                <img src={bannerUrl} alt="" aria-hidden="true" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", zIndex: 0, pointerEvents: "none" }} />
                <div aria-hidden="true" style={{ position: "absolute", inset: 0, zIndex: 1, pointerEvents: "none", background: "linear-gradient(0deg, rgba(8,10,24,0.82) 0%, rgba(8,10,24,0.30) 38%, rgba(8,10,24,0.06) 66%, transparent 100%)" }} />
                <div style={{ position: "absolute", left: 32, bottom: 26, zIndex: 2 }}>
                  <Title order={1} style={{ color: "#fff", fontSize: 34, fontWeight: 800, letterSpacing: "-0.01em", textShadow: "0 2px 18px rgba(0,0,0,0.55)" }}>Time Clock</Title>
                </div>
              </>
            ) : (
              <img src="/heroes/time-clock.svg" alt="" aria-hidden="true" style={{ position: "absolute", left: "50%", top: "50%", transform: "translate(-50%, -50%)", height: "70%", zIndex: 0, opacity: 0.22, pointerEvents: "none" }} />
            )}

            {!bannerUrl && (
            <Group justify="space-between" align="flex-start" wrap="wrap" gap="lg" style={{ position: 'relative', zIndex: 2 }}>
              <Stack gap={6} style={{ minWidth: 0, flex: 1 }}>
                <Group gap={8} align="center">
                  <ClockIcon size={14} style={{ color: 'rgba(196,181,253,0.85)' }} />
                  <Text size="xs" tt="uppercase" fw={700} c="violet.3" style={{ letterSpacing: '0.12em' }}>
                    {heroEyebrow}
                  </Text>
                </Group>

                <Title order={1} className={`tca-hero-title tca-hero-title-${isOnBreak ? 'break' : isClockedIn ? 'active' : 'idle'}`}>
                  {heroBig}
                </Title>

                <Text size="sm" c="dimmed">
                  {heroSubtitle}
                </Text>
              </Stack>

              {/* Status capsule */}
              <Paper radius="md" p="sm" className="tca-status-capsule">
                <Group gap="xs" align="center">
                  <span className={`tca-status-dot tca-dot-${statusColor}`} aria-hidden />
                  <Stack gap={0}>
                    <Text size="xs" c="dimmed" tt="uppercase" fw={700}>Status</Text>
                    <Text fw={700} size="sm">{statusText}</Text>
                  </Stack>
                </Group>
                {status && (
                  <Group gap="md" mt="xs" pt="xs" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                    <Stack gap={0}>
                      <Text size="xs" c="dimmed">Today</Text>
                      <Text size="sm" fw={700} style={{ fontVariantNumeric: 'tabular-nums' }}>
                        {formatDuration(status.todayTotal.workedMinutes)}
                      </Text>
                    </Stack>
                    <Stack gap={0}>
                      <Text size="xs" c="dimmed">Week</Text>
                      <Text size="sm" fw={700} style={{ fontVariantNumeric: 'tabular-nums' }}>
                        {formatDuration(status.weekTotal.workedMinutes)}
                      </Text>
                    </Stack>
                  </Group>
                )}
              </Paper>
            </Group>
            )}
          </Paper>
        </div>

        {error && (
          <Alert color="coral" variant="light" mb="md" onClose={() => setError(null)} withCloseButton>
            {error}
          </Alert>
        )}

        {/* =========================== TABS =========================== */}
        <Tabs
          value={tab}
          onChange={(v) => setTab((v ?? 'clock') as 'clock' | 'timesheet' | 'history')}
          variant="pills"
          radius="md"
          color="cyan"
          className="tca-tabs"
        >
          <Tabs.List mb="md">
            <Tabs.Tab value="clock"     leftSection={<ClockIcon size={14} />}>Clock</Tabs.Tab>
            <Tabs.Tab value="timesheet" leftSection={<CalendarIcon size={14} />}>Timesheet</Tabs.Tab>
            <Tabs.Tab value="history"   leftSection={<HistoryIcon size={14} />}>History</Tabs.Tab>
          </Tabs.List>

          {/* ============ CLOCK TAB ============ */}
          <Tabs.Panel value="clock">
            <SimpleGrid cols={{ base: 1, md: 2 }} spacing="md">
              {/* LEFT — clock face + actions */}
              <Card radius="lg" p="xl" withBorder className="tca-clock-card">
                <Stack align="center" gap="lg">
                  <Box className={`tca-clock-wrap${isClockedIn ? ' tca-clock-active' : ''}${isOnBreak ? ' tca-clock-break' : ''}`}>
                    <ClockFace elapsed={elapsed} isOnBreak={isOnBreak} isClockedIn={isClockedIn} />
                  </Box>

                  {/* Action buttons */}
                  <Stack gap="sm" w="100%" align="stretch">
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
                        <Text size="xs" c="dimmed" tt="uppercase" fw={700} ta="center">Take a break</Text>
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
                          color="red"
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
                        leftSection={<Play size={18} />}
                        loading={loading}
                        onClick={handleEndBreak}
                        className="tca-btn-break"
                      >
                        End Break — Resume Work
                      </Button>
                    )}
                  </Stack>
                </Stack>
              </Card>

              {/* RIGHT — week stats + chart + today's activity */}
              <Stack gap="md">
                {/* Stat cards (Dashboard-style: accent bar + tilt + gradient text) */}
                <SimpleGrid cols={2} spacing="sm">
                  <StatCard label="This Week" value={formatDuration(animWeek)}   icon={ClockIcon}    theme="cyan"   delay={0}   />
                  <StatCard label="Days"      value={String(animDays)}            icon={CalendarIcon} theme="violet" delay={80}  />
                  <StatCard label="Breaks"    value={formatDuration(animBreaks)}  icon={Coffee}       theme="orange" delay={160} />
                  <StatCard label="Today"     value={formatDuration(animToday)}   icon={Activity}     theme="mint"   delay={240} />
                </SimpleGrid>

                {/* Weekly bars panel */}
                <Card radius="lg" p="lg" withBorder className="tca-panel">
                  <Group justify="space-between" align="center" mb="sm">
                    <Group gap="xs" align="center">
                      <ThemeIcon size="md" radius="md" variant="light" color="cyan">
                        <TrendingUp size={14} />
                      </ThemeIcon>
                      <Title order={3} size="h6" className="tca-section-title">Weekly Hours</Title>
                    </Group>
                    {status && (
                      <Text size="xs" c="dimmed" style={{ fontVariantNumeric: 'tabular-nums' }}>
                        {formatDuration(status.weekTotal.workedMinutes)} total
                      </Text>
                    )}
                  </Group>
                  <Group align="flex-end" gap={8} h={120} mb="xs">
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
                                boxShadow: isToday ? '0 0 14px rgba(6,182,212,0.55)' : 'none',
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
                  <Group gap="xs" align="center" mb="sm">
                    <ThemeIcon size="md" radius="md" variant="light" color="cyan">
                      <Sparkles size={14} />
                    </ThemeIcon>
                    <Title order={3} size="h6" className="tca-section-title">Today's Activity</Title>
                  </Group>
                  {todayEntries.length > 0 ? (
                    <Stack gap={4}>
                      {todayEntries.map((e, idx) => (
                        <Group
                          key={e.id}
                          gap="sm"
                          className="tca-activity-row"
                          style={{ animationDelay: `${idx * 50}ms` }}
                        >
                          <span className="tca-activity-dot" />
                          <Text size="sm" style={{ flex: 1, fontVariantNumeric: 'tabular-nums' }}>
                            {formatTime(e.clockInAt)} → {e.clockOutAt ? formatTime(e.clockOutAt) : 'now'}
                          </Text>
                          <Badge variant="light" color="cyan">{formatDuration(e.workedMinutes)}</Badge>
                        </Group>
                      ))}
                    </Stack>
                  ) : (
                    <Stack align="center" gap="xs" py="md">
                      <ThemeIcon size={36} radius="xl" variant="light" color="cyan">
                        <ClockIcon size={18} />
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
                  Prev week
                </Button>
                <Text fw={700} className="tca-section-title">
                  {formatShortDate(weekStart)} – {formatShortDate(new Date(weekStart.getTime() + 6 * 86400000))}
                </Text>
                <Button variant="subtle" color="cyan" size="sm" rightSection={<ChevronRight size={14} />} onClick={() => shiftWeek(1)}>
                  Next week
                </Button>
              </Group>

              {tsLoading ? (
                <Group justify="center" py="xl"><Loader color="cyan" /></Group>
              ) : tsData ? (
                <>
                  <SimpleGrid cols={3} spacing="md" mb="md">
                    <StatCard label="Worked" value={formatDuration(tsData.totals.workedMinutes)} icon={ClockIcon}    theme="cyan"   delay={0}  />
                    <StatCard label="Breaks" value={formatDuration(tsData.totals.breakMinutes)}  icon={Coffee}       theme="orange" delay={80} />
                    <StatCard label="Days"   value={String(tsData.totals.daysWorked)}            icon={CalendarIcon} theme="violet" delay={160} />
                  </SimpleGrid>

                  {tsData.entries.length === 0 ? (
                    <Stack align="center" gap="xs" py="lg">
                      <ThemeIcon size={40} radius="xl" variant="light" color="cyan">
                        <CalendarIcon size={18} />
                      </ThemeIcon>
                      <Text c="dimmed">No entries this week.</Text>
                    </Stack>
                  ) : (
                    <Stack gap={6}>
                      {tsData.entries
                        .slice()
                        .sort((a, b) => new Date(a.clockInAt).getTime() - new Date(b.clockInAt).getTime())
                        .map((e, idx) => (
                          <Group key={e.id} className="tca-ts-row" wrap="nowrap" style={{ animationDelay: `${idx * 40}ms` }}>
                            <Text size="sm" fw={600} style={{ minWidth: 120 }}>
                              {new Date(e.clockInAt).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })}
                            </Text>
                            <Text size="sm" c="dimmed" style={{ flex: 1, fontVariantNumeric: 'tabular-nums' }}>
                              {formatTime(e.clockInAt)} → {e.clockOutAt ? formatTime(e.clockOutAt) : 'active'}
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
                    <Stack align="center" gap="xs" py="lg">
                      <ThemeIcon size={40} radius="xl" variant="light" color="cyan">
                        <HistoryIcon size={18} />
                      </ThemeIcon>
                      <Text c="dimmed">No history yet.</Text>
                    </Stack>
                  ) : (
                    <Stack gap={6} mb="md">
                      {histData.entries.map((e, idx) => {
                        const isExp = expanded.has(e.id)
                        return (
                          <Card
                            key={e.id}
                            radius="md"
                            p="sm"
                            withBorder
                            className="tca-hist-row"
                            style={{ cursor: 'pointer', animationDelay: `${idx * 30}ms` }}
                            onClick={() => {
                              const s = new Set(expanded)
                              if (isExp) s.delete(e.id); else s.add(e.id)
                              setExpanded(s)
                            }}
                          >
                            <Group justify="space-between" wrap="nowrap">
                              <Text size="sm" fw={600} style={{ minWidth: 120 }}>
                                {new Date(e.clockInAt).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })}
                              </Text>
                              <Text size="sm" c="dimmed" style={{ flex: 1, fontVariantNumeric: 'tabular-nums' }}>
                                {formatTime(e.clockInAt)} → {e.clockOutAt ? formatTime(e.clockOutAt) : 'active'}
                              </Text>
                              <Badge variant="light" color="cyan">{formatDuration(e.workedMinutes)}</Badge>
                            </Group>
                            {isExp && (
                              <Group gap="md" mt="sm" pt="sm" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                                <Text size="xs" c="dimmed">
                                  Break: <Text component="span" fw={700} c="white">{formatDuration(e.breakMinutes)}</Text>
                                </Text>
                                {e.notes && (
                                  <Text size="xs" c="dimmed">
                                    Notes: <Text component="span" fs="italic">{e.notes}</Text>
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

                  <Group justify="space-between" pt="sm" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                    <Text size="xs" c="dimmed">
                      {histData.offset + 1}–{histData.offset + histData.entries.length} of {histData.total}
                    </Text>
                    <Group gap="xs">
                      <Button size="xs" variant="subtle" color="cyan" leftSection={<ChevronLeft size={12} />}
                        disabled={offset === 0}
                        onClick={() => setOffset(Math.max(0, offset - LIMIT))}>Prev</Button>
                      <Button size="xs" variant="subtle" color="cyan" rightSection={<ChevronRight size={12} />}
                        disabled={!histData.hasMore}
                        onClick={() => setOffset(offset + LIMIT)}>Next</Button>
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
        @keyframes tca-mesh-drift {
          0%, 100% { transform: translate(0,0) scale(1); }
          50%      { transform: translate(3%, -2%) scale(1.05); }
        }
        @keyframes tca-orb-a { 0%,100%{transform:translate(0,0)} 50%{transform:translate(40px,-30px)} }
        @keyframes tca-orb-b { 0%,100%{transform:translate(0,0)} 50%{transform:translate(-30px,25px)} }
        @keyframes tca-orb-c { 0%,100%{transform:translate(0,0)} 50%{transform:translate(20px,40px)} }
        @keyframes tca-dot-pulse {
          0%, 100% { box-shadow: 0 0 0 0 var(--dot-color), 0 0 12px var(--dot-color); }
          50%      { box-shadow: 0 0 0 6px transparent, 0 0 18px var(--dot-color); }
        }
        @keyframes tca-pulse-cyan {
          0%, 100% { box-shadow: 0 0 0 0 rgba(6,182,212,0.5), 0 0 40px rgba(6,182,212,0.35); }
          50%      { box-shadow: 0 0 0 14px rgba(6,182,212,0), 0 0 60px rgba(6,182,212,0.55); }
        }
        @keyframes tca-pulse-amber {
          0%, 100% { box-shadow: 0 0 0 0 rgba(245,158,11,0.5), 0 0 40px rgba(245,158,11,0.35); }
          50%      { box-shadow: 0 0 0 14px rgba(245,158,11,0), 0 0 60px rgba(245,158,11,0.55); }
        }
        @media (prefers-reduced-motion: reduce) {
          .tca-root *, .tca-root *::before, .tca-root *::after {
            animation: none !important;
            transition: none !important;
          }
        }

        /* -------------- HERO (Dashboard-grade) -------------- */
        .tca-hero {
          position: relative;
          overflow: hidden;
          border: 1px solid rgba(6,182,212,0.30);
          background:
            linear-gradient(135deg, rgba(6,182,212,0.16) 0%, rgba(14,165,233,0.10) 50%, rgba(124,58,237,0.06) 100%),
            rgba(11,15,30,0.55);
          backdrop-filter: blur(14px) saturate(140%);
          -webkit-backdrop-filter: blur(14px) saturate(140%);
          box-shadow: 0 20px 60px -20px rgba(6,182,212,0.35), 0 1px 0 rgba(255,255,255,0.05) inset;
          animation: tca-slide-up 460ms ease-out backwards;
        }
        .tca-hero-mesh {
          position: absolute; inset: -25%;
          background:
            radial-gradient(circle at 22% 30%, rgba(6,182,212,0.45), transparent 42%),
            radial-gradient(circle at 78% 25%, rgba(14,165,233,0.30), transparent 47%),
            radial-gradient(circle at 62% 82%, rgba(124,58,237,0.20), transparent 52%);
          filter: blur(40px);
          animation: tca-mesh-drift 22s ease-in-out infinite;
          z-index: 0;
          pointer-events: none;
        }
        .tca-hero-orbs { position: absolute; inset: 0; z-index: 0; pointer-events: none; }
        .tca-orb { position: absolute; border-radius: 50%; filter: blur(22px); opacity: 0.55; mix-blend-mode: screen; }
        .tca-orb-1 { width: 130px; height: 130px; top: 12%; left: 8%;
          background: radial-gradient(circle, #67e8f9 0%, transparent 70%);
          animation: tca-orb-a 14s ease-in-out infinite; }
        .tca-orb-2 { width: 100px; height: 100px; top: 55%; left: 60%;
          background: radial-gradient(circle, #06B6D4 0%, transparent 70%);
          animation: tca-orb-b 16s ease-in-out infinite; }
        .tca-orb-3 { width: 80px; height: 80px; bottom: 10%; right: 12%;
          background: radial-gradient(circle, #a855f7 0%, transparent 70%);
          animation: tca-orb-c 18s ease-in-out infinite; }
        .tca-hero-spotlight {
          position: absolute; inset: 0; z-index: 1; pointer-events: none;
          background: radial-gradient(circle 360px at var(--mx, 50%) var(--my, 50%), rgba(255,255,255,0.10), transparent 60%);
        }
        .tca-hero-title {
          font-size: clamp(2.25rem, 6vw, 4rem);
          font-weight: 800;
          letter-spacing: -0.035em;
          line-height: 1;
          margin: 0;
          font-variant-numeric: tabular-nums;
        }
        .tca-hero-title-active {
          background: linear-gradient(135deg, #ffffff 0%, #67e8f9 50%, #06B6D4 100%);
          -webkit-background-clip: text; background-clip: text;
          -webkit-text-fill-color: transparent;
          filter: drop-shadow(0 2px 16px rgba(6,182,212,0.45));
        }
        .tca-hero-title-break {
          background: linear-gradient(135deg, #ffffff 0%, #fcd34d 50%, #F59E0B 100%);
          -webkit-background-clip: text; background-clip: text;
          -webkit-text-fill-color: transparent;
          filter: drop-shadow(0 2px 16px rgba(245,158,11,0.45));
        }
        .tca-hero-title-idle {
          background: linear-gradient(135deg, #ffffff 0%, #c4b5fd 50%, #7C3AED 100%);
          -webkit-background-clip: text; background-clip: text;
          -webkit-text-fill-color: transparent;
          filter: drop-shadow(0 2px 16px rgba(124,58,237,0.30));
        }

        /* Status capsule */
        .tca-status-capsule {
          background: rgba(15,23,42,0.65);
          backdrop-filter: blur(12px) saturate(140%);
          -webkit-backdrop-filter: blur(12px) saturate(140%);
          border: 1px solid rgba(255,255,255,0.08);
          min-width: 180px;
        }
        .tca-status-dot {
          width: 10px; height: 10px; border-radius: 50%;
          animation: tca-dot-pulse 1.8s ease-in-out infinite;
        }
        .tca-dot-mint   { background: #34D399; --dot-color: rgba(52,211,153,0.5); }
        .tca-dot-orange { background: #F59E0B; --dot-color: rgba(245,158,11,0.5); }
        .tca-dot-gray   { background: #64748B; --dot-color: rgba(100,116,139,0.4); }

        /* -------------- Clock card -------------- */
        .tca-clock-card {
          background: rgba(15, 23, 42, 0.55);
          backdrop-filter: blur(14px) saturate(140%);
          -webkit-backdrop-filter: blur(14px) saturate(140%);
          border: 1px solid rgba(6, 182, 212, 0.18);
          animation: tca-slide-up 500ms ease-out backwards;
          transition: border-color 200ms ease, box-shadow 200ms ease;
        }
        .tca-clock-card:hover {
          border-color: rgba(6,182,212,0.45);
          box-shadow: 0 14px 36px rgba(6,182,212,0.18);
        }
        .tca-clock-wrap {
          width: 260px; height: 260px;
          border-radius: 50%;
          padding: 6px;
          display: grid; place-items: center;
        }
        .tca-clock-wrap.tca-clock-active { animation: tca-pulse-cyan 2.6s ease-in-out infinite; border-radius: 50%; }
        .tca-clock-wrap.tca-clock-break  { animation: tca-pulse-amber 2.0s ease-in-out infinite; border-radius: 50%; }
        .tca-clock-svg { width: 100%; height: 100%; display: block; }

        /* Primary action button */
        .tca-btn-primary {
          background: linear-gradient(135deg, #06B6D4 0%, #0EA5E9 100%);
          box-shadow: 0 6px 18px rgba(6,182,212,0.40);
          transition: transform 180ms ease, box-shadow 180ms ease;
        }
        .tca-btn-primary:hover {
          transform: translateY(-1px);
          box-shadow: 0 10px 28px rgba(6,182,212,0.55);
        }
        .tca-btn-break {
          background: linear-gradient(135deg, #F59E0B 0%, #FB923C 100%);
          box-shadow: 0 6px 18px rgba(245,158,11,0.40);
          color: #fff;
        }
        .tca-btn-break:hover {
          transform: translateY(-1px);
          box-shadow: 0 10px 28px rgba(245,158,11,0.55);
        }

        /* -------------- Stat cards (Dashboard pattern) -------------- */
        .tca-stat-card {
          position: relative;
          overflow: hidden;
          background: rgba(15, 23, 42, 0.55);
          backdrop-filter: blur(12px) saturate(140%);
          -webkit-backdrop-filter: blur(12px) saturate(140%);
          transition: transform 220ms ease, box-shadow 260ms ease, border-color 220ms ease;
          animation: tca-slide-up 500ms ease-out backwards;
          will-change: transform;
        }
        .tca-stat-card::before {
          content: ''; position: absolute; top: 0; left: 0; right: 0; height: 3px;
          background: var(--tca-bar);
        }
        .tca-stat-card:hover {
          border-color: var(--mantine-color-cyan-6);
          box-shadow: 0 14px 36px var(--tca-glow, rgba(6,182,212,0.35));
        }
        .tca-stat-value {
          font-size: clamp(1.5rem, 2.5vw, 1.9rem);
          font-weight: 800;
          line-height: 1;
          letter-spacing: -0.03em;
          font-variant-numeric: tabular-nums;
          background: var(--tca-text);
          -webkit-background-clip: text; background-clip: text;
          -webkit-text-fill-color: transparent;
        }

        /* -------------- Glass panels -------------- */
        .tca-panel {
          background: rgba(15, 23, 42, 0.55);
          backdrop-filter: blur(14px) saturate(140%);
          -webkit-backdrop-filter: blur(14px) saturate(140%);
          animation: tca-slide-up 500ms ease-out backwards;
          transition: border-color 200ms ease, box-shadow 220ms ease;
        }
        .tca-panel:hover {
          border-color: rgba(6,182,212,0.30);
          box-shadow: 0 10px 30px rgba(6,182,212,0.12);
        }
        .tca-section-title {
          background: linear-gradient(135deg, #fff 0%, #67e8f9 100%);
          -webkit-background-clip: text; background-clip: text;
          -webkit-text-fill-color: transparent;
          font-weight: 700;
        }

        /* Bar chart */
        .tca-bar {
          width: 100%;
          border-radius: 6px 6px 0 0;
          transition: height 600ms cubic-bezier(0.2, 0.8, 0.2, 1);
        }

        /* Activity */
        .tca-activity-row {
          padding: 8px 10px;
          border-radius: 8px;
          transition: background 140ms ease;
          animation: tca-slide-up 400ms ease-out backwards;
        }
        .tca-activity-row:hover { background: rgba(6,182,212,0.08); }
        .tca-activity-dot {
          width: 8px; height: 8px;
          border-radius: 50%;
          background: linear-gradient(135deg, #67e8f9, #06B6D4);
          box-shadow: 0 0 8px rgba(6,182,212,0.6);
        }

        /* Timesheet rows */
        .tca-ts-row {
          padding: 10px 12px;
          border-radius: 10px;
          background: rgba(255,255,255,0.02);
          border: 1px solid rgba(255,255,255,0.04);
          transition: background 140ms ease, border-color 140ms ease;
          animation: tca-slide-up 460ms ease-out backwards;
        }
        .tca-ts-row:hover {
          background: rgba(6,182,212,0.06);
          border-color: rgba(6,182,212,0.25);
        }

        /* History row */
        .tca-hist-row {
          transition: border-color 140ms ease;
          animation: tca-slide-up 400ms ease-out backwards;
        }
        .tca-hist-row:hover { border-color: rgba(6,182,212,0.30); }
      `}</style>
    </>
  )
}

// =================================================================
// SUB-COMPONENTS
// =================================================================

function StatCard({
  label,
  value,
  icon: Icon,
  theme,
  delay,
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
        className="tca-stat-card"
        style={{
          animationDelay: `${delay}ms`,
          ['--tca-bar' as string]: cfg.bar,
          ['--tca-glow' as string]: cfg.glow,
          ['--tca-text' as string]: cfg.text,
        } as React.CSSProperties}
      >
        <Group gap="sm" align="center" wrap="nowrap">
          <ThemeIcon size="lg" radius="md" variant="light" color={cfg.color}>
            <Icon size={16} />
          </ThemeIcon>
          <Stack gap={2} style={{ minWidth: 0, flex: 1 }}>
            <Text className="tca-stat-value">{value}</Text>
            <Text size="xs" c="dimmed" tt="uppercase" fw={700}>{label}</Text>
          </Stack>
        </Group>
      </Card>
    </div>
  )
}
