'use client'

/**
 * DashboardClient — Aurora rebuild.
 *
 * Visual: Aurora system applied head-to-toe.
 *   - Hero is a gradient-mesh paper with violet primary, drifting orbs,
 *     mouse spotlight, and a live clock with brand-colored glow.
 *   - 4 stat cards in glass with per-card gradient accent bars,
 *     3D tilt on hover (via shared useTilt), count-up numbers with
 *     per-card gradient text, and a Mantine RingProgress on Productivity.
 *   - Two-column grid:
 *     LEFT: Today's Schedule (timeline), Recent Tasks, Quick Actions
 *           (gradient buttons), CaseSync Alerts (conditional, 4 tiles).
 *     RIGHT: Task Streak (flame + flicker), 30-Day Onboarding
 *           (numbered timeline), Week at a Glance (bar chart with the
 *           page accent), Recent Activity (audit log feed).
 *
 * Data contract is byte-for-byte identical to the previous Dashboard:
 *   - Same Props shape (user, stats, auditLogs, recentTasks,
 *     completedCount, totalTaskCount, todayShifts, csAlerts, csRole)
 *   - Same conditional rendering for csAlerts visibility based on role
 *   - Same Calendly link for step 3
 *   - Same internal links (/w/tasks, /w/tickets, /w/time-clock,
 *     /w/schedule, /w/county-preference, /w/evaluations, /dashboard,
 *     /team?full=1&filter=...)
 */

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import {
  Anchor,
  Badge,
  Box,
  Card,
  Container,
  Group,
  Paper,
  RingProgress,
  SimpleGrid,
  Stack,
  Text,
  ThemeIcon,
  Title,
  Tooltip,
} from '@mantine/core'
import PageBanner from '@/components/workryn/PageBanner'
import {
  AlertTriangle,
  ArrowUpRight,
  Award,
  Bell,
  Briefcase,
  CalendarClock,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  ClipboardCheck,
  Clock,
  ExternalLink,
  FileEdit,
  Flame,
  ListTodo,
  LogIn,
  LogOut,
  MapPin,
  MessageCircle,
  ShieldAlert,
  Sparkles,
  Sun,
  Timer,
  Users,
  Zap,
} from 'lucide-react'
import { timeAgo } from '@/lib/workryn/utils'
import { useCountUp } from '@/hooks/useCountUp'
import { useTilt, useMouseSpotlight } from '@/hooks/workrynEffects'
import LottieBlock from '@/components/ui/LottieBlock'
import { ANIM } from '@/lib/animations'

// ----------- Types (unchanged contract) -----------

interface Props {
  user: { name?: string | null; role?: string }
  stats: { taskCount: number; openTickets: number; weeklyHours: number }
  auditLogs: { id: string; action: string; createdAt: string }[]
  recentTasks: { id: string; title: string; priority: string; status: string }[]
  completedCount: number
  totalTaskCount: number
  todayShifts: { id: string; title?: string; startTime: string }[]
  csAlerts?: {
    totalClients: number
    overdueClients: number
    dueThisWeek: number
    eligibilityEndingSoon: number
    noContact7Days: number
  }
  csPreview?: { id: string; name: string; label: string; diffDays: number }[]
  csRole?: string | null
}

// ----------- Constants -----------

const PRIORITY_COLOR: Record<string, string> = {
  URGENT: '#dc2626',
  HIGH:   '#ef4444',
  MEDIUM: '#f59e0b',
  LOW:    '#10b981',
}

const ACTION_META: Record<
  string,
  { icon: React.ComponentType<{ size?: number }>; color: string; label: string }
> = {
  TASK_CREATED:     { icon: ListTodo,       color: '#a78bfa', label: 'Task Created' },
  TASK_UPDATED:     { icon: FileEdit,       color: '#8b5cf6', label: 'Task Updated' },
  TASK_COMPLETED:   { icon: CheckCircle2,   color: '#34d399', label: 'Task Completed' },
  CLOCK_IN:         { icon: LogIn,          color: '#10b981', label: 'Clocked In' },
  CLOCK_OUT:        { icon: LogOut,         color: '#06b6d4', label: 'Clocked Out' },
  TICKET_CREATED:   { icon: MessageCircle,  color: '#fbbf24', label: 'Ticket Created' },
  TICKET_UPDATED:   { icon: Bell,           color: '#fb923c', label: 'Ticket Updated' },
}

function getActionMeta(action: string) {
  return (
    ACTION_META[action] ?? {
      icon: Briefcase,
      color: '#64748b',
      label: action
        .replace(/_/g, ' ')
        .toLowerCase()
        .replace(/\b\w/g, (c) => c.toUpperCase()),
    }
  )
}

function greet(name: string): string {
  const h = new Date().getHours()
  const prefix = h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'
  return `${prefix}, ${name}`
}

const TIPS = [
  'Stay hydrated — aim for 8 glasses of water today.',
  'Take a 5-minute stretch break every hour.',
  'Document your work as you go — future you will thank you.',
  'Reach out to a colleague today — connection matters.',
  'Review your PTO balance and plan time off proactively.',
  'Set 3 priorities for today and focus on those first.',
  'End your day by writing tomorrow\'s top task.',
]

