import { NextRequest, NextResponse } from 'next/server'
import { getWorkrynSession } from '@/lib/workryn/auth'

import { db } from '@/lib/workryn/db'
import { isAdminOrAbove } from '@/lib/workryn/permissions'

// Fields safe to expose to clients — deliberately excludes password, mfaSecret, emailVerified.
const SAFE_MEMBER_SELECT = {
  id: true,
  name: true,
  email: true,
  jobTitle: true,
  phone: true,
  role: true,
  avatarColor: true,
  isActive: true,
  lastLogin: true,
  createdAt: true,
  mfaEnabled: true,
} as const

/**
 * GET /api/departments/[id]/members
 *   List members of a department. Any authenticated user.
 *
 * POST /api/departments/[id]/members
 *   Add a member (or move a user from another department). ADMIN/OWNER only.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getWorkrynSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params

  const department = await db.department.findUnique({ where: { id } })
  if (!department) {
    return NextResponse.json({ error: 'Department not found' }, { status: 404 })
  }

  const members = await db.user.findMany({
    where: { departmentId: id },
    orderBy: { name: 'asc' },
    select: SAFE_MEMBER_SELECT,
  })

  return NextResponse.json(members)
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getWorkrynSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!isAdminOrAbove(session.user.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { id } = await params

  let body: { userId?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const userId = typeof body.userId === 'string' ? body.userId.trim() : ''
  if (!userId) {
    return NextResponse.json({ error: 'userId required' }, { status: 400 })
  }

  const department = await db.department.findUnique({ where: { id } })
  if (!department) {
    return NextResponse.json({ error: 'Department not found' }, { status: 404 })
  }

  const user = await db.user.findUnique({ where: { id: userId } })
  if (!user) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 })
  }

  const previousDepartmentId = user.departmentId

  const updated = await db.user.update({
    where: { id: userId },
    data: { departmentId: id },
    select: SAFE_MEMBER_SELECT,
  })

  await db.auditLog.create({
    data: {
      userId: session.user.id,
      action: 'DEPARTMENT_MEMBER_ADDED',
      resourceType: 'DEPARTMENT',
      resourceId: id,
      details: `Added ${updated.name ?? updated.email ?? updated.id} to department ${department.name}${
        previousDepartmentId && previousDepartmentId !== id
          ? ` (moved from department ${previousDepartmentId})`
          : ''
      }`,
    },
  })

  return NextResponse.json(updated, { status: 201 })
}
