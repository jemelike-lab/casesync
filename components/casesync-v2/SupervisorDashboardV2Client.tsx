'use client';

import {
  Anchor,
  Avatar,
  Badge,
  Box,
  Container,
  Flex,
  Grid,
  Group,
  Paper,
  Progress,
  Stack,
  Text,
  TextInput,
  Title,
  UnstyledButton,
} from '@mantine/core';
import { LineChart } from '@mantine/charts';
import {
  Search,
  Bell,
  Mail,
  Users,
  AlertTriangle,
  Clock,
  PhoneOff,
  TrendingUp,
  TrendingDown,
  ChevronRight,
  CalendarDays,
  FileWarning,
  Moon,
  HelpCircle,
  LogOut,
} from 'lucide-react';
import type {
  TeamSummary,
  OrgKpis,
  TrendPoint,
  AttentionItem,
  TeamToolCard,
  NavLink,
} from '@/lib/casesync-v2/mock-data';
import { issueLabels, teamTools, navLinks } from '@/lib/casesync-v2/mock-data';

// CaseSync v2 — Supervisor dashboard, program-supervisor (Gabriela) view.
// Layout: app nav row, cobalt floating topbar, greeting, KPI tiles, trend
// chart, team overview, then a 2-column row with Attention Feed (left, stacked)
// and Team Tools (right, stacked action cards) — mirrors the existing site's
// stacked-card pattern with v2 visual language.

interface ViewerProfile {
  fullName: string;
  initials: string;
  role: string;
}

interface Props {
  viewer: ViewerProfile;
  orgKpis: OrgKpis;
  teams: TeamSummary[];
  trendData: TrendPoint[];
  attentionItems: AttentionItem[];
}

// ===== App nav row =====
// Plain horizontal tab row above the cobalt topbar. Matches the existing
// site's nav exactly: Dashboard / Team / Supervisor (active) / Calendar /
// Admin / Audit Log / Settings, plus right-side help button, theme toggle,
// bell, user pill, sign out. Theme toggle and sign out are visual stubs at
// this stage — wiring is a separate pass.

function AppNavRow({ viewer }: { viewer: ViewerProfile }) {
  const activePath = '/dashboard-v2'; // this page; no nav link matches yet
  return (
    <Box
      style={{
        background: '#FFFFFF',
        borderBottom: '1px solid #E5E7EB',
        padding: '8px 20px',
      }}
    >
      <Flex align="center" justify="space-between" gap="md" wrap="nowrap">
        <Group gap={4} wrap="nowrap" style={{ flex: 1, minWidth: 0, overflowX: 'auto' }}>
          {navLinks.map((link: NavLink) => {
            const isActive = link.href === activePath;
            return (
              <Anchor
                key={link.href}
                href={link.href}
                underline="never"
                style={{
                  padding: '8px 14px',
                  borderRadius: 8,
                  fontSize: 13,
                  fontWeight: 600,
                  color: isActive ? '#0F172A' : '#475569',
                  background: isActive ? '#F1F5F9' : 'transparent',
                  whiteSpace: 'nowrap',
                  flexShrink: 0,
                  transition: 'background 0.15s',
                }}
              >
                {link.label}
              </Anchor>
            );
          })}
        </Group>
        <Group gap={4} wrap="nowrap" style={{ flexShrink: 0 }}>
          <UnstyledButton
            aria-label="Help and tour"
            style={{
              padding: '6px 10px',
              borderRadius: 8,
              fontSize: 12,
              fontWeight: 600,
              color: '#475569',
              border: '1px solid #E5E7EB',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              position: 'relative',
              flexShrink: 0,
            }}
          >
            <Box
              style={{
                position: 'absolute',
                top: 4,
                left: 6,
                width: 6,
                height: 6,
                borderRadius: 3,
                background: '#FF3B5C',
              }}
            />
            <HelpCircle size={14} />
            <Text fz={12} fw={600} visibleFrom="xl">
              Help &amp; Tour
            </Text>
          </UnstyledButton>
          <UnstyledButton
            aria-label="Toggle theme"
            style={{ padding: 8, borderRadius: 8, color: '#475569' }}
          >
            <Moon size={16} />
          </UnstyledButton>
          <UnstyledButton
            aria-label="Notifications"
            style={{ padding: 8, borderRadius: 8, color: '#475569', position: 'relative' }}
          >
            <Bell size={16} />
            <Box
              style={{
                position: 'absolute',
                top: 6,
                right: 6,
                width: 7,
                height: 7,
                borderRadius: 4,
                background: '#FF3B5C',
                border: '1.5px solid #FFFFFF',
              }}
            />
          </UnstyledButton>
          <Group gap={6} wrap="nowrap" ml="xs" visibleFrom="md">
            <Avatar
              radius="xl"
              size="xs"
              style={{ background: '#1E7CFF', color: '#fff', fontWeight: 700, fontSize: 10 }}
            >
              {viewer.initials}
            </Avatar>
            <Stack gap={0}>
              <Text fz={12} fw={600} c="#0F172A" lh={1.2}>
                {viewer.fullName.split(' ')[0]} {viewer.fullName.split(' ')[1]?.[0] ?? ''}
              </Text>
              <Text fz={9} c="#94A3B8" lh={1.2} style={{ letterSpacing: '0.08em' }}>
                {viewer.role.toUpperCase()}
              </Text>
            </Stack>
          </Group>
          <UnstyledButton
            aria-label="Sign out"
            style={{
              padding: '6px 10px',
              borderRadius: 8,
              fontSize: 12,
              fontWeight: 600,
              color: '#475569',
              border: '1px solid #E5E7EB',
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              flexShrink: 0,
            }}
          >
            <LogOut size={14} />
            <Text fz={12} fw={600} visibleFrom="xl">
              Sign out
            </Text>
          </UnstyledButton>
        </Group>
      </Flex>
    </Box>
  );
}

