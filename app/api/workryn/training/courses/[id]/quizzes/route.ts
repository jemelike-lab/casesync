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
  if (!isManagerOrAbove(session.user.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { id: courseId } = await params
  const body = await req.json().catch(() => ({}))

  const title = (body.title ?? '').toString().trim()
  if (!title) return NextResponse.json({ error: 'Title is required' }, { status: 400 })

  const description = body.description ? String(body.description).trim() : null
  let passThreshold = Number.isFinite(body.passThreshold) ? Number(body.passThreshold) : 70
  if (passThreshold < 0) passThreshold = 0
  if (passThreshold > 100) passThreshold = 100

  // Verify the course exists before creating an orphan quiz
  const course = await db.trainingCourse.findUnique({ where: { id: courseId }, select: { id: true, title: true } })
  if (!course) return NextResponse.json({ error: 'Course not found' }, { status: 404 })

  const quiz = await db.trainingQuiz.create({
    data: {
      title,
      description,
      passThreshold,
      courseId,
    },
    include: { _count: { select: { questions: true } } },
  })

  await db.auditLog.create({
    data: {
      userId: session.user.id,
      action: 'QUIZ_CREATED',
      resourceType: 'TRAINING_QUIZ',
      resourceId: quiz.id,
      details: `Created quiz "${quiz.title}" in course ${course.title}`,
    },
  })

  return NextResponse.json(quiz, { status: 201 })
}
