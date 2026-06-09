'use client'

/**
 * DepartmentsClient — Aurora rebuild (indigo accent).
 *
 * Structurally distinct: department cards grid is the centerpiece.
 * Stats are baked into the hero subtitle instead of a separate
 * stat-tile row, so the cards get all the screen weight. Each card
 * uses its OWN department color as its accent stripe + icon halo +
 * hover shadow tint — so the grid feels like a colorful showcase
 * rather than a uniform palette.
 *
 * API contract preserved:
 *   POST /api/workryn/departments
 *
 * Clicking a card navigates to /w/departments/:id.
 */

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  ActionIcon, Alert, Avatar, Badge, Box, Button, Card, ColorSwatch,
  Container, Group, Modal, Paper, SimpleGrid, Stack, Text, TextInput,
  Textarea, ThemeIcon, Title, Tooltip,
} from '@mantine/core'
import { useDisclosure } from '@mantine/hooks'
import {
  Briefcase, Building2, CheckSquare, ChevronRight, Code, Crown,
  Headphones, Heart, Plus, Search, Settings as SettingsIcon,
  ShieldCheck, Ticket as TicketIcon, UserCheck, UserX, Users, AlertTriangle,
} from 'lucide-react'
import { getInitials } from '@/lib/workryn/utils'
import { useCountUp } from '@/hooks/useCountUp'
import { useTilt, useMouseSpotlight } from '@/hooks/workrynEffects'

/* ─── Types ─────────────────────────────────────────────────── */
type DeptHead = {
  id: string; name: string | null; avatarColor: string
  jobTitle: string | null; role: string
} | null

export type DepartmentListItem = {
  id: string; name: string; slug: string; description: string | null
  color: string; icon: string
  createdAt: string; updatedAt: string
  head: DeptHead
  _count: { users: number; tasks: number; tickets: number }
}

type UserOption = {
  id: string; name: string | null; email: string | null
  jobTitle: string | null; role: string; avatarColor: string
  departmentId: string | null
}

interface Props {
  initialDepartments: DepartmentListItem[]
  users: UserOption[]
  currentUserRole: string
}

/* ─── Icon registry (preserved) ──────────────────────────────── */
export const DEPT_ICON_OPTIONS = [
  { key: 'building-2',  label: 'Building',  Icon: Building2 },
  { key: 'briefcase',   label: 'Briefcase', Icon: Briefcase },
  { key: 'users',       label: 'Users',     Icon: Users },
  { key: 'heart',       label: 'Heart',     Icon: Heart },
  { key: 'code',        label: 'Code',      Icon: Code },
  { key: 'settings',    label: 'Settings',  Icon: SettingsIcon },
  { key: 'shield-check',label: 'Shield',    Icon: ShieldCheck },
  { key: 'headphones',  label: 'Support',   Icon: Headphones },
] as const

export const TEAM_BADGES: ReadonlySet<string> = new Set([
  'maroon-musketeers','white-diamonds','indigo-gladiators',
  'bronze-butterflies','silver-titans','sage-sharks',
  'emerald-guardians','purple-penguins','blue-giants','gold-giants',
])

export function getDeptIcon(key: string) {
  return DEPT_ICON_OPTIONS.find((o) => o.key === key)?.Icon ?? Building2
}

export const DEPT_COLOR_SWATCHES = [
  '#6366F1', '#7C3AED', '#ec4899', '#FB7185',
  '#F59E0B', '#10B981', '#06B6D4', '#0EA5E9',
] as const

// =================================================================
// MAIN
// =================================================================

