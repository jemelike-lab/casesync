'use client'

/**
 * ProfileClient — Mantine v9, enhanced visual identity pass.
 *
 * Builds on the first Mantine port with the dashboard's signature
 * animation language:
 *   - Animated gradient mesh in the hero (CSS keyframes, slow drift)
 *   - useCountUp on stat numbers (existing SSR-safe hook from /hooks)
 *   - Gradient accent bars on top of every stat card
 *   - Staggered slide-up entrance (80ms steps)
 *   - Hover lift + brand-colored shadow on cards
 *   - Pulsing glow ring on avatar matched to avatarColor
 *   - Gradient text on the headline and section titles
 *
 * Behavior contract is identical to the previous version:
 *   - Same props interface — page.tsx unchanged.
 *   - Same API endpoints: PUT /api/workryn/profile/me,
 *     GET /api/workryn/evaluations?agentId=,
 *     POST /api/workryn/evaluations/:id/acknowledge.
 */

import { useEffect, useState } from 'react'
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
} from '@mantine/core'
import { notifications } from '@mantine/notifications'
import {
  AlertCircle,
  BookOpen,
  Briefcase,
  Building2,
  Calendar,
  Check,
  CheckSquare,
  ClipboardCheck,
  Clock,
  Crown,
  GraduationCap,
  Mail,
  Palette,
  Phone,
  Save,
  Shield,
  Sparkles,
  Ticket,
  User as UserIcon,
} from 'lucide-react'
import { getInitials, formatDate, timeAgo } from '@/lib/workryn/utils'
import { useCountUp } from '@/hooks/useCountUp'

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

// Per-stat-card visual config: accent gradient + icon color.
const STAT_THEMES = {
  violet: {
    bar: 'linear-gradient(90deg, #7C3AED 0%, #a855f7 100%)',
    glow: 'rgba(124,58,237,0.30)',
    color: 'violet' as const,
  },
  orange: {
    bar: 'linear-gradient(90deg, #f59e0b 0%, #FB7185 100%)',
    glow: 'rgba(245,158,11,0.30)',
    color: 'orange' as const,
  },
  mint: {
    bar: 'linear-gradient(90deg, #10b981 0%, #34D399 100%)',
    glow: 'rgba(52,211,153,0.30)',
    color: 'mint' as const,
  },
  coral: {
    bar: 'linear-gradient(90deg, #FB7185 0%, #f43f5e 100%)',
    glow: 'rgba(251,113,133,0.30)',
    color: 'coral' as const,
  },
}

// =================================================================
// MAIN COMPONENT
// =================================================================