// ===== Cobalt topbar =====
// Search + bell + mail + profile chip. Kept from the prior iteration since
// Josh signed off on the visual.

function TopBar({ viewer }: { viewer: ViewerProfile }) {
  return (
    <Box
      style={{
        position: 'sticky',
        top: 12,
        zIndex: 100,
        margin: '12px 16px 24px',
        borderRadius: 18,
        overflow: 'hidden',
        background:
          'linear-gradient(135deg, #1E7CFF 0%, #2D8BFF 50%, #1A6FEB 100%)',
        boxShadow:
          '0 10px 30px -10px rgba(30,124,255,0.4), 0 4px 12px rgba(30,124,255,0.15)',
      }}
    >
      <Flex align="center" justify="space-between" px="lg" py="sm" gap="md">
        <Group gap="sm" wrap="nowrap">
          <Box
            style={{
              width: 36,
              height: 36,
              borderRadius: 10,
              background: 'rgba(255,255,255,0.18)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 18,
              fontWeight: 800,
              color: '#fff',
              letterSpacing: '-0.02em',
            }}
          >
            CS
          </Box>
          <Text visibleFrom="sm" c="white" fw={700} fz="lg" style={{ letterSpacing: '-0.01em' }}>
            CaseSync
          </Text>
        </Group>

        <Box style={{ flex: 1, maxWidth: 520 }}>
          <TextInput
            placeholder="Search clients, SPs, audits..."
            leftSection={<Search size={16} />}
            radius="xl"
            size="sm"
            styles={{
              input: {
                background: 'rgba(255,255,255,0.95)',
                border: 'none',
                fontSize: 14,
              },
            }}
          />
        </Box>

        <Group gap="md" wrap="nowrap">
          <UnstyledButton aria-label="Notifications" style={{ color: '#fff', position: 'relative' }}>
            <Bell size={20} />
            <Box
              style={{
                position: 'absolute',
                top: -2,
                right: -2,
                width: 8,
                height: 8,
                borderRadius: 4,
                background: '#FF3B5C',
                border: '1.5px solid #1E7CFF',
              }}
            />
          </UnstyledButton>
          <UnstyledButton aria-label="Messages" style={{ color: '#fff' }}>
            <Mail size={20} />
          </UnstyledButton>
          <Group gap="xs" wrap="nowrap">
            <Avatar radius="xl" size="sm" style={{ background: '#fff', color: '#1E7CFF', fontWeight: 700 }}>
              {viewer.initials}
            </Avatar>
            <Stack gap={0} visibleFrom="md">
              <Text c="white" fz="sm" fw={600} lh={1.2}>
                {viewer.fullName}
              </Text>
              <Text c="rgba(255,255,255,0.75)" fz={11} lh={1.2}>
                {viewer.role}
              </Text>
            </Stack>
          </Group>
        </Group>
      </Flex>
    </Box>
  );
}

