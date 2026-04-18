import { db } from './db'

// ── Categories ──────────────────────────────────────────────
// These define the rows in the notification preference matrix.
// Add a new category here and it shows up in Settings automatically.

export type NotificationCategoryId =
  | 'TASK'
  | 'TICKET'
  | 'MENTION'
  | 'TRAINING'
  | 'EVALUATION'
  | 'TIME_CLOCK'
  | 'SCHEDULE'
  | 'INVITATION'
  | 'SECURITY'
  | 'SYSTEM'

export type NotificationCategory = {
  id: NotificationCategoryId
  label: string
  description: string
  // Whether this category bypasses pause/DnD (security & critical).
  critical?: boolean
  // Default channel state for new users.
  defaults: { inApp: boolean; email: boolean; push: boolean }
}

export const NOTIFICATION_CATEGORIES: NotificationCategory[] = [
  {
    id: 'TASK',
    label: 'Tasks',
    description: 'New task assignments, due dates, and status updates',
    defaults: { inApp: true, email: true, push: true },
  },
  {
    id: 'TICKET',
    label: 'Support Tickets',
    description: 'IT tickets assigned to you, replies, and status changes',
    defaults: { inApp: true, email: true, push: true },
  },
  {
    id: 'MENTION',
    label: 'Mentions & Replies',
    description: 'Direct @mentions and replies to your messages',
    defaults: { inApp: true, email: false, push: true },
  },
  {
    id: 'TRAINING',
    label: 'Training & Courses',
    description: 'New courses, deadlines, quiz results',
    defaults: { inApp: true, email: true, push: false },
  },
  {
    id: 'EVALUATION',
    label: 'Evaluations',
    description: 'New performance evaluations and acknowledgements',
    defaults: { inApp: true, email: true, push: false },
  },
  {
    id: 'TIME_CLOCK',
    label: 'Time Clock',
    description: 'Clock-in reminders, break alerts, missed punches',
    defaults: { inApp: true, email: false, push: true },
  },
  {
    id: 'SCHEDULE',
    label: 'Schedule',
    description: 'New shifts, schedule changes, swaps',
    defaults: { inApp: true, email: true, push: false },
  },
  {
    id: 'INVITATION',
    label: 'Invitations',
    description: 'Team invitations and acceptances',
    defaults: { inApp: true, email: false, push: false },
  },
  {
    id: 'SECURITY',
    label: 'Security Alerts',
    description: 'Logins from new devices, password changes, MFA',
    critical: true,
    defaults: { inApp: true, email: true, push: true },
  },
  {
    id: 'SYSTEM',
    label: 'System & Announcements',
    description: 'Product updates and admin announcements',
    defaults: { inApp: true, email: false, push: false },
  },
]

export type ChannelMatrix = Record<
  string,
  { inApp?: boolean; email?: boolean; push?: boolean }
>

// Default channel matrix — used when a user has no preferences saved yet.
export function defaultChannels(): ChannelMatrix {
  const out: ChannelMatrix = {}
  for (const c of NOTIFICATION_CATEGORIES) out[c.id] = { ...c.defaults }
  return out
}

// Safe parse with fallback to defaults.
export function parseChannels(json: string | null | undefined): ChannelMatrix {
  if (!json) return defaultChannels()
  try {
    const parsed = JSON.parse(json)
    if (parsed && typeof parsed === 'object') {
      const merged = defaultChannels()
      for (const [k, v] of Object.entries(parsed)) {
        if (v && typeof v === 'object') {
          merged[k] = { ...merged[k], ...(v as object) }
        }
      }
      return merged
    }
  } catch {}
  return defaultChannels()
}

// ── DnD helpers ─────────────────────────────────────────────

function parseHHMM(s: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(s.trim())
  if (!m) return null
  const h = Number(m[1]), mm = Number(m[2])
  if (h < 0 || h > 23 || mm < 0 || mm > 59) return null
  return h * 60 + mm
}

// True if `now` falls inside the [start,end) window. Handles overnight ranges.
export function isWithinDnd(start: string, end: string, now: Date = new Date()): boolean {
  const s = parseHHMM(start)
  const e = parseHHMM(end)
  if (s == null || e == null) return false
  const cur = now.getHours() * 60 + now.getMinutes()
  if (s === e) return false
  if (s < e) return cur >= s && cur < e
  // overnight (e.g. 22:00 -> 08:00)
  return cur >= s || cur < e
}

// ── Preference loading ──────────────────────────────────────

export type LoadedPrefs = {
  channels: ChannelMatrix
  emailDigest: 'instant' | 'daily' | 'weekly' | 'never'
  pauseAll: boolean
  dndEnabled: boolean
  dndStart: string
  dndEnd: string
  playSound: boolean
  desktopEnabled: boolean
}

export async function getUserPreferences(userId: string): Promise<LoadedPrefs> {
  const row = await db.notificationPreference.findUnique({ where: { userId } })
  if (!row) {
    return {
      channels: defaultChannels(),
      emailDigest: 'instant',
      pauseAll: false,
      dndEnabled: false,
      dndStart: '22:00',
      dndEnd: '08:00',
      playSound: true,
      desktopEnabled: false,
    }
  }
  return {
    channels: parseChannels(row.channels),
    emailDigest: (['instant', 'daily', 'weekly', 'never'].includes(row.emailDigest)
      ? row.emailDigest
      : 'instant') as LoadedPrefs['emailDigest'],
    pauseAll: row.pauseAll,
    dndEnabled: row.dndEnabled,
    dndStart: row.dndStart,
    dndEnd: row.dndEnd,
    playSound: row.playSound,
    desktopEnabled: row.desktopEnabled,
  }
}

// ── Create notification (preference-aware) ─────────────────

export type CreateNotificationInput = {
  userId: string
  category: NotificationCategoryId
  type?: string // backwards-compat with existing rows; defaults to category
  title: string
  message: string
  link?: string | null
}

/**
 * Create a notification for a user, respecting their preferences.
 * - Critical categories bypass DnD/pause.
 * - In-app row is only created if `inApp` is true for that category.
 * - Returns the row, or null if suppressed.
 *
 * Email/push channels are not yet wired to a delivery transport — this helper
 * returns flags so callers (or future jobs) can dispatch later.
 */
export async function createNotification(input: CreateNotificationInput) {
  const cat = NOTIFICATION_CATEGORIES.find((c) => c.id === input.category)
  const isCritical = !!cat?.critical
  const prefs = await getUserPreferences(input.userId)
  const channel = prefs.channels[input.category] ?? cat?.defaults ?? { inApp: true, email: false, push: false }

  // Suppression rules (skipped for critical categories)
  if (!isCritical) {
    if (prefs.pauseAll) return { suppressed: true as const, reason: 'paused', notification: null }
    if (prefs.dndEnabled && isWithinDnd(prefs.dndStart, prefs.dndEnd)) {
      return { suppressed: true as const, reason: 'dnd', notification: null }
    }
  }

  if (!channel.inApp) {
    return { suppressed: true as const, reason: 'channel-off', notification: null }
  }

  const notification = await db.notification.create({
    data: {
      userId: input.userId,
      type: input.type ?? input.category,
      category: input.category,
      title: input.title,
      message: input.message,
      link: input.link ?? null,
    },
  })

  return {
    suppressed: false as const,
    notification,
    deliver: {
      email: channel.email && prefs.emailDigest === 'instant',
      push: channel.push && prefs.desktopEnabled,
    },
  }
}
