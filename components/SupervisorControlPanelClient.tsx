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
} from '@mantine/core'
import { DonutChart } from '@mantine/charts'
import {
  AlertTriangle,
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
            width: 68,
            height: 68,
            borderRadius: 18,
            background: 'rgba(255,255,255,0.92)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
            boxShadow: '0 6px 18px rgba(15,23,42,0.18)',
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
// TeamRosterTable — command-roster layout for the Team Overview section.
// One dense row per team: emblem + name + program badge · lead · SPs ·
// Clients · Overdue · Due wk · Status. Pending teams show em-dashes + an
// amber "pending" chip; active teams show numbers from summaryByAssignee.
// Theme-aware via --v2-* variables (works in light and dark).
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

function TeamRosterTable({ teams }: { teams: DerivedTeam[] }) {
  return (
    <div className="tov-wrap">
      <table className="tov-roster">
        <thead>
          <tr>
            <th>Team</th>
            <th>Lead</th>
            <th className="tov-num">SPs</th>
            <th className="tov-num">Clients</th>
            <th className="tov-num">Overdue</th>
            <th className="tov-num">Due wk</th>
            <th className="tov-status">Status</th>
          </tr>
        </thead>
        <tbody>
          {teams.map((team) => {
            const programColor =
              team.cfg.program === 'CFC' ? 'cobalt' : team.cfg.program === 'DDA' ? 'amber' : 'mauve'
            return (
              <tr key={team.cfg.id}>
                <td>
                  <span className="tov-team">
                    <span
                      className="tov-emb"
                      style={{ boxShadow: `inset 0 0 0 1.5px ${team.cfg.accentColor}55, 0 1px 4px ${team.cfg.accentColor}22` }}
                    >
                      <Image
                        src={`/teams/${team.cfg.badgeSlug}.svg`}
                        alt={team.cfg.teamName}
                        width={26}
                        height={26}
                        style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                        unoptimized
                      />
                    </span>
                    <Text component="span" fz={13} fw={700} c="var(--v2-text)" style={{ whiteSpace: 'nowrap' }}>
                      {team.cfg.teamName}
                    </Text>
                    <Badge size="xs" variant="light" color={programColor}>
                      {team.cfg.program}
                    </Badge>
                  </span>
                </td>
                <td>
                  <Text component="span" fz={12.5} c="var(--v2-text)" style={{ display: 'block', lineHeight: 1.25 }}>
                    {team.cfg.leadName}
                  </Text>
                  <Text component="span" fz={10.5} c="var(--v2-text-muted)" style={{ display: 'block' }}>
                    {team.cfg.leadTitle}
                  </Text>
                </td>
                {team.pending ? (
                  <>
                    <td className="tov-num"><span className="tov-dash">&mdash;</span></td>
                    <td className="tov-num"><span className="tov-dash">&mdash;</span></td>
                    <td className="tov-num"><span className="tov-dash">&mdash;</span></td>
                    <td className="tov-num"><span className="tov-dash">&mdash;</span></td>
                    <td className="tov-status">
                      <Badge size="xs" variant="light" color="amber">pending</Badge>
                    </td>
                  </>
                ) : (
                  <>
                    <td className="tov-num">
                      <Text component="span" fz={13} fw={700} c="var(--v2-text)">{team.spCount}</Text>
                    </td>
                    <td className="tov-num">
                      <Text component="span" fz={13} fw={700} c="var(--v2-text)">{team.clientCount.toLocaleString()}</Text>
                    </td>
                    <td className="tov-num">
                      {team.overdueCount > 0 ? (
                        <Text component="span" fz={13} fw={750} c="#FF3B5C">{team.overdueCount}</Text>
                      ) : (
                        <span className="tov-dash">0</span>
                      )}
                    </td>
                    <td className="tov-num">
                      {team.dueThisWeekCount > 0 ? (
                        <Text component="span" fz={13} fw={750} c="#FFA940">{team.dueThisWeekCount}</Text>
                      ) : (
                        <span className="tov-dash">0</span>
                      )}
                    </td>
                    <td className="tov-status">
                      <Badge size="xs" variant="light" color="cobalt">active</Badge>
                    </td>
                  </>
                )}
              </tr>
            )
          })}
        </tbody>
      </table>
      <style>{`
        .tov-wrap { overflow-x: auto; }
        .tov-roster { width: 100%; border-collapse: collapse; }
        .tov-roster th {
          text-align: left;
          font-size: 10px; font-weight: 700;
          letter-spacing: 0.06em; text-transform: uppercase;
          color: var(--v2-text-muted);
          padding: 6px 10px;
          border-bottom: 1px solid var(--v2-border-soft);
          white-space: nowrap;
        }
        .tov-roster td {
          padding: 9px 10px;
          border-bottom: 1px solid var(--v2-border-soft);
          vertical-align: middle;
        }
        .tov-roster tbody tr:last-child td { border-bottom: 0; }
        .tov-roster tbody tr { transition: background 120ms ease; }
        .tov-roster tbody tr:hover td { background: var(--v2-surface-tint); }
        .tov-roster th.tov-num, .tov-roster td.tov-num { text-align: right; }
        .tov-roster th.tov-status, .tov-roster td.tov-status { text-align: right; white-space: nowrap; }
        .tov-team { display: inline-flex; align-items: center; gap: 9px; }
        .tov-emb {
          width: 30px; height: 30px; flex: 0 0 auto;
          border-radius: 8px; padding: 2px;
          background: var(--v2-surface);
          display: inline-flex; align-items: center; justify-content: center;
        }
        .tov-dash { color: var(--v2-text-muted); opacity: 0.55; font-size: 13px; }
      `}</style>
    </div>
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
  // Attention flags. These are OVERLAPPING alerts (one client can be overdue
  // AND un-contacted), so we deliberately do NOT render them as a donut, which
  // would imply a partition and double-count (pre-launch review finding #2).
  // Each flag is an independent count out of total_clients.
  const total = Math.max(1, scopedSummary.total_clients)
  const flagData = [
    { name: 'Overdue', value: scopedSummary.overdue_clients, color: '#FF3B5C' },
    { name: 'Due This Week', value: scopedSummary.due_this_week_clients, color: '#FFA940' },
    { name: 'No Contact 7+', value: scopedSummary.no_contact_7_days_clients, color: '#1E7CFF' },
  ]
  const healthy = Math.max(0, scopedSummary.total_clients - Math.max(...flagData.map(f => f.value)))
  const donutData = flagData.filter((d) => d.value > 0)

  // Per-team caseload bars. Show every team; pending teams render as muted.
  const maxCaseload = Math.max(1, ...derivedTeams.map((t) => t.clientCount))

  return (
    <SectionPaper
      eyebrow="Org Health"
      title="Team Health Snapshot"
      anim={ANIM.gChart}
      heroSrc="/heroes/evaluations.svg"
      rightSlot={
        <Badge size="sm" variant="light" color="emerald">
          live · {scopedSummary.total_clients} clients
        </Badge>
      }
    >
      <Grid gap="lg">
        {/* Attention flags — independent, overlapping alerts (NOT a partition).
            Replaces the donut, which double-counted overlapping flags
            (pre-launch review, launch blocker #1/#2). */}
        <Grid.Col span={{ base: 12, md: 5 }}>
          <Stack gap="md">
            <Group gap={10} align="baseline">
              <Text fz={30} fw={800} c="var(--v2-text)" lh={1}>
                {scopedSummary.total_clients.toLocaleString()}
              </Text>
              <Text fz={12} c="var(--v2-text-muted)" fw={600} tt="uppercase" style={{ letterSpacing: '0.06em' }}>
                active clients
              </Text>
            </Group>
            <Stack gap={10} w="100%">
              {[
                { name: 'Overdue', value: scopedSummary.overdue_clients, color: '#FF3B5C' },
                { name: 'Due This Week', value: scopedSummary.due_this_week_clients, color: '#FFA940' },
                { name: 'No Contact 7+', value: scopedSummary.no_contact_7_days_clients, color: '#1E7CFF' },
                { name: 'Healthy (no flags)', value: healthy, color: '#10B981' },
              ].map((row) => (
                <Stack key={row.name} gap={3}>
                  <Group gap={8} wrap="nowrap" justify="space-between">
                    <Group gap={8} wrap="nowrap">
                      <Box style={{ width: 10, height: 10, borderRadius: 3, background: row.color }} />
                      <Text fz={12} c="var(--v2-text-muted)" fw={500}>{row.name}</Text>
                    </Group>
                    <Text fz={12} fw={700} c="var(--v2-text)">
                      {row.value.toLocaleString()} / {scopedSummary.total_clients.toLocaleString()}
                    </Text>
                  </Group>
                  <Box style={{ height: 7, borderRadius: 4, background: 'var(--v2-border-soft)', overflow: 'hidden' }}>
                    <Box style={{ height: '100%', width: `${Math.min(100, Math.round((row.value / total) * 100))}%`, background: row.color, borderRadius: 4 }} />
                  </Box>
                </Stack>
              ))}
              <Text fz={10.5} c="var(--v2-text-muted)">
                Flags are independent — a client can appear in more than one.
              </Text>
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
                        background: team.pending ? 'var(--v2-surface-tint)' : `${team.cfg.accentColor}2E`,
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
                            background: `${team.cfg.accentColor}`,
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
      eyebrow="Clients"
      title="Client Drill-down"
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
          searchActive={false}
          emptyTitle={`No clients match "${filterMeta.label}"`}
          emptyDescription="Try a different filter or check back later."
        />
      </div>
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
      eyebrow="Workload"
      title="Planner Workload"
      anim={ANIM.gActive}
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
      eyebrow="Roster"
      title="Team Roster"
      anim={ANIM.gProfile}
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
          <Box visibleFrom="sm" style={{ flexShrink: 0, filter: 'drop-shadow(0 14px 34px rgba(15,23,42,0.25))' }}>
            <LottieBlock src={ANIM.gHeroScene} width={320} height={230} trigger="loop" label="Care team illustration" />
          </Box>
        </Flex>
      </Paper>

      {/* ─────────── KPI tiles ─────────── */}
      <Grid gap="md" mb="lg">
        <Grid.Col span={{ base: 12, sm: 6, md: 3 }}>
          <KpiTile
            label="Active Clients"
            href="/team?filter=all"
            value={scopedSummary.total_clients}
            subtitle={`across ${derivedTeams.length} teams`}
            icon={<LottieBlock src={ANIM.gActive} size={56} trigger="loop" />}
            gradient="linear-gradient(135deg, #1663CC 0%, #1E7CFF 45%, #114FB0 100%)"
            shadowColor="rgba(30,124,255,0.35)"
          />
        </Grid.Col>
        <Grid.Col span={{ base: 12, sm: 6, md: 3 }}>
          <KpiTile
            label="Overdue"
            href="/team?filter=overdue"
            value={scopedSummary.overdue_clients}
            subtitle="needs follow-up"
            icon={<LottieBlock src={ANIM.gOverdue} size={56} trigger="loop" />}
            gradient="linear-gradient(135deg, #D91E42 0%, #E63350 45%, #B01633 100%)"
            shadowColor="rgba(255,59,92,0.35)"
          />
        </Grid.Col>
        <Grid.Col span={{ base: 12, sm: 6, md: 3 }}>
          <KpiTile
            label="Due This Week"
            href="/team?filter=due_this_week"
            value={scopedSummary.due_this_week_clients}
            subtitle="in next 7 days"
            icon={<LottieBlock src={ANIM.gDueWeek} size={56} trigger="loop" />}
            gradient="linear-gradient(135deg, #C77414 0%, #D97F0E 45%, #A85E08 100%)"
            shadowColor="rgba(255,169,64,0.35)"
          />
        </Grid.Col>
        <Grid.Col span={{ base: 12, sm: 6, md: 3 }}>
          <KpiTile
            label="No Contact 7+ Days"
            href="/team?filter=no_contact_7"
            value={scopedSummary.no_contact_7_days_clients}
            subtitle="in last 7 days"
            icon={<LottieBlock src={ANIM.gNoContact} size={56} trigger="loop" />}
            gradient="linear-gradient(135deg, #0B8A60 0%, #0EA372 45%, #04724F 100%)"
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
            <Title order={2} fz={18} fw={700} c="var(--v2-text)" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <LottieBlock src={ANIM.heroSupervisor} size={30} trigger="mount" />
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
        <TeamRosterTable teams={derivedTeams} />
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