const STAT_THEMES = {
  violet:  { bar: 'linear-gradient(90deg, #a78bfa, #7C3AED)', glow: 'rgba(124,58,237,0.35)',  text: 'linear-gradient(135deg, #c4b5fd, #7C3AED)' },
  amber:   { bar: 'linear-gradient(90deg, #fbbf24, #f59e0b)', glow: 'rgba(245,158,11,0.35)',  text: 'linear-gradient(135deg, #fcd34d, #f59e0b)' },
  mint:    { bar: 'linear-gradient(90deg, #6ee7b7, #10b981)', glow: 'rgba(52,211,153,0.35)',  text: 'linear-gradient(135deg, #6ee7b7, #10b981)' },
  cyan:    { bar: 'linear-gradient(90deg, #67e8f9, #06b6d4)', glow: 'rgba(6,182,212,0.35)',   text: 'linear-gradient(135deg, #67e8f9, #06b6d4)' },
} as const

// =================================================================
// MAIN
// =================================================================

export default function DashboardClient({
  user,
  stats,
  auditLogs,
  recentTasks,
  completedCount,
  totalTaskCount,
  todayShifts,
  csAlerts,
  csPreview,
  csRole,
  bannerUrl,
}: Props & { bannerUrl?: string | null }) {
  const productivity = totalTaskCount > 0 ? Math.round((completedCount / totalTaskCount) * 100) : 0
  const tip = TIPS[new Date().getDay() % TIPS.length]
  const streak = Math.min(completedCount, 30)

  const animTasks         = useCountUp(stats.taskCount,    800)
  const animTickets       = useCountUp(stats.openTickets,  800)
  const animHours         = useCountUp(stats.weeklyHours, 1000)
  const animProductivity  = useCountUp(productivity,      1200)

  const animOverdue       = useCountUp(csAlerts?.overdueClients         ?? 0, 800)
  const animDueWeek       = useCountUp(csAlerts?.dueThisWeek            ?? 0, 800)
  const animEligibility   = useCountUp(csAlerts?.eligibilityEndingSoon  ?? 0, 800)
  const animNoContact     = useCountUp(csAlerts?.noContact7Days         ?? 0, 800)

  const formattedShifts = todayShifts.map((shift) => ({
    id: shift.id,
    title: shift.title || 'Shift',
    time: new Date(shift.startTime).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }),
  }))

  const dayLabels = useMemo(() => {
    const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
    const today = new Date().getDay()
    const todayIdx = today === 0 ? 6 : today - 1
    return days.map((d, i) => ({ label: d, isToday: i === todayIdx }))
  }, [])

  const spot = useMouseSpotlight()

  const showCsAlerts =
    csAlerts && (csAlerts.totalClients > 0 || csRole === 'supervisor' || csRole === 'it' || csRole === 'administrator')

  return (
    <>
      <Container size="xl" py="lg" w="100%" className="wd-aurora">

        {/* ============================== HERO ============================== */}
        {bannerUrl ? (
          <>
            <PageBanner title={greet(user.name ?? 'there')} bannerUrl={bannerUrl} />
            <Group justify="flex-end" mb="lg">
              <LiveClock />
            </Group>
          </>
        ) : (
        <div ref={spot.ref} onMouseMove={spot.onMouseMove} style={{ marginBottom: 20 }}>
          <Paper radius="lg" p="xl" className="wd-hero">
            <div className="wd-hero-mesh" aria-hidden />
            <div className="wd-hero-orbs" aria-hidden>
              <span className="wd-orb wd-orb-1" />
              <span className="wd-orb wd-orb-2" />
              <span className="wd-orb wd-orb-3" />
            </div>
            <div className="wd-hero-spotlight" aria-hidden />

            <img src="/heroes/dashboard.svg" alt="" aria-hidden="true" style={{ position: "absolute", left: "50%", top: "50%", transform: "translate(-50%, -50%)", height: "70%", zIndex: 0, opacity: 0.22, pointerEvents: "none" }} />

            <Group justify="space-between" align="center" wrap="wrap" gap="lg" style={{ position: 'relative', zIndex: 2 }}>
              <Stack gap={6} style={{ minWidth: 0, flex: 1 }}>
                <Title order={1} className="wd-hero-title">
                  {greet(user.name ?? 'there')}
                </Title>
              </Stack>
              <LiveClock />
            </Group>
          </Paper>
        </div>
        )}

        {/* ============================== STATS ============================== */}
        <SimpleGrid cols={{ base: 2, sm: 2, md: 4 }} spacing="md" mb="lg">
          <StatCard
            href="/w/tasks"
            label="My Tasks"
            value={animTasks}
            icon={ListTodo}
            theme="violet"
            delay={0}
          />
          <StatCard
            href="/w/tickets"
            label="Open Tickets"
            value={animTickets}
            icon={MessageCircle}
            theme="amber"
            delay={80}
          />
          <StatCard
            href="/w/time-clock"
            label="Hours This Week"
            value={animHours}
            unit="h"
            icon={Timer}
            theme="mint"
            delay={160}
          />
          <StatCard
            label="Productivity"
            value={animProductivity}
            unit="%"
            ring={productivity}
            theme="cyan"
            delay={240}
          />
        </SimpleGrid>

        {/* ============================== GRID ============================== */}
        <SimpleGrid cols={{ base: 1, lg: 2 }} spacing="md">

          {/* ================ LEFT COLUMN ================ */}
          <Stack gap="md">

            {/* Today's Schedule */}
            <PanelCard
              title="Today's Schedule"
              icon={CalendarDays}
              accentColor="sky"
              href="/w/schedule"
              hrefLabel="View all"
            >
              {formattedShifts.length === 0 ? (
                <EmptyMini icon={CalendarDays} text="No shifts scheduled today" anim={ANIM.emptyCalendar} />
              ) : (
                <Stack gap="sm">
                  {formattedShifts.map((shift) => (
                    <Group key={shift.id} gap="sm" align="center" wrap="nowrap">
                      <span className="wd-timeline-dot" aria-hidden />
                      <Stack gap={0} style={{ flex: 1 }}>
                        <Text fw={600} size="sm">{shift.title}</Text>
                        <Text size="xs" c="dimmed">{shift.time}</Text>
                      </Stack>
                    </Group>
                  ))}
                </Stack>
              )}
            </PanelCard>

            {/* Recent Tasks */}
            <PanelCard
              title="Recent Tasks"
              icon={ListTodo}
              accentColor="coral"
              href="/w/tasks"
              hrefLabel="View all"
            >
              {recentTasks.length === 0 ? (
                <EmptyMini icon={Zap} text="No tasks yet — create one to get started" anim={ANIM.emptyTasks} />
              ) : (
                <Stack gap={6}>
                  {recentTasks.slice(0, 5).map((task) => (
                    <Link key={task.id} href="/w/tasks" className="wd-task-row">
                      <span
                        className="wd-task-priority"
                        style={{ background: PRIORITY_COLOR[task.priority] || '#64748b' }}
                      />
                      <Text size="sm" fw={500} style={{ flex: 1, minWidth: 0 }} truncate>
                        {task.title}
                      </Text>
                      <Badge size="xs" variant="light" color={statusColor(task.status)}>
                        {task.status}
                      </Badge>
                    </Link>
                  ))}
                </Stack>
              )}
            </PanelCard>

            {/* Quick Actions */}
            <PanelCard title="Quick Actions" icon={Zap} accentColor="violet">
              <SimpleGrid cols={{ base: 2 }} spacing="sm">
                <QuickAction href="/w/tasks?new=true"     icon={Zap}            label="New Task"     gradient="linear-gradient(135deg, #7C3AED, #a855f7)" />
                <QuickAction href="/w/tickets?new=true"   icon={MessageCircle}  label="Open Ticket"  gradient="linear-gradient(135deg, #f59e0b, #FB7185)" />
                <QuickAction href="/w/time-clock"         icon={Clock}          label="Clock In"     gradient="linear-gradient(135deg, #10b981, #34D399)" />
                <QuickAction href="/w/schedule"           icon={CalendarDays}   label="Schedule"     gradient="linear-gradient(135deg, #0EA5E9, #06b6d4)" />
              </SimpleGrid>
            </PanelCard>

            {/* CaseSync Alerts (conditional) */}
            {showCsAlerts && csAlerts && (
              <Card radius="lg" p="lg" withBorder className="wd-panel wd-cs-card">
                <Group justify="space-between" align="flex-start" mb="md">
                  <Group gap="sm" align="center">
                    <ThemeIcon size="lg" radius="md" variant="light" color="red">
                      <ShieldAlert size={18} />
                    </ThemeIcon>
                    <Stack gap={0}>
                      <Text fw={700} size="md">CaseSync Alerts</Text>
                      <Text size="xs" c="dimmed">
                        {csRole === 'supervisor' || csRole === 'it'
                          ? 'All clients'
                          : csRole === 'team_manager'
                          ? 'Your team'
                          : 'Your caseload'}
                      </Text>
                    </Stack>
                  </Group>
                  <Anchor component={Link} href="/dashboard" size="xs" c="violet.4" underline="never">
                    <Group gap={4}>Open CaseSync<ExternalLink size={12} /></Group>
                  </Anchor>
                </Group>

                <SimpleGrid cols={{ base: 2 }} spacing="sm">
                  <CsAlertTile href="/team?full=1&filter=overdue"                icon={AlertTriangle}  count={animOverdue}     label="Overdue"           color="#ef4444" />
                  <CsAlertTile href="/team?full=1&filter=due_this_week"          icon={CalendarClock}  count={animDueWeek}     label="Due This Week"     color="#f59e0b" />
                  <CsAlertTile href="/team?full=1&filter=eligibility_ending_soon" icon={CalendarDays}   count={animEligibility} label="Eligibility Ending" color="#06b6d4" />
                  <CsAlertTile href="/team?full=1&filter=no_contact_7"            icon={Users}          count={animNoContact}   label="No Contact 7d"     color="#94a3b8" />
                </SimpleGrid>

                {csPreview && csPreview.length > 0 && (
                  <Stack gap={4} mt="md">
                    <Text size="xs" fw={600} c="dimmed" tt="uppercase" style={{ letterSpacing: 0.5 }}>
                      Most urgent
                    </Text>
                    {csPreview.map((client) => {
                      const overdue = client.diffDays < 0
                      const dueSoon = !overdue && client.diffDays <= 7
                      const dotColor = overdue ? '#ef4444' : dueSoon ? '#f59e0b' : '#94a3b8'
                      const statusText = overdue
                        ? `${Math.abs(client.diffDays)}d overdue`
                        : client.diffDays === 0
                        ? 'due today'
                        : `due in ${client.diffDays}d`
                      return (
                        <Link
                          key={client.id}
                          href={`/clients/${client.id}`}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 10,
                            padding: '8px 10px',
                            borderRadius: 10,
                            textDecoration: 'none',
                            color: 'inherit',
                            background: `${dotColor}0d`,
                            border: `1px solid ${dotColor}26`,
                          }}
                        >
                          <span
                            style={{
                              width: 8,
                              height: 8,
                              borderRadius: '50%',
                              background: dotColor,
                              flexShrink: 0,
                            }}
                          />
                          <Text size="sm" fw={600} style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {client.name}
                          </Text>
                          <Text size="xs" c="dimmed" style={{ whiteSpace: 'nowrap' }}>
                            {client.label} · {statusText}
                          </Text>
                        </Link>
                      )
                    })}
                  </Stack>
                )}

                <Group gap={6} mt="sm" c="dimmed">
                  <Users size={13} />
                  <Text size="xs">{csAlerts.totalClients} total client{csAlerts.totalClients !== 1 ? 's' : ''}</Text>
                </Group>
              </Card>
            )}
          </Stack>

          {/* ================ RIGHT COLUMN ================ */}
          <Stack gap="md">

            {/* Streak + tip */}
            <Card radius="lg" p="lg" withBorder className="wd-panel wd-streak">
              <Group gap="md" align="center" wrap="nowrap">
                <div className="wd-streak-badge">
                  <Flame size={28} />
                  <span className="wd-streak-count">{streak}</span>
                </div>
                <Stack gap={2} style={{ flex: 1 }}>
                  <Text fw={700} size="md">Task Streak</Text>
                  <Text size="xs" c="dimmed">
                    {streak > 0
                      ? `${streak} tasks completed — keep it up!`
                      : 'Complete tasks to build your streak'}
                  </Text>
                </Stack>
              </Group>
              <Group gap="sm" mt="md" className="wd-tip">
                <ThemeIcon size="sm" radius="md" variant="light" color="yellow">
                  <Sun size={12} />
                </ThemeIcon>
                <Text size="xs" c="dimmed" style={{ flex: 1 }}>{tip}</Text>
              </Group>
            </Card>

            {/* 30-Day Onboarding */}
            <Card radius="lg" p="lg" withBorder className="wd-panel">
              <Group gap="sm" align="center" mb="md">
                <ThemeIcon size="lg" radius="md" variant="light" color="violet">
                  <Award size={18} />
                </ThemeIcon>
                <Stack gap={0}>
                  <Text fw={700} size="md">30-Day Onboarding</Text>
                  <Text size="xs" c="dimmed">New support planner evaluation flow</Text>
                </Stack>
              </Group>

              <Stack gap={0}>
                <OnboardStep n={1} color="#60a5fa" line title="County Preference"  desc="Select your residence county and preferred client regions"          href="/w/county-preference"  cta="Open Form"            icon={MapPin} />
                <OnboardStep n={2} color="#34d399" line title="Self-Assessment"    desc="Complete your 30-day self-evaluation in Workryn"                    href="/w/evaluations"        cta="Go to Evaluations"    icon={ClipboardCheck} />
                <OnboardStep n={3} color="#fbbf24" line title="Schedule Meeting"   desc="Book your evaluation review with Sarah Abbott"                       extHref="https://calendly.com/sabbott-9/evaluations" cta="Schedule on Calendly" icon={CalendarDays} />
                <OnboardStep n={4} color="#c084fc"      title="Supervisor Review" desc="Sarah reviews your self-assessment and completes the formal evaluation" />
              </Stack>

              <Group gap={6} mt="md" c="dimmed">
                <Sparkles size={13} />
                <Text size="xs">Complete steps 1–3 at least one week before your 30-day mark</Text>
              </Group>
            </Card>

            {/* Week at a Glance */}
            <PanelCard title="Week at a Glance" icon={Timer} accentColor="mint">
              <Group align="flex-end" gap="xs" mb="sm" style={{ height: 120 }}>
                {dayLabels.map(({ label, isToday }) => {
                  const pct = isToday && stats.weeklyHours > 0
                    ? Math.min(stats.weeklyHours * 12.5, 100)
                    : (isToday ? 8 : 0)
                  return (
                    <Stack key={label} gap={4} align="center" style={{ flex: 1, height: '100%' }}>
                      <div style={{ flex: 1, width: '100%', display: 'flex', alignItems: 'flex-end' }}>
                        <div
                          className="wd-week-bar"
                          style={{
                            height: `${pct}%`,
                            background: isToday
                              ? 'linear-gradient(180deg, #6ee7b7, #10b981)'
                              : 'rgba(255,255,255,0.04)',
                            boxShadow: isToday ? '0 0 16px rgba(52,211,153,0.55)' : 'none',
                          }}
                        />
                      </div>
                      <Text size="xs" c={isToday ? 'mint.4' : 'dimmed'} fw={isToday ? 700 : 500}>
                        {label}
                      </Text>
                    </Stack>
                  )
                })}
              </Group>
              <Group justify="space-between" align="baseline">
                <Text className="wd-week-total" size="xl" fw={800}>{animHours}h</Text>
                <Text size="xs" c="dimmed">total this week</Text>
              </Group>
            </PanelCard>

            {/* Recent Activity */}
            <PanelCard title="Recent Activity" icon={Clock} accentColor="indigo">
              {auditLogs.length === 0 ? (
                <EmptyMini icon={Clock} text="No recent activity" />
              ) : (
                <Stack gap={4}>
                  {auditLogs.slice(0, 8).map((log, idx) => {
                    const meta = getActionMeta(log.action)
                    const Icon = meta.icon
                    return (
                      <div
                        key={log.id}
                        className="wd-act-row"
                        style={{ animationDelay: `${idx * 40}ms` }}
                      >
                        <span
                          className="wd-act-dot"
                          style={{ background: `${meta.color}28`, color: meta.color }}
                        >
                          <Icon size={13} />
                        </span>
                        <Stack gap={0} style={{ flex: 1 }}>
                          <Text size="sm" fw={500}>{meta.label}</Text>
                          <Text size="xs" c="dimmed">{timeAgo(log.createdAt)}</Text>
                        </Stack>
                      </div>
                    )
                  })}
                </Stack>
              )}
            </PanelCard>
          </Stack>
        </SimpleGrid>
      </Container>

      {/* ============================== STYLES ============================== */}
      <style>{`
        @keyframes wd-slide-up { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes wd-mesh-drift {
          0%, 100% { transform: translate(0,0) scale(1); }
          50%      { transform: translate(3%, -2%) scale(1.05); }
        }
        @keyframes wd-orb-a { 0%,100%{transform:translate(0,0)} 50%{transform:translate(40px,-30px)} }
        @keyframes wd-orb-b { 0%,100%{transform:translate(0,0)} 50%{transform:translate(-30px,25px)} }
        @keyframes wd-orb-c { 0%,100%{transform:translate(0,0)} 50%{transform:translate(20px,40px)} }
        @keyframes wd-flame-flicker {
          0%,100% { transform: scale(1) rotate(-2deg); filter: drop-shadow(0 0 8px #f59e0b); }
          50%     { transform: scale(1.08) rotate(2deg); filter: drop-shadow(0 0 16px #f59e0b); }
        }
        @keyframes wd-clock-pulse {
          0%,100% { box-shadow: 0 0 0 0 var(--accent, #7C3AED); }
          50%     { box-shadow: 0 0 0 6px transparent; }
        }
        @media (prefers-reduced-motion: reduce) {
          .wd-aurora *, .wd-aurora *::before, .wd-aurora *::after {
            animation: none !important;
            transition: none !important;
          }
        }

        /* ---------- Hero ---------- */
        .wd-hero {
          position: relative;
          overflow: hidden;
          border: 1px solid rgba(124,58,237,0.35);
          background:
            linear-gradient(135deg, rgba(124,58,237,0.20) 0%, rgba(251,113,133,0.10) 60%, rgba(52,211,153,0.06) 100%),
            rgba(11,15,30,0.55);
          backdrop-filter: blur(14px) saturate(140%);
          -webkit-backdrop-filter: blur(14px) saturate(140%);
          box-shadow: 0 20px 60px -20px rgba(124,58,237,0.40), 0 1px 0 rgba(255,255,255,0.05) inset;
          animation: wd-slide-up 460ms ease-out backwards;
        }
        .wd-hero-mesh {
          position: absolute; inset: -25%;
          background:
            radial-gradient(circle at 22% 30%, rgba(124,58,237,0.45), transparent 42%),
            radial-gradient(circle at 78% 25%, rgba(251,113,133,0.30), transparent 47%),
            radial-gradient(circle at 62% 82%, rgba(52,211,153,0.20), transparent 52%);
          filter: blur(40px);
          animation: wd-mesh-drift 22s ease-in-out infinite;
          z-index: 0;
          pointer-events: none;
        }
        .wd-hero-orbs { position: absolute; inset: 0; z-index: 0; pointer-events: none; }
        .wd-orb { position: absolute; border-radius: 50%; filter: blur(22px); opacity: 0.55; mix-blend-mode: screen; }
        .wd-orb-1 { width: 130px; height: 130px; top: 12%; left: 8%;
          background: radial-gradient(circle, #a855f7 0%, transparent 70%); animation: wd-orb-a 14s ease-in-out infinite; }
        .wd-orb-2 { width: 100px; height: 100px; top: 60%; left: 55%;
          background: radial-gradient(circle, #FB7185 0%, transparent 70%); animation: wd-orb-b 16s ease-in-out infinite; }
        .wd-orb-3 { width: 80px;  height: 80px;  bottom: 10%; right: 12%;
          background: radial-gradient(circle, #34D399 0%, transparent 70%); animation: wd-orb-c 18s ease-in-out infinite; }
        .wd-hero-spotlight {
          position: absolute; inset: 0; z-index: 1; pointer-events: none;
          background: radial-gradient(circle 360px at var(--mx, 50%) var(--my, 50%), rgba(255,255,255,0.10), transparent 60%);
        }
        .wd-hero-title {
          font-size: clamp(1.85rem, 4vw, 2.6rem);
          font-weight: 800;
          letter-spacing: -0.025em;
          line-height: 1.05;
          margin: 0;
          background: linear-gradient(135deg, #fff 0%, #c4b5fd 50%, #FB7185 100%);
          -webkit-background-clip: text; background-clip: text;
          -webkit-text-fill-color: transparent;
          filter: drop-shadow(0 2px 12px rgba(124,58,237,0.40));
        }

        /* ---------- Live clock ---------- */
        .wd-live-clock {
          position: relative;
          display: inline-flex; flex-direction: column; align-items: flex-end;
          padding: 12px 18px;
          background: rgba(15,23,42,0.55);
          border: 1px solid rgba(255,255,255,0.06);
          border-radius: 14px;
          backdrop-filter: blur(10px);
          -webkit-backdrop-filter: blur(10px);
        }
        .wd-clock-pulse {
          position: absolute; top: 12px; right: 16px;
          width: 8px; height: 8px;
          border-radius: 50%;
          background: #34d399;
          animation: wd-clock-pulse 1.8s ease-in-out infinite;
          box-shadow: 0 0 8px #34d399;
        }
        .wd-clock-time {
          font-variant-numeric: tabular-nums;
          font-size: 1.875rem;
          font-weight: 800;
          letter-spacing: -0.02em;
          background: linear-gradient(135deg, #fff 0%, #c4b5fd 100%);
          -webkit-background-clip: text; background-clip: text;
          -webkit-text-fill-color: transparent;
        }
        .wd-clock-date { font-size: 0.75rem; color: rgba(255,255,255,0.55); }

        /* ---------- Stat cards ---------- */
        .wd-stat-card {
          position: relative;
          overflow: hidden;
          background: rgba(15,23,42,0.55);
          backdrop-filter: blur(12px) saturate(140%);
          -webkit-backdrop-filter: blur(12px) saturate(140%);
          transition: transform 220ms ease, box-shadow 260ms ease, border-color 220ms ease;
          animation: wd-slide-up 500ms ease-out backwards;
          text-decoration: none;
          color: inherit;
          display: block;
        }
        .wd-stat-card::before {
          content: ''; position: absolute; top: 0; left: 0; right: 0; height: 3px;
          background: var(--wd-bar);
        }
        .wd-stat-card:hover {
          border-color: var(--mantine-color-violet-6);
          box-shadow: 0 14px 36px var(--wd-glow, rgba(124,58,237,0.35));
        }
        .wd-stat-value {
          font-size: clamp(1.85rem, 3vw, 2.4rem);
          font-weight: 800;
          line-height: 1;
          letter-spacing: -0.03em;
          font-variant-numeric: tabular-nums;
          background: var(--wd-text);
          -webkit-background-clip: text; background-clip: text;
          -webkit-text-fill-color: transparent;
        }
        .wd-stat-unit {
          font-size: 0.6em;
          opacity: 0.7;
          font-weight: 700;
          margin-left: 2px;
        }

        /* ---------- Panels ---------- */
        .wd-panel {
          background: rgba(15,23,42,0.55);
          backdrop-filter: blur(14px) saturate(140%);
          -webkit-backdrop-filter: blur(14px) saturate(140%);
          animation: wd-slide-up 500ms ease-out backwards;
          transition: border-color 200ms ease, box-shadow 220ms ease;
        }
        .wd-panel:hover {
          border-color: var(--mantine-color-violet-7);
        }
        .wd-panel-title {
          background: linear-gradient(135deg, #fff 0%, #c4b5fd 100%);
          -webkit-background-clip: text; background-clip: text;
          -webkit-text-fill-color: transparent;
          font-weight: 700;
        }

        /* ---------- Schedule timeline dot ---------- */
        .wd-timeline-dot {
          width: 8px; height: 8px;
          border-radius: 50%;
          background: linear-gradient(135deg, #0EA5E9, #06b6d4);
          box-shadow: 0 0 10px rgba(14,165,233,0.55);
          flex-shrink: 0;
        }

        /* ---------- Task row ---------- */
        .wd-task-row {
          display: flex; align-items: center; gap: 10px;
          padding: 10px 12px;
          border-radius: 10px;
          background: rgba(255,255,255,0.02);
          border: 1px solid rgba(255,255,255,0.04);
          text-decoration: none;
          color: #e2e8f0;
          transition: background 160ms ease, border-color 160ms ease;
        }
        .wd-task-row:hover {
          background: rgba(124,58,237,0.08);
          border-color: rgba(124,58,237,0.30);
        }
        .wd-task-priority {
          width: 6px; height: 24px;
          border-radius: 99px;
          flex-shrink: 0;
        }

        /* ---------- Streak ---------- */
        .wd-streak {
          background: linear-gradient(135deg, rgba(245,158,11,0.10) 0%, rgba(15,23,42,0.55) 60%);
          border-color: rgba(245,158,11,0.30);
        }
        .wd-streak-badge {
          position: relative;
          width: 64px; height: 64px;
          display: grid; place-items: center;
          background: radial-gradient(circle, rgba(245,158,11,0.30) 0%, rgba(245,158,11,0.05) 70%);
          border-radius: 50%;
          color: #fcd34d;
          animation: wd-flame-flicker 1.6s ease-in-out infinite;
        }
        .wd-streak-count {
          position: absolute;
          right: -4px; bottom: -4px;
          min-width: 22px; height: 22px; padding: 0 5px;
          display: inline-flex; align-items: center; justify-content: center;
          background: linear-gradient(135deg, #f59e0b, #FB7185);
          color: #fff;
          font-size: 11px;
          font-weight: 800;
          border-radius: 999px;
          box-shadow: 0 0 10px rgba(245,158,11,0.6);
        }
        .wd-tip {
          padding: 10px 12px;
          border-radius: 10px;
          background: rgba(251,191,36,0.06);
          border: 1px solid rgba(251,191,36,0.15);
        }

        /* ---------- Onboarding ---------- */
        .wd-ob-step {
          position: relative;
          display: grid;
          grid-template-columns: 36px 1fr;
          gap: 14px;
          padding-bottom: 18px;
        }
        .wd-ob-step:last-child { padding-bottom: 0; }
        .wd-ob-step-num {
          width: 36px; height: 36px;
          border-radius: 10px;
          display: grid; place-items: center;
          font-weight: 800;
          font-size: 14px;
          flex-shrink: 0;
        }
        .wd-ob-step-line {
          position: absolute;
          left: 17px; top: 36px; bottom: 0;
          width: 2px;
          border-radius: 99px;
          opacity: 0.55;
        }

        /* ---------- Week chart ---------- */
        .wd-week-bar {
          width: 100%;
          border-radius: 6px 6px 0 0;
          transition: height 600ms cubic-bezier(0.2, 0.8, 0.2, 1);
        }
        .wd-week-total {
          background: linear-gradient(135deg, #6ee7b7, #10b981);
          -webkit-background-clip: text; background-clip: text;
          -webkit-text-fill-color: transparent;
          font-variant-numeric: tabular-nums;
        }

        /* ---------- Activity ---------- */
        .wd-act-row {
          display: flex; align-items: center; gap: 10px;
          padding: 8px 6px;
          border-radius: 8px;
          animation: wd-slide-up 400ms ease-out backwards;
          transition: background 140ms ease;
        }
        .wd-act-row:hover { background: rgba(255,255,255,0.04); }
        .wd-act-dot {
          width: 28px; height: 28px;
          display: grid; place-items: center;
          border-radius: 8px;
          flex-shrink: 0;
        }
      `}</style>
    </>
  )
}

