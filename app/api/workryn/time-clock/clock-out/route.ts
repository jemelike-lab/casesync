import { NextRequest, NextResponse } from 'next/server'
import { getWorkrynSession } from '@/lib/workryn/auth'

import { db } from '@/lib/workryn/db'

export async function POST(_req: NextRequest) {
  const session = await getWorkrynSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const userId = session.user.id

  const active = await db.timeEntry.findFirst({
    where: { userId, status: 'ACTIVE' },
    include: { breaks: true },
  })
  if (!active) {
    return NextResponse.json(
      { error: 'You are not currently clocked in.' },
      { status: 400 },
    )
  }

  const now = new Date()

  const result = await db.$transaction(async (tx: any) => {
    // Atomic guard against double clock-out: only proceed if row is still ACTIVE
    const guard = await tx.timeEntry.updateMany({
      where: { id: active.id, status: 'ACTIVE' },
      data: { status: 'COMPLETED' },
    })
    if (guard.count === 0) {
      return null
    }

    // End any active break first
    const openBreak = active.breaks.find((b: any) => !b.endAt)
    if (openBreak) {
      const actual = Math.max(
        0,
        Math.round((now.getTime() - new Date(openBreak.startAt).getTime()) / 60000),
      )
      await tx.timeBreak.update({
        where: { id: openBreak.id },
        data: { endAt: now, actualMinutes: actual },
      })
    }

    // Re-fetch the breaks after the update
    const breaks = await tx.timeBreak.findMany({
      where: { timeEntryId: active.id },
    })

    const totalMinutes = Math.max(
      0,
      Math.round((now.getTime() - new Date(active.clockInAt).getTime()) / 60000),
    )
    const breakMinutes = breaks.reduce((sum: number, b: any) => sum + (b.actualMinutes ?? 0), 0)
    const workedMinutes = Math.max(0, totalMinutes - breakMinutes)

    const updated = await tx.timeEntry.update({
      where: { id: active.id },
      data: {
        clockOutAt: now,
        totalMinutes,
        breakMinutes,
        workedMinutes,
      },
      include: { breaks: { orderBy: { startAt: 'asc' } } },
    })

    return updated
  })

  if (!result) {
    return NextResponse.json(
      { error: 'You are not currently clocked in.' },
      { status: 400 },
    )
  }

  await db.auditLog.create({
    data: {
      userId,
      action: 'TIME_CLOCKED_OUT',
      resourceType: 'TIME_ENTRY',
      resourceId: result.id,
      details: `Clocked out. Worked ${result.workedMinutes} min, break ${result.breakMinutes} min`,
    },
  })

  return NextResponse.json(result)
}
