import { NextRequest, NextResponse } from 'next/server'
import { getWorkrynSession } from '@/lib/workryn/auth'

import { db } from '@/lib/workryn/db'

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getWorkrynSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const existing = await db.evaluation.findUnique({ where: { id } })
  if (!existing) return NextResponse.json({ error: 'Evaluation not found' }, { status: 404 })

  if (existing.agentId !== session.user.id) {
    return NextResponse.json({ error: 'Only the agent can acknowledge this evaluation' }, { status: 403 })
  }
  if (existing.isPrivate) {
    return NextResponse.json({ error: 'This evaluation is private' }, { status: 403 })
  }
  if (existing.acknowledgedAt) {
    return NextResponse.json({ ok: true, acknowledgedAt: existing.acknowledgedAt })
  }

  const updated = await db.evaluation.update({
    where: { id },
    data: { acknowledgedAt: new Date() },
  })

  await db.auditLog.create({
    data: {
      userId: session.user.id,
      action: 'EVALUATION_ACKNOWLEDGED',
      resourceType: 'EVALUATION',
      resourceId: id,
      details: 'Agent acknowledged evaluation',
    },
  })

  return NextResponse.json({ ok: true, acknowledgedAt: updated.acknowledgedAt })
}
