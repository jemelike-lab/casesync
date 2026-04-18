import { NextRequest, NextResponse } from 'next/server'
import { getWorkrynSession } from '@/lib/workryn/auth'

import { db } from '@/lib/workryn/db'
import { isManagerOrAbove } from '@/lib/workryn/permissions'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getWorkrynSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id: lessonId } = await params
  const body = await req.json().catch(() => ({}))

  const completed = Boolean(body.completed)
  let watchedSeconds = Number.isFinite(body.watchedSeconds) ? Number(body.watchedSeconds) : 0
  if (watchedSeconds < 0) watchedSeconds = 0
  // Cap at a sane upper bound (~2 days) to prevent garbage data.
  if (watchedSeconds > 172800) watchedSeconds = 172800

  // Make sure the lesson exists and (for STAFF) belongs to a published course.
  const lesson = await db.trainingLesson.findUnique({
    where: { id: lessonId },
    select: {
      id: true,
      courseId: true,
      course: { select: { isPublished: true } },
    },
  })
  if (!lesson) return NextResponse.json({ error: 'Lesson not found' }, { status: 404 })
  if (!lesson.course?.isPublished && !isManagerOrAbove(session.user.role)) {
    return NextResponse.json({ error: 'Lesson not found' }, { status: 404 })
  }

  const progress = await db.lessonProgress.upsert({
    where: { lessonId_userId: { lessonId, userId: session.user.id } },
    create: {
      lessonId,
      userId: session.user.id,
      completed,
      watchedSeconds,
    },
    update: {
      completed,
      // Only increase watchedSeconds — don't let client accidentally reset it
      watchedSeconds: { set: watchedSeconds },
    },
  })

  // Auto-enroll the user in the course on first progress
  await db.trainingEnrollment.upsert({
    where: { courseId_userId: { courseId: lesson.courseId, userId: session.user.id } },
    create: {
      courseId: lesson.courseId,
      userId: session.user.id,
      status: 'IN_PROGRESS',
    },
    update: {},
  })

  return NextResponse.json(progress)
}
