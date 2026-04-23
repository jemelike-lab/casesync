import { NextRequest, NextResponse } from 'next/server'
import { getWorkrynSession } from '@/lib/workryn/auth'
import { db } from '@/lib/workryn/db'
import { validateUUID } from '@/lib/validation'

const ELEVATED_ROLES = ['TEAM_MANAGER', 'SUPERVISOR', 'OWNER', 'ADMIN', 'MANAGER']
const VALID_STATUSES = ['PENDING', 'APPROVED', 'DENIED', 'CANCELLED']

export async function GET(req: NextRequest) {
  const session = await getWorkrynSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const url = new URL(req.url)
  const status = url.searchParams.get('status')
  const userId = url.searchParams.get('userId')
  const startAfter = url.searchParams.get('startAfter')
  const startBefore = url.searchParams.get('startBefore')

  // Validate inputs
  if (status && !VALID_STATUSES.includes(status)) {
    return NextResponse.json({ error: 'Invalid status' }, { status: 400 })
  }
  if (userId && !validateUUID(userId)) {
    return NextResponse.json({ error: 'Invalid userId' }, { status: 400 })
  }

  const isElevated = ELEVATED_ROLES.includes(session.user.role)

  // Build where clause — planners see only their own
  const where: any = {}
  if (!isElevated) {
    where.userId = session.user.id
  } else if (userId) {
    where.userId = userId
  }
  if (status) where.status = status
  if (startAfter || startBefore) {
    where.startDate = {}
    if (startAfter) where.startDate.gte = new Date(startAfter)
    if (startBefore) where.startDate.lte = new Date(startBefore)
  }

  const requests = await db.ptoRequest.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    include: {
      user: { select: { id: true, name: true, avatarColor: true, email: true, jobTitle: true } },
      type: { select: { id: true, name: true, code: true, color: true, icon: true, excludeFromPayroll: true } },
      reviewedBy: { select: { id: true, name: true } },
    },
  })

  return NextResponse.json(requests)
}

export async function POST(req: NextRequest) {
  const session = await getWorkrynSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { typeId, startDate, endDate, totalHours, isHalfDay, halfDayPeriod, notes, documentUrl, documentName } = body

  // Validation
  if (!typeId || !startDate || !endDate || !totalHours) {
    return NextResponse.json({ error: 'typeId, startDate, endDate, totalHours are required' }, { status: 400 })
  }
  if (!validateUUID(typeId)) {
    return NextResponse.json({ error: 'Invalid typeId' }, { status: 400 })
  }
  if (totalHours <= 0 || totalHours > 480) {
    return NextResponse.json({ error: 'totalHours must be between 0 and 480' }, { status: 400 })
  }
  if (new Date(startDate) > new Date(endDate)) {
    return NextResponse.json({ error: 'startDate must be before endDate' }, { status: 400 })
  }
  if (isHalfDay && !['AM', 'PM'].includes(halfDayPeriod)) {
    return NextResponse.json({ error: 'halfDayPeriod must be AM or PM for half-day requests' }, { status: 400 })
  }

  // Check type exists
  const ptoType = await db.ptoType.findUnique({ where: { id: typeId } })
  if (!ptoType || !ptoType.isActive) {
    return NextResponse.json({ error: 'PTO type not found or inactive' }, { status: 404 })
  }

  // Check balance
  const balance = await db.ptoBalance.findUnique({
    where: { userId_typeId: { userId: session.user.id, typeId } },
  })
  const available = balance ? balance.accrued + balance.adjustment - balance.used - balance.pending : 0
  if (ptoType.maxAccrual > 0 && totalHours > available) {
    return NextResponse.json({
      error: `Insufficient balance. Available: ${available.toFixed(1)} hrs, Requested: ${totalHours} hrs`,
    }, { status: 400 })
  }

  // Check for overlapping requests
  const overlap = await db.ptoRequest.findFirst({
    where: {
      userId: session.user.id,
      status: { in: ['PENDING', 'APPROVED'] },
      startDate: { lte: new Date(endDate) },
      endDate: { gte: new Date(startDate) },
    },
  })
  if (overlap) {
    return NextResponse.json({ error: 'You already have a request overlapping these dates' }, { status: 409 })
  }

  // Create request + update pending balance
  const [request] = await db.$transaction([
    db.ptoRequest.create({
      data: {
        userId: session.user.id,
        typeId,
        startDate: new Date(startDate),
        endDate: new Date(endDate),
        totalHours,
        isHalfDay: isHalfDay || false,
        halfDayPeriod: halfDayPeriod || null,
        notes: notes?.trim() || null,
        documentUrl: documentUrl || null,
        documentName: documentName || null,
        status: 'PENDING',
      },
      include: {
        user: { select: { id: true, name: true, avatarColor: true, email: true, jobTitle: true } },
        type: { select: { id: true, name: true, code: true, color: true, icon: true, excludeFromPayroll: true } },
      },
    }),
    // Increment pending hours
    db.ptoBalance.upsert({
      where: { userId_typeId: { userId: session.user.id, typeId } },
      create: { userId: session.user.id, typeId, pending: totalHours },
      update: { pending: { increment: totalHours } },
    }),
  ])

  // Audit log
  await db.auditLog.create({
    data: {
      userId: session.user.id,
      action: 'PTO_REQUESTED',
      resourceType: 'PTO_REQUEST',
      resourceId: request.id,
      details: `${ptoType.name}: ${totalHours}hrs from ${startDate} to ${endDate}`,
    },
  })

  return NextResponse.json(request, { status: 201 })
}
