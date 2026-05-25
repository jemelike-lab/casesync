'use client'

/**
 * SettingsClient — Aurora rebuild (slate accent).
 *
 * Structurally distinct: identity hero (your face on the page), then
 * a glass panel containing Mantine Tabs for the 5 sections. The hero
 * gives Settings a personal feel — your avatar and name are the
 * subject of the page — different from the data-grid feel of prior
 * pages.
 *
 * API contracts preserved:
 *   PUT    /api/workryn/profile/me
 *   POST   /api/workryn/profile/avatar         (FormData)
 *   DELETE /api/workryn/profile/avatar
 *   POST   /api/workryn/profile/password
 *   GET    /api/workryn/notifications/preferences
 *   PUT    /api/workryn/notifications/preferences
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import Image from 'next/image'
import {
  ActionIcon, Alert, Avatar, Badge, Box, Button, Card, ColorSwatch,
  Container, Group, Loader, Modal, Paper, Select, SimpleGrid, Stack,
  Switch, Tabs, Text, Textarea, TextInput, ThemeIcon, Title, Tooltip,
} from '@mantine/core'
import {
  AlertCircle, Bell, BellOff, Camera, Check, CheckCircle2, Download,
  Eye, EyeOff, Info, Lock, Mail, Monitor, MoonStar, Moon, Palette,
  RefreshCw, Save, Smartphone, Sun, Trash2, User as UserIcon, Volume2,
} from 'lucide-react'
import { getInitials, formatDate } from '@/lib/workryn/utils'
import { useTheme, type Theme } from '@/components/workryn/ThemeProvider'
import type { NotificationCategory } from '@/lib/workryn/notifications'
import { useMouseSpotlight } from '@/hooks/workrynEffects'

// ---------- Types ----------

type Profile = {
  id: string
  name: string | null
  email: string | null
  image: string | null
  jobTitle: string | null
  phone: string | null
  bio: string | null
  avatarColor: string
  role: string
  departmentId: string | null
  department: { id: string; name: string; color: string } | null
  mfaEnabled: boolean
  createdAt: string
  lastLogin: string | null
}
type Department = { id: string; name: string; color: string }
type ChannelKey = 'inApp' | 'email' | 'push'
type ChannelCell = { inApp: boolean; email: boolean; push: boolean }
type ChannelMatrixFull = Record<string, ChannelCell>
type EmailDigest = 'instant' | 'daily' | 'weekly' | 'never'
type NotificationPrefs = {
  channels: ChannelMatrixFull
  emailDigest: EmailDigest
  pauseAll: boolean
  dndEnabled: boolean
  dndStart: string
  dndEnd: string
  playSound: boolean
  desktopEnabled: boolean
}

interface Props {
  profile: Profile
  departments: Department[]
}

const TIME_RE = /^([01]?\d|2[0-3]):([0-5]\d)$/
const DIGEST_OPTIONS: { value: EmailDigest; label: string }[] = [
  { value: 'instant', label: 'Instant' },
  { value: 'daily', label: 'Daily digest' },
  { value: 'weekly', label: 'Weekly digest' },
  { value: 'never', label: 'Never' },
]
const AVATAR_COLORS = [
  '#6366f1', '#7C3AED', '#ec4899', '#FB7185',
  '#F59E0B', '#10B981', '#06B6D4', '#0EA5E9',
  '#a855f7', '#14B8A6', '#f97316', '#84cc16',
]

// ---------- Helpers ----------

function parseHHMMClient(s: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(s.trim())
  if (!m) return null
  const h = Number(m[1]), mm = Number(m[2])
  if (h < 0 || h > 23 || mm < 0 || mm > 59) return null
  return h * 60 + mm
}
function isWithinDndClient(start: string, end: string, now = new Date()): boolean {
  const s = parseHHMMClient(start), e = parseHHMMClient(end)
  if (s === null || e === null) return false
  const cur = now.getHours() * 60 + now.getMinutes()
  return s <= e ? (cur >= s && cur < e) : (cur >= s || cur < e)
}
function normalizeCell(v: unknown): ChannelCell {
  const o = (v && typeof v === 'object') ? v as Record<string, unknown> : {}
  return { inApp: !!o.inApp, email: !!o.email, push: !!o.push }
}
function normalizePrefs(raw: unknown): NotificationPrefs | null {
  if (!raw || typeof raw !== 'object') return null
  const o = raw as Record<string, unknown>
  const channelsRaw = (o.channels && typeof o.channels === 'object') ? o.channels as Record<string, unknown> : {}
  const channels: ChannelMatrixFull = {}
  for (const [k, v] of Object.entries(channelsRaw)) channels[k] = normalizeCell(v)
  return {
    channels,
    emailDigest: (['instant','daily','weekly','never'].includes(o.emailDigest as string) ? o.emailDigest : 'instant') as EmailDigest,
    pauseAll: !!o.pauseAll,
    dndEnabled: !!o.dndEnabled,
    dndStart: typeof o.dndStart === 'string' && TIME_RE.test(o.dndStart) ? o.dndStart : '22:00',
    dndEnd:   typeof o.dndEnd   === 'string' && TIME_RE.test(o.dndEnd)   ? o.dndEnd   : '08:00',
    playSound: o.playSound !== false,
    desktopEnabled: !!o.desktopEnabled,
  }
}

// =================================================================
// MAIN
// =================================================================

export default function SettingsClient({ profile: initialProfile, departments }: Props) {
  const { theme, setTheme } = useTheme()
  const spot = useMouseSpotlight()

  const [section, setSection] = useState<string>('profile')
  const [profile, setProfile] = useState(initialProfile)
  const isAdmin = profile.role === 'OWNER' || profile.role === 'ADMIN'

  // ---------- Profile form state ----------
  const [name, setName] = useState(profile.name ?? '')
  const [phone, setPhone] = useState(profile.phone ?? '')
  const [bio, setBio] = useState(profile.bio ?? '')
  const [jobTitle, setJobTitle] = useState(profile.jobTitle ?? '')
  const [departmentId, setDepartmentId] = useState<string | null>(profile.departmentId ?? null)
  const [avatarColor, setAvatarColor] = useState(profile.avatarColor)
  const [profileSaving, setProfileSaving] = useState(false)
  const [profileMessage, setProfileMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)

  // ---------- Password form state ----------
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPasswords, setShowPasswords] = useState(false)
  const [passwordSaving, setPasswordSaving] = useState(false)
  const [passwordMessage, setPasswordMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  // ---------- Notifications state ----------
  const [notifCategories, setNotifCategories] = useState<NotificationCategory[]>([])
  const [notifPrefs, setNotifPrefs] = useState<NotificationPrefs | null>(null)
  const [notifLoading, setNotifLoading] = useState(false)
  const [notifLoaded, setNotifLoaded] = useState(false)
  const [notifSaving, setNotifSaving] = useState(false)
  const [notifMessage, setNotifMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [dndActiveNow, setDndActiveNow] = useState(false)
  const notifDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pendingChannelChangesRef = useRef<ChannelMatrixFull>({})

  // ---------- About state ----------
  const [updateStatus, setUpdateStatus] = useState<'idle' | 'checking' | 'up-to-date' | 'update-available' | 'applying' | 'error'>('idle')
  const [updateMessage, setUpdateMessage] = useState<string | null>(null)

  // Lazy-load notification preferences on tab open
  useEffect(() => {
    if (section !== 'notifications' || notifLoaded || notifLoading) return
    let cancelled = false
    setNotifLoading(true)
    ;(async () => {
      try {
        const res = await fetch('/api/workryn/notifications/preferences')
        const data: unknown = await res.json()
        if (!res.ok) { if (!cancelled) setNotifMessage({ type: 'error', text: 'Failed to load preferences' }); return }
        if (cancelled) return
        const obj = (data && typeof data === 'object') ? data as Record<string, unknown> : {}
        const cats = Array.isArray(obj.categories) ? obj.categories as NotificationCategory[] : []
        const prefs = normalizePrefs(obj.preferences)
        if (prefs) {
          for (const c of cats) {
            if (!prefs.channels[c.id]) prefs.channels[c.id] = { ...c.defaults }
            if (c.critical) prefs.channels[c.id].inApp = true
          }
          setNotifCategories(cats)
          setNotifPrefs(prefs)
          setNotifLoaded(true)
        }
      } catch {
        if (!cancelled) setNotifMessage({ type: 'error', text: 'Network error' })
      } finally {
        if (!cancelled) setNotifLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [section, notifLoaded, notifLoading])

  // DnD active indicator tick
  useEffect(() => {
    if (!notifPrefs) return
    const tick = () => setDndActiveNow(notifPrefs.dndEnabled && isWithinDndClient(notifPrefs.dndStart, notifPrefs.dndEnd))
    tick()
    const id = setInterval(tick, 60000)
    return () => clearInterval(id)
  }, [notifPrefs])

  useEffect(() => () => { if (notifDebounceRef.current) clearTimeout(notifDebounceRef.current) }, [])

  const flushChannelDebounce = useCallback(async () => {
    const pending = pendingChannelChangesRef.current
    if (Object.keys(pending).length === 0) return
    pendingChannelChangesRef.current = {}
    try {
      const res = await fetch('/api/workryn/notifications/preferences', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channels: pending }),
      })
      if (!res.ok) {
        setNotifMessage({ type: 'error', text: 'Failed to auto-save' })
        setTimeout(() => setNotifMessage(null), 3500)
      }
    } catch {
      setNotifMessage({ type: 'error', text: 'Network error' })
      setTimeout(() => setNotifMessage(null), 3500)
    }
  }, [])

  function updateChannel(categoryId: string, key: ChannelKey, value: boolean) {
    setNotifPrefs((prev) => {
      if (!prev) return prev
      const nextCell: ChannelCell = { ...(prev.channels[categoryId] ?? { inApp: true, email: false, push: false }), [key]: value }
      return { ...prev, channels: { ...prev.channels, [categoryId]: nextCell } }
    })
    const existing = pendingChannelChangesRef.current[categoryId] ?? { inApp: false, email: false, push: false }
    pendingChannelChangesRef.current = {
      ...pendingChannelChangesRef.current,
      [categoryId]: { ...existing, [key]: value } as ChannelCell,
    }
    if (notifDebounceRef.current) clearTimeout(notifDebounceRef.current)
    notifDebounceRef.current = setTimeout(() => { void flushChannelDebounce() }, 600)
  }

  async function handleDesktopToggle(next: boolean) {
    if (!notifPrefs) return
    if (next) {
      if (typeof window === 'undefined' || !('Notification' in window)) {
        setNotifMessage({ type: 'error', text: 'Desktop notifications not supported in this browser' })
        setTimeout(() => setNotifMessage(null), 3500); return
      }
      try {
        const perm = await Notification.requestPermission()
        if (perm !== 'granted') {
          setNotifMessage({ type: 'error', text: 'Permission denied for desktop notifications' })
          setTimeout(() => setNotifMessage(null), 3500)
          setNotifPrefs((prev) => prev ? { ...prev, desktopEnabled: false } : prev); return
        }
      } catch {
        setNotifMessage({ type: 'error', text: 'Could not request desktop permission' })
        setTimeout(() => setNotifMessage(null), 3500); return
      }
    }
    setNotifPrefs((prev) => prev ? { ...prev, desktopEnabled: next } : prev)
  }

  async function handleSaveNotifications() {
    if (!notifPrefs) return
    if (notifPrefs.dndEnabled) {
      if (!TIME_RE.test(notifPrefs.dndStart) || !TIME_RE.test(notifPrefs.dndEnd)) {
        setNotifMessage({ type: 'error', text: 'Invalid Do-Not-Disturb time format' })
        setTimeout(() => setNotifMessage(null), 3500); return
      }
    }
    setNotifSaving(true)
    try {
      const res = await fetch('/api/workryn/notifications/preferences', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(notifPrefs),
      })
      const data = await res.json()
      if (!res.ok) {
        setNotifMessage({ type: 'error', text: (data?.error as string) || 'Failed to save' })
        return
      }
      const obj = (data && typeof data === 'object') ? data as Record<string, unknown> : {}
      const fresh = normalizePrefs(obj.preferences)
      if (fresh) {
        for (const c of notifCategories) {
          if (!fresh.channels[c.id]) fresh.channels[c.id] = { ...c.defaults }
          if (c.critical) fresh.channels[c.id].inApp = true
        }
        setNotifPrefs(fresh)
        setDndActiveNow(fresh.dndEnabled && isWithinDndClient(fresh.dndStart, fresh.dndEnd))
      }
      setNotifMessage({ type: 'success', text: 'Notification preferences saved' })
    } catch {
      setNotifMessage({ type: 'error', text: 'Network error' })
    } finally {
      setNotifSaving(false)
      setTimeout(() => setNotifMessage(null), 3500)
    }
  }

  async function handleSaveProfile() {
    setProfileSaving(true); setProfileMessage(null)
    try {
      const body: Record<string, unknown> = { name, phone, bio, avatarColor }
      if (isAdmin) {
        body.jobTitle = jobTitle
        body.departmentId = departmentId || null
      }
      const res = await fetch('/api/workryn/profile/me', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok) {
        setProfileMessage({ type: 'error', text: data.error || 'Failed to save' }); return
      }
      setProfile(data)
      setProfileMessage({ type: 'success', text: 'Profile saved successfully' })
    } catch {
      setProfileMessage({ type: 'error', text: 'Network error' })
    } finally {
      setProfileSaving(false)
      setTimeout(() => setProfileMessage(null), 3500)
    }
  }

  async function handleAvatarUpload(file: File) {
    if (!file) return
    setUploading(true); setProfileMessage(null)
    try {
      const formData = new FormData()
      formData.append('file', file)
      const res = await fetch('/api/workryn/profile/avatar', { method: 'POST', body: formData })
      const data = await res.json()
      if (!res.ok) {
        setProfileMessage({ type: 'error', text: data.error || 'Upload failed' }); return
      }
      setProfile((p) => ({ ...p, image: data.image }))
      setProfileMessage({ type: 'success', text: 'Profile picture updated' })
    } catch {
      setProfileMessage({ type: 'error', text: 'Upload failed' })
    } finally {
      setUploading(false)
      setTimeout(() => setProfileMessage(null), 3500)
    }
  }

  async function handleAvatarRemove() {
    if (!confirm('Remove your profile picture?')) return
    setUploading(true)
    try {
      const res = await fetch('/api/workryn/profile/avatar', { method: 'DELETE' })
      if (res.ok) {
        setProfile((p) => ({ ...p, image: null }))
        setProfileMessage({ type: 'success', text: 'Profile picture removed' })
      }
    } finally {
      setUploading(false)
      setTimeout(() => setProfileMessage(null), 3500)
    }
  }

  async function handlePasswordChange() {
    setPasswordMessage(null)
    if (newPassword !== confirmPassword) { setPasswordMessage({ type: 'error', text: 'New passwords do not match' }); return }
    if (newPassword.length < 8) { setPasswordMessage({ type: 'error', text: 'New password must be at least 8 characters' }); return }
    setPasswordSaving(true)
    try {
      const res = await fetch('/api/workryn/profile/password', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword, newPassword }),
      })
      const data = await res.json()
      if (!res.ok) { setPasswordMessage({ type: 'error', text: data.error || 'Failed to change password' }); return }
      setPasswordMessage({ type: 'success', text: 'Password changed successfully' })
      setCurrentPassword(''); setNewPassword(''); setConfirmPassword('')
    } catch {
      setPasswordMessage({ type: 'error', text: 'Network error' })
    } finally {
      setPasswordSaving(false)
      setTimeout(() => setPasswordMessage(null), 5000)
    }
  }

  async function handleCheckForUpdates() {
    setUpdateStatus('checking'); setUpdateMessage(null)
    try {
      // Simple SW-driven check: caches.delete or registration.update
      if ('serviceWorker' in navigator) {
        const regs = await navigator.serviceWorker.getRegistrations()
        for (const r of regs) await r.update()
      }
      setUpdateStatus('up-to-date')
      setUpdateMessage('You are running the latest version.')
    } catch {
      setUpdateStatus('error'); setUpdateMessage('Could not check for updates.')
    }
  }

  return (
    <>
      <Container size="lg" py="lg" className="sea-root">

        {/* ============ IDENTITY HERO ============ */}
        <div ref={spot.ref} onMouseMove={spot.onMouseMove} style={{ marginBottom: 20 }}>
          <Paper radius="lg" p="xl" className="sea-hero">
            <div className="sea-hero-mesh" aria-hidden />
            <div className="sea-hero-orbs" aria-hidden>
              <span className="sea-orb sea-orb-1" />
              <span className="sea-orb sea-orb-2" />
              <span className="sea-orb sea-orb-3" />
            </div>
            <div className="sea-hero-spotlight" aria-hidden />

            <Group gap="lg" align="center" wrap="wrap" style={{ position: 'relative', zIndex: 2 }}>
              <div className="sea-identity-avatar" style={{ background: profile.image ? 'transparent' : avatarColor }}>
                {profile.image ? (
                  <Image src={profile.image} alt={profile.name ?? ''} fill style={{ objectFit: 'cover' }} />
                ) : (
                  <span>{getInitials(profile.name ?? profile.email ?? '?')}</span>
                )}
              </div>
              <Stack gap={4} style={{ flex: 1, minWidth: 0 }}>
                <Group gap={8} align="center">
                  <UserIcon size={14} style={{ color: 'rgba(203,213,225,0.85)' }} />
                  <Text size="xs" tt="uppercase" fw={700} c="gray.4" style={{ letterSpacing: '0.12em' }}>
                    Settings
                  </Text>
                </Group>
                <Title order={1} className="sea-hero-title">{profile.name ?? 'Welcome'}</Title>
                <Text size="sm" c="dimmed">
                  {profile.email}{profile.jobTitle ? <> · <Text component="span" c="gray.3">{profile.jobTitle}</Text></> : null}
                  {profile.department && <> · <Text component="span" style={{ color: profile.department.color }} fw={600}>{profile.department.name}</Text></>}
                </Text>
                <Group gap="xs" mt={4}>
                  <Badge variant="light" color="gray" size="sm">{profile.role}</Badge>
                  {profile.mfaEnabled && <Badge variant="light" color="teal" size="sm" leftSection={<Lock size={10} />}>MFA on</Badge>}
                  {profile.lastLogin && <Text size="xs" c="dimmed">Last login {formatDate(profile.lastLogin)}</Text>}
                </Group>
              </Stack>
            </Group>
          </Paper>
        </div>

        {/* ============ SETTINGS TABS ============ */}
        <Card radius="lg" p={0} withBorder className="sea-panel">
          <Tabs value={section} onChange={(v) => setSection(v ?? 'profile')} variant="default" classNames={{ list: 'sea-tabs-list' }}>
            <Tabs.List grow>
              <Tabs.Tab value="profile"       leftSection={<UserIcon size={14} />}>Profile</Tabs.Tab>
              <Tabs.Tab value="appearance"    leftSection={<Palette size={14} />}>Appearance</Tabs.Tab>
              <Tabs.Tab value="security"      leftSection={<Lock size={14} />}>Security</Tabs.Tab>
              <Tabs.Tab value="notifications" leftSection={<Bell size={14} />}>Notifications</Tabs.Tab>
              <Tabs.Tab value="about"         leftSection={<Info size={14} />}>About</Tabs.Tab>
            </Tabs.List>

            {/* ───── Profile ───── */}
            <Tabs.Panel value="profile" p="lg">
              <Stack gap="md">
                <Group gap="md" align="center" wrap="wrap">
                  <div className="sea-avatar-large" style={{ background: profile.image ? 'transparent' : avatarColor }}>
                    {profile.image ? (
                      <Image src={profile.image} alt={profile.name ?? ''} fill style={{ objectFit: 'cover' }} />
                    ) : (
                      <span>{getInitials(profile.name ?? profile.email ?? '?')}</span>
                    )}
                  </div>
                  <Stack gap="xs" style={{ flex: 1, minWidth: 220 }}>
                    <Text size="sm" fw={600}>Profile picture</Text>
                    <Group gap="xs">
                      <Button
                        size="xs" variant="light"
                        leftSection={<Camera size={13} />}
                        loading={uploading}
                        onClick={() => fileInputRef.current?.click()}
                      >
                        Upload new
                      </Button>
                      {profile.image && (
                        <Button
                          size="xs" variant="subtle" color="red"
                          leftSection={<Trash2 size={13} />}
                          loading={uploading}
                          onClick={handleAvatarRemove}
                        >
                          Remove
                        </Button>
                      )}
                    </Group>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      style={{ display: 'none' }}
                      onChange={(e) => { const f = e.target.files?.[0]; if (f) handleAvatarUpload(f) }}
                    />
                    <Text size="xs" c="dimmed">PNG, JPG, GIF up to 5MB</Text>
                  </Stack>
                </Group>

                <Box>
                  <Text size="sm" fw={500} mb={8}>Fallback avatar color</Text>
                  <Group gap={8}>
                    {AVATAR_COLORS.map((c) => (
                      <ColorSwatch
                        key={c} color={c} size={28}
                        onClick={() => setAvatarColor(c)}
                        style={{
                          cursor: 'pointer',
                          outline: avatarColor === c ? '2px solid #fff' : 'none',
                          outlineOffset: 2,
                        }}
                      />
                    ))}
                  </Group>
                </Box>

                <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm">
                  <TextInput
                    label="Display name"
                    value={name}
                    onChange={(e) => setName(e.currentTarget.value)}
                  />
                  <TextInput
                    label="Email"
                    value={profile.email ?? ''}
                    disabled
                    description="Email is managed by your administrator"
                  />
                  <TextInput
                    label="Phone"
                    value={phone}
                    onChange={(e) => setPhone(e.currentTarget.value)}
                    placeholder="+1 555 123 4567"
                  />
                  <TextInput
                    label="Job title"
                    value={jobTitle}
                    onChange={(e) => setJobTitle(e.currentTarget.value)}
                    disabled={!isAdmin}
                    description={isAdmin ? undefined : 'Set by admin'}
                  />
                </SimpleGrid>

                {isAdmin && (
                  <Select
                    label="Department"
                    value={departmentId}
                    onChange={setDepartmentId}
                    data={[{ value: '', label: 'No department' }, ...departments.map((d) => ({ value: d.id, label: d.name }))]}
                    clearable
                  />
                )}

                <Textarea
                  label="Bio"
                  value={bio}
                  onChange={(e) => setBio(e.currentTarget.value)}
                  minRows={2} autosize maxRows={4}
                  placeholder="A short bio for your team profile…"
                />

                {profileMessage && (
                  <Alert color={profileMessage.type === 'success' ? 'teal' : 'red'} variant="light"
                    icon={profileMessage.type === 'success' ? <Check size={14} /> : <AlertCircle size={14} />}>
                    {profileMessage.text}
                  </Alert>
                )}

                <Group justify="flex-end">
                  <Button
                    leftSection={<Save size={14} />}
                    loading={profileSaving}
                    onClick={handleSaveProfile}
                    className="sea-btn-primary"
                  >
                    Save Profile
                  </Button>
                </Group>
              </Stack>
            </Tabs.Panel>

            {/* ───── Appearance ───── */}
            <Tabs.Panel value="appearance" p="lg">
              <Stack gap="md">
                <Text size="sm" c="dimmed">Choose how Workryn looks. Theme syncs across all your devices.</Text>
                <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="md">
                  <ThemeOption
                    active={theme === 'light'}
                    onClick={() => setTheme('light' as Theme)}
                    icon={Sun}
                    label="Light"
                    description="Bright and clean"
                    bg="linear-gradient(135deg, #f8fafc, #e2e8f0)"
                  />
                  <ThemeOption
                    active={theme === 'dark'}
                    onClick={() => setTheme('dark' as Theme)}
                    icon={Moon}
                    label="Dark"
                    description="Easy on the eyes"
                    bg="linear-gradient(135deg, #1e293b, #0f172a)"
                  />
                  <ThemeOption
                    active={theme === 'system'}
                    onClick={() => setTheme('system' as Theme)}
                    icon={Monitor}
                    label="System"
                    description="Match your OS"
                    bg="linear-gradient(135deg, #1e293b 50%, #e2e8f0 50%)"
                  />
                </SimpleGrid>
              </Stack>
            </Tabs.Panel>

            {/* ───── Security ───── */}
            <Tabs.Panel value="security" p="lg">
              <Stack gap="md">
                <Card radius="md" p="md" withBorder>
                  <Group justify="space-between" align="center" wrap="wrap">
                    <Stack gap={2}>
                      <Group gap={6}>
                        <Lock size={14} />
                        <Text fw={600} size="sm">Multi-factor authentication</Text>
                      </Group>
                      <Text size="xs" c="dimmed">
                        {profile.mfaEnabled ? 'MFA is currently enabled on your account.' : 'Add another layer of security to your account.'}
                      </Text>
                    </Stack>
                    <Badge variant="light" color={profile.mfaEnabled ? 'teal' : 'gray'}>
                      {profile.mfaEnabled ? 'Enabled' : 'Not enabled'}
                    </Badge>
                  </Group>
                </Card>

                <Card radius="md" p="md" withBorder>
                  <Stack gap="sm">
                    <Group gap={6} align="center">
                      <Lock size={14} />
                      <Text fw={600} size="sm">Change password</Text>
                    </Group>
                    <Group justify="flex-end">
                      <Button size="xs" variant="subtle" leftSection={showPasswords ? <EyeOff size={12} /> : <Eye size={12} />}
                        onClick={() => setShowPasswords((v) => !v)}>
                        {showPasswords ? 'Hide' : 'Show'}
                      </Button>
                    </Group>
                    <TextInput
                      label="Current password"
                      type={showPasswords ? 'text' : 'password'}
                      value={currentPassword}
                      onChange={(e) => setCurrentPassword(e.currentTarget.value)}
                    />
                    <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm">
                      <TextInput
                        label="New password"
                        type={showPasswords ? 'text' : 'password'}
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.currentTarget.value)}
                        description="Minimum 8 characters"
                      />
                      <TextInput
                        label="Confirm new password"
                        type={showPasswords ? 'text' : 'password'}
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.currentTarget.value)}
                      />
                    </SimpleGrid>
                    {passwordMessage && (
                      <Alert color={passwordMessage.type === 'success' ? 'teal' : 'red'} variant="light"
                        icon={passwordMessage.type === 'success' ? <Check size={14} /> : <AlertCircle size={14} />}>
                        {passwordMessage.text}
                      </Alert>
                    )}
                    <Group justify="flex-end">
                      <Button
                        loading={passwordSaving}
                        disabled={!currentPassword || !newPassword || !confirmPassword}
                        onClick={handlePasswordChange}
                        className="sea-btn-primary"
                      >
                        Change Password
                      </Button>
                    </Group>
                  </Stack>
                </Card>
              </Stack>
            </Tabs.Panel>

            {/* ───── Notifications ───── */}
            <Tabs.Panel value="notifications" p="lg">
              {notifLoading && !notifLoaded ? (
                <Stack align="center" gap="sm" py="xl">
                  <Loader />
                  <Text size="sm" c="dimmed">Loading preferences…</Text>
                </Stack>
              ) : !notifPrefs ? (
                <Text c="dimmed">Failed to load preferences.</Text>
              ) : (
                <Stack gap="md">
                  {/* Global pause */}
                  <Card radius="md" p="md" withBorder>
                    <Group justify="space-between" wrap="wrap" gap="sm">
                      <Stack gap={2}>
                        <Group gap={6}>
                          {notifPrefs.pauseAll ? <BellOff size={14} color="#F59E0B" /> : <Bell size={14} />}
                          <Text fw={600} size="sm">Pause all notifications</Text>
                        </Group>
                        <Text size="xs" c="dimmed">Temporarily silence every channel until you turn this off.</Text>
                      </Stack>
                      <Switch
                        size="md"
                        checked={notifPrefs.pauseAll}
                        onChange={(e) => setNotifPrefs((p) => p ? { ...p, pauseAll: e.currentTarget.checked } : p)}
                      />
                    </Group>
                  </Card>

                  {/* Do Not Disturb */}
                  <Card radius="md" p="md" withBorder>
                    <Group justify="space-between" wrap="wrap" gap="sm" mb="sm">
                      <Stack gap={2}>
                        <Group gap={6}>
                          <MoonStar size={14} color="#a78bfa" />
                          <Text fw={600} size="sm">Do Not Disturb hours</Text>
                          {dndActiveNow && <Badge variant="light" color="violet" size="xs">Active now</Badge>}
                        </Group>
                        <Text size="xs" c="dimmed">Silence push and desktop notifications during these hours.</Text>
                      </Stack>
                      <Switch
                        size="md"
                        checked={notifPrefs.dndEnabled}
                        onChange={(e) => setNotifPrefs((p) => p ? { ...p, dndEnabled: e.currentTarget.checked } : p)}
                      />
                    </Group>
                    {notifPrefs.dndEnabled && (
                      <Group gap="sm">
                        <TextInput
                          label="From" type="time"
                          value={notifPrefs.dndStart}
                          onChange={(e) => setNotifPrefs((p) => p ? { ...p, dndStart: e.currentTarget.value } : p)}
                        />
                        <TextInput
                          label="Until" type="time"
                          value={notifPrefs.dndEnd}
                          onChange={(e) => setNotifPrefs((p) => p ? { ...p, dndEnd: e.currentTarget.value } : p)}
                        />
                      </Group>
                    )}
                  </Card>

                  {/* Channel-specific toggles */}
                  <Card radius="md" p="md" withBorder>
                    <Stack gap="sm">
                      <Group gap={6}><Volume2 size={14} /><Text fw={600} size="sm">Other channels</Text></Group>
                      <Group justify="space-between" wrap="wrap" gap="sm">
                        <Stack gap={0}>
                          <Group gap={6}><Smartphone size={13} /><Text size="sm">Desktop notifications</Text></Group>
                          <Text size="xs" c="dimmed">Browser-level push alerts.</Text>
                        </Stack>
                        <Switch checked={notifPrefs.desktopEnabled} onChange={(e) => handleDesktopToggle(e.currentTarget.checked)} />
                      </Group>
                      <Group justify="space-between" wrap="wrap" gap="sm">
                        <Stack gap={0}>
                          <Group gap={6}><Volume2 size={13} /><Text size="sm">Play sound on new notifications</Text></Group>
                          <Text size="xs" c="dimmed">In-app chime when new alerts arrive.</Text>
                        </Stack>
                        <Switch checked={notifPrefs.playSound} onChange={(e) => setNotifPrefs((p) => p ? { ...p, playSound: e.currentTarget.checked } : p)} />
                      </Group>
                      <Select
                        label="Email digest frequency"
                        leftSection={<Mail size={13} />}
                        value={notifPrefs.emailDigest}
                        onChange={(v) => setNotifPrefs((p) => p ? { ...p, emailDigest: (v as EmailDigest) ?? 'instant' } : p)}
                        data={DIGEST_OPTIONS}
                      />
                    </Stack>
                  </Card>

                  {/* Categories matrix */}
                  <Card radius="md" p="md" withBorder>
                    <Stack gap="sm">
                      <Text fw={600} size="sm">Notification categories</Text>
                      <Box style={{ overflowX: 'auto' }}>
                        <table className="sea-channels-table">
                          <thead>
                            <tr>
                              <th></th>
                              <th>In-app</th>
                              <th>Email</th>
                              <th>Push</th>
                            </tr>
                          </thead>
                          <tbody>
                            {notifCategories.map((cat) => {
                              const cell = notifPrefs.channels[cat.id] ?? { inApp: true, email: false, push: false }
                              return (
                                <tr key={cat.id}>
                                  <td>
                                    <Stack gap={0}>
                                      <Group gap={6}>
                                        <Text size="sm" fw={600}>{cat.label}</Text>
                                        {cat.critical && <Badge size="xs" variant="light" color="orange">Critical</Badge>}
                                      </Group>
                                      {cat.description && <Text size="xs" c="dimmed">{cat.description}</Text>}
                                    </Stack>
                                  </td>
                                  <td>
                                    <Switch
                                      size="sm"
                                      checked={cell.inApp}
                                      onChange={(e) => updateChannel(cat.id, 'inApp', e.currentTarget.checked)}
                                      disabled={cat.critical}
                                    />
                                  </td>
                                  <td>
                                    <Switch
                                      size="sm"
                                      checked={cell.email}
                                      onChange={(e) => updateChannel(cat.id, 'email', e.currentTarget.checked)}
                                    />
                                  </td>
                                  <td>
                                    <Switch
                                      size="sm"
                                      checked={cell.push}
                                      onChange={(e) => updateChannel(cat.id, 'push', e.currentTarget.checked)}
                                    />
                                  </td>
                                </tr>
                              )
                            })}
                          </tbody>
                        </table>
                      </Box>
                    </Stack>
                  </Card>

                  {notifMessage && (
                    <Alert color={notifMessage.type === 'success' ? 'teal' : 'red'} variant="light"
                      icon={notifMessage.type === 'success' ? <Check size={14} /> : <AlertCircle size={14} />}>
                      {notifMessage.text}
                    </Alert>
                  )}

                  <Group justify="flex-end">
                    <Button
                      leftSection={<Save size={14} />}
                      loading={notifSaving}
                      onClick={handleSaveNotifications}
                      className="sea-btn-primary"
                    >
                      Save preferences
                    </Button>
                  </Group>
                </Stack>
              )}
            </Tabs.Panel>

            {/* ───── About ───── */}
            <Tabs.Panel value="about" p="lg">
              <Stack gap="md">
                <Card radius="md" p="md" withBorder>
                  <Group gap="md" align="center">
                    <ThemeIcon size="xl" radius="md" variant="light" color="gray">
                      <Info size={20} />
                    </ThemeIcon>
                    <Stack gap={2}>
                      <Text fw={700} size="md">Workryn</Text>
                      <Text size="xs" c="dimmed">Integrated HR and workforce module · Part of CaseSync</Text>
                    </Stack>
                  </Group>
                </Card>

                <Card radius="md" p="md" withBorder>
                  <Stack gap="sm">
                    <Group justify="space-between" wrap="wrap" gap="sm">
                      <Stack gap={2}>
                        <Group gap={6}><RefreshCw size={13} /><Text size="sm" fw={600}>Check for updates</Text></Group>
                        <Text size="xs" c="dimmed">
                          {updateMessage ?? 'Force a check for newer app versions and reload the service worker.'}
                        </Text>
                      </Stack>
                      <Button
                        size="sm"
                        variant="light"
                        leftSection={updateStatus === 'up-to-date' ? <CheckCircle2 size={13} /> : <Download size={13} />}
                        loading={updateStatus === 'checking' || updateStatus === 'applying'}
                        onClick={handleCheckForUpdates}
                      >
                        {updateStatus === 'up-to-date' ? 'Up to date' : 'Check now'}
                      </Button>
                    </Group>
                  </Stack>
                </Card>

                <Text size="xs" c="dimmed" ta="center" mt="md">
                  © {new Date().getFullYear()} Beatrice Loving Heart · All rights reserved
                </Text>
              </Stack>
            </Tabs.Panel>
          </Tabs>
        </Card>
      </Container>

      {/* ============ STYLES ============ */}
      <style>{`
        @keyframes sea-slide-up { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes sea-mesh-drift {
          0%, 100% { transform: translate(0,0) scale(1); }
          50%      { transform: translate(3%, -2%) scale(1.05); }
        }
        @keyframes sea-orb-a { 0%,100%{transform:translate(0,0)} 50%{transform:translate(40px,-30px)} }
        @keyframes sea-orb-b { 0%,100%{transform:translate(0,0)} 50%{transform:translate(-30px,25px)} }
        @keyframes sea-orb-c { 0%,100%{transform:translate(0,0)} 50%{transform:translate(20px,40px)} }
        @media (prefers-reduced-motion: reduce) {
          .sea-root *, .sea-root *::before, .sea-root *::after {
            animation: none !important; transition: none !important;
          }
        }

        /* HERO */
        .sea-hero {
          position: relative; overflow: hidden;
          border: 1px solid rgba(100,116,139,0.30);
          background:
            linear-gradient(135deg, rgba(100,116,139,0.14) 0%, rgba(71,85,105,0.10) 50%, rgba(148,163,184,0.06) 100%),
            rgba(11,15,30,0.55);
          backdrop-filter: blur(14px) saturate(140%);
          -webkit-backdrop-filter: blur(14px) saturate(140%);
          box-shadow: 0 20px 60px -20px rgba(100,116,139,0.35), 0 1px 0 rgba(255,255,255,0.05) inset;
          animation: sea-slide-up 460ms ease-out backwards;
        }
        .sea-hero-mesh {
          position: absolute; inset: -25%;
          background:
            radial-gradient(circle at 22% 30%, rgba(148,163,184,0.40), transparent 42%),
            radial-gradient(circle at 78% 25%, rgba(100,116,139,0.28), transparent 47%),
            radial-gradient(circle at 62% 82%, rgba(124,58,237,0.10), transparent 52%);
          filter: blur(40px);
          animation: sea-mesh-drift 22s ease-in-out infinite;
          z-index: 0; pointer-events: none;
        }
        .sea-hero-orbs { position: absolute; inset: 0; z-index: 0; pointer-events: none; }
        .sea-orb { position: absolute; border-radius: 50%; filter: blur(22px); opacity: 0.45; mix-blend-mode: screen; }
        .sea-orb-1 { width: 130px; height: 130px; top: 12%; left: 8%;
          background: radial-gradient(circle, #cbd5e1 0%, transparent 70%);
          animation: sea-orb-a 14s ease-in-out infinite; }
        .sea-orb-2 { width: 100px; height: 100px; top: 55%; left: 60%;
          background: radial-gradient(circle, #94a3b8 0%, transparent 70%);
          animation: sea-orb-b 16s ease-in-out infinite; }
        .sea-orb-3 { width: 80px; height: 80px; bottom: 10%; right: 12%;
          background: radial-gradient(circle, #a78bfa 0%, transparent 70%);
          animation: sea-orb-c 18s ease-in-out infinite; }
        .sea-hero-spotlight {
          position: absolute; inset: 0; z-index: 1; pointer-events: none;
          background: radial-gradient(circle 360px at var(--mx, 50%) var(--my, 50%), rgba(255,255,255,0.10), transparent 60%);
        }
        .sea-hero-title {
          font-size: clamp(2rem, 5vw, 3.25rem);
          font-weight: 800;
          letter-spacing: -0.035em;
          line-height: 1;
          margin: 0;
          background: linear-gradient(135deg, #ffffff 0%, #cbd5e1 50%, #94a3b8 100%);
          -webkit-background-clip: text; background-clip: text;
          -webkit-text-fill-color: transparent;
          filter: drop-shadow(0 2px 16px rgba(100,116,139,0.30));
        }
        .sea-btn-primary {
          background: linear-gradient(135deg, #64748B 0%, #475569 100%);
          box-shadow: 0 6px 18px rgba(100,116,139,0.40);
          transition: transform 180ms ease, box-shadow 180ms ease;
          color: #fff;
        }
        .sea-btn-primary:hover {
          transform: translateY(-1px);
          box-shadow: 0 10px 28px rgba(100,116,139,0.55);
        }

        /* Identity avatar in hero */
        .sea-identity-avatar {
          position: relative;
          width: 84px; height: 84px;
          border-radius: 50%;
          overflow: hidden;
          display: flex; align-items: center; justify-content: center;
          color: #fff;
          font-size: 1.5rem; font-weight: 800;
          box-shadow: 0 12px 32px rgba(0,0,0,0.3), 0 0 0 3px rgba(255,255,255,0.10);
          flex-shrink: 0;
        }

        /* Larger avatar in profile tab */
        .sea-avatar-large {
          position: relative;
          width: 72px; height: 72px;
          border-radius: 50%;
          overflow: hidden;
          display: flex; align-items: center; justify-content: center;
          color: #fff;
          font-size: 1.25rem; font-weight: 800;
          flex-shrink: 0;
        }

        .sea-panel {
          background: rgba(15, 23, 42, 0.55);
          backdrop-filter: blur(14px) saturate(140%);
          -webkit-backdrop-filter: blur(14px) saturate(140%);
          overflow: hidden;
          animation: sea-slide-up 500ms 100ms ease-out backwards;
        }
        .sea-tabs-list {
          border-bottom: 1px solid rgba(255,255,255,0.06);
        }

        /* Channels matrix table */
        .sea-channels-table {
          width: 100%;
          border-collapse: collapse;
        }
        .sea-channels-table th {
          padding: 6px 10px;
          font-size: 0.6875rem;
          text-transform: uppercase;
          letter-spacing: 0.06em;
          color: rgba(148,163,184,0.75);
          font-weight: 700;
          text-align: center;
          border-bottom: 1px solid rgba(255,255,255,0.06);
        }
        .sea-channels-table th:first-child { text-align: left; }
        .sea-channels-table td {
          padding: 10px;
          border-bottom: 1px solid rgba(255,255,255,0.04);
          text-align: center;
        }
        .sea-channels-table td:first-child { text-align: left; min-width: 180px; }
        .sea-channels-table tr:last-child td { border-bottom: none; }
      `}</style>
    </>
  )
}

// =================================================================
// SUB-COMPONENTS
// =================================================================

function ThemeOption({
  active, onClick, icon: Icon, label, description, bg,
}: {
  active: boolean
  onClick: () => void
  icon: React.ComponentType<{ size?: number }>
  label: string
  description: string
  bg: string
}) {
  return (
    <Card
      radius="lg" p="md" withBorder
      style={{
        cursor: 'pointer',
        background: active ? 'rgba(100,116,139,0.10)' : undefined,
        borderColor: active ? 'rgba(100,116,139,0.55)' : undefined,
        boxShadow: active ? '0 10px 28px rgba(100,116,139,0.30)' : undefined,
        transition: 'all 220ms ease',
      }}
      onClick={onClick}
    >
      <Stack gap="sm" align="center">
        <Box style={{
          width: '100%',
          aspectRatio: '16/9',
          borderRadius: 8,
          background: bg,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#fff',
        }}>
          <Icon size={28} />
        </Box>
        <Group gap={6} align="center">
          <Text fw={700} size="sm">{label}</Text>
          {active && <CheckCircle2 size={14} color="#94a3b8" />}
        </Group>
        <Text size="xs" c="dimmed">{description}</Text>
      </Stack>
    </Card>
  )
}