// ===== KPI Tile =====

interface KpiTileProps {
  label: string;
  value: number;
  deltaPct: number;
  deltaInverted?: boolean;
  icon: React.ReactNode;
  gradient: string;
  shadowColor: string;
  subtitle?: string;
}

function KpiTile({
  label,
  value,
  deltaPct,
  deltaInverted = false,
  icon,
  gradient,
  shadowColor,
  subtitle,
}: KpiTileProps) {
  const isGood = deltaInverted ? deltaPct < 0 : deltaPct > 0;
  const deltaColor = isGood ? 'rgba(255,255,255,0.95)' : 'rgba(255,220,225,0.95)';
  const DeltaIcon = deltaPct >= 0 ? TrendingUp : TrendingDown;
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
          <Group gap={6} mt={4} wrap="nowrap">
            <DeltaIcon size={14} color={deltaColor} />
            <Text fz={12} fw={600} c={deltaColor}>
              {deltaPct >= 0 ? '+' : ''}
              {deltaPct.toFixed(1)}% {subtitle ?? 'this week'}
            </Text>
          </Group>
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
  );
}

// ===== Team Overview row =====

function TeamRow({ team }: { team: TeamSummary }) {
  const trendDown = team.weekOverWeekDelta < 0;
  return (
    <UnstyledButton
      style={{
        display: 'block',
        width: '100%',
        padding: '14px 16px',
        borderRadius: 12,
        background: '#FAFBFC',
        borderLeft: `4px solid ${team.accentColor}`,
        transition: 'all 0.15s ease',
      }}
    >
      <Flex justify="space-between" align="center" gap="md" wrap="nowrap">
        <Group gap="sm" wrap="nowrap" style={{ flex: 1, minWidth: 0 }}>
          <Avatar
            radius="md"
            size="md"
            style={{ background: team.accentColor, color: '#fff', fontWeight: 700, fontSize: 13 }}
          >
            {team.leadInitials}
          </Avatar>
          <Stack gap={2} style={{ minWidth: 0 }}>
            <Text fz={14} fw={700} c="#0F172A" truncate>
              {team.teamName}
            </Text>
            <Text fz={11} c="#64748B" truncate>
              {team.leadName} ·{' '}
              {team.leadRole === 'supervisor' ? 'Supervisor' : 'Team Manager'} ·{' '}
              {team.spCount} SPs · {team.clientCount.toLocaleString()} clients
            </Text>
          </Stack>
        </Group>
        <Group gap="lg" wrap="nowrap" visibleFrom="sm">
          <Stack gap={0} align="flex-end">
            <Text fz={11} c="#64748B" fw={600}>OVERDUE</Text>
            <Group gap={4} wrap="nowrap">
              <Text fz={15} fw={700} c="#FF3B5C">{team.overdueCount}</Text>
              {trendDown ? (
                <TrendingDown size={12} color="#10B981" />
              ) : (
                <TrendingUp size={12} color="#FF3B5C" />
              )}
            </Group>
          </Stack>
          <Stack gap={0} align="flex-end" style={{ width: 90 }}>
            <Group justify="space-between" w="100%">
              <Text fz={11} c="#64748B" fw={600}>ON-TIME</Text>
              <Text fz={11} c="#0F172A" fw={700}>{team.completionRatePct}%</Text>
            </Group>
            <Progress
              value={team.completionRatePct}
              size="xs"
              color={
                team.completionRatePct >= 95
                  ? 'emerald'
                  : team.completionRatePct >= 90
                  ? 'cobalt'
                  : 'amber'
              }
              w="100%"
              mt={2}
            />
          </Stack>
        </Group>
        <ChevronRight size={16} color="#94A3B8" style={{ flexShrink: 0 }} />
      </Flex>
    </UnstyledButton>
  );
}

