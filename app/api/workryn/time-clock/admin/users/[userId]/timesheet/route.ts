import { NextRequest, NextResponse } from 'next/server'
import { getWorkrynSession } from '@/lib/workryn/auth'

import { db } from '@/lib/workryn/db'
import { isManagerOrAbove } from '@/lib/workryn/permissions'

function getWeekStart(date: Date): Date {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  const day = d.getDay()
  const diff = day === 0 ? -6 : 1 - day
  d.setDate(d.getDate() + diff)
  return d
}

function getWeekEnd(weekStart: Date): Date {
  const d = new Date(weekStart)
  d.setDate(d.getDate() + 7)
  return d
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  const session = await getWorkrynSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!isManagerOrAbove(session.user.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { userId } = await params
  const weekStartParam = req.nextUrl.searchParams.get('weekStart')
  const now = new Date()
  const baseDate = weekStartParam ? new Date(weekStartParam) : now
  if (Number.isNaN(baseDate.getTime())) {
    return NextResponse.json({ error: 'Invalid weekStart' }, { status: 400 })
  }
  const weekStart = getWeekStart(baseDate)
  const weekEnd = getWeekEnd(weekStart)

  const [user, entries] = await Promise.all([
    db.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        email: true,
        avatarColor: true,
        jobTitle: true,
        role: true,
        department: { select: { id: true, name: true, color: true } },
      },
    }),
    db.timeEntry.findMany({
      where: {
        userId,
        clockInAt: { gte: weekStart, lt: weekEnd },
      },
      include: { breaks: { orderBy: { startAt: 'asc' } } },
      orderBy: { clockInAt: 'asc' },
    }),
  ])

  if (!user) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  let workedMinutes = 0
  let breakMinutes = 0
  const daysSet = new Set<string>()

  for (const e of entries) {
    if (e.status === 'ACTIVE') {
      const clockIn = new Date(e.clockInAt).getTime()
      const total = Math.max(0, Math.floor((now.getTime() - clockIn) / 60000))
      let bMins = 0
      for (const b of e.breaks) {
        if (b.endAt) bMins += b.actualMinutes ?? 0
        else bMins += Math.max(0, Math.floor((now.getTime() - new Date(b.startAt).getTime()) / 60000))
      }
      workedMinutes += Math.max(0, total - bMins)
      breakMinutes += bMins
    } else {
      workedMinutes += e.workedMinutes
      breakMinutes += e.breakMinutes
    }
    const d = new Date(e.clockInAt)
    daysSet.add(`${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`)
  }

  return NextResponse.json({
    user,
    weekStart: weekStart.toISOString(),
    weekEnd: weekEnd.toISOString(),
    entries,
    weekTotal: {
      workedMinutes,
      breakMinutes,
      days: daysSet.size,
    },
  })
}
