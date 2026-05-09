import { NextRequest, NextResponse } from 'next/server'
import { getWorkrynSession } from '@/lib/workryn/auth'
import { db } from '@/lib/workryn/db'
import { isManagerOrAbove } from '@/lib/workryn/permissions'

// POST /api/workryn/training/courses/[id]/remind
// Body: { userIds?: string[] }
// Sends a reminder notification to enrolled users who haven't completed the course.
// If userIds is omitted, reminds ALL incomplete enrollees.
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
  const targetUserIds: string[] | undefined = Array.isArray(body.userIds) ? body.userIds : undefined

  // Find incomplete enrollments
  const where: Record<string, unknown> = {
    courseId,
    status: { not: 'COMPLETED' },
  }
  if (targetUserIds && targetUserIds.length > 0) {
    where.userId = { in: targetUserIds }
  }

  const incompleteEnrollments = await db.trainingEnrollment.findMany({
    where,
    select: { userId: true },
  })

  if (incompleteEnrollments.length === 0) {
    return NextResponse.json({ reminded: 0, message: 'No incomplete enrollments found' })
  }

  const userIds = incompleteEnrollments.map(e => e.userId)

  // Get the sender's name
  const sender = await db.user.findUnique({
    where: { id: session.user.id },
    select: { name: true },
  })
  const senderName = sender?.name ?? 'Your supervisor'

  await db.notification.createMany({
    data: userIds.map(userId => ({
      userId,
      type: 'TRAINING_REMINDER',
      category: 'TRAINING',
      title: 'Training Reminder',
      message: `${senderName} is reminding you to complete "${course.title}".`,
      link: `/w/training/courses/${courseId}`,
    })),
  })

  await db.auditLog.create({
    data: {
      userId: session.user.id,
      action: 'TRAINING_REMINDER_SENT',
      resourceType: 'TRAINING_COURSE',
      resourceId: courseId,
      details: `Sent reminder to ${userIds.length} user(s) for "${course.title}"`,
    },
  })

  return NextResponse.json({ reminded: userIds.length })
}
