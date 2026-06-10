'use client'

/**
 * PTOClient — Aurora rebuild (teal accent).
 *
 * Structurally distinct: balance "wallet cards" row is the signature
 * — each PTO type gets a horizontal glass card with its own color as
 * the accent stripe, big hours-available number, and a usage bar.
 * Below that, Mantine Tabs (not pills, not folder switcher) host the
 * 5 sections: My PTO, Approval Queue (elevated), Team Calendar,
 * HR Admin (elevated), Intuit Sync (elevated).
 *
 * API contracts preserved:
 *   POST  /api/workryn/pto/requests
 *   PATCH /api/workryn/pto/requests/:id           body { action, reviewNote }
 *   POST  /api/workryn/pto/intuit/sync            body { action, requestId? }
 *   GET   /api/workryn/pto/intuit/sync
 *   GET   /api/workryn/pto/intuit/auth            (redirect link)
 *
 * Status set unchanged (PENDING / APPROVED / DENIED / CANCELLED).
 */

import { useState, useMemo, useEffect } from 'react'
import {
  ActionIcon, Alert, Avatar, Badge, Box, Button, Card, Checkbox,
  Container, Group, Modal, Notification, Paper, Progress, Select,
  SimpleGrid, Stack, Tabs, Text, TextInput, Textarea, ThemeIcon,
  Title, Tooltip,
} from '@mantine/core'
import { useDisclosure } from '@mantine/hooks'
import {
  AlertTriangle, ArrowUpDown, Calendar as CalendarIcon, CalendarDays,
  Check, ChevronLeft, ChevronRight, Clock, Clock as ClockIcon,
  Download, FileText, Filter, Heart, Link2, Plus, RefreshCw, Search,
  Send, Thermometer, Umbrella, User as UserIcon, X,
} from 'lucide-react'
import { getInitials, timeAgo } from '@/lib/workryn/utils'
import { useCountUp } from '@/hooks/useCountUp'
import { useMouseSpotlight } from '@/hooks/workrynEffects'

// ---------- Types ----------

type PtoType = {
  id: string; name: string; code: string; color: string; icon: string
  accrualRate: number; maxAccrual: number; excludeFromPayroll: boolean
}
type Balance = {
  id: string; typeId: string; accrued: number; used: number
  pending: number; adjustment: number; available: number; type: PtoType
}
type PtoRequest = {
  id: string; userId: string; typeId: string
  startDate: string; endDate: string; totalHours: number
  isHalfDay: boolean; halfDayPeriod: string | null; notes: string | null
  status: string; reviewedAt: string | null; reviewNote: string | null
  intuitSynced: boolean; intuitSyncError: string | null
  createdAt: string
  user: { id: string; name: string; avatarColor: string; email: string; jobTitle: string | null }
  type: { id: string; name: string; code: string; color: string; icon: string; excludeFromPayroll?: boolean }
  reviewedBy: { id: string; name: string } | null
}
type UserInfo = { id: string; name: string | null; email: string | null; avatarColor: string; jobTitle: string | null; role: string }
type IntuitMap = { id: string; userId: string; intuitEmployeeId: string; intuitDisplayName: string | null; intuitEmail: string | null; syncStatus: string; user: { id: string; name: string | null; email: string | null } }

interface PTOClientProps {
  currentUser: { id: string; name: string; role: string; avatarColor: string }
  types: PtoType[]
  balances: Balance[]
  initialRequests: PtoRequest[]
  allUsers: UserInfo[]
  pendingCount: number
  intuitMappings: IntuitMap[]
  isElevated: boolean
  intuitConnected?: boolean
  intuitCompanyName?: string | null
}

const ICON_MAP: Record<string, typeof Umbrella> = {
  umbrella: Umbrella, thermometer: Thermometer, user: UserIcon,
  'file-text': FileText, heart: Heart, clock: ClockIcon,
}
const STATUS_COLORS: Record<string, { color: string; label: string }> = {
  PENDING:   { color: '#F59E0B', label: 'Pending' },
  APPROVED:  { color: '#10B981', label: 'Approved' },
  DENIED:    { color: '#ef4444', label: 'Denied' },
  CANCELLED: { color: '#64748B', label: 'Cancelled' },
}
const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December']

// =================================================================
// MAIN
// =================================================================

