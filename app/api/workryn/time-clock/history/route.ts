import { NextRequest, NextResponse } from 'next/server'
import { getWorkrynSession } from '@/lib/workryn/auth'

import { db } from '@/lib/workryn/db'

export async function GET(req: NextRequest) {
  const session = await getWorkrynSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const userId = session.user.id

  const limitRaw = Number(req.nextUrl.searchParams.get('limit') ?? '20')
  const offsetRaw = Number(req.nextUrl.searchParams.get('offset') ?? '0')
  const limit = Math.max(1, Math.min(100, Number.isFinite(limitRaw) ? limitRaw : 20))
  const offset = Math.max(0, Number.isFinite(offsetRaw) ? offsetRaw : 0)

  const [entries, total] = await Promise.all([
    db.timeEntry.findMany({
      where: { userId, status: { in: ['COMPLETED', 'EDITED'] } },
      include: { breaks: { orderBy: { startAt: 'asc' } } },
      orderBy: { clockInAt: 'desc' },
      take: limit,
      skip: offset,
    }),
    db.timeEntry.count({
      where: { userId, status: { in: ['COMPLETED', 'EDITED'] } },
    }),
  ])

  return NextResponse.json({
    entries,
    total,
    limit,
    offset,
    hasMore: offset + entries.length < total,
  })
}