// =================================================================
// SUB-COMPONENTS
// =================================================================

function statusColor(status: string): string {
  const map: Record<string, string> = {
    'TO_DO': 'gray',
    'IN_PROGRESS': 'violet',
    'IN_REVIEW': 'orange',
    'DONE': 'mint',
    'COMPLETED': 'mint',
    'BLOCKED': 'red',
  }
  return map[status] ?? 'gray'
}

function StatCard({
  href,
  label,
  value,
  unit,
  icon: Icon,
  ring,
  theme,
  delay,
}: {
  href?: string
  label: string
  value: number | string
  unit?: string
  icon?: React.ComponentType<{ size?: number }>
  ring?: number
  theme: keyof typeof STAT_THEMES
  delay: number
}) {
  const tilt = useTilt(6)
  const cfg = STAT_THEMES[theme]

  const inner = (
    <Card
      radius="lg"
      p="md"
      withBorder
      className="wd-stat-card"
      style={{
        animationDelay: `${delay}ms`,
        ['--wd-bar' as string]: cfg.bar,
        ['--wd-glow' as string]: cfg.glow,
        ['--wd-text' as string]: cfg.text,
      } as React.CSSProperties}
    >
      <Group justify="space-between" align="center" wrap="nowrap">
        {ring != null ? (
          <RingProgress
            size={60}
            thickness={5}
            sections={[{ value: ring, color: 'cyan.4' }]}
            label={null}
          />
        ) : Icon ? (
          <ThemeIcon size="xl" radius="md" variant="light" color={ringColorForTheme(theme)}>
            <Icon size={22} />
          </ThemeIcon>
        ) : null}
        <Stack gap={2} align="flex-end" style={{ flex: 1, minWidth: 0 }}>
          <Text className="wd-stat-value">
            {value}
            {unit && <span className="wd-stat-unit">{unit}</span>}
          </Text>
          <Text size="xs" c="dimmed" tt="uppercase" fw={600} ta="right">
            {label}
          </Text>
        </Stack>
        {href && <ArrowUpRight size={16} style={{ opacity: 0.5, position: 'absolute', top: 12, right: 12 }} />}
      </Group>
    </Card>
  )

  const wrapped = (
    <div
      ref={tilt.ref}
      onMouseMove={tilt.onMouseMove}
      onMouseLeave={tilt.onMouseLeave}
      style={{ transition: 'transform 260ms cubic-bezier(0.3, 0.5, 0.3, 1)' }}
    >
      {inner}
    </div>
  )

  return href ? (
    <Link href={href} style={{ textDecoration: 'none', color: 'inherit' }}>
      {wrapped}
    </Link>
  ) : wrapped
}

