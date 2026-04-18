import { NextRequest, NextResponse } from 'next/server'
import { getWorkrynSession } from '@/lib/workryn/auth'

import { db } from '@/lib/workryn/db'

// Fields safe to expose to clients — deliberately excludes password, mfaSecret, emailVerified.
const SAFE_USER_SELECT = {
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
  departmentId: true,
  department: {
    select: {
      id: true,
      name: true,
      slug: true,
      color: true,
      icon: true,
      description: true,
    },
  },
} as const

/**
 * GET /api/departments/[id]/contact/[userId]
 *   Contact card for a single member. Any authenticated user.
 *   Returns the user's full profile plus quick stats (tasks assigned, tickets
 *   created, training completed, evaluations received).
 *   Verifies the user is actually a member of the requested department.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; userId: string }> }
) {
  const session = await getWorkrynSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id, userId } = await params

  const department = await db.department.findUnique({ where: { id } })
  if (!department) {
    return NextResponse.json({ error: 'Department not found' }, { status: 404 })
  }

  const user = await db.user.findUnique({
    where: { id: userId },
    select: SAFE_USER_SELECT,
  })

  if (!user) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 })
  }

  if (user.departmentId !== id) {
    return NextResponse.json(
      { error: 'User is not a member of this department' },
      { status: 404 }
    )
  }

  const [
    tasksAssigned,
    ticketsCreated,
    trainingCompleted,
    evaluationsReceived,
  ] = await Promise.all([
    db.task.count({ where: { assignedToId: userId } }),
    db.ticket.count({ where: { createdById: userId } }),
    db.trainingEnrollment.count({
      where: { userId, status: 'COMPLETED' },
    }),
    db.evaluation.count({ where: { agentId: userId } }),
  ])

  return NextResponse.json({
    ...user,
    stats: {
      tasksAssigned,
      ticketsCreated,
      trainingCompleted,
      evaluationsReceived,
    },
  })
}
