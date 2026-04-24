import { NextRequest, NextResponse } from 'next/server'
import { requireWorkrynSession } from '@/lib/workryn/auth'
import { db } from '@/lib/workryn/db'

const ELEVATED_ROLES = ['OWNER', 'ADMIN', 'MANAGER', 'SUPERVISOR', 'TEAM_MANAGER']

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requireWorkrynSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { user } = session
  if (!ELEVATED_ROLES.includes(user.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id } = await params
  let body: { action: string; reviewNote?: string }
  try { body = await req.json() } catch (_e) { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }

  const { action, reviewNote } = body
  if (action !== 'APPROVED' && action !== 'DENIED') return NextResponse.json({ error: 'action must be APPROVED or DENIED' }, { status: 400 })

  const ptoRequest = await db.ptoRequest.findUnique({ where: { id } })
  if (!ptoRequest) return NextResponse.json({ error: 'Request not found' }, { status: 404 })
  if (ptoRequest.status !== 'PENDING') return NextResponse.json({ error: 'Request has already been reviewed' }, { status: 400 })
  if (ptoRequest.userId === user.id) return NextResponse.json({ error: 'Cannot review your own request' }, { status: 403 })

  const now = new Date()
  const includeOpts = {
    user: { select: { id: true, name: true, avatarColor: true, email: true, jobTitle: true } },
    type: { select: { id: true, name: true, code: true, color: true, icon: true, excludeFromPayroll: true } },
    reviewedBy: { select: { id: true, name: true } },
  }

  const balanceUpdate = action === 'APPROVED'
    ? { pending: { decrement: ptoRequest.totalHours }, used: { increment: ptoRequest.totalHours } }
    : { pending: { decrement: ptoRequest.totalHours } }

  const [updated] = await db.$transaction([
    db.ptoRequest.update({
      where: { id },
      data: { status: action, reviewedById: user.id, reviewedAt: now, reviewNote: reviewNote ?? null },
      include: includeOpts,
    }),
    db.ptoBalance.update({
      where: { userId_typeId: { userId: ptoRequest.userId, typeId: ptoRequest.typeId } },
      data: balanceUpdate,
    }),
  ])

  return NextResponse.json({
    ...updated,
    startDate: updated.startDate.toISOString(),
    endDate: updated.endDate.toISOString(),
    reviewedAt: updated.reviewedAt?.toISOString() ?? null,
    createdAt: updated.createdAt.toISOString(),
  })
}
