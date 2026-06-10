'use client'

/**
 * ProfileClient — Mantine v9, premium pass.
 *
 * Layered on top of the previous gradient-mesh + count-up version with:
 *   - Conic-gradient ring rotating slowly around the avatar (luxe feel)
 *   - 3 floating SVG orbs in the hero, drifting at different speeds
 *   - Mouse spotlight on the hero (radial gradient follows cursor)
 *   - 3D tilt on stat cards (shared `useTilt` hook, matches DashboardClient)
 *   - Glassmorphism on content cards (backdrop-filter blur + semi-transparent bg)
 *   - Bigger stat numbers with gradient text + brand-colored glow
 *   - Achievement badges computed from stats + tenure (premium product touch)
 *   - SVG grain overlay on the hero for that "expensive" texture
 *   - Sparkles next to the role pill (Owner gets crown, others get sparkles)
 *   - Sticky tabs bar with backdrop blur as you scroll
 *
 * Behavior contract unchanged: same props, same API endpoints, same tabs.
 */

import { useEffect, useMemo, useState } from 'react'
import {
  Alert,
  Avatar,
  Badge,
  Box,
  Button,
  Card,
  ColorSwatch,
  Container,
  Divider,
  Group,
  Loader,
  Paper,
  Progress,
  Rating,
  SimpleGrid,
  Stack,
  Tabs,
  Text,
  TextInput,
  ThemeIcon,
  Title,
  Tooltip,
} from '@mantine/core'
import { notifications } from '@mantine/notifications'
import {
  AlertCircle,
  Award,
  BookOpen,
  Briefcase,
  Building2,
  Calendar,
  Check,
  CheckSquare,
  ClipboardCheck,
  Clock,
  Crown,
  Flame,
  GraduationCap,
  Mail,
  Medal,
  Palette,
  Phone,
  Save,
  Shield,
  Sparkles,
  Star,
  Ticket,
  Trophy,
  User as UserIcon,
  Zap,
} from 'lucide-react'
import { getInitials, formatDate, timeAgo } from '@/lib/workryn/utils'
import { useCountUp } from '@/hooks/useCountUp'
import { useTilt, useMouseSpotlight } from '@/hooks/workrynEffects'

// ---------- Types (unchanged contract) ----------

interface TrainingEnrollment {
  id: string
  status: string
  completedAt: string | null
  enrolledAt: string
  course?: {
    id: string
    title: string
    description?: string | null
    category?: string | null
  }
  progress?: number
  quizScore?: number | null
}

interface ProfileProps {
  profile: {
    id: string
    name: string | null
    email: string | null
    role: string
    jobTitle: string | null
    phone: string | null
    avatarColor: string
    mfaEnabled: boolean
    isActive: boolean
    lastLogin: string | null
    createdAt: string
    departmentId: string | null
    department: { id: string; name: string; color: string; icon: string } | null
  }
  stats: {
    tasksAssigned: number
    ticketsCreated: number
    trainingCompleted: number
    evaluationsReceived: number
  }
  initialEnrollments?: TrainingEnrollment[]
  session: { user: { id: string; role: string } } | null
}

type Tab = 'overview' | 'training' | 'evaluations' | 'settings'

interface EvaluationItem {
  id: string
  overallRating: number | null
  comments: string | null
  acknowledgedAt: string | null
  createdAt: string
  evaluator?: { id: string; name: string | null; avatarColor?: string }
  template?: { id: string; name: string }
}

const AVATAR_COLORS = [
  '#7C3AED', '#a855f7', '#ec4899', '#FB7185', '#f97316',
  '#f59e0b', '#eab308', '#84cc16', '#22c55e', '#34D399',
  '#14b8a6', '#06b6d4', '#0ea5e9', '#3b82f6', '#64748b',
]

