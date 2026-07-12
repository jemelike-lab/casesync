import { NextRequest, NextResponse } from 'next/server'
import { getWorkrynSession } from '@/lib/workryn/auth'

import { db } from '@/lib/workryn/db'
import { businessDayStartInstant, businessWeekStartStr, dateStrAddDays, dateToBusinessStr } from '@/lib/business-date'

// ET-anchored (payroll timezone), not server-UTC — 2026-07-12 audit, P1-10.
function getWeekStart(date: Date): Date {
  return businessDayStartInstant(businessWeekStartStr(date))
}

export async function GET(req: NextRequest) {
  const session = await getWorkrynSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const userId = session.user.id

  const weekStartParam = req.nextUrl.searchParams.get('weekStart')
  let weekStart: Date
  if (weekStartParam) {
    const parsed = new Date(weekStartParam)
    if (isNaN(parsed.getTime())) {
      return NextResponse.json({ error: 'Invalid weekStart.' }, { status: 400 })
    }
    weekStart = getWeekStart(parsed)
  } else {
    weekStart = getWeekStart(new Date())
  }

  const weekEnd = businessDayStartInstant(dateStrAddDays(dateToBusinessStr(weekStart), 7))

  const entries = await db.timeEntry.findMany({
    where: {
      userId,
      clockInAt: { gte: weekStart, lt: weekEnd },
    },
    include: { breaks: { orderBy: { startAt: 'asc' } } },
    orderBy: { clockInAt: 'asc' },
  })

  const now = new Date()
  const daysSet = new Set<string>()
  let workedMinutes = 0
  let breakMinutes = 0
  let totalMinutes = 0

  for (const e of entries) {
    daysSet.add(dateToBusinessStr(new Date(e.clockInAt)))

    if (e.status === 'ACTIVE') {
      const total = Math.max(
        0,
        Math.floor((now.getTime() - new Date(e.clockInAt).getTime()) / 60000),
      )
      let bm = 0
      for (const b of e.breaks) {
        if (b.endAt) {
          bm += b.actualMinutes ?? 0
        } else {
          bm += Math.max(
            0,
            Math.floor((now.getTime() - new Date(b.startAt).getTime()) / 60000),
          )
        }
      }
      totalMinutes += total
      breakMinutes += bm
      workedMinutes += Math.max(0, total - bm)
    } else {
      totalMinutes += e.totalMinutes
      breakMinutes += e.breakMinutes
      workedMinutes += e.workedMinutes
    }
  }

  return NextResponse.json({
    weekStart: weekStart.toISOString(),
    weekEnd: weekEnd.toISOString(),
    entries,
    totals: {
      workedMinutes,
      breakMinutes,
      totalMinutes,
      daysWorked: daysSet.size,
      isOvertime: workedMinutes > 2400,
    },
  })
}
