import { NextRequest, NextResponse } from 'next/server'
import { getWorkrynSession } from '@/lib/workryn/auth'
import { db } from '@/lib/workryn/db'
import { canMaintainSchedule } from '@/lib/workryn/permissions'

/**
 * POST /api/workryn/shifts/copy-week
 * Body: { targetWeekStart: ISO string (start of the week being viewed) }
 *
 * Duplicates every shift from the 7 days before targetWeekStart into the
 * target week (+7 days), preserving title/notes/color/assignee/department.
 * Manager-gated server-side (canMaintainSchedule).
 */
export async function POST(req: NextRequest) {
  const session = await getWorkrynSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!canMaintainSchedule(session.user.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { targetWeekStart } = await req.json()
  const target = new Date(targetWeekStart)
  if (isNaN(target.getTime())) {
    return NextResponse.json({ error: 'Invalid targetWeekStart — must be a parseable date string' }, { status: 400 })
  }

  const sourceStart = new Date(target)
  sourceStart.setDate(sourceStart.getDate() - 7)

  const source = await db.shift.findMany({
    where: { startTime: { gte: sourceStart, lt: target } },
    orderBy: { startTime: 'asc' },
    take: 200,
  })

  if (source.length === 0) {
    return NextResponse.json({ copied: 0, shifts: [] })
  }

  const created = await db.$transaction(
    source.map((s) => {
      const startTime = new Date(s.startTime)
      startTime.setDate(startTime.getDate() + 7)
      const endTime = new Date(s.endTime)
      endTime.setDate(endTime.getDate() + 7)
      return db.shift.create({
        data: {
          title: s.title,
          notes: s.notes,
          color: s.color,
          userId: s.userId,
          departmentId: s.departmentId,
          startTime,
          endTime,
        },
        include: { user: { select: { id: true, name: true, avatarColor: true, jobTitle: true } } },
      })
    }),
  )

  return NextResponse.json({ copied: created.length, shifts: created }, { status: 201 })
}