function ringColorForTheme(theme: keyof typeof STAT_THEMES): string {
  if (theme === 'violet') return 'violet'
  if (theme === 'amber')  return 'orange'
  if (theme === 'mint')   return 'mint'
  if (theme === 'cyan')   return 'cyan'
  return 'violet'
}

function PanelCard({
  title,
  icon: Icon,
  accentColor,
  href,
  hrefLabel,
  children,
}: {
  title: string
  icon: React.ComponentType<{ size?: number }>
  accentColor: string
  href?: string
  hrefLabel?: string
  children: React.ReactNode
}) {
  return (
    <Card radius="lg" p="lg" withBorder className="wd-panel">
      <Group justify="space-between" align="center" mb="md">
        <Group gap="xs" align="center">
          <ThemeIcon size="md" radius="md" variant="light" color={accentColor}>
            <Icon size={16} />
          </ThemeIcon>
          <Title order={3} size="h5" className="wd-panel-title">
            {title}
          </Title>
        </Group>
        {href && hrefLabel && (
          <Anchor component={Link} href={href} size="xs" c="violet.4" underline="never">
            <Group gap={2}>{hrefLabel}<ChevronRight size={12} /></Group>
          </Anchor>
        )}
      </Group>
      {children}
    </Card>
  )
}

function EmptyMini({
  icon: Icon,
  text,
  anim,
}: {
  icon: React.ComponentType<{ size?: number }>
  text: string
  anim?: string
}) {
  return (
    <Stack align="center" gap="xs" py="lg">
      {anim ? (
        <LottieBlock src={anim} size={84} trigger="mount" />
      ) : (
        <ThemeIcon size="xl" radius="xl" variant="light" color="violet">
          <Icon size={20} />
        </ThemeIcon>
      )}
      <Text size="sm" c="dimmed" ta="center">{text}</Text>
    </Stack>
  )
}

