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

  const openBreak = active.breaks.find((b) => !b.endAt)
  if (!openBreak) {
    return NextResponse.json(
      { error: 'No active break to end.' },
      { status: 400 },
    )
  }

  const now = new Date()
  const actualMinutes = Math.max(
    0,
    Math.round((now.getTime() - new Date(openBreak.startAt).getTime()) / 60000),
  )

  const updated = await db.timeBreak.update({
    where: { id: openBreak.id },
    data: { endAt: now, actualMinutes },
  })

  await db.auditLog.create({
    data: {
      userId,
      action: 'TIME_BREAK_ENDED',
      resourceType: 'TIME_ENTRY',
      resourceId: active.id,
      details: `Ended break. Planned ${openBreak.plannedMinutes} min, actual ${actualMinutes} min`,
    },
  })

  return NextResponse.json(updated)
}
