import { NextRequest, NextResponse } from 'next/server'
import { getWorkrynSession } from '@/lib/workryn/auth'

import { db } from '@/lib/workryn/db'

// Get the Monday 00:00 of the ISO week containing `date`
function getWeekStart(date: Date): Date {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  const day = d.getDay() // 0 = Sunday, 1 = Monday, ...
  const diff = day === 0 ? -6 : 1 - day
  d.setDate(d.getDate() + diff)
  return d
}

function getWeekEnd(weekStart: Date): Date {
  const d = new Date(weekStart)
  d.setDate(d.getDate() + 7)
  return d
}

function getTodayStart(date: Date): Date {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  return d
}

function getTodayEnd(date: Date): Date {
  const d = getTodayStart(date)
  d.setDate(d.getDate() + 1)
  return d
}

export async function GET(_req: NextRequest) {
  const session = await getWorkrynSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const userId = session.user.id
  const now = new Date()
  const weekStart = getWeekStart(now)
  const weekEnd = getWeekEnd(weekStart)
  const todayStart = getTodayStart(now)
  const todayEnd = getTodayEnd(now)

  const [currentEntry, weekEntries, todayEntries] = await Promise.all([
    db.timeEntry.findFirst({
      where: { userId, status: 'ACTIVE' },
      include: { breaks: { orderBy: { startAt: 'asc' } } },
    }),
    db.timeEntry.findMany({
      where: {
        userId,
        clockInAt: { gte: weekStart, lt: weekEnd },
      },
      include: { breaks: true },
      orderBy: { clockInAt: 'asc' },
    }),
    db.timeEntry.findMany({
      where: {
        userId,
        clockInAt: { gte: todayStart, lt: todayEnd },
      },
      include: { breaks: true },
      orderBy: { clockInAt: 'asc' },
    }),
  ])

  // Compute worked minutes live for active entries too
  const computeEntryMinutes = (entry: typeof weekEntries[number]) => {
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

  let weekWorked = 0
  let weekBreak = 0
  const daysSet = new Set<string>()
  for (const e of weekEntries) {
    const m = computeEntryMinutes(e)
    weekWorked += m.workedMinutes
    weekBreak += m.breakMinutes
    const d = new Date(e.clockInAt)
    daysSet.add(`${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`)
  }

  let todayWorked = 0
  for (const e of todayEntries) {
    const m = computeEntryMinutes(e)
    todayWorked += m.workedMinutes
  }

  const currentBreak = currentEntry?.breaks.find((b) => !b.endAt) ?? null

  return NextResponse.json({
    isClockedIn: Boolean(currentEntry),
    currentEntry,
    currentBreak,
    weekStart: weekStart.toISOString(),
    weekTotal: {
      workedMinutes: weekWorked,
      breakMinutes: weekBreak,
      days: daysSet.size,
    },
    todayTotal: {
      workedMinutes: todayWorked,
    },
  })
}