function QuickAction({
  href,
  icon: Icon,
  label,
  gradient,
}: {
  href: string
  icon: React.ComponentType<{ size?: number }>
  label: string
  gradient: string
}) {
  return (
    <Link
      href={href}
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        padding: '18px 12px',
        borderRadius: 12,
        background: gradient,
        color: '#fff',
        textDecoration: 'none',
        fontWeight: 600,
        fontSize: '0.875rem',
        boxShadow: '0 8px 24px -8px rgba(0,0,0,0.4), 0 0 1px rgba(255,255,255,0.1) inset',
        transition: 'transform 220ms ease, box-shadow 220ms ease',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.transform = 'translateY(-3px)'
        e.currentTarget.style.boxShadow = '0 14px 32px -8px rgba(124,58,237,0.45), 0 0 1px rgba(255,255,255,0.15) inset'
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = ''
        e.currentTarget.style.boxShadow = '0 8px 24px -8px rgba(0,0,0,0.4), 0 0 1px rgba(255,255,255,0.1) inset'
      }}
    >
      <Icon size={22} />
      <span>{label}</span>
    </Link>
  )
}

function CsAlertTile({
  href,
  icon: Icon,
  count,
  label,
  color,
}: {
  href: string
  icon: React.ComponentType<{ size?: number }>
  count: number
  label: string
  color: string
}) {
  return (
    <Link
      href={href}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: 12,
        borderRadius: 12,
        background: `${color}10`,
        border: `1px solid ${color}33`,
        textDecoration: 'none',
        color: 'inherit',
        transition: 'background 160ms ease, border-color 160ms ease, transform 160ms ease',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = `${color}1f`
        e.currentTarget.style.borderColor = `${color}66`
        e.currentTarget.style.transform = 'translateY(-2px)'
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = `${color}10`
        e.currentTarget.style.borderColor = `${color}33`
        e.currentTarget.style.transform = ''
      }}
    >
      <div style={{ color, display: 'grid', placeItems: 'center' }}>
        <Icon size={18} />
      </div>
      <Stack gap={0}>
        <Text fw={800} size="lg" style={{ color, lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>
          {count}
        </Text>
        <Text size="xs" c="dimmed">{label}</Text>
      </Stack>
    </Link>
  )
}

