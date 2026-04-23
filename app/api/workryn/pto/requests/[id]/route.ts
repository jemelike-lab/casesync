import { NextRequest, NextResponse } from 'next/server'
import { getWorkrynSession } from '@/lib/workryn/auth'
import { db } from '@/lib/workryn/db'
import { validateUUID } from '@/lib/validation'

const REVIEWER_ROLES = ['TEAM_MANAGER', 'SUPERVISOR', 'OWNER', 'ADMIN', 'MANAGER']

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getWorkrynSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  if (!REVIEWER_ROLES.includes(session.user.role)) {
    return NextResponse.json({ error: 'Only managers and supervisors can review PTO requests' }, { status: 403 })
  }

  const { id } = params
  if (!validateUUID(id)) {
    return NextResponse.json({ error: 'Invalid request ID' }, { status: 400 })
  }

  const body = await req.json()
  const { action, reviewNote } = body

  if (!['APPROVED', 'DENIED'].includes(action)) {
    return NextResponse.json({ error: 'action must be APPROVED or DENIED' }, { status: 400 })
  }

  const request = await db.ptoRequest.findUnique({
    where: { id },
    include: { type: true, user: { select: { id: true, name: true } } },
  })

  if (!request) return NextResponse.json({ error: 'Request not found' }, { status: 404 })
  if (request.status !== 'PENDING') {
    return NextResponse.json({ error: `Request is already ${request.status}` }, { status: 400 })
  }
  if (request.userId === session.user.id) {
    return NextResponse.json({ error: 'Cannot review your own request' }, { status: 403 })
  }

  // Transaction: update request + adjust balance
  const [updated] = await db.$transaction([
    db.ptoRequest.update({
      where: { id },
      data: {
        status: action,
        reviewedById: session.user.id,
        reviewedAt: new Date(),
        reviewNote: reviewNote?.trim() || null,
      },
      include: {
        user: { select: { id: true, name: true, avatarColor: true, email: true, jobTitle: true } },
        type: { select: { id: true, name: true, code: true, color: true, icon: true, excludeFromPayroll: true } },
        reviewedBy: { select: { id: true, name: true } },
      },
    }),
    // Move hours from pending → used (approved) or release pending (denied)
    db.ptoBalance.update({
      where: { userId_typeId: { userId: request.userId, typeId: request.typeId } },
      data: action === 'APPROVED'
        ? { pending: { decrement: request.totalHours }, used: { increment: request.totalHours } }
        : { pending: { decrement: request.totalHours } },
    }),
  ])

  // Create notification for requester
  await db.notification.create({
    data: {
      userId: request.userId,
      type: 'PTO',
      category: 'PTO',
      title: `PTO ${action === 'APPROVED' ? 'Approved' : 'Denied'}`,
      message: `Your ${request.type.name} request (${request.totalHours}hrs) was ${action.toLowerCase()} by ${session.user.name || 'a manager'}${reviewNote ? ': ' + reviewNote.trim() : ''}`,
      link: '/w/pto',
    },
  })

  // Audit log
  await db.auditLog.create({
    data: {
      userId: session.user.id,
      action: `PTO_${action}`,
      resourceType: 'PTO_REQUEST',
      resourceId: id,
      details: `${action} ${request.user.name}'s ${request.type.name} request (${request.totalHours}hrs)`,
    },
  })

  return NextResponse.json(updated)
}
