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

  // Race-safe path: a partial unique index on (userId) WHERE status='ACTIVE'
  // (migration 029) guarantees only one ACTIVE entry per user. If two requests
  // arrive in the same tick, the second one bombs with Prisma P2002 — translate
  // that to the same friendly 409 the find-first path returns.
  let entry
  try {
    entry = await db.timeEntry.create({
      data: {
        userId,
        clockInAt: new Date(),
        status: 'ACTIVE',
        notes,
      },
      include: { breaks: true },
    })
  } catch (err) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const code = (err as any)?.code
    if (code === 'P2002') {
      return NextResponse.json(
        { error: 'You are already clocked in.' },
        { status: 409 },
      )
    }
    throw err
  }

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
