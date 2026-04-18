import { NextRequest, NextResponse } from 'next/server'
import { getWorkrynSession } from '@/lib/workryn/auth'

import { db } from '@/lib/workryn/db'
import {
  NOTIFICATION_CATEGORIES,
  defaultChannels,
  parseChannels,
  type ChannelMatrix,
} from '@/lib/workryn/notifications'

const ALLOWED_DIGESTS = new Set(['instant', 'daily', 'weekly', 'never'])
const TIME_RE = /^([01]?\d|2[0-3]):([0-5]\d)$/

export async function GET() {
  const session = await getWorkrynSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const row = await db.notificationPreference.findUnique({
    where: { userId: session.user.id },
  })

  return NextResponse.json({
    categories: NOTIFICATION_CATEGORIES,
    preferences: {
      channels: row ? parseChannels(row.channels) : defaultChannels(),
      emailDigest: row?.emailDigest ?? 'instant',
      pauseAll: row?.pauseAll ?? false,
      dndEnabled: row?.dndEnabled ?? false,
      dndStart: row?.dndStart ?? '22:00',
      dndEnd: row?.dndEnd ?? '08:00',
      playSound: row?.playSound ?? true,
      desktopEnabled: row?.desktopEnabled ?? false,
    },
  })
}

export async function PUT(req: NextRequest) {
  const session = await getWorkrynSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => null)
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 })
  }

  // Sanitize channel matrix: only allow known categories and boolean fields.
  const allowedIds = new Set(NOTIFICATION_CATEGORIES.map((c) => c.id))
  const cleanChannels: ChannelMatrix = {}
  if (body.channels && typeof body.channels === 'object') {
    for (const [k, v] of Object.entries(body.channels as Record<string, unknown>)) {
      if (!allowedIds.has(k as never)) continue
      if (!v || typeof v !== 'object') continue
      const cell = v as Record<string, unknown>
      cleanChannels[k] = {
        inApp: typeof cell.inApp === 'boolean' ? cell.inApp : undefined,
        email: typeof cell.email === 'boolean' ? cell.email : undefined,
        push: typeof cell.push === 'boolean' ? cell.push : undefined,
      }
    }
  }

  // Build update payload from validated fields only.
  const data: Record<string, unknown> = {}

  if (Object.keys(cleanChannels).length > 0) {
    // merge with existing so partial updates work
    const existing = await db.notificationPreference.findUnique({
      where: { userId: session.user.id },
    })
    const merged = parseChannels(existing?.channels ?? null)
    for (const [k, v] of Object.entries(cleanChannels)) {
      merged[k] = { ...merged[k], ...v }
    }
    data.channels = JSON.stringify(merged)
  }

  if (typeof body.emailDigest === 'string' && ALLOWED_DIGESTS.has(body.emailDigest)) {
    data.emailDigest = body.emailDigest
  }
  if (typeof body.pauseAll === 'boolean') data.pauseAll = body.pauseAll
  if (typeof body.dndEnabled === 'boolean') data.dndEnabled = body.dndEnabled
  if (typeof body.dndStart === 'string' && TIME_RE.test(body.dndStart)) data.dndStart = body.dndStart
  if (typeof body.dndEnd === 'string' && TIME_RE.test(body.dndEnd)) data.dndEnd = body.dndEnd
  if (typeof body.playSound === 'boolean') data.playSound = body.playSound
  if (typeof body.desktopEnabled === 'boolean') data.desktopEnabled = body.desktopEnabled

  const row = await db.notificationPreference.upsert({
    where: { userId: session.user.id },
    create: {
      userId: session.user.id,
      channels: (data.channels as string) ?? JSON.stringify(defaultChannels()),
      emailDigest: (data.emailDigest as string) ?? 'instant',
      pauseAll: (data.pauseAll as boolean) ?? false,
      dndEnabled: (data.dndEnabled as boolean) ?? false,
      dndStart: (data.dndStart as string) ?? '22:00',
      dndEnd: (data.dndEnd as string) ?? '08:00',
      playSound: (data.playSound as boolean) ?? true,
      desktopEnabled: (data.desktopEnabled as boolean) ?? false,
    },
    update: data,
  })

  return NextResponse.json({
    preferences: {
      channels: parseChannels(row.channels),
      emailDigest: row.emailDigest,
      pauseAll: row.pauseAll,
      dndEnabled: row.dndEnabled,
      dndStart: row.dndStart,
      dndEnd: row.dndEnd,
      playSound: row.playSound,
      desktopEnabled: row.desktopEnabled,
    },
  })
}
