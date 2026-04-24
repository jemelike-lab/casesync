import { NextRequest, NextResponse } from 'next/server'
import { requireWorkrynSession } from '@/lib/workryn/auth'
import { db } from '@/lib/workryn/db'

const ELEVATED_ROLES = ['OWNER', 'ADMIN', 'MANAGER', 'SUPERVISOR', 'TEAM_MANAGER']

export async function GET(req: NextRequest) {
  const session = await requireWorkrynSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { user } = session
  const isElevated = ELEVATED_ROLES.includes(user.role)
  const url = req.nextUrl
  const statusFilter = url.searchParams.get('status')
  const userIdFilter = url.searchParams.get('userId')
  const limit = Math.min(Number(url.searchParams.get('limit') || '200'), 500)

  const where: Record<string, unknown> = {}
  if (!isElevated) { where.userId = user.id } else if (userIdFilter) { where.userId = userIdFilter }
  if (statusFilter && statusFilter !== 'ALL') { where.status = statusFilter }

  const requests = await db.ptoRequest.findMany({
    where,
    include: {
      user: { select: { id: true, name: true, avatarColor: true, email: true, jobTitle: true } },
      type: { select: { id: true, name: true, code: true, color: true, icon: true, excludeFromPayroll: true } },
      reviewedBy: { select: { id: true, name: true } },
    },
    orderBy: { createdAt: 'desc' },
    take: limit,
  })

  const serialized = requests.map((r) => ({
    ...r,
    startDate: r.startDate.toISOString(),
    endDate: r.endDate.toISOString(),
    reviewedAt: r.reviewedAt?.toISOString() ?? null,
    createdAt: r.createdAt.toISOString(),
  }))

  return NextResponse.json(serialized)
}

export async function POST(req: NextRequest) {
  const session = await requireWorkrynSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { user } = session
  let body: { typeId: string; startDate: string; endDate: string; totalHours: number; isHalfDay?: boolean; halfDayPeriod?: string | null; notes?: string | null }
  try { body = await req.json() } catch (_e) { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }

  const { typeId, startDate, endDate, totalHours, isHalfDay, halfDayPeriod, notes } = body
  if (!typeId || !startDate || !endDate || !totalHours) return NextResponse.json({ error: 'typeId, startDate, endDate, and totalHours are required' }, { status: 400 })
  if (totalHours <= 0) return NextResponse.json({ error: 'totalHours must be positive' }, { status: 400 })

  const start = new Date(startDate)
  const end = new Date(endDate)
  if (isNaN(start.getTime()) || isNaN(end.getTime())) return NextResponse.json({ error: 'Invalid date format' }, { status: 400 })
  if (start > end) return NextResponse.json({ error: 'Start date must be before or equal to end date' }, { status: 400 })

  const ptoType = await db.ptoType.findUnique({ where: { id: typeId } })
  if (!ptoType || !ptoType.isActive) return NextResponse.json({ error: 'Invalid PTO type' }, { status: 400 })

  let balance = await db.ptoBalance.findUnique({ where: { userId_typeId: { userId: user.id, typeId } } })
  if (!balance) { balance = await db.ptoBalance.create({ data: { userId: user.id, typeId, accrued: 0, used: 0, pending: 0, adjustment: 0 } }) }

  const available = balance.accrued + balance.adjustment - balance.used - balance.pending
  if (totalHours > available) return NextResponse.json({ error: `Insufficient balance. Available: ${available.toFixed(1)} hrs` }, { status: 400 })

  const [request] = await db.$transaction([
    db.ptoRequest.create({
      data: { userId: user.id, typeId, startDate: start, endDate: end, totalHours, isHalfDay: isHalfDay ?? false, halfDayPeriod: halfDayPeriod ?? null, notes: notes ?? null, status: 'PENDING' },
      include: {
        user: { select: { id: true, name: true, avatarColor: true, email: true, jobTitle: true } },
        type: { select: { id: true, name: true, code: true, color: true, icon: true, excludeFromPayroll: true } },
        reviewedBy: { select: { id: true, name: true } },
      },
    }),
    db.ptoBalance.update({ where: { userId_typeId: { userId: user.id, typeId } }, data: { pending: { increment: totalHours } } }),
  ])

  return NextResponse.json({ ...request, startDate: request.startDate.toISOString(), endDate: request.endDate.toISOString(), reviewedAt: null, createdAt: request.createdAt.toISOString() }, { status: 201 })
}