// ===== Attention Feed row (single-column, full-width) =====

function AttentionRow({ item }: { item: AttentionItem }) {
  const severityColor =
    item.severity === 'critical' ? '#FF3B5C' : item.severity === 'warning' ? '#FFA940' : '#1E7CFF';
  const severityBg =
    item.severity === 'critical'
      ? 'rgba(255,59,92,0.06)'
      : item.severity === 'warning'
      ? 'rgba(255,169,64,0.08)'
      : 'rgba(30,124,255,0.06)';
  const Icon =
    item.issue.startsWith('no_contact')
      ? PhoneOff
      : item.issue.includes('audit')
      ? FileWarning
      : CalendarDays;
  const overdueLabel =
    item.daysOverdue < 0 ? `in ${Math.abs(item.daysOverdue)}d` : `${item.daysOverdue}d ago`;
  return (
    <UnstyledButton
      style={{
        display: 'block',
        width: '100%',
        padding: '12px 14px',
        borderRadius: 10,
        background: severityBg,
        borderLeft: `3px solid ${severityColor}`,
      }}
    >
      <Flex justify="space-between" align="center" gap="md" wrap="nowrap">
        <Group gap="sm" wrap="nowrap" style={{ flex: 1, minWidth: 0 }}>
          <Box
            style={{
              width: 32,
              height: 32,
              borderRadius: 8,
              background: severityColor,
              color: '#fff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            <Icon size={16} />
          </Box>
          <Stack gap={2} style={{ minWidth: 0 }}>
            <Text fz={14} fw={700} c="#0F172A" truncate>
              {item.clientName}
            </Text>
            <Text fz={11} c="#64748B" truncate>
              {issueLabels[item.issue]} · {item.assignedSp} · {item.team}
            </Text>
          </Stack>
        </Group>
        <Badge
          variant="light"
          color={
            item.severity === 'critical'
              ? 'coral'
              : item.severity === 'warning'
              ? 'amber'
              : 'cobalt'
          }
          size="sm"
          style={{ flexShrink: 0 }}
        >
          {overdueLabel}
        </Badge>
      </Flex>
    </UnstyledButton>
  );
}

// ===== Team Tools action card =====

function TeamToolRow({ tool }: { tool: TeamToolCard }) {
  return (
    <UnstyledButton
      component="a"
      href={tool.href ?? '#'}
      style={{
        display: 'block',
        width: '100%',
        padding: '14px 16px',
        borderRadius: 12,
        background: '#FAFBFC',
        border: '1px solid #E5E7EB',
        transition: 'all 0.15s ease',
        textDecoration: 'none',
      }}
    >
      <Stack gap={6}>
        <Group gap={8} wrap="nowrap">
          <Text fz={16} component="span" style={{ lineHeight: 1, flexShrink: 0 }}>
            {tool.icon}
          </Text>
          <Text fz={14} fw={700} c="#0F172A">
            {tool.title}
          </Text>
        </Group>
        <Text fz={12} c="#64748B" lh={1.4}>
          {tool.description}
        </Text>
      </Stack>
    </UnstyledButton>
  );
}

// ===== Main client =====

export default function SupervisorDashboardV2Client({
  viewer,
  orgKpis,
  teams,
  trendData,
  attentionItems,
}: Props) {
  return (
    <Box>
      <AppNavRow viewer={viewer} />
      <TopBar viewer={viewer} />

      <Container size="xl" px="md" pb="xl">
        {/* Greeting */}
        <Stack gap={2} mb="lg">
          <Text fz={13} c="#64748B" fw={600} tt="uppercase" style={{ letterSpacing: '0.06em' }}>
            Program Overview
          </Text>
          <Title order={1} fz={28} fw={800} c="#0F172A" style={{ letterSpacing: '-0.02em' }}>
            Good morning, {viewer.fullName.split(' ')[0]}.
          </Title>
          <Text fz={14} c="#64748B" mt={2}>
            Org-wide caseload snapshot · {teams.length} teams ·{' '}
            {teams.reduce((sum, t) => sum + t.spCount, 0)} Support Planners
          </Text>
        </Stack>

        {/* KPI row — 4-across at md (992px+), 2-across at xs (576px+), 1-across below */}
        <Grid gap="md" mb="lg">
          <Grid.Col span={{ base: 12, xs: 6, md: 3 }}>
            <KpiTile
              label="Active Clients"
              value={orgKpis.activeClients}
              deltaPct={orgKpis.activeClientsDeltaPct}
              icon={<Users size={22} />}
              gradient="linear-gradient(135deg, #1E7CFF 0%, #2D8BFF 50%, #1A6FEB 100%)"
              shadowColor="rgba(30,124,255,0.4)"
            />
          </Grid.Col>
          <Grid.Col span={{ base: 12, xs: 6, md: 3 }}>
            <KpiTile
              label="Overdue Deadlines"
              value={orgKpis.overdueDeadlines}
              deltaPct={orgKpis.overdueDeadlinesDeltaPct}
              deltaInverted
              icon={<AlertTriangle size={22} />}
              gradient="linear-gradient(135deg, #FF3B5C 0%, #FF5A75 50%, #E63350 100%)"
              shadowColor="rgba(255,59,92,0.4)"
            />
          </Grid.Col>
          <Grid.Col span={{ base: 12, xs: 6, md: 3 }}>
            <KpiTile
              label="Due This Week"
              value={orgKpis.dueThisWeek}
              deltaPct={orgKpis.dueThisWeekDeltaPct}
              deltaInverted
              icon={<Clock size={22} />}
              gradient="linear-gradient(135deg, #FFA940 0%, #FFC061 50%, #F59E0B 100%)"
              shadowColor="rgba(255,169,64,0.4)"
            />
          </Grid.Col>
          <Grid.Col span={{ base: 12, xs: 6, md: 3 }}>
            <KpiTile
              label="No Contact 7+"
              value={orgKpis.noContact7}
              deltaPct={orgKpis.noContact7DeltaPct}
              deltaInverted
              icon={<PhoneOff size={22} />}
              gradient="linear-gradient(135deg, #10B981 0%, #34D399 50%, #059669 100%)"
              shadowColor="rgba(16,185,129,0.4)"
            />
          </Grid.Col>
        </Grid>

        {/* Caseload Trend chart — full width, explicit height to kill the width(-1) warning */}
        <Paper p="lg" mb="lg" style={{ background: '#FFFFFF' }}>
          <Flex justify="space-between" align="center" mb="md" wrap="wrap" gap="md">
            <Stack gap={2}>
              <Text
                fz={11}
                fw={700}
                c="#64748B"
                tt="uppercase"
                style={{ letterSpacing: '0.06em' }}
              >
                Last 12 Weeks
              </Text>
              <Title order={3} fz={18} fw={700} c="#0F172A">
                Caseload Trend
              </Title>
            </Stack>
            <Group gap="sm">
              <Group gap={6}>
                <Box w={10} h={10} bg="#FF3B5C" style={{ borderRadius: 3 }} />
                <Text fz={12} c="#64748B" fw={600}>Overdue</Text>
              </Group>
              <Group gap={6}>
                <Box w={10} h={10} bg="#10B981" style={{ borderRadius: 3 }} />
                <Text fz={12} c="#64748B" fw={600}>On track</Text>
              </Group>
              <Group gap={6}>
                <Box w={10} h={10} bg="#1E7CFF" style={{ borderRadius: 3 }} />
                <Text fz={12} c="#64748B" fw={600}>Completed</Text>
              </Group>
            </Group>
          </Flex>
          <Box style={{ width: '100%', height: 320, minWidth: 0 }}>
            <LineChart
              h={320}
              w="100%"
              data={trendData}
              dataKey="weekLabel"
              series={[
                { name: 'overdue', color: 'coral.6', label: 'Overdue' },
                { name: 'onTrack', color: 'emerald.6', label: 'On track' },
                { name: 'completed', color: 'cobalt.6', label: 'Completed' },
              ]}
              curveType="natural"
              strokeWidth={2.5}
              withDots
              dotProps={{ r: 3 }}
              gridAxis="xy"
              yAxisProps={{ fontSize: 11 }}
              xAxisProps={{ fontSize: 11 }}
              tooltipAnimationDuration={150}
            />
          </Box>
        </Paper>

        {/* Team Overview — full-width stacked rows */}
        <Paper p="lg" mb="lg" style={{ background: '#FFFFFF' }}>
          <Flex justify="space-between" align="center" mb="md">
            <Stack gap={2}>
              <Text
                fz={11}
                fw={700}
                c="#64748B"
                tt="uppercase"
                style={{ letterSpacing: '0.06em' }}
              >
                By Team
              </Text>
              <Title order={3} fz={18} fw={700} c="#0F172A">
                Team Overview
              </Title>
            </Stack>
            <UnstyledButton>
              <Text fz={12} fw={600} c="cobalt.6">View all</Text>
            </UnstyledButton>
          </Flex>
          <Stack gap={8}>
            {teams.map((team) => (
              <TeamRow key={team.id} team={team} />
            ))}
          </Stack>
        </Paper>

        {/* Bottom 2-col: Attention Feed (single-col stacked) + Team Tools sidebar.
            Using Flex with explicit grow ratios instead of Grid responsive cols —
            the Grid lg-breakpoint variant wasn't applying in this nested context. */}
        <Flex
          direction={{ base: 'column', lg: 'row' }}
          gap="md"
          align="flex-start"
        >
          <Box style={{ flex: 2, minWidth: 0, width: '100%' }}>
            <Paper p="lg" style={{ background: '#FFFFFF' }}>
              <Flex justify="space-between" align="center" mb="md">
                <Stack gap={2}>
                  <Text
                    fz={11}
                    fw={700}
                    c="#64748B"
                    tt="uppercase"
                    style={{ letterSpacing: '0.06em' }}
                  >
                    Needs Your Eyes
                  </Text>
                  <Title order={3} fz={18} fw={700} c="#0F172A">
                    Attention Feed
                  </Title>
                </Stack>
                <Badge variant="light" color="coral" size="lg">
                  {attentionItems.filter((i) => i.severity === 'critical').length} critical
                </Badge>
              </Flex>
              <Stack gap={8}>
                {attentionItems.map((item) => (
                  <AttentionRow key={item.id} item={item} />
                ))}
              </Stack>
            </Paper>
          </Box>

          <Box style={{ flex: 1, minWidth: 0, width: '100%' }}>
            <Paper p="lg" style={{ background: '#FFFFFF' }}>
              <Stack gap={2} mb="md">
                <Text
                  fz={11}
                  fw={700}
                  c="#64748B"
                  tt="uppercase"
                  style={{ letterSpacing: '0.06em' }}
                >
                  Manager Actions
                </Text>
                <Title order={3} fz={18} fw={700} c="#0F172A">
                  Team Tools
                </Title>
              </Stack>
              <Stack gap={8}>
                {teamTools.map((tool) => (
                  <TeamToolRow key={tool.id} tool={tool} />
                ))}
              </Stack>
            </Paper>
          </Box>
        </Flex>

        <Text fz={11} c="#94A3B8" ta="center" mt="xl">
          CaseSync v2 · north-star preview · data is mocked · /dashboard-v2
        </Text>
      </Container>
    </Box>
  );
}
