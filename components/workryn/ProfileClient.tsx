'use client'

/**
 * ProfileClient — Mantine v9 rewrite (Phase 2, page #1 of 8).
 *
 * Visual identity: "Energetic Product" per the Workryn brand plan.
 *   Primary  : violet  #7C3AED   (theme.colors.violet[6])
 *   Accent   : coral   #FB7185   (theme.colors.coral[4])
 *   Success  : mint    #34D399   (theme.colors.mint[4])
 *
 * Behavior parity with the previous (CSS-prefixed) version:
 *   - Same props interface — page.tsx unchanged.
 *   - Same API endpoints: /api/workryn/profile/me (PUT),
 *     /api/workryn/evaluations?agentId=… (GET),
 *     /api/workryn/evaluations/:id/acknowledge (POST).
 *   - Same tabs: Overview / Training / Evaluations / Settings.
 *   - Owner crown indicator preserved; MFA badge preserved.
 *   - jobTitle remains admin-only in the PUT payload.
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
  Star,
  Ticket,
  User as UserIcon,
} from 'lucide-react'
import { getInitials, formatDate, timeAgo } from '@/lib/workryn/utils'

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
    <Container size="xl" py="lg">
      {/* ---------- Header ---------- */}
      <Paper
        radius="lg"
        p="xl"
        mb="lg"
        style={{
          background:
            'linear-gradient(135deg, rgba(124,58,237,0.18) 0%, rgba(251,113,133,0.10) 100%)',
          border: '1px solid var(--mantine-color-violet-9)',
        }}
      >
        <Group align="center" gap="xl" wrap="wrap">
          <Avatar
            size={96}
            radius="50%"
            style={{
              backgroundColor: profile.avatarColor,
              color: '#fff',
              fontSize: '2rem',
              fontWeight: 800,
              border: '3px solid rgba(255,255,255,0.08)',
              boxShadow: `0 0 32px ${profile.avatarColor}66`,
            }}
          >
            {getInitials(profile.name ?? profile.email ?? 'U')}
          </Avatar>

          <Stack gap="xs" style={{ flex: 1, minWidth: 240 }}>
            <Group gap="sm" wrap="wrap" align="center">
              <Title order={1} size="h2" fw={800} lh={1.1}>
                {profile.name ?? 'Unnamed User'}
              </Title>
              <Badge
                size="md"
                variant="light"
                color="violet"
                leftSection={isOwner ? <Crown size={12} /> : null}
                tt="uppercase"
              >
                {profile.role}
              </Badge>
            </Group>

            {profile.jobTitle && (
              <Group gap={6} c="dimmed">
                <Briefcase size={14} />
                <Text size="sm" fw={500}>
                  {profile.jobTitle}
                </Text>
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
                    borderColor: `${profile.department.color}44`,
                    borderWidth: 1,
                    borderStyle: 'solid',
                  }}
                >
                  {profile.department.name}
                </Badge>
              )}
              {profile.mfaEnabled && (
                <Badge
                  variant="light"
                  color="mint"
                  leftSection={<Shield size={11} />}
                >
                  MFA Enabled
                </Badge>
              )}
            </Group>
          </Stack>
        </Group>
      </Paper>

      {/* ---------- Stats Grid ---------- */}
      <SimpleGrid cols={{ base: 2, sm: 4 }} spacing="md" mb="lg">
        <StatCard
          label="Tasks Assigned"
          value={stats.tasksAssigned}
          icon={CheckSquare}
          color="violet"
        />
        <StatCard
          label="Tickets Created"
          value={stats.ticketsCreated}
          icon={Ticket}
          color="orange"
        />
        <StatCard
          label="Training Completed"
          value={stats.trainingCompleted}
          icon={GraduationCap}
          color="mint"
        />
        <StatCard
          label="Evaluations Received"
          value={stats.evaluationsReceived}
          icon={ClipboardCheck}
          color="coral"
        />
      </SimpleGrid>

      {/* ---------- Tabs ---------- */}
      <Tabs
        value={activeTab}
        onChange={(v) => setActiveTab((v ?? 'overview') as Tab)}
        variant="pills"
        radius="md"
      >
        <Tabs.List mb="md">
          <Tabs.Tab value="overview" leftSection={<UserIcon size={14} />}>
            Overview
          </Tabs.Tab>
          <Tabs.Tab value="training" leftSection={<GraduationCap size={14} />}>
            Training Progress
          </Tabs.Tab>
          <Tabs.Tab value="evaluations" leftSection={<ClipboardCheck size={14} />}>
            Evaluations
          </Tabs.Tab>
          <Tabs.Tab value="settings" leftSection={<Palette size={14} />}>
            Settings
          </Tabs.Tab>
        </Tabs.List>

        <Tabs.Panel value="overview">
          <OverviewTab profile={profile} />
        </Tabs.Panel>
        <Tabs.Panel value="training">
          <TrainingTab enrollments={initialEnrollments} />
        </Tabs.Panel>
        <Tabs.Panel value="evaluations">
          <EvaluationsTab userId={profile.id} />
        </Tabs.Panel>
        <Tabs.Panel value="settings">
          <SettingsTab profile={profile} />
        </Tabs.Panel>
      </Tabs>
    </Container>
  )
}