export default function DepartmentsClient({ initialDepartments, users, currentUserRole }: Props) {
  const router = useRouter()
  const isAdmin = currentUserRole === 'OWNER' || currentUserRole === 'ADMIN'

  const [departments, setDepartments] = useState<DepartmentListItem[]>(initialDepartments)
  const [search, setSearch] = useState('')
  const [modalOpened, modal] = useDisclosure(false)
  const [saving, setSaving] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)
  const [form, setForm] = useState({
    name: '', description: '', color: DEPT_COLOR_SWATCHES[0] as string,
    icon: 'building-2', headId: '',
  })

  const spot = useMouseSpotlight()

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return departments
    return departments.filter((d) =>
      d.name.toLowerCase().includes(q) ||
      (d.description ?? '').toLowerCase().includes(q) ||
      (d.head?.name ?? '').toLowerCase().includes(q)
    )
  }, [departments, search])

  const stats = useMemo(() => {
    const totalMembers = departments.reduce((sum, d) => sum + d._count.users, 0)
    const withHead = departments.filter((d) => d.head).length
    return {
      total: departments.length,
      totalMembers,
      withHead,
      withoutHead: departments.length - withHead,
    }
  }, [departments])

  const animTotal   = useCountUp(stats.total, 700)
  const animMembers = useCountUp(stats.totalMembers, 800)
  const animHeads   = useCountUp(stats.withHead, 700)

  function openCreate() {
    setForm({ name: '', description: '', color: DEPT_COLOR_SWATCHES[0] as string, icon: 'building-2', headId: '' })
    setCreateError(null)
    modal.open()
  }

  async function handleCreate() {
    if (!form.name.trim()) return
    setSaving(true); setCreateError(null)
    try {
      const res = await fetch('/api/workryn/departments', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name.trim(),
          description: form.description.trim() || undefined,
          color: form.color, icon: form.icon,
          headId: form.headId || undefined,
        }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        setCreateError(err.error || 'Failed to create department')
        return
      }
      const created = await res.json()
      setDepartments((d) => [...d, created].sort((a, b) => a.name.localeCompare(b.name)))
      modal.close()
    } catch {
      setCreateError('Failed to create department')
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <Container size="xl" py="lg" className="dpa-root">

        {/* ============ HERO (stats baked in) ============ */}
        <div ref={spot.ref} onMouseMove={spot.onMouseMove} style={{ marginBottom: 20 }}>
          <Paper radius="lg" p="xl" className="dpa-hero">
            <div className="dpa-hero-mesh" aria-hidden />
            <div className="dpa-hero-orbs" aria-hidden>
              <span className="dpa-orb dpa-orb-1" />
              <span className="dpa-orb dpa-orb-2" />
              <span className="dpa-orb dpa-orb-3" />
            </div>
            <div className="dpa-hero-spotlight" aria-hidden />

            <Group justify="space-between" align="flex-start" wrap="wrap" gap="lg" style={{ position: 'relative', zIndex: 2 }}>
              <Stack gap={6} style={{ minWidth: 0, flex: 1 }}>
                <Group gap={8} align="center">
                  <Building2 size={14} style={{ color: 'rgba(165,180,252,0.9)' }} />
                  <Text size="xs" tt="uppercase" fw={700} c="indigo.3" style={{ letterSpacing: '0.12em' }}>
                    Departments
                  </Text>
                </Group>
                <Title order={1} className="dpa-hero-title">
                  {animTotal} {animTotal === 1 ? 'team' : 'teams'}
                </Title>

                {/* Stats inline in hero */}
                <Group gap="lg" mt="xs" wrap="wrap">
                  <HeroStat icon={<Users size={14} />} value={animMembers} label="Members" color="#a78bfa" />
                  <HeroStat icon={<UserCheck size={14} />} value={animHeads} label="With Head" color="#34d399" />
                  {stats.withoutHead > 0 && (
                    <HeroStat icon={<UserX size={14} />} value={stats.withoutHead} label="No Head" color="#f87171" />
                  )}
                </Group>

                {isAdmin && (
                  <Button
                    size="md" mt="md"
                    leftSection={<Plus size={16} />}
                    onClick={openCreate}
                    className="dpa-btn-primary"
                    style={{ alignSelf: 'flex-start' }}
                  >
                    New Department
                  </Button>
                )}
              </Stack>
            </Group>
          </Paper>
        </div>

        {/* ============ SEARCH BAR ============ */}
        <Card radius="lg" p="md" withBorder mb="md" className="dpa-panel">
          <TextInput
            placeholder="Search departments, descriptions, or heads…"
            value={search}
            onChange={(e) => setSearch(e.currentTarget.value)}
            leftSection={<Search size={14} />}
            size="md"
          />
        </Card>

        {/* ============ DEPARTMENT GRID ============ */}
        {filtered.length === 0 ? (
          <Card radius="lg" p="xl" withBorder className="dpa-panel">
            <Stack align="center" gap="sm" py="xl">
              <ThemeIcon size={56} radius="xl" variant="light" color="indigo">
                <Building2 size={26} />
              </ThemeIcon>
              <Text c="dimmed">
                {search
                  ? `No departments match "${search}"`
                  : 'No departments yet. Create your first department to get started.'}
              </Text>
            </Stack>
          </Card>
        ) : (
          <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }} spacing="md">
            {filtered.map((dept, idx) => (
              <DepartmentCard
                key={dept.id}
                dept={dept}
                delay={Math.min(idx, 8) * 60}
                onClick={() => router.push(`/w/departments/${dept.id}`)}
              />
            ))}
          </SimpleGrid>
        )}
      </Container>

      {/* ============ MODAL ============ */}
      <Modal
        opened={modalOpened}
        onClose={modal.close}
        title="New Department"
        size="md"
        radius="lg"
        overlayProps={{ backgroundOpacity: 0.55, blur: 4 }}
        classNames={{ content: 'dpa-modal-content' }}
      >
        <Stack gap="md">
          <TextInput
            label="Name" required
            placeholder="e.g. Engineering, Nursing, Finance"
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.currentTarget.value }))}
            autoFocus
          />
          <Textarea
            label="Description"
            placeholder="Brief description of this department…"
            value={form.description}
            onChange={(e) => setForm((f) => ({ ...f, description: e.currentTarget.value }))}
            minRows={2} autosize maxRows={4}
          />

          <Box>
            <Text size="sm" fw={500} mb={8}>Color</Text>
            <Group gap={8}>
              {DEPT_COLOR_SWATCHES.map((c) => (
                <ColorSwatch
                  key={c}
                  color={c}
                  size={32}
                  onClick={() => setForm((f) => ({ ...f, color: c }))}
                  style={{
                    cursor: 'pointer',
                    outline: form.color === c ? '2px solid #fff' : 'none',
                    outlineOffset: 2,
                  }}
                />
              ))}
            </Group>
          </Box>

          <Box>
            <Text size="sm" fw={500} mb={8}>Icon</Text>
            <Group gap={6}>
              {DEPT_ICON_OPTIONS.map((opt) => {
                const Icon = opt.Icon
                const active = form.icon === opt.key
                return (
                  <Tooltip key={opt.key} label={opt.label} withArrow>
                    <ActionIcon
                      size="xl" radius="md"
                      variant={active ? 'filled' : 'light'}
                      color={active ? 'indigo' : 'gray'}
                      onClick={() => setForm((f) => ({ ...f, icon: opt.key }))}
                      style={{
                        outline: active ? `2px solid ${form.color}` : 'none',
                        outlineOffset: 2,
                      }}
                    >
                      <Icon size={18} />
                    </ActionIcon>
                  </Tooltip>
                )
              })}
            </Group>
          </Box>

          {users.length > 0 && (
            <Stack gap={6}>
              <Text size="sm" fw={500}>Department Head <Text component="span" size="xs" c="dimmed">(optional)</Text></Text>
              <select
                className="dpa-native-select"
                value={form.headId}
                onChange={(e) => setForm((f) => ({ ...f, headId: e.target.value }))}
              >
                <option value="">— No head assigned —</option>
                {users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name ?? u.email}{u.jobTitle ? ` · ${u.jobTitle}` : ''}
                  </option>
                ))}
              </select>
            </Stack>
          )}

          {createError && (
            <Alert color="red" variant="light" icon={<AlertTriangle size={14} />}>
              {createError}
            </Alert>
          )}

          <Group justify="flex-end" mt="sm">
            <Button variant="subtle" color="gray" onClick={modal.close}>Cancel</Button>
            <Button
              loading={saving}
              disabled={!form.name.trim()}
              onClick={handleCreate}
              className="dpa-btn-primary"
            >
              Create Department
            </Button>
          </Group>
        </Stack>
      </Modal>

      {/* ============ STYLES ============ */}
      <style>{`
        @keyframes dpa-slide-up { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes dpa-mesh-drift {
          0%, 100% { transform: translate(0,0) scale(1); }
          50%      { transform: translate(3%, -2%) scale(1.05); }
        }
        @keyframes dpa-orb-a { 0%,100%{transform:translate(0,0)} 50%{transform:translate(40px,-30px)} }
        @keyframes dpa-orb-b { 0%,100%{transform:translate(0,0)} 50%{transform:translate(-30px,25px)} }
        @keyframes dpa-orb-c { 0%,100%{transform:translate(0,0)} 50%{transform:translate(20px,40px)} }
        @media (prefers-reduced-motion: reduce) {
          .dpa-root *, .dpa-root *::before, .dpa-root *::after {
            animation: none !important; transition: none !important;
          }
        }

        /* HERO */
        .dpa-hero {
          position: relative; overflow: hidden;
          border: 1px solid rgba(99,102,241,0.32);
          background:
            linear-gradient(135deg, rgba(99,102,241,0.16) 0%, rgba(124,58,237,0.10) 50%, rgba(236,72,153,0.06) 100%),
            rgba(11,15,30,0.55);
          backdrop-filter: blur(14px) saturate(140%);
          -webkit-backdrop-filter: blur(14px) saturate(140%);
          box-shadow: 0 20px 60px -20px rgba(99,102,241,0.35), 0 1px 0 rgba(255,255,255,0.05) inset;
          animation: dpa-slide-up 460ms ease-out backwards;
        }
        .dpa-hero-mesh {
          position: absolute; inset: -25%;
          background:
            radial-gradient(circle at 22% 30%, rgba(99,102,241,0.45), transparent 42%),
            radial-gradient(circle at 78% 25%, rgba(124,58,237,0.30), transparent 47%),
            radial-gradient(circle at 62% 82%, rgba(236,72,153,0.18), transparent 52%);
          filter: blur(40px);
          animation: dpa-mesh-drift 22s ease-in-out infinite;
          z-index: 0; pointer-events: none;
        }
        .dpa-hero-orbs { position: absolute; inset: 0; z-index: 0; pointer-events: none; }
        .dpa-orb { position: absolute; border-radius: 50%; filter: blur(22px); opacity: 0.55; mix-blend-mode: screen; }
        .dpa-orb-1 { width: 130px; height: 130px; top: 12%; left: 8%;
          background: radial-gradient(circle, #a5b4fc 0%, transparent 70%);
          animation: dpa-orb-a 14s ease-in-out infinite; }
        .dpa-orb-2 { width: 100px; height: 100px; top: 55%; left: 60%;
          background: radial-gradient(circle, #7C3AED 0%, transparent 70%);
          animation: dpa-orb-b 16s ease-in-out infinite; }
        .dpa-orb-3 { width: 80px; height: 80px; bottom: 10%; right: 12%;
          background: radial-gradient(circle, #ec4899 0%, transparent 70%);
          animation: dpa-orb-c 18s ease-in-out infinite; }
        .dpa-hero-spotlight {
          position: absolute; inset: 0; z-index: 1; pointer-events: none;
          background: radial-gradient(circle 360px at var(--mx, 50%) var(--my, 50%), rgba(255,255,255,0.10), transparent 60%);
        }
        .dpa-hero-title {
          font-size: clamp(2.25rem, 6vw, 4rem);
          font-weight: 800;
          letter-spacing: -0.035em;
          line-height: 1;
          margin: 0;
          font-variant-numeric: tabular-nums;
          background: linear-gradient(135deg, #ffffff 0%, #c4b5fd 50%, #6366F1 100%);
          -webkit-background-clip: text; background-clip: text;
          -webkit-text-fill-color: transparent;
          filter: drop-shadow(0 2px 16px rgba(99,102,241,0.45));
        }
        .dpa-btn-primary {
          background: linear-gradient(135deg, #6366F1 0%, #8b5cf6 100%);
          box-shadow: 0 6px 18px rgba(99,102,241,0.40);
          transition: transform 180ms ease, box-shadow 180ms ease;
          color: #fff;
        }
        .dpa-btn-primary:hover {
          transform: translateY(-1px);
          box-shadow: 0 10px 28px rgba(99,102,241,0.55);
        }

        /* Hero stat pill */
        .dpa-hero-stat {
          display: inline-flex; align-items: center; gap: 8px;
          padding: 8px 12px;
          border-radius: 12px;
          background: rgba(255,255,255,0.06);
          border: 1px solid rgba(255,255,255,0.10);
          transition: background 140ms ease;
        }
        .dpa-hero-stat:hover { background: rgba(255,255,255,0.10); }

        /* Panel */
        .dpa-panel {
          background: rgba(15, 23, 42, 0.55);
          backdrop-filter: blur(14px) saturate(140%);
          -webkit-backdrop-filter: blur(14px) saturate(140%);
          animation: dpa-slide-up 500ms 100ms ease-out backwards;
        }

        /* Department card */
        .dpa-dept-card {
          position: relative; overflow: hidden;
          background: rgba(15, 23, 42, 0.55);
          backdrop-filter: blur(12px) saturate(140%);
          -webkit-backdrop-filter: blur(12px) saturate(140%);
          transition: box-shadow 260ms ease, border-color 220ms ease;
          animation: dpa-slide-up 500ms ease-out backwards;
          cursor: pointer;
          will-change: transform;
          min-height: 220px;
        }
        .dpa-dept-card::before {
          content: ''; position: absolute; top: 0; left: 0; right: 0; height: 3px;
          background: var(--dpa-bar);
        }
        .dpa-dept-card:hover {
          border-color: var(--dpa-border-hover) !important;
          box-shadow: 0 18px 44px var(--dpa-glow);
        }
        .dpa-dept-card .dpa-card-arrow {
          opacity: 0.35;
          transition: opacity 140ms ease, transform 140ms ease;
        }
        .dpa-dept-card:hover .dpa-card-arrow {
          opacity: 1;
          transform: translateX(3px);
        }

        .dpa-card-icon-wrap {
          width: 52px; height: 52px;
          border-radius: 14px;
          display: flex; align-items: center; justify-content: center;
          flex-shrink: 0;
          background: var(--dpa-icon-bg);
          border: 1px solid var(--dpa-icon-border);
          box-shadow: 0 4px 14px var(--dpa-glow);
        }
        .dpa-card-icon-wrap-badge {
          width: 72px; height: 72px;
          border-radius: 50%;
          padding: 0;
          background: var(--dpa-icon-bg);
          border: 1.5px solid var(--dpa-icon-border);
          box-shadow: 0 6px 22px var(--dpa-glow), inset 0 0 0 2px rgba(255,255,255,0.06);
          overflow: hidden;
        }

        /* Modal */
        .dpa-modal-content {
          background: rgba(15, 23, 42, 0.85) !important;
          backdrop-filter: blur(18px) saturate(140%);
          -webkit-backdrop-filter: blur(18px) saturate(140%);
          border: 1px solid rgba(99,102,241,0.28);
        }
        .dpa-native-select {
          width: 100%;
          padding: 8px 12px;
          border-radius: 8px;
          background: rgba(11,15,30,0.65);
          color: #e2e8f0;
          border: 1px solid rgba(255,255,255,0.08);
          font-size: 0.875rem;
          font-family: inherit;
        }
        .dpa-native-select:focus {
          outline: none;
          border-color: #6366F1;
          box-shadow: 0 0 0 2px rgba(99,102,241,0.20);
        }
      `}</style>
    </>
  )
}