export default function PTOClient({
  currentUser, types, balances, initialRequests,
  allUsers: _allUsers, pendingCount: initialPendingCount,
  intuitMappings: initialMappings, isElevated,
  intuitConnected: initialIntuitConnected = false,
  intuitCompanyName: initialCompanyName = null,
}: PTOClientProps) {

  const spot = useMouseSpotlight()

  const [tab, setTab] = useState<'my' | 'queue' | 'calendar' | 'admin' | 'intuit'>('my')
  const [requests, setRequests] = useState<PtoRequest[]>(initialRequests)
  const [modalOpened, modal] = useDisclosure(false)
  const [intuitConnected, setIntuitConnected] = useState(initialIntuitConnected)
  const [companyName, setCompanyName] = useState(initialCompanyName)
  const [oauthToast, setOauthToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null)
  const [pendingCount, setPendingCount] = useState(initialPendingCount)
  const [intuitMappings, setIntuitMappings] = useState(initialMappings)
  const [syncing, setSyncing] = useState(false)
  const [syncResults, setSyncResults] = useState<any>(null)
  const [statusFilter, setStatusFilter] = useState<string | null>('ALL')
  const [searchQuery, setSearchQuery] = useState('')

  // Form state
  const [formTypeId, setFormTypeId] = useState(types[0]?.id || '')
  const [formStart, setFormStart] = useState('')
  const [formEnd, setFormEnd] = useState('')
  const [formHours, setFormHours] = useState('')
  const [formHalfDay, setFormHalfDay] = useState(false)
  const [formHalfPeriod, setFormHalfPeriod] = useState<string | null>('AM')
  const [formNotes, setFormNotes] = useState('')
  const [formError, setFormError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  // Review state
  const [reviewingId, setReviewingId] = useState<string | null>(null)
  const [reviewNote, setReviewNote] = useState('')

  // Calendar state
  const [calMonth, setCalMonth] = useState(() => {
    const d = new Date(); return { year: d.getFullYear(), month: d.getMonth() }
  })

  // Hero count-ups
  const totalAvailable = balances.reduce((s, b) => s + b.available, 0)
  const totalPending = balances.reduce((s, b) => s + b.pending, 0)
  const totalUsed = balances.reduce((s, b) => s + b.used, 0)
  const animAvailable = useCountUp(Math.round(totalAvailable), 900)
  const animPending = useCountUp(Math.round(totalPending), 800)
  const animUsed = useCountUp(Math.round(totalUsed), 800)

  // Filtering
  const filteredRequests = useMemo(() => {
    let f = requests
    if (tab === 'my') f = f.filter((r) => r.userId === currentUser.id)
    if (tab === 'queue') f = f.filter((r) => r.status === 'PENDING')
    if (statusFilter && statusFilter !== 'ALL') f = f.filter((r) => r.status === statusFilter)
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      f = f.filter((r) =>
        r.user.name.toLowerCase().includes(q) ||
        r.type.name.toLowerCase().includes(q) ||
        r.notes?.toLowerCase().includes(q)
      )
    }
    return f
  }, [requests, tab, statusFilter, searchQuery, currentUser.id])

  // Handlers
  function resetForm() {
    setFormTypeId(types[0]?.id || '')
    setFormStart(''); setFormEnd(''); setFormHours('')
    setFormHalfDay(false); setFormHalfPeriod('AM')
    setFormNotes(''); setFormError('')
  }

  async function submitRequest() {
    setFormError('')
    if (!formTypeId || !formStart || !formEnd || !formHours) { setFormError('All fields are required'); return }
    if (Number(formHours) <= 0) { setFormError('Hours must be positive'); return }
    if (new Date(formStart) > new Date(formEnd)) { setFormError('Start date must be before end date'); return }
    setSubmitting(true)
    try {
      const res = await fetch('/api/workryn/pto/requests', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          typeId: formTypeId, startDate: formStart, endDate: formEnd,
          totalHours: Number(formHours), isHalfDay: formHalfDay,
          halfDayPeriod: formHalfDay ? formHalfPeriod : null,
          notes: formNotes || null,
        }),
      })
      const data = await res.json()
      if (!res.ok) { setFormError(data.error || 'Failed'); return }
      setRequests((prev) => [data, ...prev]); modal.close(); resetForm()
    } catch { setFormError('Network error') } finally { setSubmitting(false) }
  }

  async function reviewRequest(id: string, action: 'APPROVED' | 'DENIED') {
    setReviewingId(id)
    try {
      const res = await fetch(`/api/workryn/pto/requests/${id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, reviewNote }),
      })
      const data = await res.json()
      if (res.ok) {
        setRequests((prev) => prev.map((r) => (r.id === id ? data : r)))
        setPendingCount((p) => Math.max(0, p - 1))
        setReviewNote('')
      }
    } catch {} finally { setReviewingId(null) }
  }

  async function syncIntuitEmployees() {
    setSyncing(true); setSyncResults(null)
    try {
      const res = await fetch('/api/workryn/pto/intuit/sync', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'sync-employees' }),
      })
      setSyncResults(await res.json())
      const mr = await fetch('/api/workryn/pto/intuit/sync')
      if (mr.ok) setIntuitMappings(await mr.json())
    } catch { setSyncResults({ error: 'Network error' }) } finally { setSyncing(false) }
  }
  async function pushToIntuit(rid: string) {
    try {
      const res = await fetch('/api/workryn/pto/intuit/sync', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'push-pto', requestId: rid }),
      })
      if ((await res.json()) && res.ok) {
        setRequests((prev) => prev.map((r) => (r.id === rid ? { ...r, intuitSynced: true, intuitSyncError: null } : r)))
      }
    } catch {}
  }

  // Calendar helpers
  const calDays = useMemo(() => {
    const { year, month } = calMonth
    const fd = new Date(year, month, 1).getDay()
    const dm = new Date(year, month + 1, 0).getDate()
    const d: (number | null)[] = []
    for (let i = 0; i < fd; i++) d.push(null)
    for (let i = 1; i <= dm; i++) d.push(i)
    return d
  }, [calMonth])
  const calEvents = useMemo(() => {
    const { year, month } = calMonth
    const ms = new Date(year, month, 1)
    const me = new Date(year, month + 1, 0)
    return requests.filter((r) => {
      if (r.status !== 'APPROVED' && r.status !== 'PENDING') return false
      const s = new Date(r.startDate); const e = new Date(r.endDate)
      return s <= me && e >= ms
    })
  }, [requests, calMonth])
  function getDayEvents(day: number) {
    const { year, month } = calMonth
    const d = new Date(year, month, day)
    return calEvents.filter((r) => {
      const s = new Date(r.startDate); const e = new Date(r.endDate)
      s.setHours(0, 0, 0, 0); e.setHours(23, 59, 59, 999)
      return d >= s && d <= e
    })
  }

  // Intuit OAuth callback handling (preserved)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const intuitParam = params.get('intuit')
    if (intuitParam === 'connected') {
      const co = params.get('company')
      setIntuitConnected(true)
      if (co) setCompanyName(co)
      setOauthToast({ type: 'success', message: co ? `Connected to ${co}` : 'QuickBooks connected successfully' })
      setTab('intuit')
      window.history.replaceState({}, '', window.location.pathname)
    } else if (intuitParam === 'error') {
      const detail = params.get('detail')
      setOauthToast({ type: 'error', message: detail || 'Failed to connect to QuickBooks' })
      setTab('intuit')
      window.history.replaceState({}, '', window.location.pathname)
    }
  }, [])
  useEffect(() => {
    if (!oauthToast) return
    const t = setTimeout(() => setOauthToast(null), 6000)
    return () => clearTimeout(t)
  }, [oauthToast])

  return (
    <>
      <Container size="xl" py="lg" className="ptoa-root">

        {/* OAuth toast */}
        {oauthToast && (
          <div style={{ position: 'fixed', top: 20, right: 20, zIndex: 1000 }}>
            <Notification
              color={oauthToast.type === 'success' ? 'teal' : 'red'}
              icon={oauthToast.type === 'success' ? <Check size={16} /> : <AlertTriangle size={16} />}
              onClose={() => setOauthToast(null)}
              withCloseButton
            >
              {oauthToast.message}
            </Notification>
          </div>
        )}

        {/* ============ HERO ============ */}
        <div ref={spot.ref} onMouseMove={spot.onMouseMove} style={{ marginBottom: 20 }}>
          <Paper radius="lg" p="xl" className="ptoa-hero">
            <div className="ptoa-hero-mesh" aria-hidden />
            <div className="ptoa-hero-orbs" aria-hidden>
              <span className="ptoa-orb ptoa-orb-1" />
              <span className="ptoa-orb ptoa-orb-2" />
              <span className="ptoa-orb ptoa-orb-3" />
            </div>
            <div className="ptoa-hero-spotlight" aria-hidden />

            <img src="/heroes/pto.svg" alt="" aria-hidden="true" style={{ position: "absolute", left: "50%", top: "50%", transform: "translate(-50%, -50%)", height: "70%", zIndex: 0, opacity: 0.22, pointerEvents: "none" }} />

            <Group justify="space-between" align="flex-start" wrap="wrap" gap="lg" style={{ position: 'relative', zIndex: 2 }}>
              <Stack gap={6} style={{ minWidth: 0, flex: 1 }}>
                <Group gap={8} align="center">
                  <Umbrella size={14} style={{ color: 'rgba(94,234,212,0.9)' }} />
                  <Text size="xs" tt="uppercase" fw={700} c="teal.3" style={{ letterSpacing: '0.12em' }}>
                    Paid Time Off
                  </Text>
                </Group>
                <Title order={1} className="ptoa-hero-title">
                  {animAvailable}h <Text component="span" size="xl" c="dimmed" fw={500} style={{ letterSpacing: '-0.01em' }}>available</Text>
                </Title>
                <Text size="sm" c="dimmed">
                  {animPending}h pending · {animUsed}h used this year
                  {isElevated && pendingCount > 0 && (
                    <> · <Text component="span" c="orange.4" fw={700}>{pendingCount} awaiting review</Text></>
                  )}
                </Text>
                <Button
                  size="md" mt="sm"
                  leftSection={<Plus size={16} />}
                  onClick={() => { resetForm(); modal.open() }}
                  className="ptoa-btn-primary"
                  style={{ alignSelf: 'flex-start' }}
                >
                  New Request
                </Button>
              </Stack>
            </Group>
          </Paper>
        </div>

        {/* ============ BALANCE WALLET CARDS ============ */}
        <div className="ptoa-balance-row">
          {balances.map((b, i) => {
            const IC = ICON_MAP[b.type.icon] || Umbrella
            const pct = b.type.maxAccrual > 0
              ? Math.min(100, ((b.used + b.pending) / b.type.maxAccrual) * 100)
              : 0
            return (
              <Card
                key={b.id}
                radius="lg" p="md" withBorder
                className="ptoa-balance-card"
                style={{
                  animationDelay: `${i * 70}ms`,
                  ['--ptoa-color' as string]: b.type.color,
                  ['--ptoa-bar' as string]:
                    `linear-gradient(90deg, ${b.type.color}aa, ${b.type.color})`,
                  ['--ptoa-glow' as string]: `${b.type.color}33`,
                } as React.CSSProperties}
              >
                <Group gap="sm" align="flex-start" wrap="nowrap">
                  <div className="ptoa-balance-icon">
                    <IC size={18} color={b.type.color} />
                  </div>
                  <Stack gap={2} style={{ flex: 1, minWidth: 0 }}>
                    <Text size="xs" tt="uppercase" fw={700} c="dimmed" style={{ letterSpacing: '0.06em' }}>
                      {b.type.name}
                    </Text>
                    <Text className="ptoa-balance-value">
                      {b.available.toFixed(1)}<Text component="span" size="sm" c="dimmed" fw={500}> hrs</Text>
                    </Text>
                    <Text size="xs" c="dimmed">
                      {b.accrued.toFixed(1)} accrued · {b.used.toFixed(1)} used · {b.pending.toFixed(1)} pending
                    </Text>
                  </Stack>
                </Group>
                {b.type.maxAccrual > 0 && (
                  <Progress
                    value={pct}
                    size="xs"
                    mt="sm"
                    color="teal"
                    radius="xl"
                    style={{ ['--mantine-progress-fill' as string]: b.type.color } as React.CSSProperties}
                  />
                )}
              </Card>
            )
          })}
        </div>

        {/* ============ TABS ============ */}
        <Tabs
          value={tab}
          onChange={(v) => setTab((v as typeof tab) ?? 'my')}
          variant="pills"
          color="teal"
          className="ptoa-tabs"
          mt="md"
        >
          <Tabs.List>
            <Tabs.Tab value="my" leftSection={<Umbrella size={14} />}>My PTO</Tabs.Tab>
            {isElevated && (
              <Tabs.Tab
                value="queue"
                leftSection={<Clock size={14} />}
                rightSection={pendingCount > 0 ? <Badge size="xs" variant="filled" color="orange" circle>{pendingCount}</Badge> : null}
              >
                Approval Queue
              </Tabs.Tab>
            )}
            <Tabs.Tab value="calendar" leftSection={<CalendarDays size={14} />}>
              {isElevated ? 'Team Calendar' : 'Calendar'}
            </Tabs.Tab>
            {isElevated && <Tabs.Tab value="admin" leftSection={<ArrowUpDown size={14} />}>HR Admin</Tabs.Tab>}
            {isElevated && <Tabs.Tab value="intuit" leftSection={<Link2 size={14} />}>Intuit Sync</Tabs.Tab>}
          </Tabs.List>

          {/* Filter bar for list tabs */}
          {(tab === 'my' || tab === 'queue' || tab === 'admin') && (
            <Card radius="lg" p="md" withBorder mt="md" className="ptoa-panel">
              <Group gap="sm" wrap="wrap">
                <TextInput
                  placeholder={isElevated ? 'Search by name or type…' : 'Search…'}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.currentTarget.value)}
                  leftSection={<Search size={14} />}
                  style={{ flex: 1, minWidth: 200 }}
                />
                {tab !== 'queue' && (
                  <Select
                    value={statusFilter}
                    onChange={setStatusFilter}
                    data={[
                      { value: 'ALL', label: 'All statuses' },
                      { value: 'PENDING', label: 'Pending' },
                      { value: 'APPROVED', label: 'Approved' },
                      { value: 'DENIED', label: 'Denied' },
                      { value: 'CANCELLED', label: 'Cancelled' },
                    ]}
                    leftSection={<Filter size={14} />}
                    w={170}
                  />
                )}
              </Group>
            </Card>
          )}

          <Tabs.Panel value="my" pt="md">
            <RequestList
              requests={filteredRequests}
              currentUserId={currentUser.id}
              isElevated={isElevated}
              reviewingId={reviewingId}
              reviewNote={reviewNote}
              setReviewNote={setReviewNote}
              setReviewingId={setReviewingId}
              onReview={reviewRequest}
              onPushIntuit={pushToIntuit}
            />
          </Tabs.Panel>

          {isElevated && (
            <Tabs.Panel value="queue" pt="md">
              <RequestList
                requests={filteredRequests}
                currentUserId={currentUser.id}
                isElevated={isElevated}
                reviewingId={reviewingId}
                reviewNote={reviewNote}
                setReviewNote={setReviewNote}
                setReviewingId={setReviewingId}
                onReview={reviewRequest}
                onPushIntuit={pushToIntuit}
              />
            </Tabs.Panel>
          )}

          <Tabs.Panel value="calendar" pt="md">
            <Card radius="lg" p="lg" withBorder className="ptoa-panel">
              <Group justify="space-between" mb="md">
                <ActionIcon
                  variant="light" color="teal" size="lg" radius="md"
                  onClick={() => setCalMonth((p) => {
                    const m = p.month - 1
                    return m < 0 ? { year: p.year - 1, month: 11 } : { ...p, month: m }
                  })}
                >
                  <ChevronLeft size={16} />
                </ActionIcon>
                <Title order={3} className="ptoa-cal-title">
                  {MONTH_NAMES[calMonth.month]} {calMonth.year}
                </Title>
                <ActionIcon
                  variant="light" color="teal" size="lg" radius="md"
                  onClick={() => setCalMonth((p) => {
                    const m = p.month + 1
                    return m > 11 ? { year: p.year + 1, month: 0 } : { ...p, month: m }
                  })}
                >
                  <ChevronRight size={16} />
                </ActionIcon>
              </Group>
              <div className="ptoa-cal-grid">
                {['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map((d) => (
                  <div key={d} className="ptoa-cal-dow">{d}</div>
                ))}
                {calDays.map((day, i) => {
                  if (day === null) return <div key={`e-${i}`} className="ptoa-cal-cell ptoa-cal-cell-empty" />
                  const ev = getDayEvents(day)
                  const t = new Date()
                  const isToday = t.getFullYear() === calMonth.year && t.getMonth() === calMonth.month && t.getDate() === day
                  return (
                    <div key={day} className={`ptoa-cal-cell${isToday ? ' ptoa-cal-cell-today' : ''}`}>
                      <span className={`ptoa-cal-day${isToday ? ' ptoa-cal-day-today' : ''}`}>{day}</span>
                      <div className="ptoa-cal-events">
                        {ev.slice(0, 3).map((e) => (
                          <Tooltip
                            key={e.id}
                            label={`${e.user.name}: ${e.type.name} (${e.totalHours}hrs) — ${e.status}`}
                            withArrow
                          >
                            <div
                              className="ptoa-cal-event"
                              style={{
                                background: e.type.color + '22',
                                borderLeft: `3px solid ${e.type.color}`,
                                opacity: e.status === 'PENDING' ? 0.65 : 1,
                              }}
                            >
                              {e.user.name.split(' ')[0]}
                            </div>
                          </Tooltip>
                        ))}
                        {ev.length > 3 && <div className="ptoa-cal-more">+{ev.length - 3}</div>}
                      </div>
                    </div>
                  )
                })}
              </div>
            </Card>
          </Tabs.Panel>

          {isElevated && (
            <Tabs.Panel value="admin" pt="md">
              <RequestList
                requests={filteredRequests}
                currentUserId={currentUser.id}
                isElevated={isElevated}
                reviewingId={reviewingId}
                reviewNote={reviewNote}
                setReviewNote={setReviewNote}
                setReviewingId={setReviewingId}
                onReview={reviewRequest}
                onPushIntuit={pushToIntuit}
              />
            </Tabs.Panel>
          )}

          {isElevated && (
            <Tabs.Panel value="intuit" pt="md">
              <Stack gap="md">
                <Card
                  radius="lg" p="md" withBorder
                  className={`ptoa-panel ptoa-intuit-conn ${intuitConnected ? 'ptoa-intuit-connected' : 'ptoa-intuit-disconnected'}`}
                >
                  <Group justify="space-between" wrap="wrap">
                    <Group gap="md" align="center">
                      <ThemeIcon size="lg" radius="md" variant="light" color={intuitConnected ? 'teal' : 'orange'}>
                        {intuitConnected ? <Check size={18} /> : <AlertTriangle size={18} />}
                      </ThemeIcon>
                      <Stack gap={2}>
                        <Text fw={700}>
                          {intuitConnected ? 'Connected to QuickBooks' : 'QuickBooks Not Connected'}
                        </Text>
                        {intuitConnected && companyName ? (
                          <Text size="sm" c="dimmed">{companyName}</Text>
                        ) : !intuitConnected ? (
                          <Text size="sm" c="dimmed">
                            Connect your QuickBooks Online account to enable payroll sync.
                          </Text>
                        ) : null}
                      </Stack>
                    </Group>
                    <Button
                      component="a"
                      href="/api/workryn/pto/intuit/auth"
                      leftSection={intuitConnected ? <RefreshCw size={14} /> : <Link2 size={14} />}
                      variant={intuitConnected ? 'subtle' : 'filled'}
                      className={!intuitConnected ? 'ptoa-btn-primary' : ''}
                      color={intuitConnected ? 'gray' : undefined}
                    >
                      {intuitConnected ? 'Reconnect' : 'Connect to QuickBooks'}
                    </Button>
                  </Group>
                </Card>

                <Card radius="lg" p="md" withBorder className="ptoa-panel">
                  <Group justify="space-between" mb="md" wrap="wrap">
                    <Stack gap={2}>
                      <Title order={4}>Employee Mapping</Title>
                      <Text size="sm" c="dimmed">
                        Map Workryn users to QuickBooks employees for automatic PTO payroll sync. Auto-matching uses email first, then name.
                      </Text>
                    </Stack>
                    <Button
                      onClick={syncIntuitEmployees}
                      disabled={syncing || !intuitConnected}
                      leftSection={<RefreshCw size={14} className={syncing ? 'ptoa-spin' : ''} />}
                      className="ptoa-btn-primary"
                    >
                      {syncing ? 'Syncing…' : 'Sync Employees'}
                    </Button>
                  </Group>

                  {syncResults && !syncResults.error && (
                    <SimpleGrid cols={{ base: 2, md: 4 }} spacing="sm" mb="md">
                      <SyncStat label="Newly matched"     value={syncResults.matched?.length || 0}        color="teal" />
                      <SyncStat label="Already mapped"    value={syncResults.already_mapped || 0}         color="gray" />
                      <SyncStat label="Unmatched (QBO)"   value={syncResults.unmatched_qbo?.length || 0}  color="orange" />
                      <SyncStat label="Unmatched (Workryn)" value={syncResults.unmatched_workryn?.length || 0} color="orange" />
                    </SimpleGrid>
                  )}
                  {syncResults?.error && (
                    <Alert color="red" variant="light" icon={<AlertTriangle size={14} />} mb="md">
                      {syncResults.error}
                      {syncResults.detail && (
                        <pre style={{ fontSize: 11, marginTop: 8, overflow: 'auto' }}>{syncResults.detail}</pre>
                      )}
                    </Alert>
                  )}

                  <Text size="xs" tt="uppercase" fw={700} c="dimmed" mb="xs" style={{ letterSpacing: '0.06em' }}>
                    Current mappings ({intuitMappings.length})
                  </Text>
                  {intuitMappings.length === 0 ? (
                    <Stack align="center" gap="xs" py="lg">
                      <ThemeIcon size="lg" radius="xl" variant="light" color="teal"><Link2 size={18} /></ThemeIcon>
                      <Text size="sm" c="dimmed">
                        {intuitConnected
                          ? 'No employee mappings yet. Click "Sync Employees" to auto-match.'
                          : 'Connect to QuickBooks first, then sync employees.'}
                      </Text>
                    </Stack>
                  ) : (
                    <Stack gap={4}>
                      {intuitMappings.map((m) => (
                        <Group
                          key={m.id} justify="space-between" wrap="nowrap" gap="md"
                          className="ptoa-map-row"
                        >
                          <Text size="sm" fw={600} style={{ flex: 1 }}>
                            {m.user.name || m.user.email || 'Unknown'}
                          </Text>
                          <Text size="sm" c="dimmed" style={{ flex: 1 }}>
                            {m.intuitDisplayName || `#${m.intuitEmployeeId}`}
                          </Text>
                          <Text size="xs" c="dimmed" style={{ flex: 1 }} truncate>{m.intuitEmail || ''}</Text>
                          <Badge size="sm" variant="light" color={m.syncStatus === 'ACTIVE' ? 'teal' : 'gray'}>
                            {m.syncStatus}
                          </Badge>
                        </Group>
                      ))}
                    </Stack>
                  )}
                </Card>
              </Stack>
            </Tabs.Panel>
          )}
        </Tabs>
      </Container>

      {/* ============ MODAL ============ */}
      <Modal
        opened={modalOpened}
        onClose={() => { modal.close(); resetForm() }}
        title="New PTO Request"
        size="md"
        radius="lg"
        overlayProps={{ backgroundOpacity: 0.55, blur: 4 }}
        classNames={{ content: 'ptoa-modal-content' }}
      >
        <Stack gap="md">
          <Select
            label="PTO Type" required
            value={formTypeId}
            onChange={(v) => setFormTypeId(v ?? '')}
            data={types.map((t) => ({ value: t.id, label: t.name }))}
          />
          <Group grow>
            <TextInput
              label="Start Date" type="date" required
              value={formStart}
              onChange={(e) => setFormStart(e.currentTarget.value)}
            />
            <TextInput
              label="End Date" type="date" required
              value={formEnd}
              onChange={(e) => setFormEnd(e.currentTarget.value)}
            />
          </Group>
          <TextInput
            label="Total Hours" type="number" required
            placeholder="e.g. 8"
            value={formHours}
            onChange={(e) => setFormHours(e.currentTarget.value)}
          />
          <Group gap="md" align="center">
            <Checkbox
              label="Half Day"
              checked={formHalfDay}
              onChange={(e) => setFormHalfDay(e.currentTarget.checked)}
              color="teal"
            />
            {formHalfDay && (
              <Select
                value={formHalfPeriod}
                onChange={setFormHalfPeriod}
                data={[{ value: 'AM', label: 'Morning (AM)' }, { value: 'PM', label: 'Afternoon (PM)' }]}
                w={170}
              />
            )}
          </Group>
          <Textarea
            label="Notes" placeholder="Reason or additional context…"
            value={formNotes}
            onChange={(e) => setFormNotes(e.currentTarget.value)}
            minRows={2} autosize maxRows={4}
          />

          {formTypeId && (() => {
            const bal = balances.find((b) => b.typeId === formTypeId)
            return bal ? (
              <Alert color="teal" variant="light" icon={<Umbrella size={14} />}>
                Available: <strong>{bal.available.toFixed(1)} hrs</strong> of {bal.type.name}
              </Alert>
            ) : null
          })()}
          {formError && (
            <Alert color="red" variant="light" icon={<AlertTriangle size={14} />}>{formError}</Alert>
          )}

          <Group justify="flex-end" mt="sm">
            <Button variant="subtle" color="gray" onClick={() => { modal.close(); resetForm() }}>Cancel</Button>
            <Button loading={submitting} onClick={submitRequest} className="ptoa-btn-primary">
              Submit Request
            </Button>
          </Group>
        </Stack>
      </Modal>

      {/* ============ STYLES ============ */}
      <style>{`
        @keyframes ptoa-slide-up { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes ptoa-mesh-drift {
          0%, 100% { transform: translate(0,0) scale(1); }
          50%      { transform: translate(3%, -2%) scale(1.05); }
        }
        @keyframes ptoa-orb-a { 0%,100%{transform:translate(0,0)} 50%{transform:translate(40px,-30px)} }
        @keyframes ptoa-orb-b { 0%,100%{transform:translate(0,0)} 50%{transform:translate(-30px,25px)} }
        @keyframes ptoa-orb-c { 0%,100%{transform:translate(0,0)} 50%{transform:translate(20px,40px)} }
        @keyframes ptoa-spin   { to { transform: rotate(360deg); } }
        .ptoa-spin { animation: ptoa-spin 1s linear infinite; }
        @media (prefers-reduced-motion: reduce) {
          .ptoa-root *, .ptoa-root *::before, .ptoa-root *::after {
            animation: none !important; transition: none !important;
          }
        }

        /* HERO */
        .ptoa-hero {
          position: relative; overflow: hidden;
          border: 1px solid rgba(20,184,166,0.32);
          background:
            linear-gradient(135deg, rgba(20,184,166,0.16) 0%, rgba(6,182,212,0.10) 50%, rgba(16,185,129,0.06) 100%),
            rgba(11,15,30,0.55);
          backdrop-filter: blur(14px) saturate(140%);
          -webkit-backdrop-filter: blur(14px) saturate(140%);
          box-shadow: 0 20px 60px -20px rgba(20,184,166,0.35), 0 1px 0 rgba(255,255,255,0.05) inset;
          animation: ptoa-slide-up 460ms ease-out backwards;
        }
        .ptoa-hero-mesh {
          position: absolute; inset: -25%;
          background:
            radial-gradient(circle at 22% 30%, rgba(20,184,166,0.45), transparent 42%),
            radial-gradient(circle at 78% 25%, rgba(6,182,212,0.30), transparent 47%),
            radial-gradient(circle at 62% 82%, rgba(16,185,129,0.18), transparent 52%);
          filter: blur(40px);
          animation: ptoa-mesh-drift 22s ease-in-out infinite;
          z-index: 0; pointer-events: none;
        }
        .ptoa-hero-orbs { position: absolute; inset: 0; z-index: 0; pointer-events: none; }
        .ptoa-orb { position: absolute; border-radius: 50%; filter: blur(22px); opacity: 0.55; mix-blend-mode: screen; }
        .ptoa-orb-1 { width: 130px; height: 130px; top: 12%; left: 8%;
          background: radial-gradient(circle, #5eead4 0%, transparent 70%);
          animation: ptoa-orb-a 14s ease-in-out infinite; }
        .ptoa-orb-2 { width: 100px; height: 100px; top: 55%; left: 60%;
          background: radial-gradient(circle, #14B8A6 0%, transparent 70%);
          animation: ptoa-orb-b 16s ease-in-out infinite; }
        .ptoa-orb-3 { width: 80px; height: 80px; bottom: 10%; right: 12%;
          background: radial-gradient(circle, #34d399 0%, transparent 70%);
          animation: ptoa-orb-c 18s ease-in-out infinite; }
        .ptoa-hero-spotlight {
          position: absolute; inset: 0; z-index: 1; pointer-events: none;
          background: radial-gradient(circle 360px at var(--mx, 50%) var(--my, 50%), rgba(255,255,255,0.10), transparent 60%);
        }
        .ptoa-hero-title {
          font-size: clamp(2rem, 5vw, 3.5rem);
          font-weight: 800;
          letter-spacing: -0.035em;
          line-height: 1;
          margin: 0;
          font-variant-numeric: tabular-nums;
          background: linear-gradient(135deg, #ffffff 0%, #5eead4 55%, #14B8A6 100%);
          -webkit-background-clip: text; background-clip: text;
          -webkit-text-fill-color: transparent;
          filter: drop-shadow(0 2px 16px rgba(20,184,166,0.45));
        }
        .ptoa-btn-primary {
          background: linear-gradient(135deg, #14B8A6 0%, #06b6d4 100%);
          box-shadow: 0 6px 18px rgba(20,184,166,0.40);
          transition: transform 180ms ease, box-shadow 180ms ease;
          color: #fff;
        }
        .ptoa-btn-primary:hover {
          transform: translateY(-1px);
          box-shadow: 0 10px 28px rgba(20,184,166,0.55);
        }

        /* Balance wallet cards */
        .ptoa-balance-row {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
          gap: 12px;
        }
        .ptoa-balance-card {
          position: relative; overflow: hidden;
          background: rgba(15, 23, 42, 0.55);
          backdrop-filter: blur(12px) saturate(140%);
          -webkit-backdrop-filter: blur(12px) saturate(140%);
          transition: box-shadow 260ms ease, transform 200ms ease;
          animation: ptoa-slide-up 500ms ease-out backwards;
        }
        .ptoa-balance-card::before {
          content: ''; position: absolute; top: 0; left: 0; right: 0; height: 3px;
          background: var(--ptoa-bar);
        }
        .ptoa-balance-card:hover {
          transform: translateY(-2px);
          box-shadow: 0 16px 40px var(--ptoa-glow);
        }
        .ptoa-balance-icon {
          width: 40px; height: 40px; border-radius: 12px;
          display: flex; align-items: center; justify-content: center;
          background: color-mix(in srgb, var(--ptoa-color, #14B8A6) 18%, transparent);
          border: 1px solid color-mix(in srgb, var(--ptoa-color, #14B8A6) 45%, transparent);
          flex-shrink: 0;
        }
        .ptoa-balance-value {
          font-size: 1.5rem; font-weight: 800; letter-spacing: -0.03em;
          line-height: 1; font-variant-numeric: tabular-nums;
          background: linear-gradient(135deg, #ffffff 0%, var(--ptoa-color, #14B8A6) 100%);
          -webkit-background-clip: text; background-clip: text;
          -webkit-text-fill-color: transparent;
        }

        /* Tabs */
        .ptoa-tabs [data-active] {
          background: linear-gradient(135deg, #14B8A6, #06b6d4) !important;
          color: #fff !important;
          box-shadow: 0 4px 14px rgba(20,184,166,0.35);
        }

        /* Panels */
        .ptoa-panel {
          background: rgba(15, 23, 42, 0.55);
          backdrop-filter: blur(14px) saturate(140%);
          -webkit-backdrop-filter: blur(14px) saturate(140%);
        }

        /* Calendar */
        .ptoa-cal-title {
          background: linear-gradient(135deg, #ffffff, #5eead4);
          -webkit-background-clip: text; background-clip: text;
          -webkit-text-fill-color: transparent;
        }
        .ptoa-cal-grid {
          display: grid;
          grid-template-columns: repeat(7, 1fr);
          gap: 4px;
        }
        .ptoa-cal-dow {
          padding: 8px;
          font-size: 0.6875rem;
          font-weight: 700;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          color: rgba(148,163,184,0.7);
          text-align: center;
        }
        .ptoa-cal-cell {
          min-height: 88px;
          padding: 6px;
          border-radius: 8px;
          background: rgba(255,255,255,0.025);
          border: 1px solid rgba(255,255,255,0.04);
          display: flex;
          flex-direction: column;
          gap: 4px;
          transition: background 140ms ease;
        }
        .ptoa-cal-cell:hover { background: rgba(20,184,166,0.04); }
        .ptoa-cal-cell-empty { background: transparent; border: none; }
        .ptoa-cal-cell-today {
          background: linear-gradient(180deg, rgba(20,184,166,0.10), rgba(20,184,166,0.04));
          box-shadow: inset 0 2px 0 #14B8A6;
        }
        .ptoa-cal-day {
          font-size: 0.8125rem;
          font-weight: 600;
          color: rgba(226,232,240,0.85);
          align-self: flex-start;
          padding: 1px 5px;
        }
        .ptoa-cal-day-today {
          background: linear-gradient(135deg, #14B8A6, #06b6d4);
          color: #fff;
          border-radius: 6px;
          padding: 2px 8px;
          box-shadow: 0 4px 12px rgba(20,184,166,0.4);
        }
        .ptoa-cal-events { display: flex; flex-direction: column; gap: 2px; }
        .ptoa-cal-event {
          font-size: 0.6875rem;
          padding: 2px 6px;
          border-radius: 4px;
          color: rgba(241,245,249,0.9);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .ptoa-cal-more { font-size: 0.625rem; color: rgba(148,163,184,0.6); padding: 2px 5px; font-weight: 600; }

        /* Intuit panel */
        .ptoa-intuit-connected { border-color: rgba(20,184,166,0.45) !important; }
        .ptoa-intuit-disconnected { border-color: rgba(245,158,11,0.45) !important; }
        .ptoa-map-row {
          padding: 8px 12px;
          border-radius: 8px;
          background: rgba(255,255,255,0.02);
          border: 1px solid rgba(255,255,255,0.04);
        }

        /* Modal */
        .ptoa-modal-content {
          background: rgba(15, 23, 42, 0.85) !important;
          backdrop-filter: blur(18px) saturate(140%);
          -webkit-backdrop-filter: blur(18px) saturate(140%);
          border: 1px solid rgba(20,184,166,0.28);
        }
      `}</style>
    </>
  )
}

