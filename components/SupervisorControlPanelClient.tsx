'use client'

/* ──────────────────────────────────────────────────────────────────────────
 * SupervisorControlPanelClient — CaseSync v2 (Commit P1.1: scaffold + KPIs
 * + 10-team overview). Rendered by /supervisor and by /dashboard for the
 * supervisor/IT role variant. Migrated from the 940-line legacy component
 * on the redesign branch, preserving the Props interface verbatim so the
 * server pages don't change.
 *
 * P1.1 ships:
 *   - Greeting block with /heroes/schedule.svg
 *   - 4 KPI tiles (Active / Overdue / Due-this-week / No-contact-7+) wired
 *     to scopedSummary, derived from summaryByAssignee with globalSummary
 *     fallback (preserves legacy behavior)
 *   - 10-row Team Overview sourced from the canonical Workryn Departments
 *     list. Blue Giants + Gold Giants compute real counts from team_manager_id;
 *     the other 8 teams render visual scaffold + "pending assignments" until
 *     the DB schema grows a richer org mapping.
 *
 * Defers to later commits (rendered as loading placeholders here):
 *   - Team Health bar chart (P1.2)
 *   - Client Drill-down (P1.3)
 *   - Planner Workload + Team Roster (P1.4)
 *   - Attention Feed + SUPERVISOR SCOPE footer (P1.5)
 *
 * Does NOT touch: BLH bot endpoints (/api/bot/*), middleware, schema,
 * globals.css, the Header, or any other component.
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
  UnstyledButton,
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

// ===========================================================================
// Props — preserved EXACTLY from the legacy component (see
// app/supervisor/page.tsx and app/dashboard/page.tsx server fetches).
// ===========================================================================

interface Props {
  planners: Profile[]
  teamManagers: Profile[]
  summaryByAssignee?: Record<string, AssigneeSummaryRow>
  globalSummary?: {
    total_clients: number
    overdue_clients: number
    due_this_week_clients: number
    eligibility_ending_soon_clients: number
    no_contact_7_days_clients: number
  }
  profile?: Profile | null
}

// ===========================================================================
// BLH team registry — sourced from Workryn /w/departments (the canonical
// org list). Lead name + leadTitle are display strings; memberSource defines
// how planner counts are derived from the current CaseSync profile schema:
//
//   'team_manager_id'  → match the lead to a row in `teamManagers` by
//                        full_name, then count planners whose
//                        team_manager_id equals that row's id.
//   'pending'          → the lead is a supervisor / agency liaison / program
//                        supervisor (not a team_manager in the Profile.role
//                        enum), so we can't derive members from current
//                        schema. Render scaffold + "pending assignments".
//
// When the org chart lands (either by promoting these leads to team_managers
// or by adding a new mapping column), flipping memberSource to
// 'team_manager_id' here is the only change needed for counts to appear.
// ===========================================================================

type MemberSource = 'team_manager_id' | 'pending'
type Program = 'CFC' | 'DDA' | 'Leadership'

interface TeamConfig {
  id: string
  teamName: string
  leadName: string
  leadTitle: string
  program: Program
  badgeSlug: string
  accentColor: string
  memberSource: MemberSource
  /** full_name to match against `teamManagers[].full_name` when memberSource = 'team_manager_id'. */
  leadFullName?: string
}

