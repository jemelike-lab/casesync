'use client'
import { useState, useRef, useEffect, useCallback } from 'react'
import Image from 'next/image'
import {
  User as UserIcon, Palette, Lock, Bell, Camera, Trash2, Save,
  Loader2, Check, AlertCircle, Sun, Moon, Monitor, Eye, EyeOff,
  BellOff, Volume2, Mail, Smartphone, MessageSquare,
  MoonStar, ShieldAlert,
} from 'lucide-react'
import { getInitials, formatDate } from '@/lib/workryn/utils'
import { useTheme, type Theme } from '@/components/workryn/ThemeProvider'
import type { NotificationCategory } from '@/lib/workryn/notifications'

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

const TIME_RE = /^([01]?\d|2[0-3]):([0-5]\d)$/
const DIGEST_OPTIONS: { value: EmailDigest; label: string }[] = [
  { value: 'instant', label: 'Instant' },
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'never', label: 'Never' },
]

function parseHHMMClient(s: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(s.trim())
  if (!m) return null
  const h = Number(m[1]), mm = Number(m[2])
  if (h < 0 || h > 23 || mm < 0 || mm > 59) return null
  return h * 60 + mm
}

function isWithinDndClient(start: string, end: string, now: Date = new Date()): boolean {
  const s = parseHHMMClient(start)
  const e = parseHHMMClient(end)
  if (s == null || e == null) return false
  const cur = now.getHours() * 60 + now.getMinutes()
  if (s === e) return false
  if (s < e) return cur >= s && cur < e
  return cur >= s || cur < e
}

function normalizeCell(v: unknown): ChannelCell {
  if (v && typeof v === 'object') {
    const o = v as Record<string, unknown>
    return {
      inApp: typeof o.inApp === 'boolean' ? o.inApp : true,
      email: typeof o.email === 'boolean' ? o.email : false,
      push: typeof o.push === 'boolean' ? o.push : false,
    }
  }
  return { inApp: true, email: false, push: false }
}

function normalizePrefs(raw: unknown): NotificationPrefs | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  const channelsIn = (r.channels && typeof r.channels === 'object') ? r.channels as Record<string, unknown> : {}
  const channels: ChannelMatrixFull = {}
  for (const [k, v] of Object.entries(channelsIn)) channels[k] = normalizeCell(v)
  const digestRaw = typeof r.emailDigest === 'string' ? r.emailDigest : 'instant'
  const emailDigest: EmailDigest = (['instant', 'daily', 'weekly', 'never'] as const).includes(digestRaw as EmailDigest)
    ? (digestRaw as EmailDigest) : 'instant'
  return {
    channels,
    emailDigest,
    pauseAll: typeof r.pauseAll === 'boolean' ? r.pauseAll : false,
    dndEnabled: typeof r.dndEnabled === 'boolean' ? r.dndEnabled : false,
    dndStart: typeof r.dndStart === 'string' && TIME_RE.test(r.dndStart) ? r.dndStart : '22:00',
    dndEnd: typeof r.dndEnd === 'string' && TIME_RE.test(r.dndEnd) ? r.dndEnd : '08:00',
    playSound: typeof r.playSound === 'boolean' ? r.playSound : true,
    desktopEnabled: typeof r.desktopEnabled === 'boolean' ? r.desktopEnabled : false,
  }
}

interface Props {
  profile: Profile
  departments: Department[]
}

const SECTIONS = [
  { id: 'profile', label: 'Profile', icon: UserIcon },
  { id: 'appearance', label: 'Appearance', icon: Palette },
  { id: 'security', label: 'Security', icon: Lock },
  { id: 'notifications', label: 'Notifications', icon: Bell },
] as const

const AVATAR_COLORS = [
  '#6366f1', '#8b5cf6', '#ec4899', '#f43f5e',
  '#f59e0b', '#10b981', '#06b6d4', '#3b82f6',
  '#a855f7', '#14b8a6', '#f97316', '#84cc16',
]

// ── Toggle pill (used by Notifications) ────────────────────
function Toggle({
  on,
  onChange,
  disabled = false,
  ariaLabel,
}: {
  on: boolean
  onChange: (next: boolean) => void
  disabled?: boolean
  ariaLabel?: string
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={ariaLabel}
      disabled={disabled}
      onClick={() => !disabled && onChange(!on)}
      className={`toggle-pill focus-ring ${on ? 'on' : ''} ${disabled ? 'disabled' : ''}`}
    >
      <span className="toggle-dot" />
    </button>
  )
}