function OnboardStep({
  n,
  color,
  line,
  title,
  desc,
  href,
  extHref,
  cta,
  icon: Icon,
}: {
  n: number
  color: string
  line?: boolean
  title: string
  desc: string
  href?: string
  extHref?: string
  cta?: string
  icon?: React.ComponentType<{ size?: number }>
}) {
  return (
    <div className="wd-ob-step">
      <div
        className="wd-ob-step-num"
        style={{ background: `${color}26`, color }}
      >
        {n}
      </div>
      {line && (
        <div
          className="wd-ob-step-line"
          style={{ background: `linear-gradient(180deg, ${color}, ${color}66)` }}
        />
      )}
      <Stack gap={4} pt={4}>
        <Text fw={700} size="sm">{title}</Text>
        <Text size="xs" c="dimmed">{desc}</Text>
        {cta && Icon && (
          href ? (
            <Anchor component={Link} href={href} size="xs" c="violet.4" underline="never" mt={4}>
              <Group gap={4} align="center"><Icon size={12} />{cta}<ChevronRight size={12} /></Group>
            </Anchor>
          ) : extHref ? (
            <Anchor href={extHref} target="_blank" rel="noopener noreferrer" size="xs" c="violet.4" underline="never" mt={4}>
              <Group gap={4} align="center"><Icon size={12} />{cta}<ExternalLink size={10} /></Group>
            </Anchor>
          ) : null
        )}
      </Stack>
    </div>
  )
}

function LiveClock() {
  const [time, setTime] = useState<Date | null>(null)
  useEffect(() => {
    setTime(new Date())
    const t = setInterval(() => setTime(new Date()), 1000)
    return () => clearInterval(t)
  }, [])

  if (!time) {
    return <div className="wd-live-clock" style={{ minWidth: 160, minHeight: 70 }} />
  }
  return (
    <div className="wd-live-clock">
      <div className="wd-clock-pulse" />
      <span className="wd-clock-time">
        {time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
      </span>
      <span className="wd-clock-date">
        {time.toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric' })}
      </span>
    </div>
  )
}
