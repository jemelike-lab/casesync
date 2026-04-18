import { NextRequest, NextResponse } from 'next/server'
import { getWorkrynSession } from '@/lib/workryn/auth'

import { db } from '@/lib/workryn/db'
import { isManagerOrAbove } from '@/lib/workryn/permissions'

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getWorkrynSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id: courseId } = await params

  const course = await db.trainingCourse.findUnique({
    where: { id: courseId },
    select: { id: true, isPublished: true },
  })
  if (!course) return NextResponse.json({ error: 'Course not found' }, { status: 404 })

  // STAFF can only enroll in published courses.
  if (!course.isPublished && !isManagerOrAbove(session.user.role)) {
    return NextResponse.json({ error: 'Course not found' }, { status: 404 })
  }

  const enrollment = await db.trainingEnrollment.upsert({
    where: { courseId_userId: { courseId, userId: session.user.id } },
    create: {
      courseId,
      userId: session.user.id,
      status: 'IN_PROGRESS',
    },
    update: {},
  })

  await db.auditLog.create({
    data: {
      userId: session.user.id,
      action: 'COURSE_ENROLLED',
      resourceType: 'TRAINING_COURSE',
      resourceId: courseId,
      details: 'User enrolled in course',
    },
  })

  return NextResponse.json(enrollment, { status: 201 })
}
