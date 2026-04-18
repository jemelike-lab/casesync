/**
 * POST /api/profile/password — change current user's password
 *
 * Body: { currentPassword, newPassword }
 *
 * Validates that currentPassword matches before allowing the change.
 * New password must be at least 8 characters.
 */

import { NextRequest, NextResponse } from 'next/server'
import { getWorkrynSession } from '@/lib/workryn/auth'

import { db } from '@/lib/workryn/db'
import { compare, hash } from 'bcryptjs'

export async function POST(req: NextRequest) {
  const session = await getWorkrynSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { currentPassword, newPassword } = await req.json().catch(() => ({}))

  if (typeof currentPassword !== 'string' || typeof newPassword !== 'string') {
    return NextResponse.json({ error: 'Both currentPassword and newPassword are required' }, { status: 400 })
  }

  if (newPassword.length < 8) {
    return NextResponse.json({ error: 'New password must be at least 8 characters' }, { status: 400 })
  }

  const user = await db.user.findUnique({
    where: { id: session.user.id },
    select: { id: true, password: true },
  })

  if (!user || !user.password) {
    return NextResponse.json({ error: 'User not found or no password set' }, { status: 404 })
  }

  const valid = await compare(currentPassword, user.password)
  if (!valid) return NextResponse.json({ error: 'Current password is incorrect' }, { status: 400 })

  const newHash = await hash(newPassword, 12)
  await db.user.update({
    where: { id: session.user.id },
    data: { password: newHash },
  })

  await db.auditLog.create({
    data: {
      userId: session.user.id,
      action: 'PASSWORD_CHANGED',
      resourceType: 'USER',
      resourceId: session.user.id,
      details: 'Password updated by user',
    },
  })

  return NextResponse.json({ success: true })
}
