import { NextRequest, NextResponse } from 'next/server'
import { getWorkrynSession } from '@/lib/workryn/auth'

import { db } from '@/lib/workryn/db'
import { canManageUser, canCreateRole, isManagerOrAbove } from '@/lib/workryn/permissions'

// Fields safe to expose to clients — deliberately excludes password, mfaSecret, emailVerified.
const SAFE_USER_SELECT = {
  id: true,
  name: true,
  email: true,
  role: true,
  jobTitle: true,
  phone: true,
  avatarColor: true,
  mfaEnabled: true,
  isActive: true,
  lastLogin: true,
  createdAt: true,
  updatedAt: true,
  departmentId: true,
  department: { select: { id: true, name: true, color: true } },
} as const

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getWorkrynSession()
  if (!session || !isManagerOrAbove(session.user.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { id } = await params
  const body = await req.json()
  const { name, email, role, jobTitle, departmentId, avatarColor, isActive } = body

  const existing = await db.user.findUnique({ where: { id } })
  if (!existing) return NextResponse.json({ error: 'User not found' }, { status: 404 })

  if (!canManageUser(session.user.role, existing.role)) {
    return NextResponse.json({ error: 'You are not allowed to manage this user' }, { status: 403 })
  }

  // If the role is changing, make sure the actor can assign the new role
  if (role !== undefined && role !== existing.role) {
    if (!canCreateRole(session.user.role, role)) {
      return NextResponse.json({ error: `You are not allowed to assign the role ${role}` }, { status: 403 })
    }
    // Prevent self-demotion (would lock the actor out of their own permission tier)
    if (id === session.user.id) {
      return NextResponse.json({ error: 'You cannot change your own role' }, { status: 400 })
    }
    // Protect the last OWNER from demotion
    if (existing.role === 'OWNER' && role !== 'OWNER') {
      const ownerCount = await db.user.count({ where: { role: 'OWNER', isActive: true } })
      if (ownerCount <= 1) {
        return NextResponse.json({ error: 'Cannot demote the last OWNER' }, { status: 400 })
      }
    }
  }

  // Protect the last OWNER from deactivation
  if (isActive === false && existing.role === 'OWNER' && existing.isActive) {
    const ownerCount = await db.user.count({ where: { role: 'OWNER', isActive: true } })
    if (ownerCount <= 1) {
      return NextResponse.json({ error: 'Cannot deactivate the last OWNER' }, { status: 400 })
    }
  }

  // Prevent self-deactivation
  if (isActive === false && id === session.user.id) {
    return NextResponse.json({ error: 'You cannot deactivate yourself' }, { status: 400 })
  }

  // If the email is changing, normalize and enforce uniqueness.
  let normalizedEmail: string | undefined
  if (email !== undefined && email !== existing.email) {
    normalizedEmail = String(email).trim().toLowerCase()
    if (!normalizedEmail) {
      return NextResponse.json({ error: 'Email cannot be empty' }, { status: 400 })
    }
    const clash = await db.user.findUnique({ where: { email: normalizedEmail } })
    if (clash && clash.id !== id) {
      return NextResponse.json({ error: 'A user with this email already exists' }, { status: 400 })
    }
  }

  const data: Record<string, unknown> = {}
  if (name !== undefined) data.name = name
  if (normalizedEmail !== undefined) data.email = normalizedEmail
  if (role !== undefined) data.role = role
  if (jobTitle !== undefined) data.jobTitle = jobTitle || null
  if (departmentId !== undefined) data.departmentId = departmentId || null
  if (avatarColor !== undefined) data.avatarColor = avatarColor
  if (isActive !== undefined) data.isActive = isActive

  const user = await db.user.update({
    where: { id },
    data,
    select: SAFE_USER_SELECT,
  })

  await db.auditLog.create({
    data: {
      userId: session.user.id,
      action: 'USER_UPDATED',
      resourceType: 'USER',
      resourceId: user.id,
      details: isActive !== undefined
        ? `User ${user.name} ${isActive ? 'activated' : 'deactivated'}`
        : `Updated user: ${user.name}`,
    },
  })

  return NextResponse.json(user)
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getWorkrynSession()
  if (!session || !isManagerOrAbove(session.user.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { id } = await params
  if (id === session.user.id) return NextResponse.json({ error: 'Cannot delete yourself' }, { status: 400 })

  const existing = await db.user.findUnique({ where: { id } })
  if (!existing) return NextResponse.json({ error: 'User not found' }, { status: 404 })

  if (!canManageUser(session.user.role, existing.role)) {
    return NextResponse.json({ error: 'You are not allowed to manage this user' }, { status: 403 })
  }

  // Protect the last active OWNER from deletion
  if (existing.role === 'OWNER') {
    const ownerCount = await db.user.count({ where: { role: 'OWNER', isActive: true } })
    if (ownerCount <= 1) {
      return NextResponse.json({ error: 'Cannot delete the last OWNER' }, { status: 400 })
    }
  }

  await db.user.delete({ where: { id } })

  await db.auditLog.create({
    data: {
      userId: session.user.id,
      action: 'USER_DELETED',
      resourceType: 'USER',
      resourceId: id,
      details: `Deleted user: ${existing.name} (${existing.email})`,
    },
  })

  return NextResponse.json({ ok: true })
}
