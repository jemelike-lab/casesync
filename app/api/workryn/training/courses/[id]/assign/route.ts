import { NextRequest, NextResponse } from 'next/server'
import { getWorkrynSession } from '@/lib/workryn/auth'
import { db } from '@/lib/workryn/db'
import { isManagerOrAbove } from '@/lib/workryn/permissions'

// POST /api/workryn/training/courses/[id]/assign
// Body: { userIds?: string[], departmentIds?: string[] }
// Enrolls specified users (and/or all users in specified departments) into the course.
// Sends a notification to each newly enrolled user.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getWorkrynSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!isManagerOrAbove(session.user.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { id: courseId } = await params
  const course = await db.trainingCourse.findUnique({
    where: { id: courseId },
    select: { id: true, title: true },
  })
  if (!course) return NextResponse.json({ error: 'Course not found' }, { status: 404 })

  const body = await req.json().catch(() => ({}))
  const userIds: string[] = Array.isArray(body.userIds) ? body.userIds : []
  const departmentIds: string[] = Array.isArray(body.departmentIds) ? body.departmentIds : []

  // Resolve department members
  let deptUserIds: string[] = []
  if (departmentIds.length > 0) {
    const deptUsers = await db.user.findMany({
      where: { departmentId: { in: departmentIds } },
      select: { id: true },
    })
    deptUserIds = deptUsers.map(u => u.id)
  }

  // Combine and dedupe
  const allUserIds = [...new Set([...userIds, ...deptUserIds])]
  if (allUserIds.length === 0) {
    return NextResponse.json({ error: 'No users specified' }, { status: 400 })
  }

  // Find existing enrollments to avoid duplicates
  const existing = await db.trainingEnrollment.findMany({
    where: { courseId, userId: { in: allUserIds } },
    select: { userId: true },
  })
  const existingSet = new Set(existing.map(e => e.userId))
  const newUserIds = allUserIds.filter(uid => !existingSet.has(uid))

  // Bulk create enrollments
  if (newUserIds.length > 0) {
    await db.trainingEnrollment.createMany({
      data: newUserIds.map(userId => ({
        courseId,
        userId,
        status: 'IN_PROGRESS',
      })),
    })

    // Send notification to each new enrollee
    await db.notification.createMany({
      data: newUserIds.map(userId => ({
        userId,
        type: 'TRAINING_ASSIGNED',
        category: 'TRAINING',
        title: 'New Training Assigned',
        message: `You have been assigned to "${course.title}". Start learning now!`,
        link: `/w/training/courses/${courseId}`,
      })),
    })

    // Audit log
    await db.auditLog.create({
      data: {
        userId: session.user.id,
        action: 'TRAINING_ASSIGNED',
        resourceType: 'TRAINING_COURSE',
        resourceId: courseId,
        details: `Assigned ${newUserIds.length} user(s) to "${course.title}"`,
      },
    })
  }

  return NextResponse.json({
    assigned: newUserIds.length,
    alreadyEnrolled: existingSet.size,
    total: allUserIds.length,
  })
}
