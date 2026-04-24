import { NextRequest, NextResponse } from 'next/server'
import { getWorkrynSession } from '@/lib/workryn/auth'
import { db } from '@/lib/workryn/db'
import { validateUUID } from '@/lib/validation'

const ELEVATED_ROLES = ['TEAM_MANAGER', 'SUPERVISOR', 'OWNER', 'ADMIN', 'MANAGER']

export async function GET(req: NextRequest) {
  const session = await getWorkrynSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const url = new URL(req.url)
  const userId = url.searchParams.get('userId')
  const isElevated = ELEVATED_ROLES.includes(session.user.role)

  const targetUserId = (isElevated && userId && validateUUID(userId)) ? userId : session.user.id

  const balances = await db.ptoBalance.findMany({
    where: { userId: targetUserId },
    include: {
      type: {
        select: { id: true, name: true, code: true, color: true, icon: true, maxAccrual: true, accrualRate: true }
      },
    },
    orderBy: { type: { sortOrder: 'asc' } },
  })

  const enriched = balances.map(b => ({
    ...b,
    available: b.accrued + b.adjustment - b.used - b.pending,
  }))

  return NextResponse.json(enriched)
}

export async function POST(req: NextRequest) {
  const session = await getWorkrynSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  if (!['SUPERVISOR', 'OWNER', 'ADMIN'].includes(session.user.role)) {
    return NextResponse.json({ error: 'Only supervisors can adjust balances' }, { status: 403 })
  }

  const { userId, typeId, adjustmentHours, reason } = await req.json()

  if (!userId || !typeId || adjustmentHours == null || !reason?.trim()) {
    return NextResponse.json({ error: 'userId, typeId, adjustmentHours, reason required' }, { status: 400 })
  }
  if (!validateUUID(userId) || !validateUUID(typeId)) {
    return NextResponse.json({ error: 'Invalid IDs' }, { status: 400 })
  }
  if (Math.abs(adjustmentHours) > 480) {
    return NextResponse.json({ error: 'Adjustment too large' }, { status: 400 })
  }

  const balance = await db.ptoBalance.upsert({
    where: { userId_typeId: { userId, typeId } },
    create: { userId, typeId, adjustment: adjustmentHours },
    update: { adjustment: { increment: adjustmentHours } },
    include: { type: { select: { name: true } } },
  })

  await db.auditLog.create({
    data: {
      userId: session.user.id,
      action: 'PTO_BALANCE_ADJUSTED',
      resourceType: 'PTO_BALANCE',
      resourceId: balance.id,
      details: `Adjusted ${balance.type.name} for user ${userId}: ${adjustmentHours > 0 ? '+' : ''}${adjustmentHours}hrs — ${reason.trim()}`,
    },
  })

  return NextResponse.json(balance)
}