const TEAMS: TeamConfig[] = [
  {
    id: 'blue-giants',
    teamName: 'Blue Giants',
    leadName: 'Rosabel Corion-Brown',
    leadTitle: 'Team Manager',
    program: 'CFC',
    badgeSlug: 'blue-giants',
    accentColor: '#1E7CFF',
    memberSource: 'team_manager_id',
    leadFullName: 'Rosabel Corion-Brown',
  },
  {
    id: 'gold-giants',
    teamName: 'Gold Giants',
    leadName: 'Mariama Jalloh',
    leadTitle: 'Team Manager',
    program: 'CFC',
    badgeSlug: 'gold-giants',
    accentColor: '#F59E0B',
    memberSource: 'team_manager_id',
    leadFullName: 'Mariama Jalloh',
  },
  {
    id: 'bronze-butterflies',
    teamName: 'Bronze Butterflies',
    leadName: 'Kelly Sanchez',
    leadTitle: 'Onboarding Supervisor',
    program: 'CFC',
    badgeSlug: 'bronze-butterflies',
    accentColor: '#C77B45',
    memberSource: 'pending',
  },
  {
    id: 'emerald-guardians',
    teamName: 'Emerald Guardians',
    leadName: 'Ashley Alfaro',
    leadTitle: 'Lead',
    program: 'CFC',
    badgeSlug: 'emerald-guardians',
    accentColor: '#10B981',
    memberSource: 'pending',
  },
  {
    id: 'maroon-musketeers',
    teamName: 'Maroon Musketeers',
    leadName: 'TahTeona Hall',
    leadTitle: 'Audit Supervisor',
    program: 'CFC',
    badgeSlug: 'maroon-musketeers',
    accentColor: '#9F1239',
    memberSource: 'pending',
  },
  {
    id: 'purple-penguins',
    teamName: 'Purple Penguins',
    leadName: 'Emma Wojnovich',
    leadTitle: 'Lead',
    program: 'CFC',
    badgeSlug: 'purple-penguins',
    accentColor: '#9333EA',
    memberSource: 'pending',
  },
  {
    id: 'sage-sharks',
    teamName: 'Sage Sharks',
    leadName: 'Breanna Shears',
    leadTitle: 'Lead',
    program: 'CFC',
    badgeSlug: 'sage-sharks',
    accentColor: '#65A30D',
    memberSource: 'pending',
  },
  {
    id: 'silver-titans',
    teamName: 'Silver Titans',
    leadName: 'Mercedes Jones',
    leadTitle: 'Supervisor',
    program: 'CFC',
    badgeSlug: 'silver-titans',
    accentColor: '#64748B',
    memberSource: 'pending',
  },
  {
    id: 'indigo-gladiators',
    teamName: 'Indigo Gladiators',
    leadName: 'Jai Mbenga Sanneh',
    leadTitle: 'Agency Liaison',
    program: 'DDA',
    badgeSlug: 'indigo-gladiators',
    accentColor: '#6366F1',
    memberSource: 'pending',
  },
  {
    id: 'white-diamonds',
    teamName: 'White Diamonds',
    leadName: 'Gabriela Jannuzzio',
    leadTitle: 'Program Supervisor',
    program: 'Leadership',
    badgeSlug: 'white-diamonds',
    accentColor: '#A78BFA',
    memberSource: 'pending',
  },
]

// ===========================================================================
// KpiTile — mirrors the v2 north-star pattern at
// components/casesync-v2/SupervisorDashboardV2Client.tsx (KpiTile fn).
// Delta-pct is omitted here because the existing server fetches don't return
// historical comparison data; the trend chart belongs to P1.2.
// ===========================================================================

interface KpiTileProps {
  label: string
  value: number
  icon: React.ReactNode
  gradient: string
  shadowColor: string
  subtitle?: string
}

