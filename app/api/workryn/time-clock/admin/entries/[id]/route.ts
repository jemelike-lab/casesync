import { NextRequest, NextResponse } from 'next/server'
import { getWorkrynSession } from '@/lib/workryn/auth'

import { db } from '@/lib/workryn/db'
import { isManagerOrAbove } from '@/lib/workryn/permissions'

type BreakInput = {
  startAt: string
  endAt: string | null
  plannedMinutes: number
  type?: string
}

const ALLOWED_PLANNED = new Set([30, 45, 60])
const ALLOWED_TYPES = new Set(['LUNCH', 'SHORT', 'OTHER'])

function validateBreaks(
  breaks: BreakInput[],
  clockInAt: Date,
  clockOutAt: Date | null,
): string | null {
  const entryStart = clockInAt.getTime()
  const entryEnd = clockOutAt ? clockOutAt.getTime() : null
  for (const b of breaks) {
    const planned = Number(b.plannedMinutes)
    if (!ALLOWED_PLANNED.has(planned)) {
      return 'Break plannedMinutes must be 30, 45, or 60.'
    }
    if (b.type && !ALLOWED_TYPES.has(b.type)) {
      return 'Break type must be LUNCH, SHORT, or OTHER.'
    }
    const bs = new Date(b.startAt)
    if (Number.isNaN(bs.getTime())) return 'Invalid break start date.'
    const be = b.endAt ? new Date(b.endAt) : null
    if (be && Number.isNaN(be.getTime())) return 'Invalid break end date.'
    if (be && be.getTime() < bs.getTime()) {
      return 'Break end must be after break start.'
    }
    if (bs.getTime() < entryStart) {
      return 'Break start must be on or after clock-in time.'
    }
    if (entryEnd != null && be && be.getTime() > entryEnd) {
      return 'Break end must be on or before clock-out time.'
    }
    if (entryEnd != null && bs.getTime() > entryEnd) {
      return 'Break must fall within the entry range.'
    }
  }
  return null
}

function computeTotals(clockInAt: Date, clockOutAt: Date | null, breaks: BreakInput[]) {
  const end = clockOutAt ?? new Date()
  const totalMinutes = Math.max(0, Math.floor((end.getTime() - clockInAt.getTime()) / 60000))
  let breakMinutes = 0
  const breakRows: {
    startAt: Date
    endAt: Date | null
    plannedMinutes: number
    actualMinutes: number | null
    type: string
  }[] = []
  for (const b of breaks) {
    const bs = new Date(b.startAt)
    const be = b.endAt ? new Date(b.endAt) : null
    const actual = be ? Math.max(0, Math.floor((be.getTime() - bs.getTime()) / 60000)) : null
    breakRows.push({
      startAt: bs,
      endAt: be,
      plannedMinutes: Number(b.plannedMinutes) || 0,
      actualMinutes: actual,
      type: b.type || 'LUNCH',
    })
    if (actual != null) breakMinutes += actual
  }
  const workedMinutes = Math.max(0, totalMinutes - breakMinutes)
  return { totalMinutes, breakMinutes, workedMinutes, breakRows }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getWorkrynSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!isManagerOrAbove(session.user.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { id } = await params
  let body: {
    clockInAt?: string
    clockOutAt?: string | null
    breaks?: BreakInput[]
    notes?: string
    reason?: string
  }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { clockInAt, clockOutAt, breaks = [], notes, reason } = body
  if (!clockInAt) {
    return NextResponse.json({ error: 'clockInAt is required' }, { status: 400 })
  }
  if (!reason || !reason.trim()) {
    return NextResponse.json({ error: 'Reason is required for audit log' }, { status: 400 })
  }

  const existing = await db.timeEntry.findUnique({ where: { id } })
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const inAt = new Date(clockInAt)
  const outAt = clockOutAt ? new Date(clockOutAt) : null
  if (Number.isNaN(inAt.getTime()) || (outAt && Number.isNaN(outAt.getTime()))) {
    return NextResponse.json({ error: 'Invalid date' }, { status: 400 })
  }
  if (outAt && outAt.getTime() <= inAt.getTime()) {
    return NextResponse.json({ error: 'clockOutAt must be after clockInAt' }, { status: 400 })
  }

  const breakError = validateBreaks(breaks, inAt, outAt)
  if (breakError) {
    return NextResponse.json({ error: breakError }, { status: 400 })
  }

  const { totalMinutes, breakMinutes, workedMinutes, breakRows } = computeTotals(inAt, outAt, breaks)

  const updated = await db.$transaction(async (tx) => {
    await tx.timeBreak.deleteMany({ where: { timeEntryId: id } })
    const entry = await tx.timeEntry.update({
      where: { id },
      data: {
        clockInAt: inAt,
        clockOutAt: outAt,
        totalMinutes,
        breakMinutes,
        workedMinutes,
        status: 'EDITED',
        notes: notes ?? null,
        editedById: session.user.id,
        editReason: reason,
        breaks: {
          create: breakRows,
        },
      },
      include: { breaks: true },
    })
    await tx.auditLog.create({
      data: {
        userId: session.user.id,
        action: 'TIME_ENTRY_EDITED',
        resourceType: 'TIME_ENTRY',
        resourceId: id,
        details: reason,
      },
    })
    return entry
  })

  return NextResponse.json({ entry: updated })
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getWorkrynSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!isManagerOrAbove(session.user.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { id } = await params
  let body: { reason?: string } = {}
  try {
    body = await req.json()
  } catch {
    // allow empty body — will fail reason check
  }
  const reason = body.reason
  if (!reason || !reason.trim()) {
    return NextResponse.json({ error: 'Reason is required for audit log' }, { status: 400 })
  }

  const existing = await db.timeEntry.findUnique({ where: { id } })
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  await db.$transaction(async (tx) => {
    await tx.timeBreak.deleteMany({ where: { timeEntryId: id } })
    await tx.timeEntry.delete({ where: { id } })
    await tx.auditLog.create({
      data: {
        userId: session.user.id,
        action: 'TIME_ENTRY_DELETED',
        resourceType: 'TIME_ENTRY',
        resourceId: id,
        details: reason,
      },
    })
  })

  return NextResponse.json({ ok: true })
}