// =================================================================
// SUB-COMPONENTS
// =================================================================

function HeroStat({ icon, value, label, color }: {
  icon: React.ReactNode; value: number; label: string; color: string
}) {
  return (
    <span className="dpa-hero-stat" style={{ color }}>
      {icon}
      <Text component="span" size="sm" fw={800} c="white" style={{ fontVariantNumeric: 'tabular-nums' }}>
        {value}
      </Text>
      <Text component="span" size="xs" c="dimmed" fw={500}>
        {label}
      </Text>
    </span>
  )
}

function DepartmentCard({
  dept, delay, onClick,
}: {
  dept: DepartmentListItem; delay: number; onClick: () => void
}) {
  const tilt = useTilt(4)
  const Icon = getDeptIcon(dept.icon)

  // Color-derived CSS vars for accents on this card
  const cssVars = {
    ['--dpa-bar' as string]:           `linear-gradient(90deg, ${dept.color}cc, ${dept.color})`,
    ['--dpa-glow' as string]:          `${dept.color}38`,
    ['--dpa-border-hover' as string]:  `${dept.color}80`,
    ['--dpa-icon-bg' as string]:       `${dept.color}1f`,
    ['--dpa-icon-border' as string]:   `${dept.color}55`,
  } as React.CSSProperties

  return (
    <div
      ref={tilt.ref}
      onMouseMove={tilt.onMouseMove}
      onMouseLeave={tilt.onMouseLeave}
      style={{ transition: 'transform 260ms cubic-bezier(0.3, 0.5, 0.3, 1)' }}
    >
      <Card
        radius="lg" p="lg" withBorder
        className="dpa-dept-card"
        style={{ animationDelay: `${delay}ms`, ...cssVars }}
        onClick={onClick}
      >
        <Stack gap="md" style={{ height: '100%' }}>
          <Group justify="space-between" align="flex-start">
            <div className={`dpa-card-icon-wrap ${TEAM_BADGES.has(dept.slug) ? 'dpa-card-icon-wrap-badge' : ''}`}>
              {TEAM_BADGES.has(dept.slug) ? (
                <img src={`/teams/${dept.slug}.svg`} alt={`${dept.name} badge`} width={64} height={64} style={{display:'block',width:'100%',height:'100%'}} />
              ) : (
                <Icon size={26} color={dept.color} />
              )}
            </div>
            <ChevronRight size={18} className="dpa-card-arrow" />
          </Group>

          <Stack gap={6}>
            <Text fw={700} size="lg" style={{ lineHeight: 1.2 }}>{dept.name}</Text>
            {dept.description ? (
              <Text size="sm" c="dimmed" lineClamp={2}>{dept.description}</Text>
            ) : (
              <Text size="sm" c="dimmed" fs="italic" style={{ opacity: 0.55 }}>No description</Text>
            )}
          </Stack>

          <Group gap="md" wrap="wrap">
            <Group gap={4} align="center">
              <Users size={13} color={dept.color} />
              <Text size="xs" fw={700} style={{ fontVariantNumeric: 'tabular-nums' }}>
                {dept._count.users}
              </Text>
              <Text size="xs" c="dimmed">members</Text>
            </Group>
            <Group gap={4} align="center">
              <TicketIcon size={13} color="rgba(148,163,184,0.7)" />
              <Text size="xs" fw={700} style={{ fontVariantNumeric: 'tabular-nums' }}>
                {dept._count.tickets}
              </Text>
              <Text size="xs" c="dimmed">tickets</Text>
            </Group>
            <Group gap={4} align="center">
              <CheckSquare size={13} color="rgba(148,163,184,0.7)" />
              <Text size="xs" fw={700} style={{ fontVariantNumeric: 'tabular-nums' }}>
                {dept._count.tasks}
              </Text>
              <Text size="xs" c="dimmed">tasks</Text>
            </Group>
          </Group>

          <Box mt="auto" pt="sm" style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}>
            {dept.head ? (
              <Group gap="xs" align="center" wrap="nowrap">
                <Avatar size="sm" radius="xl" style={{ background: dept.head.avatarColor, color: '#fff' }}>
                  {getInitials(dept.head.name ?? 'U')}
                </Avatar>
                <Stack gap={0} style={{ minWidth: 0, flex: 1 }}>
                  <Group gap={4} align="center">
                    <Text size="xs" fw={700} truncate>{dept.head.name}</Text>
                    {dept.head.role === 'OWNER' && (
                      <Crown size={11} color="#fbbf24" />
                    )}
                  </Group>
                  <Text size="xs" c="dimmed">Department Head</Text>
                </Stack>
              </Group>
            ) : (
              <Group gap="xs" align="center" wrap="nowrap" style={{ opacity: 0.55 }}>
                <Avatar size="sm" radius="xl" color="gray">?</Avatar>
                <Stack gap={0}>
                  <Text size="xs" fw={600} c="dimmed">No head assigned</Text>
                  <Text size="xs" c="dimmed">—</Text>
                </Stack>
              </Group>
            )}
          </Box>
        </Stack>
      </Card>
    </div>
  )
}