// =================================================================
// SUB-COMPONENTS
// =================================================================

function StatCard({
  label,
  value,
  icon: Icon,
  color,
}: {
  label: string
  value: number
  icon: React.ComponentType<{ size?: number }>
  color: string
}) {
  return (
    <Card radius="lg" p="md" withBorder>
      <Group gap="sm" align="center">
        <ThemeIcon size="lg" radius="md" variant="light" color={color}>
          <Icon size={18} />
        </ThemeIcon>
        <Stack gap={2}>
          <Text size="xl" fw={700} lh={1}>
            {value}
          </Text>
          <Text size="xs" c="dimmed">
            {label}
          </Text>
        </Stack>
      </Group>
    </Card>
  )
}

// ---------- Overview tab ----------

function OverviewTab({ profile }: { profile: ProfileProps['profile'] }) {
  return (
    <Card radius="lg" p="lg" withBorder>
      <Title order={3} mb="md">
        Personal Information
      </Title>
      <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
        <InfoItem icon={UserIcon} label="Full Name" value={profile.name ?? '—'} />
        <InfoItem icon={Mail} label="Email" value={profile.email ?? '—'} />
        <InfoItem
          icon={Briefcase}
          label="Job Title"
          value={profile.jobTitle ?? 'Not set'}
        />
        <InfoItem icon={Phone} label="Phone" value={profile.phone ?? 'Not set'} />
        <InfoItem
          icon={Building2}
          label="Department"
          value={profile.department?.name ?? 'Unassigned'}
        />
        <InfoItem icon={Shield} label="Role" value={profile.role} />
        <InfoItem
          icon={Calendar}
          label="Joined"
          value={formatDate(profile.createdAt)}
        />
        <InfoItem
          icon={Clock}
          label="Last Login"
          value={profile.lastLogin ? timeAgo(profile.lastLogin) : 'Never'}
        />
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
        <Text size="xs" c="dimmed" tt="uppercase" fw={600}>
          {label}
        </Text>
        <Text size="sm" fw={500}>
          {value}
        </Text>
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
      <Card radius="lg" p="xl" withBorder>
        <Stack align="center" gap="sm" py="xl">
          <ThemeIcon size={48} radius="xl" variant="light" color="violet">
            <BookOpen size={24} />
          </ThemeIcon>
          <Text size="lg" fw={600}>
            No training enrollments yet
          </Text>
          <Text size="sm" c="dimmed">
            Courses you enroll in will appear here.
          </Text>
        </Stack>
      </Card>
    )
  }

  return (
    <Stack gap="md">
      {inProgress.length > 0 && (
        <Card radius="lg" p="lg" withBorder>
          <Title order={3} mb="md">
            In Progress
          </Title>
          <Stack gap="md">
            {inProgress.map((e) => (
              <Box key={e.id}>
                <Group justify="space-between" align="center" mb="xs">
                  <Group gap="sm">
                    <ThemeIcon size="md" radius="md" variant="light" color="violet">
                      <BookOpen size={14} />
                    </ThemeIcon>
                    <Stack gap={0}>
                      <Text fw={600} size="sm">
                        {e.course?.title}
                      </Text>
                      <Text size="xs" c="dimmed">
                        {e.course?.category ?? 'Uncategorized'} • enrolled{' '}
                        {timeAgo(e.enrolledAt)}
                      </Text>
                    </Stack>
                  </Group>
                  <Text size="sm" fw={600} c="violet">
                    {e.progress ?? 0}%
                  </Text>
                </Group>
                <Progress value={e.progress ?? 0} color="violet" radius="xl" />
              </Box>
            ))}
          </Stack>
        </Card>
      )}

      {completed.length > 0 && (
        <Card radius="lg" p="lg" withBorder>
          <Title order={3} mb="md">
            Completed
          </Title>
          <Stack gap="sm">
            {completed.map((e) => (
              <Group key={e.id} gap="sm" wrap="nowrap">
                <ThemeIcon size="md" radius="md" variant="light" color="mint">
                  <Check size={14} />
                </ThemeIcon>
                <Stack gap={0} style={{ flex: 1 }}>
                  <Text fw={600} size="sm">
                    {e.course?.title}
                  </Text>
                  <Text size="xs" c="dimmed">
                    Completed {e.completedAt ? timeAgo(e.completedAt) : '—'}
                  </Text>
                </Stack>
                {e.quizScore != null && (
                  <Badge variant="light" color="mint">
                    {e.quizScore}%
                  </Badge>
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
        const res = await fetch(
          `/api/workryn/evaluations?agentId=${encodeURIComponent(userId)}`,
        )
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
    return () => {
      cancelled = true
    }
  }, [userId])

  async function acknowledge(id: string) {
    try {
      const res = await fetch(`/api/workryn/evaluations/${id}/acknowledge`, {
        method: 'POST',
      })
      if (!res.ok) throw new Error('Failed to acknowledge')
      setItems((prev) =>
        prev.map((it) =>
          it.id === id ? { ...it, acknowledgedAt: new Date().toISOString() } : it,
        ),
      )
      notifications.show({
        title: 'Acknowledged',
        message: 'Evaluation acknowledged.',
        color: 'mint',
      })
    } catch (err) {
      notifications.show({
        title: 'Error',
        message: (err as Error).message,
        color: 'coral',
      })
    }
  }

  if (loading) {
    return (
      <Card radius="lg" p="xl" withBorder>
        <Group justify="center" py="xl">
          <Loader color="violet" />
        </Group>
      </Card>
    )
  }

  if (error) {
    return (
      <Alert icon={<AlertCircle size={16} />} color="coral" variant="light">
        {error}
      </Alert>
    )
  }

  if (items.length === 0) {
    return (
      <Card radius="lg" p="xl" withBorder>
        <Stack align="center" gap="sm" py="xl">
          <ThemeIcon size={48} radius="xl" variant="light" color="violet">
            <ClipboardCheck size={24} />
          </ThemeIcon>
          <Text size="lg" fw={600}>
            No evaluations yet
          </Text>
          <Text size="sm" c="dimmed">
            Evaluations from your manager will appear here.
          </Text>
        </Stack>
      </Card>
    )
  }

  return (
    <Stack gap="md">
      {items.map((it) => (
        <Card key={it.id} radius="lg" p="lg" withBorder>
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
                <Text size="sm" c="dimmed">
                  {it.overallRating.toFixed(1)}
                </Text>
              </Group>
            )}
          </Group>

          {it.comments && (
            <>
              <Divider my="sm" />
              <Text size="sm" style={{ whiteSpace: 'pre-wrap' }}>
                {it.comments}
              </Text>
            </>
          )}

          <Divider my="sm" />
          <Group justify="space-between" align="center">
            {it.acknowledgedAt ? (
              <Badge variant="light" color="mint" leftSection={<Check size={12} />}>
                Acknowledged {timeAgo(it.acknowledgedAt)}
              </Badge>
            ) : (
              <Badge variant="light" color="coral">
                Awaiting acknowledgment
              </Badge>
            )}
            {!it.acknowledgedAt && (
              <Button
                size="xs"
                variant="light"
                color="violet"
                leftSection={<Check size={14} />}
                onClick={() => acknowledge(it.id)}
              >
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
      // jobTitle is admin-only on /api/profile/me — only include for admins
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
      notifications.show({
        title: 'Saved',
        message: 'Profile updated successfully.',
        color: 'mint',
      })
    } catch {
      setError('Network error. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card radius="lg" p="lg" withBorder>
      <Title order={3} mb="md">
        Edit Profile
      </Title>

      {error && (
        <Alert icon={<AlertCircle size={16} />} color="coral" variant="light" mb="md">
          {error}
        </Alert>
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
            description={
              !isAdmin ? 'Only administrators can edit job titles.' : undefined
            }
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
            <Text size="sm" fw={500} mb={6}>
              Avatar Color
            </Text>
            <Group gap="xs" wrap="wrap">
              {AVATAR_COLORS.map((c) => (
                <ColorSwatch
                  key={c}
                  color={c}
                  size={32}
                  style={{
                    cursor: 'pointer',
                    border:
                      c === avatarColor
                        ? '3px solid var(--mantine-color-violet-6)'
                        : '3px solid transparent',
                    transition: 'transform 120ms ease',
                    transform: c === avatarColor ? 'scale(1.1)' : 'scale(1)',
                  }}
                  onClick={() => setAvatarColor(c)}
                >
                  {c === avatarColor && (
                    <Check size={16} color="#fff" strokeWidth={3} />
                  )}
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
            >
              Save Changes
            </Button>
          </Group>
        </Stack>
      </form>
    </Card>
  )
}
