'use client'

/* ──────────────────────────────────────────────────────────────────────────
 * SupportPlannerControlPanelClient — CaseSync v2 dashboard for the
 * `supports_planner` role. Routed from app/dashboard/page.tsx when role is
 * 'supports_planner' and ?full=1 is not set. Mirrors the v2 visual language
 * scoped to a single planner's caseload.
 *
 * Sections:
 *   - Greeting block (dashboard.svg hero, personalized)
 *   - 4 KPI tiles aggregated from this planner's AssigneeSummaryRow
 *   - My Team Manager card (compact "up the chain" element)
 *   - My Caseload Snapshot (donut of personal status breakdown)
 *   - Client Drill-down (their own clients — /api/clients now scopes to SP)
 *
 * Does NOT touch: BLH bot endpoints (/api/bot/*), middleware, schema,
 * globals.css, the Header, the supervisor dashboard, the TM dashboard,
 * or DashboardClient (legacy still handles ?full=1).
 * ────────────────────────────────────────────────────────────────────────── */

import { useEffect, useMemo, useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import {
  Avatar,
  Badge,
  Box,
  Container,
  Flex,
  Grid,
  Group,
  Paper,
  SegmentedControl,
  Stack,
  Text,
  Title,
} from '@mantine/core'
import { DonutChart } from '@mantine/charts'
import {
  AlertTriangle,
  ChevronRight,
  Clock,
  PhoneOff,
  UserCheck,
  Users,
} from 'lucide-react'
import { Profile, Client } from '@/lib/types'
import type { AssigneeSummaryRow } from '@/lib/dashboard-summary'
import CaseSyncV2MantineProvider from '@/components/casesync-v2/CaseSyncV2MantineProvider'
import LottieBlock from '@/components/ui/LottieBlock'
import { ANIM } from '@/lib/animations'
import ClientListTable from './ClientListTable'

// ===========================================================================
// Props — the server fetches the SP's own profile, their TM (if any), and the
// AssigneeSummaryRow for just this SP.
// ===========================================================================

interface Props {
  profile: Profile
  myTeamManager: Profile | null
  mySummary: AssigneeSummaryRow | null
}

interface ScopedSummary {
  total_clients: number
  overdue_clients: number
  due_this_week_clients: number
  eligibility_ending_soon_clients: number
  no_contact_7_days_clients: number
}

// ===========================================================================
// KpiTile (same pattern as supervisor + TM)
// ===========================================================================

interface KpiTileProps {
  label: string
  value: number
  icon: React.ReactNode
  gradient: string
  shadowColor: string
  subtitle?: string
  href?: string
}

/* IDEMPOTENT_KPI_HREF */
function KpiTile({ label, value, icon, gradient, shadowColor, subtitle, href }: KpiTileProps) {
  const [kpiHovered, setKpiHovered] = useState(false)
  const tile = (
    <Paper
      p="lg"
      style={{
        background: gradient,
          textShadow: '0 1px 2px rgba(0,0,0,0.30)',
        boxShadow: `0 12px 32px -10px ${shadowColor}, 0 4px 12px rgba(15,23,42,0.06)`,
        color: '#fff',
        overflow: 'hidden',
        position: 'relative',
        minHeight: 140,
      }}
    >
      <Group justify="space-between" align="flex-start" wrap="nowrap">
        <Stack gap={4} style={{ flex: 1, minWidth: 0 }}>
          <Text fz={12} fw={600} c="rgba(255,255,255,0.92)" style={{ letterSpacing: '0.06em', textTransform: 'uppercase' }}>
            {label}
          </Text>
          <Text fz={36} fw={800} lh={1.05} c="#fff" style={{ letterSpacing: '-0.02em' }}>
            {value.toLocaleString()}
          </Text>
          {subtitle && (
            <Text fz={12} fw={500} c="rgba(255,255,255,0.82)" mt={4}>
              {subtitle}
            </Text>
          )}
        </Stack>
        <Box
          style={{
            width: 44,
            height: 44,
            borderRadius: 12,
            background: 'rgba(255,255,255,0.22)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          {icon}
        </Box>
      </Group>
    </Paper>
  )
  if (!href) return tile
  return (
    <Link
      href={href}
      style={{
        textDecoration: 'none',
        display: 'block',
        cursor: 'pointer',
        transform: kpiHovered ? 'translateY(-2px)' : 'none',
        transition: 'transform 0.2s ease',
      }}
      onMouseEnter={() => setKpiHovered(true)}
      onMouseLeave={() => setKpiHovered(false)}
    >
      {tile}
    </Link>
  )
}

// ===========================================================================
// SectionPaper — shared chrome with optional decorative hero SVG
// ===========================================================================

function SectionPaper({
  eyebrow,
  title,
  rightSlot,
  heroSrc,
  anim,
  children,
}: {
  eyebrow: string
  title: string
  rightSlot?: React.ReactNode
  heroSrc?: string
  anim?: string
  children: React.ReactNode
}) {
  return (
    <Paper
      p="lg"
      style={{
        background: 'var(--v2-surface)',
        border: '1px solid var(--v2-border-soft)',
        boxShadow: '0 1px 2px rgba(15,23,42,0.04), 0 4px 12px rgba(15,23,42,0.05)',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {heroSrc && (
        <Box
          style={{
            position: 'absolute',
            top: -20,
            right: -20,
            width: 140,
            height: 140,
            opacity: 0.1,
            pointerEvents: 'none',
            zIndex: 0,
          }}
        >
          <Image
            src={heroSrc}
            alt=""
            width={140}
            height={140}
            style={{ width: '100%', height: '100%', objectFit: 'contain' }}
            unoptimized
          />
        </Box>
      )}
      <Box style={{ position: 'relative', zIndex: 1 }}>
        <Flex justify="space-between" align="flex-start" mb="md" gap="md" wrap="wrap">
          <Group gap="sm" wrap="nowrap" align="center">
            {anim && (
              <Box style={{ width: 52, height: 52, flexShrink: 0, background: 'rgba(30,124,255,0.08)', borderRadius: 14, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <LottieBlock src={anim} size={42} trigger="loop" />
              </Box>
            )}
            <Stack gap={2}>
              <Text fz={13} fw={600} c="var(--v2-text-muted)" tt="uppercase" style={{ letterSpacing: '0.06em' }}>
                {eyebrow}
              </Text>
              <Title order={2} fz={18} fw={700} c="var(--v2-text)">
                {title}
              </Title>
            </Stack>
          </Group>
          {rightSlot}
        </Flex>
        {children}
      </Box>
    </Paper>
  )
}

// ===========================================================================
// MyTeamManagerCard — compact card showing who the SP reports to.
// If team_manager_id is null, show an "unassigned" empty state.
// ===========================================================================

function MyTeamManagerCard({ tm }: { tm: Profile | null }) {
  if (!tm) {
    return (
      <Paper
        p="lg"
        style={{
          background: 'var(--v2-surface)',
          border: '1px solid var(--v2-border-soft)',
          borderLeft: '4px solid var(--v2-text-muted)',
          boxShadow: '0 1px 2px rgba(15,23,42,0.04), 0 4px 12px rgba(15,23,42,0.05)',
        }}
      >
        <Group gap="md" wrap="nowrap">
          <Box
            style={{
              width: 48,
              height: 48,
              borderRadius: 14,
              background: 'var(--v2-surface-tint)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            <UserCheck size={22} color="var(--v2-border-rail)" />
          </Box>
          <Stack gap={2}>
            <Text fz={13} fw={600} c="var(--v2-text-muted)" tt="uppercase" style={{ letterSpacing: '0.06em' }}>
              My Team Manager
            </Text>
            <Text fz={16} fw={700} c="var(--v2-text)">
              Not yet assigned
            </Text>
            <Text fz={12} c="var(--v2-text-muted)">
              Reach out to your supervisor to get assigned to a team manager.
            </Text>
          </Stack>
        </Group>
      </Paper>
    )
  }

  const initials = (tm.full_name ?? '?')
    .split(' ')
    .slice(0, 2)
    .map((p) => p[0])
    .join('')
    .toUpperCase()

  return (
    <Paper
      p="lg"
      style={{
        background: 'var(--v2-surface)',
        border: '1px solid var(--v2-border-soft)',
        borderLeft: '4px solid #1E7CFF',
        boxShadow: '0 1px 2px rgba(15,23,42,0.04), 0 4px 12px rgba(15,23,42,0.05)',
      }}
    >
      <Group gap="md" wrap="nowrap">
        <Avatar
          size={48}
          radius={14}
          style={{
            background: '#1E7CFF',
            color: '#fff',
            fontWeight: 700,
            fontSize: 18,
            flexShrink: 0,
          }}
        >
          {initials}
        </Avatar>
        <Stack gap={2}>
          <Text fz={13} fw={600} c="var(--v2-text-muted)" tt="uppercase" style={{ letterSpacing: '0.06em' }}>
            My Team Manager
          </Text>
          <Text fz={18} fw={700} c="var(--v2-text)">
            {tm.full_name ?? 'Unnamed'}
          </Text>
          <Text fz={12} c="var(--v2-text-muted)">
            Reach out for support, escalation, or coverage questions.
          </Text>
        </Stack>
      </Group>
    </Paper>
  )
}

// ===========================================================================
// CaseloadSnapshotSection — donut of the SP's status breakdown.
// ===========================================================================

function CaseloadSnapshotSection({ scopedSummary }: { scopedSummary: ScopedSummary }) {
  const issuesSum =
    scopedSummary.overdue_clients +
    scopedSummary.due_this_week_clients +
    scopedSummary.no_contact_7_days_clients
  const healthy = Math.max(0, scopedSummary.total_clients - issuesSum)

  const donutData = [
    { name: 'Overdue', value: scopedSummary.overdue_clients, color: '#FF3B5C' },
    { name: 'Due This Week', value: scopedSummary.due_this_week_clients, color: '#FFA940' },
    { name: 'No Contact 15+', value: scopedSummary.no_contact_7_days_clients, color: '#1E7CFF' },
    { name: 'Healthy', value: healthy, color: '#10B981' },
  ].filter((d) => d.value > 0)

  return (
    <SectionPaper
      eyebrow="Snapshot"
      title="My Caseload Snapshot"
      heroSrc="/heroes/evaluations.svg"
      rightSlot={
        <Badge size="sm" variant="light" color="emerald">
          live · {scopedSummary.total_clients} client{scopedSummary.total_clients === 1 ? '' : 's'}
        </Badge>
      }
    >
      <Grid gap="lg">
        <Grid.Col span={{ base: 12, md: 5 }}>
          <Stack align="center" gap="md">
            <Box style={{ position: 'relative', width: 200, height: 200 }}>
              <DonutChart
                data={donutData.length > 0 ? donutData : [{ name: 'No data', value: 1, color: 'var(--v2-border-soft)' }]}
                size={200}
                thickness={28}
                withLabels={false}
                withTooltip
                paddingAngle={2}
              />
              <Stack
                gap={0}
                align="center"
                style={{
                  position: 'absolute',
                  inset: 0,
                  justifyContent: 'center',
                  pointerEvents: 'none',
                }}
              >
                <Text fz={28} fw={800} c="var(--v2-text)" lh={1}>
                  {scopedSummary.total_clients.toLocaleString()}
                </Text>
                <Text fz={11} c="var(--v2-text-muted)" fw={600} tt="uppercase" style={{ letterSpacing: '0.06em' }}>
                  active
                </Text>
              </Stack>
            </Box>
          </Stack>
        </Grid.Col>
        <Grid.Col span={{ base: 12, md: 7 }}>
          <Text fz={12} fw={600} c="var(--v2-text-muted)" tt="uppercase" mb="sm" style={{ letterSpacing: '0.06em' }}>
            Status Breakdown
          </Text>
          <Stack gap={10}>
            {[
              { name: 'Overdue', value: scopedSummary.overdue_clients, color: '#FF3B5C', hint: 'past due, needs follow-up' },
              { name: 'Due This Week', value: scopedSummary.due_this_week_clients, color: '#FFA940', hint: 'next 7 days' },
              { name: 'No Contact 15+', value: scopedSummary.no_contact_7_days_clients, color: '#1E7CFF', hint: 'haven\u2019t reached in 15 days' },
              { name: 'Healthy', value: healthy, color: '#10B981', hint: 'on track' },
            ].map((row) => {
              const pct = scopedSummary.total_clients > 0 ? (row.value / scopedSummary.total_clients) * 100 : 0
              return (
                <Box key={row.name}>
                  <Group justify="space-between" gap={6} mb={4} wrap="nowrap">
                    <Group gap={8} wrap="nowrap">
                      <Box style={{ width: 10, height: 10, borderRadius: 3, background: row.color }} />
                      <Stack gap={0}>
                        <Text fz={12} fw={700} c="var(--v2-text)" lh={1.2}>
                          {row.name}
                        </Text>
                        <Text fz={10} c="var(--v2-border-rail)">
                          {row.hint}
                        </Text>
                      </Stack>
                    </Group>
                    <Text fz={13} fw={800} c="var(--v2-text)">
                      {row.value.toLocaleString()}
                    </Text>
                  </Group>
                  <Box
                    style={{
                      height: 6,
                      borderRadius: 3,
                      background: `${row.color}2E`,
                      overflow: 'hidden',
                      position: 'relative',
                    }}
                  >
                    {pct > 0 && (
                      <Box
                        style={{
                          position: 'absolute',
                          left: 0,
                          top: 0,
                          bottom: 0,
                          width: `${Math.max(2, pct)}%`,
                          background: `${row.color}`,
                          borderRadius: 3,
                        }}
                      />
                    )}
                  </Box>
                </Box>
              )
            })}
          </Stack>
        </Grid.Col>
      </Grid>
    </SectionPaper>
  )
}

// ===========================================================================
// ClientDrillDownSection — filter chips + fetched list. /api/clients
// auto-scopes to the SP's own clients (assigned_to = userId) post task 1.
// ===========================================================================

type ClientFilter = 'all' | 'overdue' | 'due_this_week' | 'no_contact_7'

const CLIENT_FILTERS: { value: ClientFilter; label: string; color: string }[] = [
  { value: 'all', label: 'All', color: 'var(--v2-text)' },
  { value: 'overdue', label: 'Overdue', color: '#FF3B5C' },
  { value: 'due_this_week', label: 'Due Week', color: '#FFA940' },
  { value: 'no_contact_7', label: 'No Contact 15+', color: '#1E7CFF' },
]

function ClientDrillDownSection() {
  const [clientFilter, setClientFilter] = useState<ClientFilter>('all')
  const [clients, setClients] = useState<Client[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    const controller = new AbortController()
    const params = new URLSearchParams()
    params.set('page', '0')
    params.set('limit', '10')
    params.set('filter', clientFilter)
    params.set('sortField', 'name')
    params.set('sortDir', 'asc')

    setLoading(true)
    fetch(`/api/clients?${params.toString()}`, { signal: controller.signal })
      .then(async (res) => {
        if (!res.ok) throw new Error(`Failed to load clients (${res.status})`)
        return res.json() as Promise<{ clients: Client[]; total: number }>
      })
      .then((payload) => {
        setClients(payload.clients ?? [])
        setTotal(payload.total ?? 0)
      })
      .catch((err) => {
        if (controller.signal.aborted) return
        console.error('SP drill-down load failed:', err)
        setClients([])
        setTotal(0)
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })

    return () => controller.abort()
  }, [clientFilter])

  const filterMeta = CLIENT_FILTERS.find((f) => f.value === clientFilter)!
  const fullHref = `/dashboard?full=1&filter=${clientFilter}`

  return (
    <SectionPaper
      eyebrow="Caseload"
      title="My Clients"
      anim={ANIM.gDueWeek}
      heroSrc="/heroes/tickets.svg"
      rightSlot={
        <Group gap="xs" wrap="nowrap">
          <Badge size="sm" variant="light" color="cobalt">
            {loading ? 'loading…' : `${total.toLocaleString()} matching`}
          </Badge>
          <Link href={fullHref} style={{ textDecoration: 'none' }}>
            <Text fz={12} fw={600} c="#1E7CFF">
              View all →
            </Text>
          </Link>
        </Group>
      }
    >
      <SegmentedControl
        value={clientFilter}
        onChange={(v) => setClientFilter(v as ClientFilter)}
        data={CLIENT_FILTERS.map((f) => ({ value: f.value, label: f.label }))}
        size="sm"
        fullWidth
        mb="md"
        color="cobalt"
      />
      <div className="card" style={{ padding: 0, overflow: 'hidden', border: '1px solid var(--v2-border-soft)', borderRadius: 12 }}>
        <ClientListTable
          clients={clients as any}
          loading={loading}
          emptyTitle={`No clients match "${filterMeta.label}"`}
          emptyDescription="Try a different filter or check back later."
        />
      </div>
    </SectionPaper>
  )
}

// ===========================================================================
// Main component
// ===========================================================================

export default function SupportPlannerControlPanelClient(props: Props) {
  return (
    <CaseSyncV2MantineProvider>
      <Inner {...props} />
    </CaseSyncV2MantineProvider>
  )
}

function Inner({ profile, myTeamManager, mySummary }: Props) {
  // ----- Aggregate AssigneeSummaryRow into ScopedSummary (single planner) -----
  const scopedSummary: ScopedSummary = useMemo(() => ({
    total_clients: mySummary?.total_clients ?? 0,
    overdue_clients: mySummary?.overdue_clients ?? 0,
    due_this_week_clients: mySummary?.due_this_week_clients ?? 0,
    eligibility_ending_soon_clients: mySummary?.eligibility_ending_soon_clients ?? 0,
    no_contact_7_days_clients: mySummary?.no_contact_7_days_clients ?? 0,
  }), [mySummary])

  // ----- Greeting -----
  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening'
  const firstName = profile.full_name?.split(' ')[0] ?? 'there'
  const dateLabel = new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  })

  const caseloadCopy = (() => {
    const total = scopedSummary.total_clients
    const overdue = scopedSummary.overdue_clients
    if (total === 0) return 'No active clients on your caseload yet.'
    if (overdue === 0) return `${total} active client${total === 1 ? '' : 's'} on your caseload — all on track.`
    return `${total} active client${total === 1 ? '' : 's'} on your caseload · ${overdue} need${overdue === 1 ? 's' : ''} follow-up.`
  })()

  return (
    <Box
      style={{
        background: 'var(--v2-canvas)',
        margin: '-24px',
        padding: '24px',
        width: 'calc(100% + 48px)',
        minHeight: 'calc(100dvh - 100px)',
      }}
    >
      <Container size={1280} px={0} pb={80}>
        {/* Greeting block */}
        <Paper
          p="xl"
          mb="lg"
          style={{
            background: 'linear-gradient(135deg, rgba(30,124,255,0.06) 0%, var(--v2-surface) 60%)',
            border: '1px solid var(--v2-border-soft)',
            boxShadow: '0 1px 2px rgba(15,23,42,0.04), 0 2px 6px rgba(15,23,42,0.04)',
            position: 'relative',
            overflow: 'hidden',
          }}
        >
          <Flex justify="space-between" align="center" gap="md" wrap="nowrap">
            <Stack gap={6} style={{ flex: 1, minWidth: 0 }}>
              <Text fz={13} fw={600} c="var(--v2-text-muted)" tt="uppercase" style={{ letterSpacing: '0.06em' }}>
                {dateLabel}
              </Text>
              <Title order={1} fz={28} fw={800} c="var(--v2-text)" style={{ letterSpacing: '-0.02em' }}>
                {greeting}, {firstName}
              </Title>
              <Text fz={14} c="var(--v2-text-muted)">
                {caseloadCopy}
              </Text>
            </Stack>
            <Box visibleFrom="sm" style={{ flexShrink: 0 }}>
              <Image
                src="/heroes/dashboard.svg"
                alt=""
                width={200}
                height={120}
                priority
                unoptimized
              />
            </Box>
          </Flex>
        </Paper>

        {/* KPI tiles */}
        <Grid gap="md" mb="lg">
          <Grid.Col span={{ base: 12, sm: 6, md: 3 }}>
            <KpiTile
              label="My Clients"
              href="/dashboard?full=1&filter=all"
              value={scopedSummary.total_clients}
              subtitle="active caseload"
              icon={<Users size={20} color="#fff" />}
              gradient="linear-gradient(135deg, #1663CC 0%, #1E7CFF 45%, #114FB0 100%)"
              shadowColor="rgba(30,124,255,0.35)"
            />
          </Grid.Col>
          <Grid.Col span={{ base: 12, sm: 6, md: 3 }}>
            <KpiTile
              label="Overdue"
              href="/dashboard?full=1&filter=overdue"
              value={scopedSummary.overdue_clients}
              subtitle="needs follow-up"
              icon={<AlertTriangle size={20} color="#fff" />}
              gradient="linear-gradient(135deg, #D91E42 0%, #E63350 45%, #B01633 100%)"
              shadowColor="rgba(255,59,92,0.35)"
            />
          </Grid.Col>
          <Grid.Col span={{ base: 12, sm: 6, md: 3 }}>
            <KpiTile
              label="Due This Week"
              href="/dashboard?full=1&filter=due_this_week"
              value={scopedSummary.due_this_week_clients}
              subtitle="in next 7 days"
              icon={<Clock size={20} color="#fff" />}
              gradient="linear-gradient(135deg, #C77414 0%, #D97F0E 45%, #A85E08 100%)"
              shadowColor="rgba(255,169,64,0.35)"
            />
          </Grid.Col>
          <Grid.Col span={{ base: 12, sm: 6, md: 3 }}>
            <KpiTile
              label="No Contact 15+"
              href="/dashboard?full=1&filter=no_contact_7"
              value={scopedSummary.no_contact_7_days_clients}
              subtitle="in last 7 days"
              icon={<PhoneOff size={20} color="#fff" />}
              gradient="linear-gradient(135deg, #0B8A60 0%, #0EA372 45%, #04724F 100%)"
              shadowColor="rgba(16,185,129,0.35)"
            />
          </Grid.Col>
        </Grid>

        {/* My Team Manager card */}
        <Box mb="lg">
          <MyTeamManagerCard tm={myTeamManager} />
        </Box>

        {/* Sections */}
        <Stack gap="lg">
          <CaseloadSnapshotSection scopedSummary={scopedSummary} />
          <ClientDrillDownSection />
        </Stack>
      </Container>
    </Box>
  )
}
