import { NextRequest, NextResponse } from 'next/server'
import { getWorkrynSession } from '@/lib/workryn/auth'

import { db } from '@/lib/workryn/db'

export async function POST(req: NextRequest) {
  const session = await getWorkrynSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { title, userId, startTime, endTime, notes, color, departmentId } = await req.json()

  // Validate date strings before passing to new Date()
  const startDate = new Date(startTime)
  const endDate   = new Date(endTime)
  if (isNaN(startDate.getTime())) {
    return NextResponse.json({ error: 'Invalid startTime — must be a parseable date string' }, { status: 400 })
  }
  if (isNaN(endDate.getTime())) {
    return NextResponse.json({ error: 'Invalid endTime — must be a parseable date string' }, { status: 400 })
  }
  if (endDate <= startDate) {
    return NextResponse.json({ error: 'endTime must be after startTime' }, { status: 400 })
  }

  const shift = await db.shift.create({
    data: {
      title, notes: notes || null, color: color || '#6366f1',
      startTime: startDate, endTime: endDate,
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