// =================================================================
// SUB-COMPONENTS
// =================================================================

function RequestList({
  requests, currentUserId, isElevated,
  reviewingId, reviewNote, setReviewNote, setReviewingId,
  onReview, onPushIntuit,
}: {
  requests: PtoRequest[]
  currentUserId: string
  isElevated: boolean
  reviewingId: string | null
  reviewNote: string
  setReviewNote: (v: string) => void
  setReviewingId: (v: string | null) => void
  onReview: (id: string, action: 'APPROVED' | 'DENIED') => void
  onPushIntuit: (id: string) => void
}) {
  if (requests.length === 0) {
    return (
      <Card radius="lg" p="xl" withBorder className="ptoa-panel">
        <Stack align="center" gap="xs" py="lg">
          <ThemeIcon size="xl" radius="xl" variant="light" color="teal">
            <Umbrella size={20} />
          </ThemeIcon>
          <Text c="dimmed">No requests found</Text>
        </Stack>
      </Card>
    )
  }
  return (
    <Stack gap="sm">
      {requests.map((r) => (
        <RequestRow
          key={r.id}
          request={r}
          isOwn={r.userId === currentUserId}
          isElevated={isElevated}
          reviewing={reviewingId === r.id}
          reviewNote={reviewNote}
          setReviewNote={setReviewNote}
          setReviewingId={setReviewingId}
          onReview={onReview}
          onPushIntuit={onPushIntuit}
        />
      ))}
    </Stack>
  )
}

