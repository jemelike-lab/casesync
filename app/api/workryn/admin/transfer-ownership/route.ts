import { NextRequest, NextResponse } from 'next/server'
import { getWorkrynSession } from '@/lib/workryn/auth'

import { db } from '@/lib/workryn/db'
import { isOwner } from '@/lib/workryn/permissions'

export async function POST(req: NextRequest) {
  const session = await getWorkrynSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  if (!isOwner(session.user.role)) {
    return NextResponse.json({ error: 'Only an OWNER can transfer ownership' }, { status: 403 })
  }

  const body = await req.json().catch(() => ({}))
  const { targetUserId, demoteSelf = true } = body as { targetUserId?: string; demoteSelf?: boolean }

  if (!targetUserId) {
    return NextResponse.json({ error: 'targetUserId required' }, { status: 400 })
  }

  const target = await db.user.findUnique({ where: { id: targetUserId } })
  if (!target) return NextResponse.json({ error: 'Target user not found' }, { status: 404 })

  if (target.id === session.user.id) {
    return NextResponse.json({ error: 'Cannot transfer ownership to yourself' }, { status: 400 })
  }

  if (!target.isActive) {
    return NextResponse.json({ error: 'Cannot transfer ownership to an inactive user' }, { status: 400 })
  }

  // Already the owner? No-op success.
  if (target.role === 'OWNER') {
    return NextResponse.json({ ok: true, targetUserId: target.id, demoteSelf, noop: true })
  }

  await db.$transaction(async (tx) => {
    await tx.user.update({ where: { id: target.id }, data: { role: 'OWNER' } })
    if (demoteSelf) {
      await tx.user.update({ where: { id: session.user.id }, data: { role: 'ADMIN' } })
    }
  })

  await db.auditLog.create({
    data: {
      userId: session.user.id,
      action: 'OWNERSHIP_TRANSFERRED',
      resourceType: 'USER',
      resourceId: target.id,
      details: demoteSelf
        ? `Transferred ownership to ${target.name} (${target.email}); self demoted to ADMIN`
        : `Promoted ${target.name} (${target.email}) to OWNER`,
    },
  })

  return NextResponse.json({ ok: true, targetUserId: target.id, demoteSelf })
}