export default function SettingsClient({ profile: initialProfile, departments }: Props) {
  
  const { theme, setTheme } = useTheme()

  const [section, setSection] = useState<(typeof SECTIONS)[number]['id']>('profile')
  const [profile, setProfile] = useState(initialProfile)

  // Profile form state
  const [name, setName] = useState(profile.name ?? '')
  const [phone, setPhone] = useState(profile.phone ?? '')
  const [bio, setBio] = useState(profile.bio ?? '')
  const [jobTitle, setJobTitle] = useState(profile.jobTitle ?? '')
  const [departmentId, setDepartmentId] = useState(profile.departmentId ?? '')
  const [avatarColor, setAvatarColor] = useState(profile.avatarColor)
  const [profileSaving, setProfileSaving] = useState(false)
  const [profileMessage, setProfileMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  // Avatar upload state
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)

  // Password form state
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPasswords, setShowPasswords] = useState(false)
  const [passwordSaving, setPasswordSaving] = useState(false)
  const [passwordMessage, setPasswordMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  // Notifications state
  const [notifCategories, setNotifCategories] = useState<NotificationCategory[]>([])
  const [notifPrefs, setNotifPrefs] = useState<NotificationPrefs | null>(null)
  const [notifLoading, setNotifLoading] = useState(false)
  const [notifLoaded, setNotifLoaded] = useState(false)
  const [notifSaving, setNotifSaving] = useState(false)
  const [notifMessage, setNotifMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [dndActiveNow, setDndActiveNow] = useState(false)
  const notifDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pendingChannelChangesRef = useRef<ChannelMatrixFull>({})

  const isAdmin = profile.role === 'OWNER' || profile.role === 'ADMIN'

  // Lazy-load notification preferences the first time the user opens the section.
  useEffect(() => {
    if (section !== 'notifications' || notifLoaded || notifLoading) return
    let cancelled = false
    setNotifLoading(true)
    ;(async () => {
      try {
        const res = await fetch('/api/workryn/notifications/preferences')
        const data: unknown = await res.json()
        if (!res.ok) {
          if (!cancelled) setNotifMessage({ type: 'error', text: 'Failed to load preferences' })
          return
        }
        if (cancelled) return
        const obj = (data && typeof data === 'object') ? data as Record<string, unknown> : {}
        const cats = Array.isArray(obj.categories) ? obj.categories as NotificationCategory[] : []
        const prefs = normalizePrefs(obj.preferences)
        if (prefs) {
          // Ensure every category has a cell
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

  // Recompute DnD active badge on interval.
  useEffect(() => {
    if (!notifPrefs) return
    const tick = () => {
      setDndActiveNow(notifPrefs.dndEnabled && isWithinDndClient(notifPrefs.dndStart, notifPrefs.dndEnd))
    }
    tick()
    const id = setInterval(tick, 60000)
    return () => clearInterval(id)
  }, [notifPrefs])

  // Cleanup pending debounce on unmount.
  useEffect(() => {
    return () => {
      if (notifDebounceRef.current) clearTimeout(notifDebounceRef.current)
    }
  }, [])

  const flushChannelDebounce = useCallback(async () => {
    const pending = pendingChannelChangesRef.current
    if (Object.keys(pending).length === 0) return
    pendingChannelChangesRef.current = {}
    try {
      const res = await fetch('/api/workryn/notifications/preferences', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
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
    setNotifPrefs(prev => {
      if (!prev) return prev
      const nextCell: ChannelCell = { ...(prev.channels[categoryId] ?? { inApp: true, email: false, push: false }), [key]: value }
      return { ...prev, channels: { ...prev.channels, [categoryId]: nextCell } }
    })
    // Queue the specific changed field for auto-save.
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
        setNotifMessage({ type: 'error', text: 'Desktop notifications are not supported in this browser' })
        setTimeout(() => setNotifMessage(null), 3500)
        return
      }
      try {
        const perm = await Notification.requestPermission()
        if (perm !== 'granted') {
          setNotifMessage({ type: 'error', text: 'Permission denied for desktop notifications' })
          setTimeout(() => setNotifMessage(null), 3500)
          setNotifPrefs(prev => prev ? { ...prev, desktopEnabled: false } : prev)
          return
        }
      } catch {
        setNotifMessage({ type: 'error', text: 'Could not request desktop permission' })
        setTimeout(() => setNotifMessage(null), 3500)
        return
      }
    }
    setNotifPrefs(prev => prev ? { ...prev, desktopEnabled: next } : prev)
  }

  async function handleSaveNotifications() {
    if (!notifPrefs) return
    // Validate DnD times client-side
    if (notifPrefs.dndEnabled) {
      if (!TIME_RE.test(notifPrefs.dndStart) || !TIME_RE.test(notifPrefs.dndEnd)) {
        setNotifMessage({ type: 'error', text: 'Do Not Disturb times must be HH:MM' })
        setTimeout(() => setNotifMessage(null), 3500)
        return
      }
    }
    // Flush any pending channel auto-saves first so they don't race the full save.
    if (notifDebounceRef.current) {
      clearTimeout(notifDebounceRef.current)
      notifDebounceRef.current = null
    }
    pendingChannelChangesRef.current = {}

    setNotifSaving(true)
    setNotifMessage(null)
    try {
      const res = await fetch('/api/workryn/notifications/preferences', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          channels: notifPrefs.channels,
          emailDigest: notifPrefs.emailDigest,
          pauseAll: notifPrefs.pauseAll,
          dndEnabled: notifPrefs.dndEnabled,
          dndStart: notifPrefs.dndStart,
          dndEnd: notifPrefs.dndEnd,
          playSound: notifPrefs.playSound,
          desktopEnabled: notifPrefs.desktopEnabled,
        }),
      })
      const data: unknown = await res.json()
      if (!res.ok) {
        const msg = (data && typeof data === 'object' && 'error' in data && typeof (data as { error: unknown }).error === 'string')
          ? (data as { error: string }).error
          : 'Failed to save'
        setNotifMessage({ type: 'error', text: msg })
        return
      }
      const obj = (data && typeof data === 'object') ? data as Record<string, unknown> : {}
      const fresh = normalizePrefs(obj.preferences)
      if (fresh) {
        // Keep any categories that were missing
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
    setProfileSaving(true)
    setProfileMessage(null)
    try {
      const body: Record<string, unknown> = {
        name,
        phone,
        bio,
        avatarColor,
      }
      if (isAdmin) {
        body.jobTitle = jobTitle
        body.departmentId = departmentId || null
      }
      const res = await fetch('/api/workryn/profile/me', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok) {
        setProfileMessage({ type: 'error', text: data.error || 'Failed to save' })
        return
      }
      setProfile(data)
      setProfileMessage({ type: 'success', text: 'Profile saved successfully' })
      // Trigger session refresh so the sidebar avatar/name updates
      // Session refreshed via server
    } catch {
      setProfileMessage({ type: 'error', text: 'Network error' })
    } finally {
      setProfileSaving(false)
      setTimeout(() => setProfileMessage(null), 3500)
    }
  }

  async function handleAvatarUpload(file: File) {
    if (!file) return
    setUploading(true)
    setProfileMessage(null)
    try {
      const formData = new FormData()
      formData.append('file', file)
      const res = await fetch('/api/workryn/profile/avatar', { method: 'POST', body: formData })
      const data = await res.json()
      if (!res.ok) {
        setProfileMessage({ type: 'error', text: data.error || 'Upload failed' })
        return
      }
      setProfile(p => ({ ...p, image: data.image }))
      setProfileMessage({ type: 'success', text: 'Profile picture updated' })
      // Session refreshed via server
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
        setProfile(p => ({ ...p, image: null }))
        setProfileMessage({ type: 'success', text: 'Profile picture removed' })
        // Session refreshed via server
      }
    } finally {
      setUploading(false)
      setTimeout(() => setProfileMessage(null), 3500)
    }
  }

  async function handlePasswordChange() {
    setPasswordMessage(null)
    if (newPassword !== confirmPassword) {
      setPasswordMessage({ type: 'error', text: 'New passwords do not match' })
      return
    }
    if (newPassword.length < 8) {
      setPasswordMessage({ type: 'error', text: 'New password must be at least 8 characters' })
      return
    }
    setPasswordSaving(true)
    try {
      const res = await fetch('/api/workryn/profile/password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword, newPassword }),
      })
      const data = await res.json()
      if (!res.ok) {
        setPasswordMessage({ type: 'error', text: data.error || 'Failed to change password' })
        return
      }
      setPasswordMessage({ type: 'success', text: 'Password changed successfully' })
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
    } catch {
      setPasswordMessage({ type: 'error', text: 'Network error' })
    } finally {
      setPasswordSaving(false)
      setTimeout(() => setPasswordMessage(null), 4000)
    }
  }

  return (
    <>
      <div style={{ padding: '24px 32px 0' }}>
        <h1 className="gradient-text" style={{ marginBottom: 4 }}>Settings</h1>
        <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', marginBottom: 24 }}>
          Manage your account, appearance, and security preferences
        </p>
      </div>

      <div className="settings-layout">
        {/* Section nav */}
        <aside className="settings-sidebar glass-card">
          {SECTIONS.map(s => {
            const Icon = s.icon
            return (
              <button
                key={s.id}
                className={`settings-nav-btn focus-ring ${section === s.id ? 'active' : ''}`}
                onClick={() => setSection(s.id)}
              >
                <Icon size={18} />
                <span>{s.label}</span>
              </button>
            )
          })}
        </aside>

        {/* Section content */}
        <main className="settings-content">
          {/* PROFILE */}
          {section === 'profile' && (
            <div className="settings-section animate-slide-up">
              <h2 style={{ marginBottom: 4 }}>Profile Settings</h2>
              <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', marginBottom: 24 }}>
                Update your personal information and how others see you
              </p>

              {/* Avatar */}
              <div className="settings-card glass-card">
                <div style={{ display: 'flex', alignItems: 'center', gap: 24, flexWrap: 'wrap' }}>
                  <div className="avatar-large" style={{ background: profile.avatarColor }}>
                    {profile.image ? (
                      <Image
                        src={profile.image}
                        alt={profile.name ?? 'avatar'}
                        width={96}
                        height={96}
                        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                      />
                    ) : (
                      getInitials(profile.name ?? profile.email ?? 'U')
                    )}
                  </div>
                  <div style={{ flex: 1, minWidth: 200 }}>
                    <h3 style={{ marginBottom: 6 }}>Profile Picture</h3>
                    <p style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', marginBottom: 14 }}>
                      Upload a PNG, JPG, WEBP, or GIF (max 5MB)
                    </p>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      <button
                        className="btn btn-gradient focus-ring"
                        onClick={() => fileInputRef.current?.click()}
                        disabled={uploading}
                      >
                        {uploading ? <Loader2 size={16} className="spin" /> : <><Camera size={16} /> Upload</>}
                      </button>
                      {profile.image && (
                        <button
                          className="btn btn-danger focus-ring"
                          onClick={handleAvatarRemove}
                          disabled={uploading}
                        >
                          <Trash2 size={16} /> Remove
                        </button>
                      )}
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/png,image/jpeg,image/webp,image/gif"
                        style={{ display: 'none' }}
                        onChange={e => {
                          const f = e.target.files?.[0]
                          if (f) handleAvatarUpload(f)
                          e.target.value = ''
                        }}
                      />
                    </div>
                  </div>
                </div>

                <div className="divider" style={{ margin: '24px 0' }} />

                <h3 style={{ marginBottom: 14 }}>Avatar Color</h3>
                <p style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', marginBottom: 12 }}>
                  Used as a fallback when no profile picture is set
                </p>
                <div className="color-picker">
                  {AVATAR_COLORS.map(c => (
                    <button
                      key={c}
                      className={`color-swatch focus-ring ${avatarColor === c ? 'active' : ''}`}
                      style={{ background: c }}
                      onClick={() => setAvatarColor(c)}
                      aria-label={`Avatar color ${c}`}
                      title={c}
                    />
                  ))}
                </div>
              </div>

              {/* Personal info */}
              <div className="settings-card glass-card" style={{ marginTop: 16 }}>
                <h3 style={{ marginBottom: 16 }}>Personal Information</h3>

                <div className="form-grid">
                  <div className="form-group">
                    <label className="label">Full Name</label>
                    <input
                      className="input focus-ring"
                      value={name}
                      onChange={e => setName(e.target.value)}
                      placeholder="Your name"
                    />
                  </div>

                  <div className="form-group">
                    <label className="label">Email</label>
                    <input
                      className="input"
                      value={profile.email ?? ''}
                      disabled
                      title="Email cannot be changed here"
                    />
                  </div>

                  <div className="form-group">
                    <label className="label">Phone</label>
                    <input
                      className="input focus-ring"
                      value={phone}
                      onChange={e => setPhone(e.target.value)}
                      placeholder="Phone number"
                    />
                  </div>

                  <div className="form-group">
                    <label className="label">
                      Job Title
                      {!isAdmin && <span className="locked-badge">Admin only</span>}
                    </label>
                    <input
                      className="input focus-ring"
                      value={jobTitle}
                      onChange={e => setJobTitle(e.target.value)}
                      placeholder="Your job title"
                      disabled={!isAdmin}
                      title={!isAdmin ? 'Contact your admin to change this' : undefined}
                    />
                  </div>

                  <div className="form-group">
                    <label className="label">
                      Department
                      {!isAdmin && <span className="locked-badge">Admin only</span>}
                    </label>
                    <select
                      className="input focus-ring"
                      value={departmentId}
                      onChange={e => setDepartmentId(e.target.value)}
                      disabled={!isAdmin}
                      title={!isAdmin ? 'Contact your admin to change this' : undefined}
                    >
                      <option value="">No department</option>
                      {departments.map(d => (
                        <option key={d.id} value={d.id}>{d.name}</option>
                      ))}
                    </select>
                  </div>

                  <div className="form-group">
                    <label className="label">Role</label>
                    <input className="input" value={profile.role} disabled />
                  </div>
                </div>

                <div className="form-group" style={{ marginTop: 16 }}>
                  <label className="label">Bio</label>
                  <textarea
                    className="input focus-ring"
                    value={bio}
                    onChange={e => setBio(e.target.value)}
                    placeholder="Tell your team a bit about yourself"
                    rows={4}
                    maxLength={500}
                    style={{ resize: 'vertical' }}
                  />
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 4, textAlign: 'right' }}>
                    {bio.length}/500
                  </div>
                </div>

                {profileMessage && (
                  <div className={`settings-alert ${profileMessage.type}`}>
                    {profileMessage.type === 'success' ? <Check size={16} /> : <AlertCircle size={16} />}
                    {profileMessage.text}
                  </div>
                )}

                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
                  <button
                    className="btn btn-gradient focus-ring"
                    onClick={handleSaveProfile}
                    disabled={profileSaving}
                  >
                    {profileSaving ? <Loader2 size={16} className="spin" /> : <><Save size={16} /> Save Changes</>}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* APPEARANCE */}
          {section === 'appearance' && (
            <div className="settings-section animate-slide-up">
              <h2 style={{ marginBottom: 4 }}>Appearance</h2>
              <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', marginBottom: 24 }}>
                Choose how Workryn looks to you
              </p>

              <div className="settings-card glass-card">
                <h3 style={{ marginBottom: 14 }}>Theme</h3>
                <div className="theme-grid">
                  {(['light', 'dark', 'system'] as Theme[]).map(t => {
                    const Icon = t === 'light' ? Sun : t === 'dark' ? Moon : Monitor
                    const label = t === 'light' ? 'Light' : t === 'dark' ? 'Dark' : 'System'
                    const description = t === 'light'
                      ? 'Clean and bright'
                      : t === 'dark'
                      ? 'Easy on the eyes'
                      : 'Match your OS'
                    return (
                      <button
                        key={t}
                        className={`theme-option focus-ring ${theme === t ? 'active' : ''}`}
                        onClick={() => setTheme(t)}
                      >
                        <div className="theme-preview" data-preview-theme={t}>
                          <Icon size={28} />
                        </div>
                        <div style={{ fontWeight: 600, marginTop: 12, color: 'var(--text-primary)' }}>{label}</div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 2 }}>{description}</div>
                        {theme === t && (
                          <div className="theme-selected-badge"><Check size={14} /></div>
                        )}
                      </button>
                    )
                  })}
                </div>
              </div>
            </div>
          )}

          {/* SECURITY */}
          {section === 'security' && (
            <div className="settings-section animate-slide-up">
              <h2 style={{ marginBottom: 4 }}>Security</h2>
              <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', marginBottom: 24 }}>
                Manage your password and account security
              </p>

              <div className="settings-card glass-card">
                <h3 style={{ marginBottom: 4 }}>Change Password</h3>
                <p style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', marginBottom: 16 }}>
                  Use a strong password you don&apos;t use anywhere else
                </p>

                <div className="form-group">
                  <label className="label">Current Password</label>
                  <input
                    className="input focus-ring"
                    type={showPasswords ? 'text' : 'password'}
                    value={currentPassword}
                    onChange={e => setCurrentPassword(e.target.value)}
                    autoComplete="current-password"
                  />
                </div>
                <div className="form-group">
                  <label className="label">New Password</label>
                  <input
                    className="input focus-ring"
                    type={showPasswords ? 'text' : 'password'}
                    value={newPassword}
                    onChange={e => setNewPassword(e.target.value)}
                    autoComplete="new-password"
                    placeholder="At least 8 characters"
                  />
                </div>
                <div className="form-group">
                  <label className="label">Confirm New Password</label>
                  <input
                    className="input focus-ring"
                    type={showPasswords ? 'text' : 'password'}
                    value={confirmPassword}
                    onChange={e => setConfirmPassword(e.target.value)}
                    autoComplete="new-password"
                  />
                </div>

                <button
                  className="btn btn-ghost btn-sm focus-ring"
                  onClick={() => setShowPasswords(v => !v)}
                  style={{ marginTop: 4 }}
                  type="button"
                >
                  {showPasswords ? <><EyeOff size={14} /> Hide</> : <><Eye size={14} /> Show</>} passwords
                </button>

                {passwordMessage && (
                  <div className={`settings-alert ${passwordMessage.type}`}>
                    {passwordMessage.type === 'success' ? <Check size={16} /> : <AlertCircle size={16} />}
                    {passwordMessage.text}
                  </div>
                )}

                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
                  <button
                    className="btn btn-gradient focus-ring"
                    onClick={handlePasswordChange}
                    disabled={passwordSaving || !currentPassword || !newPassword || !confirmPassword}
                  >
                    {passwordSaving ? <Loader2 size={16} className="spin" /> : <><Lock size={16} /> Change Password</>}
                  </button>
                </div>
              </div>

              <div className="settings-card glass-card" style={{ marginTop: 16 }}>
                <h3 style={{ marginBottom: 4 }}>Account Information</h3>
                <p style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', marginBottom: 16 }}>
                  Read-only details about your account
                </p>
                <div className="account-info-grid">
                  <div>
                    <div className="account-info-label">Member since</div>
                    <div className="account-info-value">{formatDate(profile.createdAt)}</div>
                  </div>
                  <div>
                    <div className="account-info-label">Last login</div>
                    <div className="account-info-value">{profile.lastLogin ? formatDate(profile.lastLogin) : 'Never'}</div>
                  </div>
                  <div>
                    <div className="account-info-label">Two-factor auth</div>
                    <div className="account-info-value">
                      {profile.mfaEnabled ? (
                        <span style={{ color: 'var(--success)' }}>Enabled</span>
                      ) : (
                        <span style={{ color: 'var(--text-muted)' }}>Not enabled</span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* NOTIFICATIONS */}
          {section === 'notifications' && (
            <div className="settings-section animate-slide-up">
              <h2 style={{ marginBottom: 4 }}>Notifications</h2>
              <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', marginBottom: 24 }}>
                Choose what you want to be notified about, where, and when
              </p>

              {notifLoading && !notifPrefs && (
                <div className="settings-card glass-card" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 48 }}>
                  <Loader2 size={24} className="spin" style={{ color: 'var(--text-muted)' }} />
                </div>
              )}

              {notifPrefs && (
                <>
                  {/* Master controls */}
                  <div className="settings-card glass-card">
                    <h3 style={{ marginBottom: 4 }}>Quick Controls</h3>
                    <p style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', marginBottom: 18 }}>
                      Pause everything, choose how often emails arrive, or change feedback options
                    </p>

                    <div className="notif-row">
                      <div className="notif-row-info">
                        <div className="notif-row-label">
                          <BellOff size={15} style={{ color: 'var(--text-muted)' }} />
                          Pause all notifications
                        </div>
                        <div className="notif-row-desc">
                          Critical security alerts will still come through
                        </div>
                      </div>
                      <Toggle
                        on={notifPrefs.pauseAll}
                        onChange={v => setNotifPrefs(p => p ? { ...p, pauseAll: v } : p)}
                        ariaLabel="Pause all notifications"
                      />
                    </div>

                    <div className="divider" style={{ margin: '14px 0' }} />

                    <div className="notif-row">
                      <div className="notif-row-info">
                        <div className="notif-row-label">
                          <Mail size={15} style={{ color: 'var(--text-muted)' }} />
                          Email digest
                        </div>
                        <div className="notif-row-desc">
                          How often non-urgent email notifications are bundled
                        </div>
                      </div>
                      <div className="segmented">
                        {DIGEST_OPTIONS.map(opt => (
                          <button
                            key={opt.value}
                            type="button"
                            className={`segmented-btn focus-ring ${notifPrefs.emailDigest === opt.value ? 'active' : ''}`}
                            onClick={() => setNotifPrefs(p => p ? { ...p, emailDigest: opt.value } : p)}
                          >
                            {opt.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="divider" style={{ margin: '14px 0' }} />

                    <div className="notif-row">
                      <div className="notif-row-info">
                        <div className="notif-row-label">
                          <Volume2 size={15} style={{ color: 'var(--text-muted)' }} />
                          Play sound
                        </div>
                        <div className="notif-row-desc">
                          Play a soft sound when a new in-app notification arrives
                        </div>
                      </div>
                      <Toggle
                        on={notifPrefs.playSound}
                        onChange={v => setNotifPrefs(p => p ? { ...p, playSound: v } : p)}
                        ariaLabel="Play notification sound"
                      />
                    </div>

                    <div className="divider" style={{ margin: '14px 0' }} />

                    <div className="notif-row">
                      <div className="notif-row-info">
                        <div className="notif-row-label">
                          <Smartphone size={15} style={{ color: 'var(--text-muted)' }} />
                          Desktop notifications
                        </div>
                        <div className="notif-row-desc">
                          Show OS-level pop-ups when Workryn is open in a tab
                        </div>
                      </div>
                      <Toggle
                        on={notifPrefs.desktopEnabled}
                        onChange={handleDesktopToggle}
                        ariaLabel="Enable desktop notifications"
                      />
                    </div>
                  </div>

                  {/* Notification matrix */}
                  <div className="settings-card glass-card" style={{ marginTop: 16 }}>
                    <h3 style={{ marginBottom: 4 }}>Notification Types</h3>
                    <p style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', marginBottom: 18 }}>
                      Choose how you want to be notified for each type. Changes save automatically.
                    </p>

                    <div className="matrix">
                      <div className="matrix-header">
                        <div></div>
                        <div className="matrix-col-head"><MessageSquare size={13} /> In-app</div>
                        <div className="matrix-col-head"><Mail size={13} /> Email</div>
                        <div className="matrix-col-head"><Smartphone size={13} /> Push</div>
                      </div>

                      {notifCategories.map(cat => {
                        const cell = notifPrefs.channels[cat.id] ?? { inApp: true, email: false, push: false }
                        const isCritical = !!cat.critical
                        return (
                          <div key={cat.id} className="matrix-row">
                            <div className="matrix-cat">
                              <div className="matrix-cat-label">
                                {isCritical && <ShieldAlert size={14} style={{ color: 'var(--warning)' }} />}
                                {cat.label}
                                {isCritical && <span className="locked-badge">Required</span>}
                              </div>
                              <div className="matrix-cat-desc">{cat.description}</div>
                            </div>

                            <div className="matrix-cell" data-label="In-app">
                              <Toggle
                                on={cell.inApp}
                                onChange={v => updateChannel(cat.id, 'inApp', v)}
                                disabled={isCritical}
                                ariaLabel={`${cat.label} in-app`}
                              />
                            </div>
                            <div className="matrix-cell" data-label="Email">
                              <Toggle
                                on={cell.email}
                                onChange={v => updateChannel(cat.id, 'email', v)}
                                ariaLabel={`${cat.label} email`}
                              />
                            </div>
                            <div className="matrix-cell" data-label="Push">
                              <Toggle
                                on={cell.push}
                                onChange={v => updateChannel(cat.id, 'push', v)}
                                ariaLabel={`${cat.label} push`}
                              />
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>

                  {/* Do Not Disturb */}
                  <div className="settings-card glass-card" style={{ marginTop: 16 }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 4 }}>
                      <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
                        <MoonStar size={16} style={{ color: 'var(--brand-light)' }} />
                        Do Not Disturb
                        {notifPrefs.dndEnabled && dndActiveNow && (
                          <span className="dnd-active-badge">Currently active</span>
                        )}
                      </h3>
                      <Toggle
                        on={notifPrefs.dndEnabled}
                        onChange={v => setNotifPrefs(p => p ? { ...p, dndEnabled: v } : p)}
                        ariaLabel="Enable Do Not Disturb"
                      />
                    </div>
                    <p style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', marginBottom: 18 }}>
                      Notifications are silenced during this window. Critical security alerts always come through.
                    </p>

                    <div className="dnd-time-row">
                      <div className="form-group" style={{ flex: 1 }}>
                        <label className="label">From</label>
                        <input
                          className="input focus-ring"
                          type="time"
                          value={notifPrefs.dndStart}
                          onChange={e => setNotifPrefs(p => p ? { ...p, dndStart: e.target.value } : p)}
                          disabled={!notifPrefs.dndEnabled}
                        />
                      </div>
                      <div className="form-group" style={{ flex: 1 }}>
                        <label className="label">To</label>
                        <input
                          className="input focus-ring"
                          type="time"
                          value={notifPrefs.dndEnd}
                          onChange={e => setNotifPrefs(p => p ? { ...p, dndEnd: e.target.value } : p)}
                          disabled={!notifPrefs.dndEnabled}
                        />
                      </div>
                    </div>
                  </div>

                  {notifMessage && (
                    <div className={`settings-alert ${notifMessage.type}`}>
                      {notifMessage.type === 'success' ? <Check size={16} /> : <AlertCircle size={16} />}
                      {notifMessage.text}
                    </div>
                  )}

                  <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
                    <button
                      className="btn btn-gradient focus-ring"
                      onClick={handleSaveNotifications}
                      disabled={notifSaving}
                    >
                      {notifSaving ? <Loader2 size={16} className="spin" /> : <><Save size={16} /> Save preferences</>}
                    </button>
                  </div>
                </>
              )}
            </div>
          )}
        </main>
      </div>

      <style>{`
        .settings-layout {
          display: grid;
          grid-template-columns: 220px 1fr;
          gap: 24px;
          padding: 0 32px 32px;
          align-items: start;
        }

        .settings-sidebar {
          padding: 12px;
          display: flex;
          flex-direction: column;
          gap: 4px;
          position: sticky;
          top: 24px;
        }

        .settings-nav-btn {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 10px 14px;
          border: none;
          background: none;
          color: var(--text-secondary);
          font-size: 0.875rem;
          font-weight: 500;
          border-radius: var(--radius-md);
          cursor: pointer;
          transition: all var(--transition-smooth);
          text-align: left;
          width: 100%;
        }
        .settings-nav-btn:hover {
          background: var(--bg-hover);
          color: var(--text-primary);
        }
        .settings-nav-btn.active {
          background: var(--brand-gradient-subtle);
          color: var(--brand-light);
          font-weight: 600;
        }

        .settings-content { min-width: 0; }
        .settings-section {}

        .settings-card { padding: 24px; }

        .avatar-large {
          width: 96px;
          height: 96px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 2rem;
          font-weight: 700;
          color: #fff;
          flex-shrink: 0;
          overflow: hidden;
          border: 2px solid var(--border-default);
        }

        .form-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 16px;
        }
        @media (max-width: 768px) {
          .form-grid { grid-template-columns: 1fr; }
        }

        .input:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        .locked-badge {
          margin-left: 8px;
          font-size: 0.625rem;
          font-weight: 600;
          color: var(--warning);
          background: rgba(245,158,11,0.12);
          border: 1px solid rgba(245,158,11,0.25);
          padding: 1px 6px;
          border-radius: 99px;
          text-transform: uppercase;
          letter-spacing: 0.04em;
        }

        .color-picker {
          display: flex;
          flex-wrap: wrap;
          gap: 10px;
        }
        .color-swatch {
          width: 36px;
          height: 36px;
          border-radius: 50%;
          border: 3px solid transparent;
          cursor: pointer;
          transition: transform 0.15s, border-color 0.15s;
        }
        .color-swatch:hover { transform: scale(1.1); }
        .color-swatch.active {
          border-color: var(--text-primary);
          transform: scale(1.1);
        }

        .settings-alert {
          margin-top: 16px;
          padding: 12px 14px;
          border-radius: var(--radius-md);
          font-size: 0.875rem;
          display: flex;
          align-items: center;
          gap: 10px;
        }
        .settings-alert.success {
          background: rgba(16,185,129,0.10);
          border: 1px solid rgba(16,185,129,0.30);
          color: var(--success);
        }
        .settings-alert.error {
          background: rgba(239,68,68,0.10);
          border: 1px solid rgba(239,68,68,0.30);
          color: var(--danger);
        }

        .theme-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 16px;
        }
        @media (max-width: 640px) {
          .theme-grid { grid-template-columns: 1fr; }
        }
        .theme-option {
          position: relative;
          padding: 24px;
          background: var(--bg-overlay);
          border: 2px solid var(--border-default);
          border-radius: var(--radius-lg);
          cursor: pointer;
          transition: all var(--transition-smooth);
          text-align: center;
        }
        .theme-option:hover {
          border-color: var(--border-strong);
          transform: translateY(-2px);
        }
        .theme-option.active {
          border-color: var(--brand);
          box-shadow: 0 0 0 3px var(--brand-glow);
        }
        .theme-preview {
          width: 80px;
          height: 80px;
          border-radius: var(--radius-md);
          margin: 0 auto;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .theme-preview[data-preview-theme="light"] {
          background: linear-gradient(135deg, #f8fafc, #e2e8f0);
          color: #f59e0b;
          border: 1px solid rgba(15,23,42,0.1);
        }
        .theme-preview[data-preview-theme="dark"] {
          background: linear-gradient(135deg, #0a0b0f, #1e2130);
          color: #818cf8;
          border: 1px solid rgba(255,255,255,0.1);
        }
        .theme-preview[data-preview-theme="system"] {
          background: linear-gradient(135deg, #f8fafc 50%, #0a0b0f 50%);
          color: var(--brand-light);
          border: 1px solid var(--border-default);
        }
        .theme-selected-badge {
          position: absolute;
          top: 12px;
          right: 12px;
          width: 24px;
          height: 24px;
          background: var(--brand-gradient);
          color: #fff;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .account-info-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
          gap: 16px;
        }
        .account-info-label {
          font-size: 0.75rem;
          color: var(--text-muted);
          text-transform: uppercase;
          letter-spacing: 0.04em;
          margin-bottom: 4px;
        }
        .account-info-value {
          font-size: 0.9375rem;
          color: var(--text-primary);
          font-weight: 500;
        }

        .spin { animation: spin 0.7s linear infinite; }

        @media (max-width: 900px) {
          .settings-layout {
            grid-template-columns: 1fr;
            padding: 0 16px 32px;
          }
          .settings-sidebar {
            position: static;
            flex-direction: row;
            overflow-x: auto;
          }
          .settings-nav-btn {
            flex-shrink: 0;
          }
        }

        /* ── Toggle pill ─────────────────────────────────── */
        .toggle-pill {
          position: relative;
          width: 38px;
          height: 22px;
          border-radius: 99px;
          background: var(--bg-overlay);
          border: 1px solid var(--border-default);
          cursor: pointer;
          padding: 0;
          flex-shrink: 0;
          transition: all var(--transition-smooth);
        }
        .toggle-pill:hover:not(.disabled) { border-color: var(--border-strong); }
        .toggle-pill .toggle-dot {
          position: absolute;
          top: 2px;
          left: 2px;
          width: 16px;
          height: 16px;
          background: var(--text-secondary);
          border-radius: 50%;
          transition: all var(--transition-smooth);
        }
        .toggle-pill.on {
          background: var(--brand-gradient);
          border-color: transparent;
          box-shadow: 0 0 0 1px var(--brand-glow);
        }
        .toggle-pill.on .toggle-dot {
          left: 18px;
          background: #fff;
          box-shadow: 0 1px 3px rgba(0,0,0,0.25);
        }
        .toggle-pill.disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        /* ── Notification rows (Quick Controls card) ─────── */
        .notif-row {
          display: flex;
          align-items: center;
          gap: 16px;
          justify-content: space-between;
        }
        .notif-row-info { flex: 1; min-width: 0; }
        .notif-row-label {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 0.875rem;
          font-weight: 600;
          color: var(--text-primary);
        }
        .notif-row-desc {
          font-size: 0.75rem;
          color: var(--text-muted);
          margin-top: 2px;
          line-height: 1.4;
        }

        /* ── Segmented control (digest) ──────────────────── */
        .segmented {
          display: inline-flex;
          background: var(--bg-overlay);
          border: 1px solid var(--border-default);
          border-radius: var(--radius-md);
          padding: 3px;
          gap: 2px;
        }
        .segmented-btn {
          padding: 6px 12px;
          background: none;
          border: none;
          font-size: 0.75rem;
          font-weight: 600;
          color: var(--text-muted);
          border-radius: calc(var(--radius-md) - 2px);
          cursor: pointer;
          transition: all var(--transition-smooth);
        }
        .segmented-btn:hover { color: var(--text-primary); }
        .segmented-btn.active {
          background: var(--brand-gradient);
          color: #fff;
          box-shadow: 0 2px 6px var(--brand-glow);
        }

        /* ── Notification matrix ─────────────────────────── */
        .matrix {
          display: flex;
          flex-direction: column;
          gap: 4px;
        }
        .matrix-header {
          display: grid;
          grid-template-columns: 1fr 70px 70px 70px;
          gap: 8px;
          padding: 0 8px 10px;
          border-bottom: 1px solid var(--border-subtle);
          margin-bottom: 6px;
        }
        .matrix-col-head {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 4px;
          font-size: 0.6875rem;
          font-weight: 700;
          color: var(--text-muted);
          text-transform: uppercase;
          letter-spacing: 0.06em;
        }
        .matrix-row {
          display: grid;
          grid-template-columns: 1fr 70px 70px 70px;
          gap: 8px;
          align-items: center;
          padding: 12px 8px;
          border-radius: var(--radius-md);
          transition: background var(--transition);
        }
        .matrix-row:hover { background: var(--bg-hover); }
        .matrix-cat { min-width: 0; }
        .matrix-cat-label {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 0.875rem;
          font-weight: 600;
          color: var(--text-primary);
        }
        .matrix-cat-desc {
          font-size: 0.75rem;
          color: var(--text-muted);
          margin-top: 2px;
          line-height: 1.4;
        }
        .matrix-cell {
          display: flex;
          align-items: center;
          justify-content: center;
        }

        @media (max-width: 720px) {
          .matrix-header { display: none; }
          .matrix-row {
            grid-template-columns: 1fr;
            gap: 12px;
            padding: 14px 12px;
            background: var(--bg-overlay);
            border: 1px solid var(--border-subtle);
            margin-bottom: 4px;
          }
          .matrix-row:hover { background: var(--bg-overlay); }
          .matrix-cell {
            justify-content: space-between;
            padding: 6px 0;
            border-top: 1px solid var(--border-subtle);
          }
          .matrix-cell::before {
            content: attr(data-label);
            font-size: 0.75rem;
            font-weight: 600;
            color: var(--text-muted);
            text-transform: uppercase;
            letter-spacing: 0.04em;
          }
        }

        /* ── DnD card ────────────────────────────────────── */
        .dnd-time-row {
          display: flex;
          gap: 16px;
          flex-wrap: wrap;
        }
        .dnd-active-badge {
          font-size: 0.625rem;
          font-weight: 700;
          color: var(--success);
          background: rgba(16,185,129,0.12);
          border: 1px solid rgba(16,185,129,0.30);
          padding: 2px 8px;
          border-radius: 99px;
          text-transform: uppercase;
          letter-spacing: 0.04em;
        }
      `}</style>
    </>
  )
}
