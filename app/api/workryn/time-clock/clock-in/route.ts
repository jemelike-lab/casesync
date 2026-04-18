import { NextRequest, NextResponse } from 'next/server'
import { getWorkrynSession } from '@/lib/workryn/auth'

import { db } from '@/lib/workryn/db'

export async function POST(req: NextRequest) {
  const session = await getWorkrynSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const userId = session.user.id

  const existing = await db.timeEntry.findFirst({
    where: { userId, status: 'ACTIVE' },
  })
  if (existing) {
    return NextResponse.json(
      { error: 'You are already clocked in.' },
      { status: 409 },
    )
  }

  let notes: string | null = null
  try {
    const body = await req.json().catch(() => null)
    if (body && typeof body.notes === 'string' && body.notes.trim()) {
      notes = body.notes.trim().slice(0, 1000)
    }
  } catch {
    // ignore
  }

  const entry = await db.timeEntry.create({
    data: {
      userId,
      clockInAt: new Date(),
      status: 'ACTIVE',
      notes,
    },
    include: { breaks: true },
  })

  await db.auditLog.create({
    data: {
      userId,
      action: 'TIME_CLOCKED_IN',
      resourceType: 'TIME_ENTRY',
      resourceId: entry.id,
      details: `Clocked in at ${entry.clockInAt.toISOString()}`,
    },
  })

  return NextResponse.json(entry, { status: 201 })
}
