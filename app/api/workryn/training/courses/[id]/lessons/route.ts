import { NextRequest, NextResponse } from 'next/server'
import { getWorkrynSession } from '@/lib/workryn/auth'

import { db } from '@/lib/workryn/db'
import { isManagerOrAbove } from '@/lib/workryn/permissions'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getWorkrynSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params

  // STAFF may only see lessons for published courses
  const course = await db.trainingCourse.findUnique({
    where: { id },
    select: { id: true, isPublished: true },
  })
  if (!course) return NextResponse.json({ error: 'Course not found' }, { status: 404 })
  if (!course.isPublished && !isManagerOrAbove(session.user.role)) {
    return NextResponse.json({ error: 'Course not found' }, { status: 404 })
  }

  const lessons = await db.trainingLesson.findMany({
    where: { courseId: id },
    orderBy: { order: 'asc' },
    include: {
      progress: {
        where: { userId: session.user.id },
        select: { id: true, completed: true, watchedSeconds: true },
      },
    },
  })
  return NextResponse.json(lessons)
}

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
  const body = await req.json().catch(() => ({}))

  const title = (body.title ?? '').toString().trim()
  if (!title) return NextResponse.json({ error: 'Title is required' }, { status: 400 })

  const content = body.content ? String(body.content) : ''
  const videoUrl = body.videoUrl ? String(body.videoUrl) : null
  const videoFileName = body.videoFileName ? String(body.videoFileName) : null
  const durationSeconds = Number.isFinite(body.durationSeconds) ? Number(body.durationSeconds) : null

  // Auto-assign order if not supplied: append to end
  let order: number
  if (Number.isFinite(body.order)) {
    order = Number(body.order)
  } else {
    const last = await db.trainingLesson.findFirst({
      where: { courseId },
      orderBy: { order: 'desc' },
      select: { order: true },
    })
    order = last ? last.order + 1 : 0
  }

  // Verify the course actually exists before creating an orphan lesson
  const course = await db.trainingCourse.findUnique({ where: { id: courseId }, select: { id: true, title: true } })
  if (!course) return NextResponse.json({ error: 'Course not found' }, { status: 404 })

  const lesson = await db.trainingLesson.create({
    data: {
      title,
      content,
      videoUrl,
      videoFileName,
      durationSeconds,
      order,
      courseId,
    },
  })

  await db.auditLog.create({
    data: {
      userId: session.user.id,
      action: 'LESSON_CREATED',
      resourceType: 'TRAINING_LESSON',
      resourceId: lesson.id,
      details: `Created lesson "${lesson.title}" in course ${course.title}`,
    },
  })

  return NextResponse.json(lesson, { status: 201 })
}
