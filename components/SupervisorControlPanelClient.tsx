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

import { useMemo } from 'react'
import Image from 'next/image'
import {
  Badge,
  Box,
  Container,
  Flex,
  Grid,
  Group,
  Paper,
  Stack,
  Text,
  Title,
  UnstyledButton,
} from '@mantine/core'
import {
  AlertTriangle,
  ChevronRight,
  Clock,
  Loader2,
  PhoneOff,
  Users,
} from 'lucide-react'
import { Profile } from '@/lib/types'
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
}

function KpiTile({ label, value, icon, gradient, shadowColor }: KpiTileProps) {
  return (
    <Paper
      p="lg"
      style={{
        background: gradient,
        boxShadow: `0 10px 30px -10px ${shadowColor}, 0 4px 12px rgba(15,23,42,0.06)`,
        color: '#fff',
        overflow: 'hidden',
        position: 'relative',
        minHeight: 130,
      }}
    >
      <Group justify="space-between" align="flex-start" wrap="nowrap">
        <Stack gap={4} style={{ flex: 1, minWidth: 0 }}>
          <Text
            fz={12}
            fw={600}
            c="rgba(255,255,255,0.85)"
            style={{ letterSpacing: '0.06em', textTransform: 'uppercase' }}
          >
            {label}
          </Text>
          <Text fz={32} fw={800} lh={1.1} c="#fff">
            {value.toLocaleString()}
          </Text>
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
        background: '#FAFBFC',
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
              background: '#FFFFFF',
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
              <Text fz={14} fw={700} c="#0F172A" truncate>
                {team.cfg.teamName}
              </Text>
              <Badge size="xs" variant="light" color={programColor}>
                {team.cfg.program}
              </Badge>
            </Group>
            <Text fz={11} c="#64748B" truncate>
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
              <Text fz={11} c="#64748B" fw={600}>OVERDUE</Text>
              <Text fz={15} fw={700} c="#FF3B5C">{team.overdueCount}</Text>
            </Stack>
            <Stack gap={0} align="flex-end">
              <Text fz={11} c="#64748B" fw={600}>DUE WK</Text>
              <Text fz={15} fw={700} c="#FFA940">{team.dueThisWeekCount}</Text>
            </Stack>
          </Group>
        ) : (
          <Text fz={11} c="#94A3B8" fs="italic" visibleFrom="sm">
            no data yet
          </Text>
        )}
        <ChevronRight size={16} color="#94A3B8" style={{ flexShrink: 0 }} />
      </Flex>
    </UnstyledButton>
  )
}

// ===========================================================================
// LoadingSection — placeholder for sections deferred to P1.2-P1.5. Renders
// shimmer-style bars so the page has visual rhythm before the real content
// lands.
// ===========================================================================

function LoadingSection({ title, lines = 3, hint }: { title: string; lines?: number; hint?: string }) {
  return (
    <Paper
      p="lg"
      style={{
        background: '#FFFFFF',
        border: '1px solid #E5E7EB',
        boxShadow: '0 1px 2px rgba(15,23,42,0.04), 0 2px 6px rgba(15,23,42,0.04)',
      }}
    >
      <Group gap="xs" mb="md" wrap="nowrap">
        <Loader2 size={14} color="#94A3B8" />
        <Text
          fz={13}
          fw={700}
          c="#64748B"
          tt="uppercase"
          style={{ letterSpacing: '0.06em' }}
        >
          {title}
        </Text>
        <Text fz={11} c="#94A3B8">
          {hint ?? 'loading…'}
        </Text>
      </Group>
      <Stack gap={8}>
        {Array.from({ length: lines }).map((_, i) => (
          <Box
            key={i}
            style={{
              height: 14,
              borderRadius: 6,
              background: '#F1F5F9',
              width: `${100 - i * 12}%`,
            }}
          />
        ))}
      </Stack>
    </Paper>
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
    <Container size={1280} px={0} pb={80}>
      {/* ─────────── Greeting block ─────────── */}
      <Paper
        p="xl"
        mb="lg"
        style={{
          background: 'linear-gradient(135deg, #EFF6FF 0%, #FFFFFF 60%)',
          border: '1px solid #E5E7EB',
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
              c="#64748B"
              tt="uppercase"
              style={{ letterSpacing: '0.06em' }}
            >
              {dateLabel}
            </Text>
            <Title order={1} fz={28} fw={800} c="#0F172A" style={{ letterSpacing: '-0.02em' }}>
              {greeting}, {firstName}
            </Title>
            <Text fz={14} c="#64748B">
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
      <Grid gutter="md" mb="lg">
        <Grid.Col span={{ base: 12, sm: 6, md: 3 }}>
          <KpiTile
            label="Active Clients"
            value={scopedSummary.total_clients}
            icon={<Users size={20} color="#fff" />}
            gradient="linear-gradient(135deg, #1E7CFF 0%, #2D8BFF 50%, #1A6FEB 100%)"
            shadowColor="rgba(30,124,255,0.35)"
          />
        </Grid.Col>
        <Grid.Col span={{ base: 12, sm: 6, md: 3 }}>
          <KpiTile
            label="Overdue"
            value={scopedSummary.overdue_clients}
            icon={<AlertTriangle size={20} color="#fff" />}
            gradient="linear-gradient(135deg, #FF3B5C 0%, #FF5573 50%, #E63350 100%)"
            shadowColor="rgba(255,59,92,0.35)"
          />
        </Grid.Col>
        <Grid.Col span={{ base: 12, sm: 6, md: 3 }}>
          <KpiTile
            label="Due This Week"
            value={scopedSummary.due_this_week_clients}
            icon={<Clock size={20} color="#fff" />}
            gradient="linear-gradient(135deg, #FFA940 0%, #FFB860 50%, #F59E0B 100%)"
            shadowColor="rgba(255,169,64,0.35)"
          />
        </Grid.Col>
        <Grid.Col span={{ base: 12, sm: 6, md: 3 }}>
          <KpiTile
            label="No Contact 7+ Days"
            value={scopedSummary.no_contact_7_days_clients}
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
          background: '#FFFFFF',
          border: '1px solid #E5E7EB',
          boxShadow: '0 1px 2px rgba(15,23,42,0.04), 0 2px 6px rgba(15,23,42,0.04)',
        }}
      >
        <Flex justify="space-between" align="flex-start" mb="md" gap="md" wrap="wrap">
          <Stack gap={2}>
            <Text
              fz={13}
              fw={600}
              c="#64748B"
              tt="uppercase"
              style={{ letterSpacing: '0.06em' }}
            >
              Org Overview
            </Text>
            <Title order={2} fz={18} fw={700} c="#0F172A">
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
        <LoadingSection title="Team Health" lines={4} hint="bar chart · P1.2" />
        <LoadingSection title="Client Drill-down" lines={5} hint="filtered list · P1.3" />
        <LoadingSection title="Planner Workload" lines={4} hint="per-planner cards · P1.4" />
        <LoadingSection title="Team Roster" lines={3} hint="filter chips + cards · P1.4" />
      </Stack>
    </Container>
  )
}
