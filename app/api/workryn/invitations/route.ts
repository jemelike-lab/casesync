import { NextRequest, NextResponse } from 'next/server'
import { getWorkrynSession } from '@/lib/workryn/auth'

import { db } from '@/lib/workryn/db'
import { isManagerOrAbove, canCreateRole } from '@/lib/workryn/permissions'

export async function GET() {
  const session = await getWorkrynSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  if (!isManagerOrAbove(session.user.role)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }

  const invitations = await db.invitation.findMany({
    orderBy: { createdAt: 'desc' },
    include: {
      invitedBy: { select: { id: true, name: true, avatarColor: true } },
    },
  })

  return NextResponse.json(invitations)
}

export async function POST(req: NextRequest) {
  const session = await getWorkrynSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  if (!isManagerOrAbove(session.user.role)) {
    return NextResponse.json({ error: 'Only admins and managers can send invitations' }, { status: 403 })
  }

  const { email, role, departmentId, message } = await req.json()

  if (!email?.trim()) return NextResponse.json({ error: 'Email required' }, { status: 400 })

  const normalizedEmail = String(email).trim().toLowerCase()
  // Basic RFC-5322-ish shape check. Keeps garbage input from slipping into the DB.
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
    return NextResponse.json({ error: 'Invalid email address' }, { status: 400 })
  }

  const targetRole = role || 'STAFF'
  if (!canCreateRole(session.user.role, targetRole)) {
    return NextResponse.json({ error: `You are not allowed to invite users with role ${targetRole}` }, { status: 403 })
  }

  // Check if user already exists
  const existingUser = await db.user.findUnique({ where: { email: normalizedEmail } })
  if (existingUser) return NextResponse.json({ error: 'A user with this email already exists' }, { status: 400 })

  // Check for pending invitation with same email
  const existingInvite = await db.invitation.findFirst({
    where: { email: normalizedEmail, status: 'PENDING' },
  })
  if (existingInvite) return NextResponse.json({ error: 'A pending invitation already exists for this email' }, { status: 400 })

  const expiresAt = new Date()
  expiresAt.setDate(expiresAt.getDate() + 7) // 7 days expiry

  const invitation = await db.invitation.create({
    data: {
      email: normalizedEmail,
      role: targetRole,
      departmentId: departmentId || null,
      message: message?.trim() || null,
      expiresAt,
      invitedById: session.user.id,
    },
    include: {
      invitedBy: { select: { id: true, name: true, avatarColor: true } },
    },
  })

  await db.auditLog.create({
    data: {
      userId: session.user.id,
      action: 'INVITATION_SENT',
      resourceType: 'INVITATION',
      resourceId: invitation.id,
      details: `Invited ${email} as ${targetRole}`,
    },
  })

  return NextResponse.json(invitation, { status: 201 })
}

export async function PATCH(req: NextRequest) {
  const session = await getWorkrynSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  if (!isManagerOrAbove(session.user.role)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }

  const { id } = await req.json()
  if (!id) return NextResponse.json({ error: 'Invitation ID required' }, { status: 400 })

  const invitation = await db.invitation.findUnique({ where: { id } })
  if (!invitation) return NextResponse.json({ error: 'Invitation not found' }, { status: 404 })
  if (invitation.status !== 'PENDING') return NextResponse.json({ error: 'Can only revoke pending invitations' }, { status: 400 })

  const updated = await db.invitation.update({
    where: { id },
    data: { status: 'REVOKED' },
    include: {
      invitedBy: { select: { id: true, name: true, avatarColor: true } },
    },
  })

  await db.auditLog.create({
    data: {
      userId: session.user.id,
      action: 'INVITATION_REVOKED',
      resourceType: 'INVITATION',
      resourceId: updated.id,
      details: `Revoked invitation to ${updated.email}`,
    },
  })

  return NextResponse.json(updated)
}
