'use client'

/* ──────────────────────────────────────────────────────────────────────────
 * TeamManagerControlPanelClient — CaseSync v2 dashboard for the
 * `team_manager` role. Routed from app/dashboard/page.tsx when role is
 * 'team_manager' and ?full=1 is not set. Mirrors the supervisor v2 visual
 * language scoped to a single team (the TM's direct reports).
 *
 * Sections (same shell + tokens as supervisor; sized for a team-of-N view):
 *   - Greeting block (dashboard.svg hero, personalized)
 *   - 4 KPI tiles aggregated from the TM's planners
 *   - My Team card (team badge + lead identity, looked up in TEAMS registry)
 *   - Team Health Snapshot (donut + per-planner caseload bars)
 *   - Client Drill-down (filter chips + /api/clients fetched list)
 *   - Planner Workload (per-SP cards)
 *   - Team Roster (TM + their SPs)
 *
 * Does NOT touch: BLH bot endpoints (/api/bot/*), middleware, schema,
 * globals.css, the Header, the supervisor dashboard, or DashboardClient
 * (legacy still handles SPs + ?full=1).
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
  Progress,
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
  Filter,
  PhoneOff,
  Users,
} from 'lucide-react'
import { Profile, Client } from '@/lib/types'
import type { AssigneeSummaryRow } from '@/lib/dashboard-summary'
import CaseSyncV2MantineProvider from '@/components/casesync-v2/CaseSyncV2MantineProvider'
import LottieBlock from '@/components/ui/LottieBlock'
import { ANIM } from '@/lib/animations'
import ClientListTable from './ClientListTable'

// ===========================================================================
// Props — the server pre-filters `planners` to this TM's direct reports and
// computes `summaryByAssignee` only for those planners.
// ===========================================================================

interface Props {
  profile: Profile
  planners: Profile[]
  summaryByAssignee?: Record<string, AssigneeSummaryRow>
}

interface ScopedSummary {
  total_clients: number
  overdue_clients: number
  due_this_week_clients: number
  eligibility_ending_soon_clients: number
  no_contact_7_days_clients: number
}

// ===========================================================================
// BLH team registry (subset used here) — same source of truth as the
// supervisor view (Workryn /w/departments). For the TM dashboard we only
// need it to look up the current TM's team identity for the "My Team" card.
// ===========================================================================

type Program = 'CFC' | 'DDA' | 'Leadership'

interface TeamConfig {
  id: string
  teamName: string
  leadName: string
  leadTitle: string
  program: Program
  badgeSlug: string
  accentColor: string
}

const TEAMS: TeamConfig[] = [
  { id: 'blue-giants', teamName: 'Blue Giants', leadName: 'Rosabel Corion-Brown', leadTitle: 'Team Manager', program: 'CFC', badgeSlug: 'blue-giants', accentColor: '#1E7CFF' },
  { id: 'gold-giants', teamName: 'Gold Giants', leadName: 'Mariama Jalloh', leadTitle: 'Team Manager', program: 'CFC', badgeSlug: 'gold-giants', accentColor: '#F59E0B' },
  { id: 'bronze-butterflies', teamName: 'Bronze Butterflies', leadName: 'Kelly Sanchez', leadTitle: 'Onboarding Supervisor', program: 'CFC', badgeSlug: 'bronze-butterflies', accentColor: '#C77B45' },
  { id: 'emerald-guardians', teamName: 'Emerald Guardians', leadName: 'Ashley Alfaro', leadTitle: 'Lead', program: 'CFC', badgeSlug: 'emerald-guardians', accentColor: '#10B981' },
  { id: 'maroon-musketeers', teamName: 'Maroon Musketeers', leadName: 'TahTeona Hall', leadTitle: 'Audit Supervisor', program: 'CFC', badgeSlug: 'maroon-musketeers', accentColor: '#9F1239' },
  { id: 'purple-penguins', teamName: 'Purple Penguins', leadName: 'Emma Wojnovich', leadTitle: 'Lead', program: 'CFC', badgeSlug: 'purple-penguins', accentColor: '#9333EA' },
  { id: 'sage-sharks', teamName: 'Sage Sharks', leadName: 'Breanna Shears', leadTitle: 'Lead', program: 'CFC', badgeSlug: 'sage-sharks', accentColor: '#65A30D' },
  { id: 'silver-titans', teamName: 'Silver Titans', leadName: 'Mercedes Jones', leadTitle: 'Supervisor', program: 'CFC', badgeSlug: 'silver-titans', accentColor: 'var(--v2-text-muted)' },
  { id: 'indigo-gladiators', teamName: 'Indigo Gladiators', leadName: 'Jai Mbenga Sanneh', leadTitle: 'Agency Liaison', program: 'DDA', badgeSlug: 'indigo-gladiators', accentColor: '#6366F1' },
  { id: 'white-diamonds', teamName: 'White Diamonds', leadName: 'Gabriela Jannuzzio', leadTitle: 'Program Supervisor', program: 'Leadership', badgeSlug: 'white-diamonds', accentColor: '#A78BFA' },
]

// ===========================================================================
// KpiTile (mirrors supervisor pattern)
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
// MyTeamCard — single-team identity banner. Looks up the TM's team in the
// registry by full_name; if no match (TM not yet on Workryn Departments),
// renders a neutral "My Team" card with their team-manager-id-derived stats.
// ===========================================================================

function MyTeamCard({
  profile,
  scopedSummary,
  spCount,
}: {
  profile: Profile
  scopedSummary: ScopedSummary
  spCount: number
}) {
  const team = TEAMS.find((t) => t.leadName === profile.full_name)
  const accent = team?.accentColor ?? '#1E7CFF'
  const teamName = team?.teamName ?? 'My Team'
  const program = team?.program ?? 'CFC'
  const badgeSlug = team?.badgeSlug

  return (
    <Paper
      p="lg"
      style={{
        background: 'var(--v2-surface)',
        border: '1px solid var(--v2-border-soft)',
        borderLeft: `4px solid ${accent}`,
        boxShadow: '0 1px 2px rgba(15,23,42,0.04), 0 4px 12px rgba(15,23,42,0.05)',
      }}
    >
      <Flex justify="space-between" align="center" gap="lg" wrap="wrap">
        <Group gap="md" wrap="nowrap" style={{ flex: 1, minWidth: 0 }}>
          {badgeSlug ? (
            <Box
              style={{
                width: 64,
                height: 64,
                borderRadius: 16,
                background: 'var(--v2-surface)',
                padding: 4,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: `0 4px 12px ${accent}33, inset 0 0 0 2px ${accent}33`,
                flexShrink: 0,
              }}
            >
              <Image
                src={`/teams/${badgeSlug}.svg`}
                alt={teamName}
                width={56}
                height={56}
                style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                unoptimized
              />
            </Box>
          ) : (
            <Avatar size={64} radius={16} style={{ background: accent, color: '#fff', fontSize: 22, fontWeight: 800 }}>
              {(profile.full_name ?? '?')
                .split(' ')
                .slice(0, 2)
                .map((p) => p[0])
                .join('')
                .toUpperCase()}
            </Avatar>
          )}
          <Stack gap={4} style={{ minWidth: 0 }}>
            <Group gap={6} wrap="nowrap">
              <Text fz={13} fw={600} c="var(--v2-text-muted)" tt="uppercase" style={{ letterSpacing: '0.06em' }}>
                My Team
              </Text>
              <Badge size="xs" variant="light" color={program === 'CFC' ? 'cobalt' : program === 'DDA' ? 'amber' : 'mauve'}>
                {program}
              </Badge>
            </Group>
            <Title order={2} fz={22} fw={800} c="var(--v2-text)" style={{ letterSpacing: '-0.02em' }}>
              {teamName}
            </Title>
            <Text fz={13} c="var(--v2-text-muted)">
              {profile.full_name ?? 'Lead'} · Team Manager · {spCount} Support Planner{spCount === 1 ? '' : 's'}
            </Text>
          </Stack>
        </Group>
        <Group gap="lg" wrap="nowrap" visibleFrom="sm">
          <Stack gap={0} align="flex-end">
            <Text fz={11} c="var(--v2-text-muted)" fw={600} tt="uppercase" style={{ letterSpacing: '0.06em' }}>Clients</Text>
            <Text fz={22} fw={800} c="var(--v2-text)">{scopedSummary.total_clients.toLocaleString()}</Text>
          </Stack>
          <Stack gap={0} align="flex-end">
            <Text fz={11} c="#FF3B5C" fw={600} tt="uppercase" style={{ letterSpacing: '0.06em' }}>Overdue</Text>
            <Text fz={22} fw={800} c="#FF3B5C">{scopedSummary.overdue_clients}</Text>
          </Stack>
        </Group>
      </Flex>
    </Paper>
  )
}

// ===========================================================================
// TeamHealthSection — donut of status breakdown + per-planner caseload bars
// (since this is a single team, the "bar chart" rows are SPs, not teams).
// ===========================================================================

function TeamHealthSection({
  scopedSummary,
  planners,
  summaryByAssignee,
}: {
  scopedSummary: ScopedSummary
  planners: Profile[]
  summaryByAssignee?: Record<string, AssigneeSummaryRow>
}) {
  const issuesSum =
    scopedSummary.overdue_clients +
    scopedSummary.due_this_week_clients +
    scopedSummary.no_contact_7_days_clients
  const healthy = Math.max(0, scopedSummary.total_clients - issuesSum)

  const donutData = [
    { name: 'Overdue', value: scopedSummary.overdue_clients, color: '#FF3B5C' },
    { name: 'Due This Week', value: scopedSummary.due_this_week_clients, color: '#FFA940' },
    { name: 'No Contact 7+', value: scopedSummary.no_contact_7_days_clients, color: '#1E7CFF' },
    { name: 'Healthy', value: healthy, color: '#10B981' },
  ].filter((d) => d.value > 0)

  const plannerRows = planners.map((p) => ({
    planner: p,
    caseload: summaryByAssignee?.[p.id]?.total_clients ?? 0,
    overdue: summaryByAssignee?.[p.id]?.overdue_clients ?? 0,
  }))
  const maxCaseload = Math.max(1, ...plannerRows.map((r) => r.caseload))

  return (
    <SectionPaper
      eyebrow="Snapshot"
      title="Team Health Snapshot"
      heroSrc="/heroes/evaluations.svg"
      rightSlot={
        <Badge size="sm" variant="light" color="emerald">
          live · {scopedSummary.total_clients} clients
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
            <Stack gap={6} w="100%">
              {[
                { name: 'Overdue', value: scopedSummary.overdue_clients, color: '#FF3B5C' },
                { name: 'Due This Week', value: scopedSummary.due_this_week_clients, color: '#FFA940' },
                { name: 'No Contact 7+', value: scopedSummary.no_contact_7_days_clients, color: '#1E7CFF' },
                { name: 'Healthy', value: healthy, color: '#10B981' },
              ].map((row) => (
                <Group key={row.name} gap={8} wrap="nowrap" justify="space-between">
                  <Group gap={8} wrap="nowrap">
                    <Box style={{ width: 10, height: 10, borderRadius: 3, background: row.color }} />
                    <Text fz={12} c="var(--v2-text-muted)" fw={500}>{row.name}</Text>
                  </Group>
                  <Text fz={12} fw={700} c="var(--v2-text)">{row.value.toLocaleString()}</Text>
                </Group>
              ))}
            </Stack>
          </Stack>
        </Grid.Col>
        <Grid.Col span={{ base: 12, md: 7 }}>
          <Text fz={12} fw={600} c="var(--v2-text-muted)" tt="uppercase" mb="sm" style={{ letterSpacing: '0.06em' }}>
            Caseload by Support Planner
          </Text>
          {plannerRows.length === 0 ? (
            <Text fz={13} c="var(--v2-border-rail)" fs="italic">No support planners assigned to this team yet.</Text>
          ) : (
            <Stack gap={10}>
              {plannerRows.map(({ planner, caseload, overdue }) => {
                const pct = (caseload / maxCaseload) * 100
                const initials = (planner.full_name ?? '?')
                  .split(' ').slice(0, 2).map((p) => p[0]).join('').toUpperCase()
                const barColor = overdue >= 5 ? '#FF3B5C' : overdue >= 2 ? '#FFA940' : '#10B981'
                return (
                  <Group key={planner.id} gap="sm" wrap="nowrap">
                    <Avatar size={28} radius="xl" style={{ background: barColor, color: '#fff', fontSize: 10, fontWeight: 700, flexShrink: 0 }}>
                      {initials}
                    </Avatar>
                    <Stack gap={2} style={{ flex: 1, minWidth: 0 }}>
                      <Group justify="space-between" gap={6}>
                        <Text fz={12} fw={600} c="var(--v2-text)" truncate>{planner.full_name ?? 'Unnamed'}</Text>
                        <Text fz={11} fw={700} c="var(--v2-text)">{caseload.toLocaleString()}</Text>
                      </Group>
                      <Box style={{ height: 8, borderRadius: 4, background: `${barColor}2E`, overflow: 'hidden', position: 'relative' }}>
                        <Box
                          style={{
                            position: 'absolute',
                            left: 0,
                            top: 0,
                            bottom: 0,
                            width: `${Math.max(2, pct)}%`,
                            background: `${barColor}`,
                            borderRadius: 4,
                          }}
                        />
                      </Box>
                    </Stack>
                  </Group>
                )
              })}
            </Stack>
          )}
        </Grid.Col>
      </Grid>
    </SectionPaper>
  )
}

// ===========================================================================
// ClientDrillDownSection — filter chips + fetched list. /api/clients should
// already apply role-scoped filtering server-side (RLS or endpoint logic), so
// what comes back here is already scoped to this TM's team.
// ===========================================================================

type ClientFilter = 'all' | 'overdue' | 'due_this_week' | 'no_contact_7'

const CLIENT_FILTERS: { value: ClientFilter; label: string; color: string }[] = [
  { value: 'all', label: 'All', color: 'var(--v2-text)' },
  { value: 'overdue', label: 'Overdue', color: '#FF3B5C' },
  { value: 'due_this_week', label: 'Due Week', color: '#FFA940' },
  { value: 'no_contact_7', label: 'No Contact 7+', color: '#1E7CFF' },
]

function ClientDrillDownSection({ planners }: { planners: Profile[] }) {
  const [clientFilter, setClientFilter] = useState<ClientFilter>('all')
  const [clients, setClients] = useState<Client[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    const controller = new AbortController()
    const params = new URLSearchParams()
    params.set('page', '0')
    params.set('limit', '8')
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
        console.error('Client drill-down load failed:', err)
        setClients([])
        setTotal(0)
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })

    return () => controller.abort()
  }, [clientFilter])

  const filterMeta = CLIENT_FILTERS.find((f) => f.value === clientFilter)!
  const fullHref = `/team?full=1&filter=${clientFilter}`

  return (
    <SectionPaper
      eyebrow="Caseload"
      title="Client Drill-down"
      anim={ANIM.gDueWeek}
      heroSrc="/heroes/tickets.svg"
      rightSlot={
        <Group gap="xs" wrap="nowrap">
          <Badge size="sm" variant="light" color="cobalt">
            {loading ? 'loading…' : `${total.toLocaleString()} matching`}
          </Badge>
          <Link href={fullHref} style={{ textDecoration: 'none' }}>
            <Text fz={12} fw={600} c="#1E7CFF">View all →</Text>
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
// PlannerWorkloadSection — per-planner cards. Same pattern as the supervisor
// view but limited to the TM's direct reports.
// ===========================================================================

function PlannerWorkloadSection({
  planners,
  profile,
  summaryByAssignee,
}: {
  planners: Profile[]
  profile: Profile
  summaryByAssignee?: Record<string, AssigneeSummaryRow>
}) {
  const rows = useMemo(() => {
    return planners
      .map((planner) => {
        const s = summaryByAssignee?.[planner.id]
        return {
          planner,
          caseload: s?.total_clients ?? 0,
          overdue: s?.overdue_clients ?? 0,
          dueWeek: s?.due_this_week_clients ?? 0,
          quiet: s?.no_contact_7_days_clients ?? 0,
        }
      })
      .sort((a, b) => {
        if (b.overdue !== a.overdue) return b.overdue - a.overdue
        return b.caseload - a.caseload
      })
  }, [planners, summaryByAssignee])

  const maxCaseload = Math.max(1, ...rows.map((r) => r.caseload))

  return (
    <SectionPaper
      eyebrow="My Team"
      title="Planner Workload"
      heroSrc="/heroes/tasks.svg"
      rightSlot={
        <Badge size="sm" variant="light" color="cobalt">
          {planners.length} Support Planner{planners.length === 1 ? '' : 's'}
        </Badge>
      }
    >
      {rows.length === 0 ? (
        <Box py="xl" style={{ textAlign: 'center', background: 'var(--v2-surface-tint)', borderRadius: 12, border: '1px dashed var(--v2-border-soft)' }}>
          <Box style={{ width: 96, height: 96, margin: '0 auto 12px' }}>
            <Image
              src="/heroes/empty-tasks.svg"
              alt=""
              width={96}
              height={96}
              style={{ width: '100%', height: '100%', objectFit: 'contain' }}
              unoptimized
            />
          </Box>
          <Text fz={14} fw={600} c="var(--v2-text)">No Support Planners assigned</Text>
          <Text fz={12} c="var(--v2-text-muted)" mt={4}>
            Reach out to your supervisor to add SPs to {profile.full_name ?? 'your team'}.
          </Text>
        </Box>
      ) : (
        <Grid gap="md">
          {rows.map(({ planner, caseload, overdue, dueWeek, quiet }) => {
            const initials = (planner.full_name ?? '?').split(' ').slice(0, 2).map((p) => p[0]).join('').toUpperCase()
            const pressurePct = maxCaseload > 0 ? (caseload / maxCaseload) * 100 : 0
            const pressureColor = overdue >= 5 ? '#FF3B5C' : overdue >= 2 ? '#FFA940' : '#10B981'
            return (
              <Grid.Col key={planner.id} span={{ base: 12, sm: 6, lg: 4 }}>
                <Box
                  style={{
                    padding: 14,
                    borderRadius: 12,
                    background: 'var(--v2-surface)',
                    border: '1px solid var(--v2-border-soft)',
                    borderLeft: `4px solid ${pressureColor}`,
                  }}
                >
                  <Group gap="sm" wrap="nowrap" mb="sm">
                    <Avatar size="md" radius="xl" style={{ background: '#1E7CFF', color: '#fff', fontWeight: 700, fontSize: 14 }}>
                      {initials}
                    </Avatar>
                    <Stack gap={2} style={{ minWidth: 0, flex: 1 }}>
                      <Text fz={13} fw={700} c="var(--v2-text)" truncate>{planner.full_name ?? 'Unnamed'}</Text>
                      <Text fz={11} c="var(--v2-text-muted)" truncate>Support Planner</Text>
                    </Stack>
                  </Group>
                  <Group justify="space-between" gap={4} mb={6}>
                    <Stack gap={0}>
                      <Text fz={20} fw={800} c="var(--v2-text)" lh={1}>{caseload}</Text>
                      <Text fz={10} c="var(--v2-text-muted)" fw={600} tt="uppercase" style={{ letterSpacing: '0.06em' }}>Clients</Text>
                    </Stack>
                    <Stack gap={0} align="center">
                      <Text fz={20} fw={800} c="#FF3B5C" lh={1}>{overdue}</Text>
                      <Text fz={10} c="var(--v2-text-muted)" fw={600} tt="uppercase" style={{ letterSpacing: '0.06em' }}>Overdue</Text>
                    </Stack>
                    <Stack gap={0} align="center">
                      <Text fz={20} fw={800} c="#FFA940" lh={1}>{dueWeek}</Text>
                      <Text fz={10} c="var(--v2-text-muted)" fw={600} tt="uppercase" style={{ letterSpacing: '0.06em' }}>Due Wk</Text>
                    </Stack>
                    <Stack gap={0} align="flex-end">
                      <Text fz={20} fw={800} c="#1E7CFF" lh={1}>{quiet}</Text>
                      <Text fz={10} c="var(--v2-text-muted)" fw={600} tt="uppercase" style={{ letterSpacing: '0.06em' }}>Quiet</Text>
                    </Stack>
                  </Group>
                  <Progress value={pressurePct} size="xs" color={pressureColor === '#FF3B5C' ? 'coral' : pressureColor === '#FFA940' ? 'amber' : 'emerald'} mt={4} />
                </Box>
              </Grid.Col>
            )
          })}
        </Grid>
      )}
    </SectionPaper>
  )
}

// ===========================================================================
// TeamRosterSection — TM + their SPs. Filter chips kept lighter than the
// supervisor view since the roster is by definition small.
// ===========================================================================

type RosterFilter = 'all' | 'me' | 'planners'

const ROSTER_FILTERS: { value: RosterFilter; label: string }[] = [
  { value: 'all', label: 'Everyone' },
  { value: 'me', label: 'Me (Team Manager)' },
  { value: 'planners', label: 'Support Planners' },
]

function TeamRosterSection({
  profile,
  planners,
}: {
  profile: Profile
  planners: Profile[]
}) {
  const [rosterFilter, setRosterFilter] = useState<RosterFilter>('all')

  const rows = useMemo(() => {
    if (rosterFilter === 'me') {
      return [{ profile, kind: 'tm' as const }]
    }
    if (rosterFilter === 'planners') {
      return planners.map((p) => ({ profile: p, kind: 'sp' as const }))
    }
    return [
      { profile, kind: 'tm' as const },
      ...planners.map((p) => ({ profile: p, kind: 'sp' as const })),
    ]
  }, [profile, planners, rosterFilter])

  return (
    <SectionPaper
      eyebrow="Roster"
      title="Team Roster"
      heroSrc="/heroes/profile.svg"
      rightSlot={
        <Group gap={6} wrap="nowrap">
          <Badge size="sm" variant="light" color="cobalt">1 TM</Badge>
          <Badge size="sm" variant="light" color="emerald">
            {planners.length} SP{planners.length === 1 ? '' : 's'}
          </Badge>
        </Group>
      }
    >
      <SegmentedControl
        value={rosterFilter}
        onChange={(v) => setRosterFilter(v as RosterFilter)}
        data={ROSTER_FILTERS.map((f) => ({ value: f.value, label: f.label }))}
        size="sm"
        fullWidth
        mb="md"
        color="cobalt"
      />
      {rows.length === 0 ? (
        <Box py="xl" style={{ textAlign: 'center', background: 'var(--v2-surface-tint)', borderRadius: 12, border: '1px dashed var(--v2-border-soft)' }}>
          <Filter size={32} color="var(--v2-border-rail)" style={{ margin: '0 auto 8px' }} />
          <Text fz={14} fw={600} c="var(--v2-text)">No one in this slice</Text>
          <Text fz={12} c="var(--v2-text-muted)" mt={4}>Try a different filter.</Text>
        </Box>
      ) : (
        <Grid gap="sm">
          {rows.map(({ profile: p, kind }) => {
            const initials = (p.full_name ?? '?').split(' ').slice(0, 2).map((x) => x[0]).join('').toUpperCase()
            const isTM = kind === 'tm'
            const accent = isTM ? '#1E7CFF' : '#10B981'
            const label = isTM ? 'Team Manager' : 'Support Planner'
            return (
              <Grid.Col key={p.id} span={{ base: 12, sm: 6, md: 4, lg: 3 }}>
                <Group
                  gap="sm"
                  wrap="nowrap"
                  style={{
                    padding: '10px 12px',
                    borderRadius: 10,
                    background: 'var(--v2-surface)',
                    border: '1px solid var(--v2-border-soft)',
                    borderLeft: `3px solid ${accent}`,
                  }}
                >
                  <Avatar size="sm" radius="xl" style={{ background: accent, color: '#fff', fontWeight: 700, fontSize: 11 }}>
                    {initials}
                  </Avatar>
                  <Stack gap={0} style={{ minWidth: 0, flex: 1 }}>
                    <Text fz={12} fw={700} c="var(--v2-text)" truncate>
                      {p.full_name ?? 'Unnamed'}
                      {isTM && p.id === profile.id ? ' (you)' : ''}
                    </Text>
                    <Text fz={10} c="var(--v2-text-muted)" truncate>{label}</Text>
                  </Stack>
                </Group>
              </Grid.Col>
            )
          })}
        </Grid>
      )}
    </SectionPaper>
  )
}

// ===========================================================================
// Main component
// ===========================================================================

export default function TeamManagerControlPanelClient(props: Props) {
  return (
    <CaseSyncV2MantineProvider>
      <Inner {...props} />
    </CaseSyncV2MantineProvider>
  )
}

function Inner({ profile, planners, summaryByAssignee }: Props) {
  // ----- Aggregate per-planner summaries into a team total -----
  const scopedSummary: ScopedSummary = useMemo(() => {
    const rows = Object.values(summaryByAssignee ?? {})
    return rows.reduce(
      (acc, row) => ({
        total_clients: acc.total_clients + (row.total_clients ?? 0),
        overdue_clients: acc.overdue_clients + (row.overdue_clients ?? 0),
        due_this_week_clients: acc.due_this_week_clients + (row.due_this_week_clients ?? 0),
        eligibility_ending_soon_clients:
          acc.eligibility_ending_soon_clients + (row.eligibility_ending_soon_clients ?? 0),
        no_contact_7_days_clients:
          acc.no_contact_7_days_clients + (row.no_contact_7_days_clients ?? 0),
      }),
      {
        total_clients: 0,
        overdue_clients: 0,
        due_this_week_clients: 0,
        eligibility_ending_soon_clients: 0,
        no_contact_7_days_clients: 0,
      },
    )
  }, [summaryByAssignee])

  // ----- Greeting -----
  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening'
  const firstName = profile.full_name?.split(' ')[0] ?? 'there'
  const dateLabel = new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  })

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
                {scopedSummary.total_clients.toLocaleString()} active client
                {scopedSummary.total_clients === 1 ? '' : 's'} across {planners.length} Support Planner
                {planners.length === 1 ? '' : 's'}.
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
              label="My Caseload"
              href="/team?filter=all"
              value={scopedSummary.total_clients}
              subtitle={`${planners.length} SP${planners.length === 1 ? '' : 's'}`}
              icon={<Users size={20} color="#fff" />}
              gradient="linear-gradient(135deg, #1E7CFF 0%, #2D8BFF 50%, #1A6FEB 100%)"
              shadowColor="rgba(30,124,255,0.35)"
            />
          </Grid.Col>
          <Grid.Col span={{ base: 12, sm: 6, md: 3 }}>
            <KpiTile
              label="Overdue"
              href="/team?filter=overdue"
              value={scopedSummary.overdue_clients}
              subtitle="needs follow-up"
              icon={<AlertTriangle size={20} color="#fff" />}
              gradient="linear-gradient(135deg, #FF3B5C 0%, #FF5573 50%, #E63350 100%)"
              shadowColor="rgba(255,59,92,0.35)"
            />
          </Grid.Col>
          <Grid.Col span={{ base: 12, sm: 6, md: 3 }}>
            <KpiTile
              label="Due This Week"
              href="/team?filter=due_this_week"
              value={scopedSummary.due_this_week_clients}
              subtitle="in next 7 days"
              icon={<Clock size={20} color="#fff" />}
              gradient="linear-gradient(135deg, #FFA940 0%, #FFB860 50%, #F59E0B 100%)"
              shadowColor="rgba(255,169,64,0.35)"
            />
          </Grid.Col>
          <Grid.Col span={{ base: 12, sm: 6, md: 3 }}>
            <KpiTile
              label="No Contact 7+"
              href="/team?filter=no_contact_7"
              value={scopedSummary.no_contact_7_days_clients}
              subtitle="in last 7 days"
              icon={<PhoneOff size={20} color="#fff" />}
              gradient="linear-gradient(135deg, #10B981 0%, #1AC78A 50%, #059669 100%)"
              shadowColor="rgba(16,185,129,0.35)"
            />
          </Grid.Col>
        </Grid>

        {/* My Team identity card */}
        <Box mb="lg">
          <MyTeamCard profile={profile} scopedSummary={scopedSummary} spCount={planners.length} />
        </Box>

        {/* Sections */}
        <Stack gap="lg">
          <TeamHealthSection
            scopedSummary={scopedSummary}
            planners={planners}
            summaryByAssignee={summaryByAssignee}
          />
          <ClientDrillDownSection planners={planners} />
          <PlannerWorkloadSection
            planners={planners}
            profile={profile}
            summaryByAssignee={summaryByAssignee}
          />
          <TeamRosterSection profile={profile} planners={planners} />
        </Stack>
      </Container>
    </Box>
  )
}