function KpiTile({ label, value, icon, gradient, shadowColor, subtitle }: KpiTileProps) {
  return (
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
          <Text
            fz={12}
            fw={600}
            c="rgba(255,255,255,0.92)"
            style={{ letterSpacing: '0.06em', textTransform: 'uppercase' }}
          >
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
}

// ===========================================================================
// TeamRow — mirrors the v2 north-star TeamRow component.
// Pending teams show scaffold + "pending assignments"; active teams show
// the OVERDUE / DUE-WEEK stats derived from summaryByAssignee.
// ===========================================================================

interface DerivedTeam {
  cfg: TeamConfig
  spCount: number
  clientCount: number
  overdueCount: number
  dueThisWeekCount: number
  noContact7Count: number
  pending: boolean
}

function TeamRow({ team }: { team: DerivedTeam }) {
  const programColor = team.cfg.program === 'CFC' ? 'cobalt' : team.cfg.program === 'DDA' ? 'amber' : 'mauve'

  return (
    <UnstyledButton
      style={{
        display: 'block',
        width: '100%',
        padding: '14px 16px',
        borderRadius: 12,
        background: 'var(--v2-surface-tint)',
        borderLeft: `4px solid ${team.cfg.accentColor}`,
        transition: 'all 0.15s ease',
      }}
    >
      <Flex justify="space-between" align="center" gap="md" wrap="nowrap">
        <Group gap="sm" wrap="nowrap" style={{ flex: 1, minWidth: 0 }}>
          <Box
            style={{
              width: 44,
              height: 44,
              borderRadius: 12,
              background: 'var(--v2-surface)',
              padding: 3,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: `0 2px 8px ${team.cfg.accentColor}26, inset 0 0 0 1.5px ${team.cfg.accentColor}33`,
              flexShrink: 0,
            }}
          >
            <Image
              src={`/teams/${team.cfg.badgeSlug}.svg`}
              alt={team.cfg.teamName}
              width={38}
              height={38}
              style={{ width: '100%', height: '100%', objectFit: 'contain' }}
              unoptimized
            />
          </Box>
          <Stack gap={2} style={{ minWidth: 0, flex: 1 }}>
            <Group gap={6} wrap="nowrap">
              <Text fz={14} fw={700} c="var(--v2-text)" truncate>
                {team.cfg.teamName}
              </Text>
              <Badge size="xs" variant="light" color={programColor}>
                {team.cfg.program}
              </Badge>
            </Group>
            <Text fz={11} c="var(--v2-text-muted)" truncate>
              {team.cfg.leadName} · {team.cfg.leadTitle}
              {!team.pending &&
                ` · ${team.spCount} SP${team.spCount === 1 ? '' : 's'} · ${team.clientCount.toLocaleString()} clients`}
              {team.pending && ' · pending assignments'}
            </Text>
          </Stack>
        </Group>
        {!team.pending ? (
          <Group gap="lg" wrap="nowrap" visibleFrom="sm">
            <Stack gap={0} align="flex-end">
              <Text fz={11} c="var(--v2-text-muted)" fw={600}>OVERDUE</Text>
              <Text fz={15} fw={700} c="#FF3B5C">{team.overdueCount}</Text>
            </Stack>
            <Stack gap={0} align="flex-end">
              <Text fz={11} c="var(--v2-text-muted)" fw={600}>DUE WK</Text>
              <Text fz={15} fw={700} c="#FFA940">{team.dueThisWeekCount}</Text>
            </Stack>
          </Group>
        ) : (
          <Text fz={11} c="var(--v2-text-muted)" fs="italic" visibleFrom="sm">
            no data yet
          </Text>
        )}
        <ChevronRight size={16} color="var(--v2-text-muted)" style={{ flexShrink: 0 }} />
      </Flex>
    </UnstyledButton>
  )
}

// ===========================================================================
// Shared section primitives — header strip + Paper shell. Every section uses
// the same chrome so the page reads as a coherent grid.
// ===========================================================================

function SectionPaper({
  eyebrow,
  title,
  rightSlot,
  heroSrc,
  children,
}: {
  eyebrow: string
  title: string
  rightSlot?: React.ReactNode
  heroSrc?: string
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
      {/* Decorative section-hero SVG anchored to the upper-right corner, low-opacity watermark */}
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
          <Stack gap={2}>
            <Text fz={13} fw={600} c="var(--v2-text-muted)" tt="uppercase" style={{ letterSpacing: '0.06em' }}>
              {eyebrow}
            </Text>
            <Title order={2} fz={18} fw={700} c="var(--v2-text)">
              {title}
            </Title>
          </Stack>
          {rightSlot}
        </Flex>
        {children}
      </Box>
    </Paper>
  )
}

// ===========================================================================
// TeamHealthSection — DonutChart of org status + per-team horizontal bars.
// Replaces the P1.2 placeholder. Uses real scopedSummary + derivedTeams.
// ===========================================================================

interface ScopedSummary {
  total_clients: number
  overdue_clients: number
  due_this_week_clients: number
  eligibility_ending_soon_clients: number
  no_contact_7_days_clients: number
}

function TeamHealthSection({
  scopedSummary,
  derivedTeams,
}: {
  scopedSummary: ScopedSummary
  derivedTeams: DerivedTeam[]
}) {
  // Status breakdown for the donut. "Healthy" is the remainder when we treat
  // overdue / due-week / no-contact as separate alert buckets. They can overlap
  // in reality, so this is a visual snapshot rather than a strict partition.
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

  // Per-team caseload bars. Show every team; pending teams render as muted.
  const maxCaseload = Math.max(1, ...derivedTeams.map((t) => t.clientCount))

  return (
    <SectionPaper
      eyebrow="P1.2"
      title="Team Health Snapshot"
      heroSrc="/heroes/evaluations.svg"
      rightSlot={
        <Badge size="sm" variant="light" color="emerald">
          live · {scopedSummary.total_clients} clients
        </Badge>
      }
    >
      <Grid gap="lg">
        {/* Donut + legend */}
        <Grid.Col span={{ base: 12, md: 5 }}>
          <Stack align="center" gap="md">
            <Box style={{ position: 'relative', width: 200, height: 200 }}>
              <DonutChart
                data={donutData.length > 0 ? donutData : [{ name: 'No data', value: 1, color: '#E5E7EB' }]}
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
                    <Text fz={12} c="var(--v2-text-muted)" fw={500}>
                      {row.name}
                    </Text>
                  </Group>
                  <Text fz={12} fw={700} c="var(--v2-text)">
                    {row.value.toLocaleString()}
                  </Text>
                </Group>
              ))}
            </Stack>
          </Stack>
        </Grid.Col>

        {/* Per-team horizontal bars */}
        <Grid.Col span={{ base: 12, md: 7 }}>
          <Text fz={12} fw={600} c="var(--v2-text-muted)" tt="uppercase" mb="sm" style={{ letterSpacing: '0.06em' }}>
            Caseload by Team
          </Text>
          <Stack gap={10}>
            {derivedTeams.map((team) => {
              const pct = team.pending ? 0 : (team.clientCount / maxCaseload) * 100
              return (
                <Group key={team.cfg.id} gap="sm" wrap="nowrap">
                  <Box style={{ width: 28, height: 28, flexShrink: 0 }}>
                    <Image
                      src={`/teams/${team.cfg.badgeSlug}.svg`}
                      alt={team.cfg.teamName}
                      width={28}
                      height={28}
                      style={{ width: '100%', height: '100%' }}
                      unoptimized
                    />
                  </Box>
                  <Stack gap={2} style={{ flex: 1, minWidth: 0 }}>
                    <Group justify="space-between" gap={6}>
                      <Text fz={12} fw={600} c="var(--v2-text)" truncate>
                        {team.cfg.teamName}
                      </Text>
                      <Text fz={11} fw={700} c={team.pending ? 'var(--v2-text-muted)' : 'var(--v2-text)'}>
                        {team.pending ? '—' : team.clientCount.toLocaleString()}
                      </Text>
                    </Group>
                    <Box
                      style={{
                        height: 8,
                        borderRadius: 4,
                        background: team.pending ? 'var(--v2-surface-tint)' : `${team.cfg.accentColor}15`,
                        overflow: 'hidden',
                        position: 'relative',
                      }}
                    >
                      {!team.pending && pct > 0 && (
                        <Box
                          style={{
                            position: 'absolute',
                            left: 0,
                            top: 0,
                            bottom: 0,
                            width: `${Math.max(2, pct)}%`,
                            background: `linear-gradient(90deg, ${team.cfg.accentColor} 0%, ${team.cfg.accentColor}cc 100%)`,
                            borderRadius: 4,
                          }}
                        />
                      )}
                    </Box>
                  </Stack>
                </Group>
              )
            })}
          </Stack>
        </Grid.Col>
      </Grid>
    </SectionPaper>
  )
}