const STAT_THEMES = {
  violet: {
    bar:  'linear-gradient(90deg, #7C3AED 0%, #a855f7 100%)',
    glow: 'rgba(124,58,237,0.35)',
    text: 'linear-gradient(135deg, #c4b5fd 0%, #7C3AED 100%)',
    color: 'violet' as const,
  },
  orange: {
    bar:  'linear-gradient(90deg, #f59e0b 0%, #FB7185 100%)',
    glow: 'rgba(245,158,11,0.35)',
    text: 'linear-gradient(135deg, #fcd34d 0%, #f59e0b 100%)',
    color: 'orange' as const,
  },
  mint: {
    bar:  'linear-gradient(90deg, #10b981 0%, #34D399 100%)',
    glow: 'rgba(52,211,153,0.35)',
    text: 'linear-gradient(135deg, #6ee7b7 0%, #10b981 100%)',
    color: 'mint' as const,
  },
  coral: {
    bar:  'linear-gradient(90deg, #FB7185 0%, #f43f5e 100%)',
    glow: 'rgba(251,113,133,0.35)',
    text: 'linear-gradient(135deg, #fda4af 0%, #FB7185 100%)',
    color: 'coral' as const,
  },
}

// =================================================================
// MAIN
// =================================================================

export default function ProfileClient({
  profile,
  stats,
  initialEnrollments = [],
  session,
}: ProfileProps) {
  const [activeTab, setActiveTab] = useState<Tab>('overview')
  const isOwner = profile.role === 'OWNER'

  const spot = useMouseSpotlight()

  // Compute achievement badges from data on hand. These are intentionally
  // lightweight — they're decorative, computed from props, no DB call.
  const achievements = useMemo(() => {
    const days = Math.max(
      0,
      Math.floor(
        (Date.now() - new Date(profile.createdAt).getTime()) /
          (1000 * 60 * 60 * 24),
      ),
    )
    const list: { icon: React.ComponentType<{ size?: number }>; label: string; color: 'violet' | 'coral' | 'mint' | 'orange' }[] = []
    if (days >= 365) list.push({ icon: Trophy,  label: 'Veteran',         color: 'violet' })
    else if (days >= 90) list.push({ icon: Medal,  label: `${days} days strong`, color: 'violet' })
    else if (days >= 7) list.push({ icon: Sparkles, label: 'New teammate', color: 'mint' })

    if (stats.trainingCompleted >= 5) list.push({ icon: GraduationCap, label: `${stats.trainingCompleted} courses`,   color: 'mint' })
    if (stats.tasksAssigned   >= 50) list.push({ icon: Flame,         label: `${stats.tasksAssigned} tasks`,         color: 'coral' })
    if (stats.evaluationsReceived >= 3) list.push({ icon: Award,      label: 'Reviewed',                              color: 'orange' })
    if (profile.mfaEnabled)            list.push({ icon: Shield,      label: 'Secured',                               color: 'mint' })

    return list.slice(0, 4) // keep it visually tidy
  }, [profile.createdAt, profile.mfaEnabled, stats])

  return (
    <>
      <Container size="xl" py="lg" className="wp-profile-root">

        {/* =========================== HERO =========================== */}
        <div ref={spot.ref} onMouseMove={spot.onMouseMove} style={{ marginBottom: 24 }}>
          <Paper radius="lg" p="xl" className="wp-hero">
            {/* layer 1: animated radial gradient mesh (slowest) */}
            <div className="wp-hero-mesh" aria-hidden />
            {/* layer 2: drifting orbs */}
            <div className="wp-hero-orbs" aria-hidden>
              <span className="wp-orb wp-orb-1" />
              <span className="wp-orb wp-orb-2" />
              <span className="wp-orb wp-orb-3" />
            </div>
            {/* layer 3: mouse spotlight (positioned via CSS vars from useMouseSpotlight) */}
            <div className="wp-hero-spotlight" aria-hidden />

            <img src="/heroes/profile.svg" alt="" aria-hidden="true" style={{ position: "absolute", left: "50%", top: "50%", transform: "translate(-50%, -50%)", height: "70%", zIndex: 0, opacity: 0.22, pointerEvents: "none" }} />
            {/* layer 4: SVG grain texture for the "expensive" feel */}
            <svg className="wp-hero-grain" aria-hidden>
              <filter id="wp-grain">
                <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" stitchTiles="stitch" />
                <feColorMatrix values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 0.4 0" />
              </filter>
              <rect width="100%" height="100%" filter="url(#wp-grain)" />
            </svg>

            <Group align="center" gap="xl" wrap="wrap" style={{ position: 'relative', zIndex: 2 }}>
              {/* Avatar with rotating conic gradient ring */}
              <div className="wp-avatar-wrap">
                <div className="wp-avatar-ring" aria-hidden />
                <Avatar
                  size={108}
                  radius="50%"
                  className="wp-avatar"
                  style={{
                    backgroundColor: profile.avatarColor,
                    color: '#fff',
                    fontSize: '2.2rem',
                    fontWeight: 800,
                    ['--wp-avatar-color' as string]: profile.avatarColor,
                  } as React.CSSProperties}
                >
                  {getInitials(profile.name ?? profile.email ?? 'U')}
                </Avatar>
                {profile.isActive && (
                  <span className="wp-online-dot" aria-label="active" />
                )}
              </div>

              <Stack gap="xs" style={{ flex: 1, minWidth: 240 }}>
                <Group gap="sm" wrap="wrap" align="center">
                  <Title order={1} className="wp-hero-title">
                    {profile.name ?? 'Unnamed User'}
                  </Title>
                  <Badge
                    size="md"
                    variant="light"
                    color="violet"
                    leftSection={isOwner ? <Crown size={12} /> : <Sparkles size={12} />}
                    tt="uppercase"
                    className="wp-role-pill"
                  >
                    {profile.role}
                  </Badge>
                </Group>

                {profile.jobTitle && (
                  <Group gap={6} c="dimmed">
                    <Briefcase size={14} />
                    <Text size="sm" fw={500}>{profile.jobTitle}</Text>
                  </Group>
                )}

                <Group gap="md" wrap="wrap">
                  {profile.email && (
                    <Group gap={6} c="dimmed">
                      <Mail size={13} />
                      <Text size="sm">{profile.email}</Text>
                    </Group>
                  )}
                  {profile.department && (
                    <Badge
                      variant="light"
                      leftSection={<Building2 size={12} />}
                      style={{
                        backgroundColor: `${profile.department.color}22`,
                        color: profile.department.color,
                        borderColor: `${profile.department.color}55`,
                        borderWidth: 1,
                        borderStyle: 'solid',
                      }}
                    >
                      {profile.department.name}
                    </Badge>
                  )}
                  {profile.mfaEnabled && (
                    <Badge variant="light" color="mint" leftSection={<Shield size={11} />}>
                      MFA Enabled
                    </Badge>
                  )}
                </Group>

                {/* Achievement badges row */}
                {achievements.length > 0 && (
                  <Group gap="xs" wrap="wrap" mt={6}>
                    {achievements.map((a, i) => (
                      <Tooltip key={i} label={a.label} withArrow>
                        <Badge
                          variant="light"
                          color={a.color}
                          size="sm"
                          leftSection={<a.icon size={11} />}
                          className="wp-achievement"
                          style={{ animationDelay: `${300 + i * 80}ms` }}
                        >
                          {a.label}
                        </Badge>
                      </Tooltip>
                    ))}
                  </Group>
                )}
              </Stack>
            </Group>
          </Paper>
        </div>

        {/* =========================== STATS =========================== */}
        <SimpleGrid cols={{ base: 2, sm: 4 }} spacing="md" mb="lg">
          <StatCard label="Tasks Assigned"       value={stats.tasksAssigned}       icon={CheckSquare}    theme="violet" delay={0}   />
          <StatCard label="Tickets Created"      value={stats.ticketsCreated}      icon={Ticket}         theme="orange" delay={80}  />
          <StatCard label="Training Completed"   value={stats.trainingCompleted}   icon={GraduationCap}  theme="mint"   delay={160} />
          <StatCard label="Evaluations Received" value={stats.evaluationsReceived} icon={ClipboardCheck} theme="coral"  delay={240} />
        </SimpleGrid>

        {/* =========================== TABS =========================== */}
        <div className="wp-tabs-shell">
          <Tabs
            value={activeTab}
            onChange={(v) => setActiveTab((v ?? 'overview') as Tab)}
            variant="pills"
            radius="md"
            className="wp-tabs"
          >
            <Tabs.List mb="md">
              <Tabs.Tab value="overview"    leftSection={<UserIcon size={14} />}>Overview</Tabs.Tab>
              <Tabs.Tab value="training"    leftSection={<GraduationCap size={14} />}>Training Progress</Tabs.Tab>
              <Tabs.Tab value="evaluations" leftSection={<ClipboardCheck size={14} />}>Evaluations</Tabs.Tab>
              <Tabs.Tab value="settings"    leftSection={<Palette size={14} />}>Settings</Tabs.Tab>
            </Tabs.List>

            <Tabs.Panel value="overview"><OverviewTab profile={profile} /></Tabs.Panel>
            <Tabs.Panel value="training"><TrainingTab enrollments={initialEnrollments} /></Tabs.Panel>
            <Tabs.Panel value="evaluations"><EvaluationsTab userId={profile.id} /></Tabs.Panel>
            <Tabs.Panel value="settings"><SettingsTab profile={profile} /></Tabs.Panel>
          </Tabs>
        </div>
      </Container>

      {/* =========================== STYLES =========================== */}
      <style>{`
        /* --------- Keyframes --------- */
        @keyframes wp-slide-up { from { opacity: 0; transform: translateY(14px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes wp-mesh-drift {
          0%   { transform: translate(0,0) scale(1); }
          50%  { transform: translate(3%, -2%) scale(1.05); }
          100% { transform: translate(0,0) scale(1); }
        }
        @keyframes wp-orb-float-a {
          0%, 100% { transform: translate(0,0); }
          50%      { transform: translate(40px, -30px); }
        }
        @keyframes wp-orb-float-b {
          0%, 100% { transform: translate(0,0); }
          50%      { transform: translate(-30px, 25px); }
        }
        @keyframes wp-orb-float-c {
          0%, 100% { transform: translate(0,0); }
          50%      { transform: translate(20px, 40px); }
        }
        @keyframes wp-conic-rotate { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        @keyframes wp-online-pulse {
          0%, 100% { box-shadow: 0 0 0 0 rgba(52,211,153,0.6); }
          50%      { box-shadow: 0 0 0 6px rgba(52,211,153,0); }
        }
        @media (prefers-reduced-motion: reduce) {
          .wp-profile-root *,
          .wp-profile-root *::before,
          .wp-profile-root *::after {
            animation: none !important;
            transition: none !important;
          }
        }

        /* --------- Hero shell --------- */
        .wp-hero {
          position: relative;
          overflow: hidden;
          border: 1px solid rgba(124,58,237,0.35);
          background:
            linear-gradient(135deg, rgba(124,58,237,0.22) 0%, rgba(251,113,133,0.12) 55%, rgba(52,211,153,0.06) 100%),
            #0b0f1e;
          box-shadow:
            0 1px 0 rgba(255,255,255,0.05) inset,
            0 20px 60px -20px rgba(124,58,237,0.40);
          animation: wp-slide-up 460ms ease-out backwards;
        }
        .wp-hero-mesh {
          position: absolute; inset: -25%;
          background:
            radial-gradient(circle at 22% 30%, rgba(124,58,237,0.45), transparent 42%),
            radial-gradient(circle at 78% 25%, rgba(251,113,133,0.38), transparent 47%),
            radial-gradient(circle at 62% 82%, rgba(52,211,153,0.24), transparent 52%);
          filter: blur(40px);
          animation: wp-mesh-drift 18s ease-in-out infinite;
          z-index: 0;
          pointer-events: none;
        }
        .wp-hero-orbs { position: absolute; inset: 0; z-index: 0; pointer-events: none; }
        .wp-orb {
          position: absolute;
          border-radius: 50%;
          filter: blur(22px);
          opacity: 0.55;
          mix-blend-mode: screen;
        }
        .wp-orb-1 { width: 130px; height: 130px; top: 12%;  left: 8%;
          background: radial-gradient(circle, #a855f7 0%, transparent 70%);
          animation: wp-orb-float-a 12s ease-in-out infinite; }
        .wp-orb-2 { width: 100px; height: 100px; top: 50%;  left: 55%;
          background: radial-gradient(circle, #FB7185 0%, transparent 70%);
          animation: wp-orb-float-b 14s ease-in-out infinite; }
        .wp-orb-3 { width:  80px; height:  80px; bottom: 10%; right: 12%;
          background: radial-gradient(circle, #34D399 0%, transparent 70%);
          animation: wp-orb-float-c 16s ease-in-out infinite; }
        .wp-hero-spotlight {
          position: absolute; inset: 0;
          background: radial-gradient(circle 380px at var(--mx, 50%) var(--my, 50%),
            rgba(255,255,255,0.10), transparent 60%);
          z-index: 1;
          pointer-events: none;
          transition: background 80ms linear;
        }
        .wp-hero-grain {
          position: absolute; inset: 0;
          width: 100%; height: 100%;
          z-index: 1;
          opacity: 0.18;
          mix-blend-mode: overlay;
          pointer-events: none;
        }
        .wp-hero-title {
          font-size: clamp(1.75rem, 3.5vw, 2.6rem);
          font-weight: 800;
          letter-spacing: -0.025em;
          line-height: 1.04;
          margin: 0;
          background: linear-gradient(135deg, #ffffff 0%, #c4b5fd 50%, #FB7185 100%);
          -webkit-background-clip: text; background-clip: text;
          -webkit-text-fill-color: transparent;
          filter: drop-shadow(0 2px 12px rgba(124,58,237,0.40));
        }

        /* --------- Avatar --------- */
        .wp-avatar-wrap {
          position: relative;
          width: 120px; height: 120px;
          display: grid; place-items: center;
          flex-shrink: 0;
        }
        .wp-avatar-ring {
          position: absolute; inset: 0;
          border-radius: 50%;
          padding: 4px;
          background: conic-gradient(from 0deg, #7C3AED, #FB7185, #34D399, #f59e0b, #7C3AED);
          -webkit-mask:
            linear-gradient(#000 0 0) content-box,
            linear-gradient(#000 0 0);
          -webkit-mask-composite: xor;
                  mask-composite: exclude;
          animation: wp-conic-rotate 6s linear infinite;
          filter: drop-shadow(0 0 16px rgba(124,58,237,0.55));
        }
        .wp-avatar {
          border: 3px solid #0b0f1e;
          position: relative;
          z-index: 1;
        }
        .wp-online-dot {
          position: absolute;
          bottom: 6px; right: 6px;
          width: 18px; height: 18px;
          border-radius: 50%;
          background: #34D399;
          border: 3px solid #0b0f1e;
          z-index: 2;
          animation: wp-online-pulse 2s ease-in-out infinite;
        }

        /* --------- Achievement chips --------- */
        .wp-achievement { animation: wp-slide-up 460ms ease-out backwards; }

        /* --------- Stat cards (3D tilt + gradient text) --------- */
        .wp-stat-card {
          position: relative;
          overflow: hidden;
          background: rgba(15, 23, 42, 0.55);
          backdrop-filter: blur(10px);
          -webkit-backdrop-filter: blur(10px);
          transition: transform 200ms ease, box-shadow 260ms ease, border-color 200ms ease;
          animation: wp-slide-up 500ms ease-out backwards;
          transform-style: preserve-3d;
          will-change: transform;
        }
        .wp-stat-card::before {
          content: '';
          position: absolute; top: 0; left: 0; right: 0;
          height: 3px;
          background: var(--wp-bar, linear-gradient(90deg, #7C3AED, #a855f7));
        }
        .wp-stat-card:hover {
          box-shadow: 0 14px 36px var(--wp-glow, rgba(124,58,237,0.35));
          border-color: var(--mantine-color-violet-6);
        }
        .wp-stat-value {
          font-size: clamp(2rem, 3vw, 2.5rem);
          font-weight: 800;
          line-height: 1;
          letter-spacing: -0.03em;
          font-variant-numeric: tabular-nums;
          background: var(--wp-text, linear-gradient(135deg, #c4b5fd 0%, #7C3AED 100%));
          -webkit-background-clip: text; background-clip: text;
          -webkit-text-fill-color: transparent;
        }

        /* --------- Tabs --------- */
        .wp-tabs-shell {
          position: sticky;
          top: 0;
          z-index: 5;
          padding: 4px 0;
          backdrop-filter: blur(12px);
          -webkit-backdrop-filter: blur(12px);
          background: linear-gradient(180deg, rgba(11,15,30,0.85) 0%, rgba(11,15,30,0.50) 100%);
          margin: 0 -4px 12px;
          padding: 8px 4px;
        }
        .wp-tabs [data-active] {
          box-shadow: 0 6px 18px rgba(124,58,237,0.45);
        }

        /* --------- Content cards (glassmorphism) --------- */
        .wp-card {
          background: rgba(15, 23, 42, 0.55);
          backdrop-filter: blur(12px);
          -webkit-backdrop-filter: blur(12px);
          transition: transform 220ms ease, border-color 220ms ease, box-shadow 220ms ease;
          animation: wp-slide-up 500ms ease-out backwards;
        }
        .wp-card:hover {
          border-color: var(--mantine-color-violet-7);
          box-shadow: 0 10px 30px rgba(124,58,237,0.18);
        }
        .wp-section-title {
          background: linear-gradient(135deg, #ffffff 0%, #c4b5fd 100%);
          -webkit-background-clip: text; background-clip: text;
          -webkit-text-fill-color: transparent;
          font-weight: 700;
        }
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
  value: number
  icon: React.ComponentType<{ size?: number }>
  theme: keyof typeof STAT_THEMES
  delay: number
}) {
  const animated = useCountUp(value, 900)
  const tilt = useTilt(6)
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
        className="wp-stat-card"
        style={{
          animationDelay: `${delay}ms`,
          ['--wp-bar' as string]: cfg.bar,
          ['--wp-glow' as string]: cfg.glow,
          ['--wp-text' as string]: cfg.text,
        } as React.CSSProperties}
      >
        <Group gap="sm" align="center">
          <ThemeIcon size="lg" radius="md" variant="light" color={cfg.color}>
            <Icon size={18} />
          </ThemeIcon>
          <Stack gap={2}>
            <Text className="wp-stat-value">{animated}</Text>
            <Text size="xs" c="dimmed">{label}</Text>
          </Stack>
        </Group>
      </Card>
    </div>
  )
}

// ---------- Overview tab ----------

function OverviewTab({ profile }: { profile: ProfileProps['profile'] }) {
  return (
    <Card radius="lg" p="lg" withBorder className="wp-card">
      <Title order={3} mb="md" className="wp-section-title">Personal Information</Title>
      <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
        <InfoItem icon={UserIcon}  label="Full Name"  value={profile.name ?? '—'} />
        <InfoItem icon={Mail}      label="Email"      value={profile.email ?? '—'} />
        <InfoItem icon={Briefcase} label="Job Title"  value={profile.jobTitle ?? 'Not set'} />
        <InfoItem icon={Phone}     label="Phone"      value={profile.phone ?? 'Not set'} />
        <InfoItem icon={Building2} label="Department" value={profile.department?.name ?? 'Unassigned'} />
        <InfoItem icon={Shield}    label="Role"       value={profile.role} />
        <InfoItem icon={Calendar}  label="Joined"     value={formatDate(profile.createdAt)} />
        <InfoItem icon={Clock}     label="Last Login" value={profile.lastLogin ? timeAgo(profile.lastLogin) : 'Never'} />
      </SimpleGrid>
    </Card>
  )
}

function InfoItem({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ size?: number }>
  label: string
  value: string
}) {
  return (
    <Group gap="sm" align="flex-start">
      <ThemeIcon size="md" radius="md" variant="light" color="violet">
        <Icon size={14} />
      </ThemeIcon>
      <Stack gap={2}>
        <Text size="xs" c="dimmed" tt="uppercase" fw={600}>{label}</Text>
        <Text size="sm" fw={500}>{value}</Text>
      </Stack>
    </Group>
  )
}

// ---------- Training tab ----------

function TrainingTab({ enrollments }: { enrollments: TrainingEnrollment[] }) {
  const inProgress = enrollments.filter((e) => e.status !== 'COMPLETED')
  const completed = enrollments.filter((e) => e.status === 'COMPLETED')

  if (enrollments.length === 0) {
    return (
      <Card radius="lg" p="xl" withBorder className="wp-card">
        <Stack align="center" gap="sm" py="xl">
          <ThemeIcon size={48} radius="xl" variant="light" color="violet">
            <BookOpen size={24} />
          </ThemeIcon>
          <Text size="lg" fw={600}>No training enrollments yet</Text>
          <Text size="sm" c="dimmed">Courses you enroll in will appear here.</Text>
        </Stack>
      </Card>
    )
  }

  return (
    <Stack gap="md">
      {inProgress.length > 0 && (
        <Card radius="lg" p="lg" withBorder className="wp-card">
          <Title order={3} mb="md" className="wp-section-title">In Progress</Title>
          <Stack gap="md">
            {inProgress.map((e) => (
              <Box key={e.id}>
                <Group justify="space-between" align="center" mb="xs">
                  <Group gap="sm">
                    <ThemeIcon size="md" radius="md" variant="light" color="violet">
                      <BookOpen size={14} />
                    </ThemeIcon>
                    <Stack gap={0}>
                      <Text fw={600} size="sm">{e.course?.title}</Text>
                      <Text size="xs" c="dimmed">
                        {e.course?.category ?? 'Uncategorized'} • enrolled {timeAgo(e.enrolledAt)}
                      </Text>
                    </Stack>
                  </Group>
                  <Text size="sm" fw={700} c="violet" style={{ fontVariantNumeric: 'tabular-nums' }}>
                    {e.progress ?? 0}%
                  </Text>
                </Group>
                <Progress value={e.progress ?? 0} color="violet" radius="xl" animated striped />
              </Box>
            ))}
          </Stack>
        </Card>
      )}

      {completed.length > 0 && (
        <Card radius="lg" p="lg" withBorder className="wp-card">
          <Title order={3} mb="md" className="wp-section-title">Completed</Title>
          <Stack gap="sm">
            {completed.map((e) => (
              <Group key={e.id} gap="sm" wrap="nowrap">
                <ThemeIcon size="md" radius="md" variant="light" color="mint">
                  <Check size={14} />
                </ThemeIcon>
                <Stack gap={0} style={{ flex: 1 }}>
                  <Text fw={600} size="sm">{e.course?.title}</Text>
                  <Text size="xs" c="dimmed">
                    Completed {e.completedAt ? timeAgo(e.completedAt) : '—'}
                  </Text>
                </Stack>
                {e.quizScore != null && (
                  <Badge variant="light" color="mint">{e.quizScore}%</Badge>
                )}
              </Group>
            ))}
          </Stack>
        </Card>
      )}
    </Stack>
  )
}

// ---------- Evaluations tab ----------

function EvaluationsTab({ userId }: { userId: string }) {
  const [items, setItems] = useState<EvaluationItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        setLoading(true)
        const res = await fetch(`/api/workryn/evaluations?agentId=${encodeURIComponent(userId)}`)
        if (!res.ok) throw new Error('Failed to load evaluations')
        const data = await res.json()
        if (!cancelled) setItems(data?.items ?? data ?? [])
      } catch (err) {
        if (!cancelled) setError((err as Error).message)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [userId])

  async function acknowledge(id: string) {
    try {
      const res = await fetch(`/api/workryn/evaluations/${id}/acknowledge`, { method: 'POST' })
      if (!res.ok) throw new Error('Failed to acknowledge')
      setItems((prev) => prev.map((it) =>
        it.id === id ? { ...it, acknowledgedAt: new Date().toISOString() } : it
      ))
      notifications.show({ title: 'Acknowledged', message: 'Evaluation acknowledged.', color: 'mint' })
    } catch (err) {
      notifications.show({ title: 'Error', message: (err as Error).message, color: 'coral' })
    }
  }

  if (loading) {
    return (
      <Card radius="lg" p="xl" withBorder className="wp-card">
        <Group justify="center" py="xl"><Loader color="violet" /></Group>
      </Card>
    )
  }

  if (error) {
    return <Alert icon={<AlertCircle size={16} />} color="coral" variant="light">{error}</Alert>
  }

  if (items.length === 0) {
    return (
      <Card radius="lg" p="xl" withBorder className="wp-card">
        <Stack align="center" gap="sm" py="xl">
          <ThemeIcon size={48} radius="xl" variant="light" color="violet">
            <ClipboardCheck size={24} />
          </ThemeIcon>
          <Text size="lg" fw={600}>No evaluations yet</Text>
          <Text size="sm" c="dimmed">Evaluations from your manager will appear here.</Text>
        </Stack>
      </Card>
    )
  }

  return (
    <Stack gap="md">
      {items.map((it) => (
        <Card key={it.id} radius="lg" p="lg" withBorder className="wp-card">
          <Group justify="space-between" align="flex-start" mb="sm">
            <Stack gap={2}>
              <Text fw={600}>{it.template?.name ?? 'Evaluation'}</Text>
              <Text size="xs" c="dimmed">
                {it.evaluator?.name ?? 'Manager'} • {timeAgo(it.createdAt)}
              </Text>
            </Stack>
            {it.overallRating != null && (
              <Group gap={4}>
                <Rating value={it.overallRating} readOnly fractions={2} />
                <Text size="sm" c="dimmed">{it.overallRating.toFixed(1)}</Text>
              </Group>
            )}
          </Group>

          {it.comments && (
            <>
              <Divider my="sm" />
              <Text size="sm" style={{ whiteSpace: 'pre-wrap' }}>{it.comments}</Text>
            </>
          )}

          <Divider my="sm" />
          <Group justify="space-between" align="center">
            {it.acknowledgedAt ? (
              <Badge variant="light" color="mint" leftSection={<Check size={12} />}>
                Acknowledged {timeAgo(it.acknowledgedAt)}
              </Badge>
            ) : (
              <Badge variant="light" color="coral">Awaiting acknowledgment</Badge>
            )}
            {!it.acknowledgedAt && (
              <Button size="xs" variant="light" color="violet"
                leftSection={<Check size={14} />}
                onClick={() => acknowledge(it.id)}>
                Acknowledge
              </Button>
            )}
          </Group>
        </Card>
      ))}
    </Stack>
  )
}

// ---------- Settings tab ----------

function SettingsTab({ profile }: { profile: ProfileProps['profile'] }) {
  const isAdmin = profile.role === 'OWNER' || profile.role === 'ADMIN'

  const [name, setName] = useState(profile.name ?? '')
  const [jobTitle, setJobTitle] = useState(profile.jobTitle ?? '')
  const [phone, setPhone] = useState(profile.phone ?? '')
  const [avatarColor, setAvatarColor] = useState(profile.avatarColor)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    setSuccess(false)
    try {
      const body: Record<string, unknown> = { name, phone, avatarColor }
      if (isAdmin) body.jobTitle = jobTitle || null

      const res = await fetch(`/api/workryn/profile/me`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setError(data?.error ?? 'Failed to update profile.')
        setSaving(false)
        return
      }

      setSuccess(true)
      notifications.show({ title: 'Saved', message: 'Profile updated successfully.', color: 'mint' })
    } catch {
      setError('Network error. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card radius="lg" p="lg" withBorder className="wp-card">
      <Title order={3} mb="md" className="wp-section-title">Edit Profile</Title>

      {error && (
        <Alert icon={<AlertCircle size={16} />} color="coral" variant="light" mb="md">{error}</Alert>
      )}
      {success && (
        <Alert icon={<Check size={16} />} color="mint" variant="light" mb="md">
          Profile updated successfully.
        </Alert>
      )}

      <form onSubmit={handleSave}>
        <Stack gap="md">
          <TextInput
            label="Full Name"
            placeholder="Your full name"
            value={name}
            onChange={(e) => setName(e.currentTarget.value)}
          />

          <TextInput
            label="Job Title"
            placeholder="e.g. Support Specialist"
            value={jobTitle}
            onChange={(e) => setJobTitle(e.currentTarget.value)}
            disabled={!isAdmin}
            description={!isAdmin ? 'Only administrators can edit job titles.' : undefined}
          />

          <TextInput
            label="Phone"
            placeholder="Optional"
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.currentTarget.value)}
            description="Phone updates via admin API require elevated permissions."
          />

          <Box>
            <Text size="sm" fw={500} mb={6}>Avatar Color</Text>
            <Group gap="xs" wrap="wrap">
              {AVATAR_COLORS.map((c) => (
                <ColorSwatch
                  key={c}
                  color={c}
                  size={32}
                  style={{
                    cursor: 'pointer',
                    border: c === avatarColor
                      ? '3px solid var(--mantine-color-violet-6)'
                      : '3px solid transparent',
                    transition: 'transform 160ms ease, box-shadow 160ms ease',
                    transform: c === avatarColor ? 'scale(1.12)' : 'scale(1)',
                    boxShadow: c === avatarColor ? `0 0 20px ${c}80` : 'none',
                  }}
                  onClick={() => setAvatarColor(c)}
                >
                  {c === avatarColor && <Check size={16} color="#fff" strokeWidth={3} />}
                </ColorSwatch>
              ))}
            </Group>
          </Box>

          <Group justify="flex-end">
            <Button
              type="submit"
              loading={saving}
              leftSection={<Save size={16} />}
              color="violet"
              size="md"
              style={{ boxShadow: '0 4px 14px rgba(124,58,237,0.40)' }}
            >
              Save Changes
            </Button>
          </Group>
        </Stack>
      </form>
    </Card>
  )
}