export default function ProfileClient({
  profile,
  stats,
  initialEnrollments = [],
  session,
}: ProfileProps) {
  const [activeTab, setActiveTab] = useState<Tab>('overview')
  const isOwner = profile.role === 'OWNER'

  return (
    <>
      <Container size="xl" py="lg" className="wp-profile-root">
        {/* ---------- Header ---------- */}
        <Paper radius="lg" p="xl" mb="lg" className="wp-hero">
          {/* Drifting gradient mesh background layer */}
          <div className="wp-hero-mesh" aria-hidden />

          <Group align="center" gap="xl" wrap="wrap" style={{ position: 'relative', zIndex: 1 }}>
            <div className="wp-avatar-wrap">
              <Avatar
                size={104}
                radius="50%"
                className="wp-avatar"
                style={{
                  backgroundColor: profile.avatarColor,
                  color: '#fff',
                  fontSize: '2.1rem',
                  fontWeight: 800,
                  // CSS variable consumed by the pulse keyframe
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
            </Stack>
          </Group>
        </Paper>

        {/* ---------- Stats Grid ---------- */}
        <SimpleGrid cols={{ base: 2, sm: 4 }} spacing="md" mb="lg">
          <StatCard label="Tasks Assigned"      value={stats.tasksAssigned}      icon={CheckSquare}     theme="violet" delay={0}   />
          <StatCard label="Tickets Created"     value={stats.ticketsCreated}     icon={Ticket}          theme="orange" delay={80}  />
          <StatCard label="Training Completed"  value={stats.trainingCompleted}  icon={GraduationCap}   theme="mint"   delay={160} />
          <StatCard label="Evaluations Received" value={stats.evaluationsReceived} icon={ClipboardCheck} theme="coral"  delay={240} />
        </SimpleGrid>

        {/* ---------- Tabs ---------- */}
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
      </Container>

      {/* ---------------- Scoped visual identity styles ---------------- */}
      <style>{`
        @keyframes wp-slide-up {
          from { opacity: 0; transform: translateY(12px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes wp-mesh-drift {
          0%   { transform: translate(0, 0) scale(1); }
          50%  { transform: translate(3%, -2%) scale(1.05); }
          100% { transform: translate(0, 0) scale(1); }
        }
        @keyframes wp-avatar-pulse {
          0%, 100% { box-shadow: 0 0 0 0 var(--wp-avatar-color, #7C3AED), 0 0 32px var(--wp-avatar-color, #7C3AED); }
          50%      { box-shadow: 0 0 0 8px transparent, 0 0 48px var(--wp-avatar-color, #7C3AED); }
        }
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

        /* ---------- Hero ---------- */
        .wp-hero {
          position: relative;
          overflow: hidden;
          border: 1px solid var(--mantine-color-violet-9);
          background:
            linear-gradient(135deg, rgba(124,58,237,0.20) 0%, rgba(251,113,133,0.10) 60%, rgba(52,211,153,0.06) 100%);
          animation: wp-slide-up 420ms ease-out backwards;
        }
        .wp-hero-mesh {
          position: absolute;
          inset: -25%;
          background:
            radial-gradient(circle at 20% 30%, rgba(124,58,237,0.35), transparent 40%),
            radial-gradient(circle at 80% 20%, rgba(251,113,133,0.30), transparent 45%),
            radial-gradient(circle at 60% 80%, rgba(52,211,153,0.20), transparent 50%);
          filter: blur(36px);
          animation: wp-mesh-drift 18s ease-in-out infinite;
          z-index: 0;
          pointer-events: none;
        }
        .wp-hero-title {
          font-size: clamp(1.75rem, 3.5vw, 2.5rem);
          font-weight: 800;
          letter-spacing: -0.02em;
          line-height: 1.05;
          margin: 0;
          background: linear-gradient(135deg, #fff 0%, #c4b5fd 50%, #FB7185 100%);
          -webkit-background-clip: text;
          background-clip: text;
          -webkit-text-fill-color: transparent;
        }

        /* ---------- Avatar ---------- */
        .wp-avatar-wrap {
          position: relative;
          flex-shrink: 0;
        }
        .wp-avatar {
          border: 3px solid rgba(255,255,255,0.08);
          animation: wp-avatar-pulse 3.6s ease-in-out infinite;
        }
        .wp-online-dot {
          position: absolute;
          bottom: 4px;
          right: 4px;
          width: 16px;
          height: 16px;
          border-radius: 50%;
          background: #34D399;
          border: 3px solid #0f172a;
          animation: wp-online-pulse 2s ease-in-out infinite;
        }

        /* ---------- Stat cards ---------- */
        .wp-stat-card {
          position: relative;
          overflow: hidden;
          transition: transform 220ms ease, box-shadow 220ms ease, border-color 220ms ease;
          animation: wp-slide-up 460ms ease-out backwards;
        }
        .wp-stat-card::before {
          content: '';
          position: absolute;
          top: 0; left: 0; right: 0;
          height: 3px;
          background: var(--wp-bar, linear-gradient(90deg, #7C3AED, #a855f7));
        }
        .wp-stat-card:hover {
          transform: translateY(-3px);
          box-shadow: 0 12px 28px var(--wp-glow, rgba(124,58,237,0.30));
          border-color: var(--mantine-color-violet-7);
        }
        .wp-stat-value {
          font-size: 1.75rem;
          font-weight: 800;
          line-height: 1;
          letter-spacing: -0.02em;
          font-variant-numeric: tabular-nums;
        }

        /* ---------- Tabs ---------- */
        .wp-tabs [data-active] {
          box-shadow: 0 4px 14px rgba(124,58,237,0.35);
        }

        /* ---------- Content cards: lift on hover ---------- */
        .wp-card {
          transition: transform 200ms ease, border-color 200ms ease;
          animation: wp-slide-up 460ms ease-out backwards;
        }
        .wp-card:hover {
          border-color: var(--mantine-color-violet-8);
        }

        /* Section titles get the gradient too */
        .wp-section-title {
          background: linear-gradient(135deg, #fff 0%, #c4b5fd 100%);
          -webkit-background-clip: text;
          background-clip: text;
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
  const cfg = STAT_THEMES[theme]

  return (
    <Card
      radius="lg"
      p="md"
      withBorder
      className="wp-stat-card"
      style={{
        animationDelay: `${delay}ms`,
        ['--wp-bar' as string]: cfg.bar,
        ['--wp-glow' as string]: cfg.glow,
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
  )
}

// ---------- Overview tab ----------

function OverviewTab({ profile }: { profile: ProfileProps['profile'] }) {
  return (
    <Card radius="lg" p="lg" withBorder className="wp-card">
      <Title order={3} mb="md" className="wp-section-title">
        Personal Information
      </Title>
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
                <Progress value={e.progress ?? 0} color="violet" radius="xl" animated />
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
              style={{
                boxShadow: '0 4px 14px rgba(124,58,237,0.35)',
              }}
            >
              Save Changes
            </Button>
          </Group>
        </Stack>
      </form>
    </Card>
  )
}
