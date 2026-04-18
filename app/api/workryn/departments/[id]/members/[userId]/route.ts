import { NextRequest, NextResponse } from 'next/server'
import { getWorkrynSession } from '@/lib/workryn/auth'

import { db } from '@/lib/workryn/db'
import { isAdminOrAbove } from '@/lib/workryn/permissions'

/**
 * DELETE /api/departments/[id]/members/[userId]
 *   Remove a user from a department. ADMIN/OWNER only.
 *   Sets the user's departmentId to null. If the user is the department's head,
 *   also clears the department's headId (inside a transaction).
 */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; userId: string }> }
) {
  const session = await getWorkrynSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!isAdminOrAbove(session.user.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { id, userId } = await params

  const department = await db.department.findUnique({ where: { id } })
  if (!department) {
    return NextResponse.json({ error: 'Department not found' }, { status: 404 })
  }

  const user = await db.user.findUnique({ where: { id: userId } })
  if (!user) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 })
  }

  if (user.departmentId !== id) {
    return NextResponse.json(
      { error: 'User is not a member of this department' },
      { status: 400 }
    )
  }

  const wasHead = department.headId === userId

  await db.$transaction(async (tx) => {
    if (wasHead) {
      await tx.department.update({
        where: { id },
        data: { headId: null },
      })
    }
    await tx.user.update({
      where: { id: userId },
      data: { departmentId: null },
    })
  })

  await db.auditLog.create({
    data: {
      userId: session.user.id,
      action: 'DEPARTMENT_MEMBER_REMOVED',
      resourceType: 'DEPARTMENT',
      resourceId: id,
      details: `Removed ${user.name ?? user.email ?? user.id} from department ${department.name}${
        wasHead ? ' (also cleared as department head)' : ''
      }`,
    },
  })

  return NextResponse.json({ ok: true })
}
