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

function escapeCsv(value: string): string {
  if (value == null) return ''
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`
  }
  return value
}

function formatDateCell(d: Date): string {
  return new Date(d).toLocaleDateString('en-US', { year: 'numeric', month: '2-digit', day: '2-digit' })
}

function formatTimeCell(d: Date | null): string {
  if (!d) return ''
  return new Date(d).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })
}

export async function GET(req: NextRequest) {
  const session = await getWorkrynSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!isManagerOrAbove(session.user.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const sp = req.nextUrl.searchParams
  const userId = sp.get('userId') || undefined
  const weekStartParam = sp.get('weekStart')
  const weekEndParam = sp.get('weekEnd')

  const now = new Date()
  const weekStart = weekStartParam ? new Date(weekStartParam) : getWeekStart(now)
  const weekEnd = weekEndParam ? new Date(weekEndParam) : getWeekEnd(weekStart)

  if (Number.isNaN(weekStart.getTime()) || Number.isNaN(weekEnd.getTime())) {
    return NextResponse.json({ error: 'Invalid date range' }, { status: 400 })
  }

  const where: {
    clockInAt: { gte: Date; lt: Date }
    userId?: string
  } = {
    clockInAt: { gte: weekStart, lt: weekEnd },
  }
  if (userId) where.userId = userId

  const [user, entries] = await Promise.all([
    userId
      ? db.user.findUnique({
          where: { id: userId },
          select: { id: true, name: true, email: true },
        })
      : Promise.resolve(null),
    db.timeEntry.findMany({
      where,
      include: {
        breaks: true,
        user: { select: { id: true, name: true, email: true } },
      },
      orderBy: [{ userId: 'asc' }, { clockInAt: 'asc' }],
    }),
  ])

  const headers = ['User', 'Date', 'Clock In', 'Clock Out', 'Breaks (min)', 'Worked (min)', 'Status', 'Notes']
  const rows: string[] = [headers.join(',')]

  for (const e of entries) {
    rows.push(
      [
        escapeCsv(e.user?.name ?? e.user?.email ?? ''),
        escapeCsv(formatDateCell(e.clockInAt)),
        escapeCsv(formatTimeCell(e.clockInAt)),
        escapeCsv(e.clockOutAt ? formatTimeCell(e.clockOutAt) : 'Active'),
        String(e.breakMinutes),
        String(e.workedMinutes),
        escapeCsv(e.status),
        escapeCsv(e.notes ?? ''),
      ].join(',')
    )
  }

  const csv = rows.join('\r\n')
  const nameSlug = (user?.name || 'all').replace(/[^a-z0-9]+/gi, '-').toLowerCase()
  const weekSlug = weekStart.toISOString().slice(0, 10)
  const filename = `timesheet-${nameSlug}-${weekSlug}.csv`

  return new NextResponse(csv, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  })
}
