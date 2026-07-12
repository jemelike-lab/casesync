import { NextRequest, NextResponse } from 'next/server'
import { getWorkrynSession } from '@/lib/workryn/auth'

import { db } from '@/lib/workryn/db'
import { businessDayStartInstant, businessTodayStr, businessWeekStartStr, dateStrAddDays, dateToBusinessStr } from '@/lib/business-date'

// Week/day boundaries are anchored to the America/New_York business day
// (payroll timezone), NOT the server's UTC clock — a Sat-evening ET clock-in
// previously landed in the next week's totals (2026-07-12 audit, P1-10).
function getWeekStart(date: Date): Date {
  return businessDayStartInstant(businessWeekStartStr(date))
}

function getWeekEnd(weekStart: Date): Date {
  return businessDayStartInstant(dateStrAddDays(dateToBusinessStr(weekStart), 7))
}

function getTodayStart(date: Date): Date {
  return businessDayStartInstant(businessTodayStr(date))
}

function getTodayEnd(date: Date): Date {
  return businessDayStartInstant(dateStrAddDays(businessTodayStr(date), 1))
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
    daysSet.add(dateToBusinessStr(new Date(e.clockInAt)))
  }

  let todayWorked = 0
  for (const e of todayEntries) {
    const m = computeEntryMinutes(e)
    todayWorked += m.workedMinutes
  }

  const currentBreak = currentEntry?.breaks.find((b: any) => !b.endAt) ?? null

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
