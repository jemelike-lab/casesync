import { NextRequest, NextResponse } from 'next/server'
import { getWorkrynSession } from '@/lib/workryn/auth'

import { db } from '@/lib/workryn/db'

const ALLOWED_MINUTES = new Set([30, 45, 60])
const ALLOWED_TYPES = new Set(['LUNCH', 'SHORT', 'OTHER'])
const MAX_BREAKS_PER_ENTRY = 5

export async function POST(req: NextRequest) {
  const session = await getWorkrynSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const userId = session.user.id

  let body: any = null
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 })
  }

  const plannedMinutes = Number(body?.plannedMinutes)
  if (!ALLOWED_MINUTES.has(plannedMinutes)) {
    return NextResponse.json(
      { error: 'plannedMinutes must be 30, 45, or 60.' },
      { status: 400 },
    )
  }

  const type = typeof body?.type === 'string' && ALLOWED_TYPES.has(body.type)
    ? body.type
    : plannedMinutes === 30
      ? 'SHORT'
      : 'LUNCH'

  const active = await db.timeEntry.findFirst({
    where: { userId, status: 'ACTIVE' },
    include: { breaks: true },
  })

  if (!active) {
    return NextResponse.json(
      { error: 'You must be clocked in to start a break.' },
      { status: 400 },
    )
  }

  if (active.breaks.some((b: any) => !b.endAt)) {
    return NextResponse.json(
      { error: 'You already have an active break.' },
      { status: 409 },
    )
  }

  if (active.breaks.length >= MAX_BREAKS_PER_ENTRY) {
    return NextResponse.json(
      { error: `Maximum of ${MAX_BREAKS_PER_ENTRY} breaks per shift.` },
      { status: 409 },
    )
  }

  const br = await db.timeBreak.create({
    data: {
      timeEntryId: active.id,
      startAt: new Date(),
      plannedMinutes,
      type,
    },
  })

  await db.auditLog.create({
    data: {
      userId,
      action: 'TIME_BREAK_STARTED',
      resourceType: 'TIME_ENTRY',
      resourceId: active.id,
      details: `Started ${plannedMinutes}-min ${type.toLowerCase()} break`,
    },
  })

  return NextResponse.json(br, { status: 201 })
}
