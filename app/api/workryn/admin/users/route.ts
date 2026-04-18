import { NextRequest, NextResponse } from 'next/server'
import { getWorkrynSession } from '@/lib/workryn/auth'

import { db } from '@/lib/workryn/db'
import { hash } from 'bcryptjs'
import { isManagerOrAbove, canCreateRole } from '@/lib/workryn/permissions'

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

export async function GET() {
  const session = await getWorkrynSession()
  if (!session || !isManagerOrAbove(session.user.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const users = await db.user.findMany({
    orderBy: { createdAt: 'desc' },
    select: SAFE_USER_SELECT,
  })
  return NextResponse.json(users)
}

export async function POST(req: NextRequest) {
  const session = await getWorkrynSession()
  if (!session || !isManagerOrAbove(session.user.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { name, email, password, role, jobTitle, departmentId, avatarColor } = await req.json()

  if (!name || !email || !password) {
    return NextResponse.json({ error: 'Name, email, and password required' }, { status: 400 })
  }
  if (typeof password !== 'string' || password.length < 6) {
    return NextResponse.json({ error: 'Password must be at least 6 characters' }, { status: 400 })
  }

  const targetRole = role || 'STAFF'
  if (!canCreateRole(session.user.role, targetRole)) {
    return NextResponse.json({ error: `You are not allowed to create users with role ${targetRole}` }, { status: 403 })
  }

  const normalizedEmail = String(email).trim().toLowerCase()
  const existing = await db.user.findUnique({ where: { email: normalizedEmail } })
  if (existing) {
    return NextResponse.json({ error: 'A user with this email already exists' }, { status: 400 })
  }

  const hashedPwd = await hash(password, 12)

  const user = await db.user.create({
    data: {
      name: String(name).trim(),
      email: normalizedEmail,
      password: hashedPwd,
      role: targetRole,
      jobTitle: jobTitle || null,
      avatarColor: avatarColor || '#6366f1',
      departmentId: departmentId || null,
      isActive: true,
    },
    select: SAFE_USER_SELECT,
  })

  await db.auditLog.create({
    data: {
      userId: session.user.id,
      action: 'USER_CREATED',
      resourceType: 'USER',
      resourceId: user.id,
      details: `Created user: ${user.name} (${user.email}) as ${targetRole}`,
    },
  })

  return NextResponse.json(user, { status: 201 })
}
