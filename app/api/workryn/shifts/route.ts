import { NextRequest, NextResponse } from 'next/server'
import { getWorkrynSession } from '@/lib/workryn/auth'

import { db } from '@/lib/workryn/db'

export async function POST(req: NextRequest) {
  const session = await getWorkrynSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { title, userId, startTime, endTime, notes, color, departmentId } = await req.json()

  const shift = await db.shift.create({
    data: {
      title, notes: notes || null, color: color || '#6366f1',
      startTime: new Date(startTime), endTime: new Date(endTime),
      userId, departmentId: departmentId || null,
    },
    include: { user: { select: { id: true, name: true, avatarColor: true, jobTitle: true } } },
  })

  return NextResponse.json(shift, { status: 201 })
}

export async function GET(req: NextRequest) {
  const session = await getWorkrynSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const from = req.nextUrl.searchParams.get('from')
  const to = req.nextUrl.searchParams.get('to')

  const shifts = await db.shift.findMany({
    where: {
      ...(from && to ? { startTime: { gte: new Date(from), lte: new Date(to) } } : {}),
    },
    orderBy: { startTime: 'asc' },
    include: { user: { select: { id: true, name: true, avatarColor: true, jobTitle: true } } },
  })

  return NextResponse.json(shifts)
}