// ===========================================================================
// ClientDrillDownSection — filter chips + fetched client list.
// Replaces the P1.3 placeholder. Fetches /api/clients on filter change with
// AbortController (preserves legacy behavior).
// ===========================================================================

type ClientFilter = 'all' | 'overdue' | 'due_this_week' | 'no_contact_7'

const CLIENT_FILTERS: { value: ClientFilter; label: string; color: string }[] = [
  { value: 'all', label: 'All', color: '#64748B' },
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
      eyebrow="P1.3"
      title="Client Drill-down"
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
      {clients.length === 0 ? (
        <Box
          py="xl"
          style={{
            textAlign: 'center',
            background: 'var(--v2-surface-tint)',
            borderRadius: 12,
            border: '1px dashed var(--v2-border-soft)',
          }}
        >
          <Box style={{ width: 96, height: 96, margin: '0 auto 12px' }}>
            <Image
              src="/heroes/empty-tickets.svg"
              alt=""
              width={96}
              height={96}
              style={{ width: '100%', height: '100%', objectFit: 'contain' }}
              unoptimized
            />
          </Box>
          <Text fz={14} fw={600} c="var(--v2-text)">
            {loading ? 'Loading clients…' : `No clients match "${filterMeta.label}"`}
          </Text>
          <Text fz={12} c="var(--v2-text-muted)" mt={4}>
            {loading ? 'Just a moment…' : 'Try a different filter or check back later.'}
          </Text>
        </Box>
      ) : (
        <Stack gap={8}>
          {clients.map((client) => {
            const planner = planners.find((p) => p.id === client.assigned_to)
            const fullName =
              [client.first_name, client.last_name].filter(Boolean).join(' ') || client.client_id
            return (
              <Link
                key={client.id}
                href={`/clients/${client.id}`}
                style={{ textDecoration: 'none' }}
              >
                <Box
                  style={{
                    padding: '12px 14px',
                    borderRadius: 10,
                    background: `${filterMeta.color}08`,
                    borderLeft: `3px solid ${filterMeta.color}`,
                    transition: 'background 0.15s',
                  }}
                >
                  <Flex justify="space-between" align="center" gap="md" wrap="nowrap">
                    <Group gap="sm" wrap="nowrap" style={{ flex: 1, minWidth: 0 }}>
                      <Avatar
                        size="sm"
                        radius="xl"
                        style={{ background: `${filterMeta.color}22`, color: filterMeta.color, fontSize: 11, fontWeight: 700 }}
                      >
                        {fullName
                          .split(' ')
                          .slice(0, 2)
                          .map((p) => p[0])
                          .join('')
                          .toUpperCase()}
                      </Avatar>
                      <Stack gap={2} style={{ minWidth: 0 }}>
                        <Text fz={13} fw={700} c="var(--v2-text)" truncate>
                          {fullName}
                        </Text>
                        <Text fz={11} c="var(--v2-text-muted)" truncate>
                          {planner?.full_name ?? 'Unassigned'} · {client.category?.toUpperCase() ?? '—'}
                        </Text>
                      </Stack>
                    </Group>
                    <Badge size="xs" variant="light" style={{ background: `${filterMeta.color}1A`, color: filterMeta.color }}>
                      {filterMeta.label}
                    </Badge>
                    <ChevronRight size={14} color="var(--v2-text-muted)" />
                  </Flex>
                </Box>
              </Link>
            )
          })}
        </Stack>
      )}
    </SectionPaper>
  )
}