function RequestRow({
  request: r, isOwn, isElevated, reviewing,
  reviewNote, setReviewNote, setReviewingId, onReview, onPushIntuit,
}: {
  request: PtoRequest
  isOwn: boolean
  isElevated: boolean
  reviewing: boolean
  reviewNote: string
  setReviewNote: (v: string) => void
  setReviewingId: (v: string | null) => void
  onReview: (id: string, action: 'APPROVED' | 'DENIED') => void
  onPushIntuit: (id: string) => void
}) {
  const status = STATUS_COLORS[r.status] || STATUS_COLORS.PENDING
  const Icon = ICON_MAP[r.type.icon] || Umbrella
  return (
    <Card radius="lg" p="md" withBorder className="ptoa-panel">
      <Group justify="space-between" align="flex-start" wrap="wrap" gap="md">
        <Group gap="md" align="flex-start" style={{ flex: 1, minWidth: 0 }} wrap="nowrap">
          <ThemeIcon
            size="lg" radius="md" variant="light"
            style={{ background: r.type.color + '24', color: r.type.color }}
          >
            <Icon size={16} />
          </ThemeIcon>
          <Stack gap={2} style={{ flex: 1, minWidth: 0 }}>
            <Group gap={8} align="center" wrap="wrap">
              {!isOwn && (
                <Group gap={4} align="center">
                  <Avatar size="xs" radius="xl" style={{ background: r.user.avatarColor, color: '#fff' }}>
                    {getInitials(r.user.name)}
                  </Avatar>
                  <Text size="sm" fw={700}>{r.user.name}</Text>
                </Group>
              )}
              <Text size="sm" fw={600} c="dimmed">{r.type.name}</Text>
              <Badge size="sm" variant="light" color="teal">{r.totalHours}h</Badge>
              {r.isHalfDay && (
                <Badge size="xs" variant="default">{r.halfDayPeriod} half</Badge>
              )}
            </Group>
            <Text size="xs" c="dimmed">
              {new Date(r.startDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
              {r.startDate !== r.endDate && ` – ${new Date(r.endDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`}
            </Text>
            {r.notes && <Text size="xs" c="gray.4" style={{ fontStyle: 'italic' }}>{r.notes}</Text>}
            {r.reviewedBy && (
              <Group gap={4} align="center">
                {r.status === 'APPROVED' ? <Check size={12} color="#10B981" /> : <X size={12} color="#ef4444" />}
                <Text size="xs" c="dimmed">{r.reviewedBy.name} · {timeAgo(r.reviewedAt!)}</Text>
                {r.reviewNote && <Text size="xs" c="dimmed">· {r.reviewNote}</Text>}
              </Group>
            )}
          </Stack>
        </Group>

        <Stack gap="xs" align="flex-end">
          <Badge
            size="md" variant="light"
            style={{ background: status.color + '24', color: status.color, border: `1px solid ${status.color}40` }}
          >
            {status.label}
          </Badge>
          {r.status === 'APPROVED' && isElevated && (
            r.type.excludeFromPayroll ? (
              <Badge size="xs" variant="default" leftSection={<ClockIcon size={10} />}>Workryn Only</Badge>
            ) : r.intuitSynced ? (
              <Badge size="xs" variant="light" color="teal" leftSection={<Check size={10} />}>Synced</Badge>
            ) : r.intuitSyncError ? (
              <Tooltip label={r.intuitSyncError} withArrow>
                <Button size="compact-xs" variant="light" color="red" leftSection={<AlertTriangle size={10} />} onClick={() => onPushIntuit(r.id)}>
                  Retry
                </Button>
              </Tooltip>
            ) : (
              <Button size="compact-xs" variant="light" color="teal" leftSection={<Send size={10} />} onClick={() => onPushIntuit(r.id)}>
                Push to QBO
              </Button>
            )
          )}
        </Stack>
      </Group>

      {r.status === 'PENDING' && isElevated && !isOwn && (
        <Group gap="xs" mt="sm" wrap="wrap" style={{ borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: 10 }}>
          <TextInput
            placeholder="Review note (optional)"
            value={reviewing ? reviewNote : ''}
            onChange={(e) => { setReviewingId(r.id); setReviewNote(e.currentTarget.value) }}
            style={{ flex: 1, minWidth: 200 }}
            size="xs"
          />
          <Button
            size="xs" color="teal" leftSection={<Check size={12} />}
            onClick={() => onReview(r.id, 'APPROVED')}
            loading={reviewing && r.status === 'PENDING'}
          >
            Approve
          </Button>
          <Button
            size="xs" color="red" variant="light" leftSection={<X size={12} />}
            onClick={() => onReview(r.id, 'DENIED')}
          >
            Deny
          </Button>
        </Group>
      )}
    </Card>
  )
}

function SyncStat({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <Card radius="md" p="sm" withBorder style={{ background: 'rgba(255,255,255,0.025)' }}>
      <Stack gap={2} align="center">
        <Text fw={800} size="xl" style={{ fontVariantNumeric: 'tabular-nums' }} c={color}>{value}</Text>
        <Text size="xs" c="dimmed" ta="center">{label}</Text>
      </Stack>
    </Card>
  )
}
