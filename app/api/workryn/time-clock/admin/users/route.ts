import { NextRequest, NextResponse } from 'next/server'
import { getWorkrynSession } from '@/lib/workryn/auth'

import { db } from '@/lib/workryn/db'
import { isManagerOrAbove } from '@/lib/workryn/permissions'

// Monday 00:00 of the ISO week containing `date`
function getWeekStart(date: Date): Date {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  const day = d.getDay() // 0 = Sunday, 1 = Monday
  const diff = day === 0 ? -6 : 1 - day
  d.setDate(d.getDate() + diff)
  return d
}

function getWeekEnd(weekStart: Date): Date {
  const d = new Date(weekStart)
  d.setDate(d.getDate() + 7)
  return d
}

type EntryWithBreaks = {
  id: string
  userId: string
  clockInAt: Date
  clockOutAt: Date | null
  totalMinutes: number
  breakMinutes: number
  workedMinutes: number
  status: string
  notes: string | null
  breaks: {
    id: string
    startAt: Date
    endAt: Date | null
    plannedMinutes: number
    actualMinutes: number | null
    type: string
  }[]
}

function computeEntryMinutes(entry: EntryWithBreaks, now: Date) {
  if (entry.status !== 'ACTIVE') {
    return {
      workedMinutes: entry.workedMinutes,
      breakMinutes: entry.breakMinutes,
    }
  }
  const clockIn = new Date(entry.clockInAt).getTime()
  const total = Math.max(0, Math.floor((now.getTime() - clockIn) / 60000))
  let breakMins = 0
  for (const b of entry.breaks) {
    if (b.endAt) {
      breakMins += b.actualMinutes ?? 0
    } else {
      const s = new Date(b.startAt).getTime()
      breakMins += Math.max(0, Math.floor((now.getTime() - s) / 60000))
    }
  }
  return {
    workedMinutes: Math.max(0, total - breakMins),
    breakMinutes: breakMins,
  }
}

export async function GET(req: NextRequest) {
  const session = await getWorkrynSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!isManagerOrAbove(session.user.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const searchParams = req.nextUrl.searchParams
  const departmentId = searchParams.get('departmentId') || undefined
  const statusFilter = searchParams.get('status') || undefined // active | on_break | clocked_out
  const search = (searchParams.get('search') || '').trim().toLowerCase()

  const now = new Date()
  const weekStart = getWeekStart(now)
  const weekEnd = getWeekEnd(weekStart)

  const users = await db.user.findMany({
    where: {
      isActive: true,
      ...(departmentId ? { departmentId } : {}),
    },
    orderBy: { name: 'asc' },
    select: {
      id: true,
      name: true,
      email: true,
      avatarColor: true,
      jobTitle: true,
      role: true,
      departmentId: true,
      department: { select: { id: true, name: true, color: true } },
    },
  })

  const userIds = users.map((u) => u.id)

  const [activeEntries, weekEntries, lastEntries] = await Promise.all([
    db.timeEntry.findMany({
      where: { userId: { in: userIds }, status: 'ACTIVE' },
      include: { breaks: { orderBy: { startAt: 'asc' } } },
    }),
    db.timeEntry.findMany({
      where: {
        userId: { in: userIds },
        clockInAt: { gte: weekStart, lt: weekEnd },
      },
      include: { breaks: true },
    }),
    db.timeEntry.findMany({
      where: { userId: { in: userIds }, status: { not: 'ACTIVE' } },
      orderBy: { clockInAt: 'desc' },
      take: userIds.length * 2,
    }),
  ])

  const activeByUser = new Map<string, EntryWithBreaks>()
  for (const e of activeEntries) activeByUser.set(e.userId, e as EntryWithBreaks)

  const weekByUser = new Map<string, { workedMinutes: number; breakMinutes: number }>()
  for (const e of weekEntries) {
    const m = computeEntryMinutes(e as EntryWithBreaks, now)
    const prev = weekByUser.get(e.userId) || { workedMinutes: 0, breakMinutes: 0 }
    weekByUser.set(e.userId, {
      workedMinutes: prev.workedMinutes + m.workedMinutes,
      breakMinutes: prev.breakMinutes + m.breakMinutes,
    })
  }

  const lastByUser = new Map<string, { clockInAt: Date; clockOutAt: Date | null }>()
  for (const e of lastEntries) {
    if (!lastByUser.has(e.userId)) {
      lastByUser.set(e.userId, { clockInAt: e.clockInAt, clockOutAt: e.clockOutAt })
    }
  }

  const result = users
    .map((u) => {
      const currentEntry = activeByUser.get(u.id) ?? null
      const currentBreak = currentEntry?.breaks.find((b) => !b.endAt) ?? null
      const weekTotal = weekByUser.get(u.id) || { workedMinutes: 0, breakMinutes: 0 }
      const lastEntry = lastByUser.get(u.id) || null

      return {
        id: u.id,
        name: u.name,
        email: u.email,
        avatarColor: u.avatarColor,
        jobTitle: u.jobTitle,
        role: u.role,
        departmentId: u.departmentId,
        department: u.department,
        currentEntry,
        currentBreak,
        weekTotal,
        lastEntry,
      }
    })
    .filter((u) => {
      if (search) {
        const hay = `${u.name ?? ''} ${u.email ?? ''} ${u.jobTitle ?? ''}`.toLowerCase()
        if (!hay.includes(search)) return false
      }
      if (statusFilter === 'active') {
        return Boolean(u.currentEntry) && !u.currentBreak
      }
      if (statusFilter === 'on_break') {
        return Boolean(u.currentBreak)
      }
      if (statusFilter === 'clocked_out') {
        return !u.currentEntry
      }
      return true
    })

  return NextResponse.json({ users: result, weekStart: weekStart.toISOString() })
}