// ===========================================================================
// PlannerWorkloadSection — per-planner cards in a Grid.
// Replaces the P1.4 placeholder (planners side). Uses real summaryByAssignee.
// Sorted by overdue desc so the most-pressured planners surface first.
// ===========================================================================

function PlannerWorkloadSection({
  planners,
  teamManagers,
  summaryByAssignee,
}: {
  planners: Profile[]
  teamManagers: Profile[]
  summaryByAssignee?: Record<string, AssigneeSummaryRow>
}) {
  const rows = useMemo(() => {
    return planners
      .map((planner) => {
        const tm = teamManagers.find((t) => t.id === planner.team_manager_id)
        const s = summaryByAssignee?.[planner.id]
        return {
          planner,
          tm,
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
  }, [planners, teamManagers, summaryByAssignee])

  const maxCaseload = Math.max(1, ...rows.map((r) => r.caseload))

  return (
    <SectionPaper
      eyebrow="P1.4"
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
          <Users size={32} color="var(--v2-text-muted)" style={{ margin: '0 auto 8px' }} />
          <Text fz={14} fw={600} c="var(--v2-text)">No Support Planners loaded</Text>
          <Text fz={12} c="var(--v2-text-muted)" mt={4}>Planners will appear here once they're added to the org.</Text>
        </Box>
      ) : (
        <Grid gap="md">
          {rows.map(({ planner, tm, caseload, overdue, dueWeek, quiet }) => {
            const initials = (planner.full_name ?? '?')
              .split(' ')
              .slice(0, 2)
              .map((p) => p[0])
              .join('')
              .toUpperCase()
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
                      <Text fz={13} fw={700} c="var(--v2-text)" truncate>
                        {planner.full_name ?? 'Unnamed'}
                      </Text>
                      <Text fz={11} c="var(--v2-text-muted)" truncate>
                        {tm ? `${tm.full_name} · TM` : 'Unassigned'}
                      </Text>
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
// TeamRosterSection — filter chips + roster cards.
// Replaces the P1.4 placeholder (roster side). Uses planners + teamManagers.
// ===========================================================================

type RosterFilter = 'all' | 'planners' | 'team_managers' | 'unassigned_planners'

const ROSTER_FILTERS: { value: RosterFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'team_managers', label: 'Team Managers' },
  { value: 'planners', label: 'Support Planners' },
  { value: 'unassigned_planners', label: 'Unassigned' },
]

function TeamRosterSection({
  planners,
  teamManagers,
}: {
  planners: Profile[]
  teamManagers: Profile[]
}) {
  const [rosterFilter, setRosterFilter] = useState<RosterFilter>('all')

  const filteredRows = useMemo(() => {
    if (rosterFilter === 'team_managers') {
      return teamManagers.map((p) => ({ profile: p, kind: 'tm' as const }))
    }
    if (rosterFilter === 'planners') {
      return planners.map((p) => ({ profile: p, kind: 'sp' as const }))
    }
    if (rosterFilter === 'unassigned_planners') {
      return planners
        .filter((p) => !p.team_manager_id)
        .map((p) => ({ profile: p, kind: 'sp' as const }))
    }
    return [
      ...teamManagers.map((p) => ({ profile: p, kind: 'tm' as const })),
      ...planners.map((p) => ({ profile: p, kind: 'sp' as const })),
    ]
  }, [planners, teamManagers, rosterFilter])

  return (
    <SectionPaper
      eyebrow="P1.4"
      title="Team Roster"
      heroSrc="/heroes/profile.svg"
      rightSlot={
        <Group gap={6} wrap="nowrap">
          <Badge size="sm" variant="light" color="cobalt">
            {teamManagers.length} TM{teamManagers.length === 1 ? '' : 's'}
          </Badge>
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
      {filteredRows.length === 0 ? (
        <Box py="xl" style={{ textAlign: 'center', background: 'var(--v2-surface-tint)', borderRadius: 12, border: '1px dashed var(--v2-border-soft)' }}>
          <Filter size={32} color="var(--v2-text-muted)" style={{ margin: '0 auto 8px' }} />
          <Text fz={14} fw={600} c="var(--v2-text)">No one in this slice</Text>
          <Text fz={12} c="var(--v2-text-muted)" mt={4}>Try a different filter.</Text>
        </Box>
      ) : (
        <Grid gap="sm">
          {filteredRows.map(({ profile, kind }) => {
            const initials = (profile.full_name ?? '?')
              .split(' ')
              .slice(0, 2)
              .map((p) => p[0])
              .join('')
              .toUpperCase()
            const isTM = kind === 'tm'
            const accent = isTM ? '#1E7CFF' : '#10B981'
            const label = isTM ? 'Team Manager' : 'Support Planner'
            return (
              <Grid.Col key={profile.id} span={{ base: 12, sm: 6, md: 4, lg: 3 }}>
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
                      {profile.full_name ?? 'Unnamed'}
                    </Text>
                    <Text fz={10} c="var(--v2-text-muted)" truncate>
                      {label}
                    </Text>
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

export default function SupervisorControlPanelClient(props: Props) {
  return (
    <CaseSyncV2MantineProvider>
      <SupervisorControlPanelInner {...props} />
    </CaseSyncV2MantineProvider>
  )
}

function SupervisorControlPanelInner({
  planners,
  teamManagers,
  summaryByAssignee,
  globalSummary,
  profile,
}: Props) {
  // ----- Scoped summary: sum per-assignee rows, fall back to global -----
  // (Behavior preserved verbatim from the legacy 940-line component.)
  const scopedSummary = useMemo(() => {
    const rows = Object.values(summaryByAssignee ?? {})
    if (rows.length === 0) {
      return (
        globalSummary ?? {
          total_clients: 0,
          overdue_clients: 0,
          due_this_week_clients: 0,
          eligibility_ending_soon_clients: 0,
          no_contact_7_days_clients: 0,
        }
      )
    }
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
  }, [summaryByAssignee, globalSummary])

  // ----- Derive 10 team rows from the static registry + live data -----
  const derivedTeams: DerivedTeam[] = useMemo(() => {
    return TEAMS.map((cfg) => {
      if (cfg.memberSource === 'team_manager_id' && cfg.leadFullName) {
        const tm = teamManagers.find((t) => t.full_name === cfg.leadFullName)
        if (!tm) {
          // Lead not yet in profiles — render as pending.
          return {
            cfg,
            spCount: 0,
            clientCount: 0,
            overdueCount: 0,
            dueThisWeekCount: 0,
            noContact7Count: 0,
            pending: true,
          }
        }
        const teamPlanners = planners.filter((p) => p.team_manager_id === tm.id)
        const agg = teamPlanners.reduce(
          (acc, p) => {
            const s = summaryByAssignee?.[p.id]
            return {
              clientCount: acc.clientCount + (s?.total_clients ?? 0),
              overdueCount: acc.overdueCount + (s?.overdue_clients ?? 0),
              dueThisWeekCount: acc.dueThisWeekCount + (s?.due_this_week_clients ?? 0),
              noContact7Count: acc.noContact7Count + (s?.no_contact_7_days_clients ?? 0),
            }
          },
          { clientCount: 0, overdueCount: 0, dueThisWeekCount: 0, noContact7Count: 0 },
        )
        return {
          cfg,
          spCount: teamPlanners.length,
          ...agg,
          pending: false,
        }
      }
      return {
        cfg,
        spCount: 0,
        clientCount: 0,
        overdueCount: 0,
        dueThisWeekCount: 0,
        noContact7Count: 0,
        pending: true,
      }
    })
  }, [planners, teamManagers, summaryByAssignee])

  const activeTeamCount = derivedTeams.filter((t) => !t.pending).length
  const pendingTeamCount = derivedTeams.length - activeTeamCount

  // ----- Greeting -----
  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening'
  const firstName = profile?.full_name?.split(' ')[0] ?? 'there'
  const dateLabel = new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  })

  return (
    <Box
      style={{
        background:
          'var(--v2-canvas)',
        margin: '-24px',
        padding: '24px',
        width: 'calc(100% + 48px)',
        minHeight: 'calc(100dvh - 100px)',
      }}
    >
      <Container size={1280} px={0} pb={80}>
      {/* ─────────── Greeting block ─────────── */}
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
            <Text
              fz={13}
              fw={600}
              c="var(--v2-text-muted)"
              tt="uppercase"
              style={{ letterSpacing: '0.06em' }}
            >
              {dateLabel}
            </Text>
            <Title order={1} fz={28} fw={800} c="var(--v2-text)" style={{ letterSpacing: '-0.02em' }}>
              {greeting}, {firstName}
            </Title>
            <Text fz={14} c="var(--v2-text-muted)">
              {scopedSummary.total_clients.toLocaleString()} active clients across {derivedTeams.length} teams
              {activeTeamCount > 0 && ` · ${activeTeamCount} with live data`}.
            </Text>
          </Stack>
          <Box visibleFrom="sm" style={{ flexShrink: 0 }}>
            <Image
              src="/heroes/schedule.svg"
              alt=""
              width={200}
              height={120}
              priority
              unoptimized
            />
          </Box>
        </Flex>
      </Paper>

      {/* ─────────── KPI tiles ─────────── */}
      <Grid gap="md" mb="lg">
        <Grid.Col span={{ base: 12, sm: 6, md: 3 }}>
          <KpiTile
            label="Active Clients"
            value={scopedSummary.total_clients}
            subtitle={`across ${derivedTeams.length} teams`}
            icon={<Users size={20} color="#fff" />}
            gradient="linear-gradient(135deg, #1E7CFF 0%, #2D8BFF 50%, #1A6FEB 100%)"
            shadowColor="rgba(30,124,255,0.35)"
          />
        </Grid.Col>
        <Grid.Col span={{ base: 12, sm: 6, md: 3 }}>
          <KpiTile
            label="Overdue"
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
            value={scopedSummary.due_this_week_clients}
            subtitle="in next 7 days"
            icon={<Clock size={20} color="#fff" />}
            gradient="linear-gradient(135deg, #FFA940 0%, #FFB860 50%, #F59E0B 100%)"
            shadowColor="rgba(255,169,64,0.35)"
          />
        </Grid.Col>
        <Grid.Col span={{ base: 12, sm: 6, md: 3 }}>
          <KpiTile
            label="No Contact 7+ Days"
            value={scopedSummary.no_contact_7_days_clients}
            subtitle="in last 7 days"
            icon={<PhoneOff size={20} color="#fff" />}
            gradient="linear-gradient(135deg, #10B981 0%, #1AC78A 50%, #059669 100%)"
            shadowColor="rgba(16,185,129,0.35)"
          />
        </Grid.Col>
      </Grid>

      {/* ─────────── Team Overview ─────────── */}
      <Paper
        p="lg"
        mb="lg"
        style={{
          background: 'var(--v2-surface)',
          border: '1px solid var(--v2-border-soft)',
          boxShadow: '0 1px 2px rgba(15,23,42,0.04), 0 2px 6px rgba(15,23,42,0.04)',
        }}
      >
        <Flex justify="space-between" align="flex-start" mb="md" gap="md" wrap="wrap">
          <Stack gap={2}>
            <Text
              fz={13}
              fw={600}
              c="var(--v2-text-muted)"
              tt="uppercase"
              style={{ letterSpacing: '0.06em' }}
            >
              Org Overview
            </Text>
            <Title order={2} fz={18} fw={700} c="var(--v2-text)">
              Team Overview · {derivedTeams.length} teams
            </Title>
          </Stack>
          <Group gap={6} visibleFrom="sm">
            <Badge size="sm" variant="light" color="cobalt">
              {activeTeamCount} active
            </Badge>
            <Badge size="sm" variant="light" color="mauve">
              {pendingTeamCount} pending
            </Badge>
          </Group>
        </Flex>
        <Stack gap={8}>
          {derivedTeams.map((team) => (
            <TeamRow key={team.cfg.id} team={team} />
          ))}
        </Stack>
      </Paper>

      {/* ─────────── Section placeholders for P1.2–P1.5 ─────────── */}
        <Stack gap="lg">
          <TeamHealthSection scopedSummary={scopedSummary} derivedTeams={derivedTeams} />
          <ClientDrillDownSection planners={planners} />
          <PlannerWorkloadSection
            planners={planners}
            teamManagers={teamManagers}
            summaryByAssignee={summaryByAssignee}
          />
          <TeamRosterSection planners={planners} teamManagers={teamManagers} />
        </Stack>
      </Container>
    </Box>
  )
}
