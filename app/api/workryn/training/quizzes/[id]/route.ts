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
  const quiz = await db.trainingQuiz.findUnique({
    where: { id },
    include: {
      course: { select: { isPublished: true } },
      questions: {
        orderBy: { order: 'asc' },
        include: { options: { orderBy: { order: 'asc' } } },
      },
    },
  })

  if (!quiz) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const isStaff = !isManagerOrAbove(session.user.role)

  // STAFF cannot see quizzes attached to unpublished courses
  if (isStaff && !quiz.course?.isPublished) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  // Strip isCorrect flags from STAFF to prevent cheating
  if (isStaff) {
    const sanitized = {
      ...quiz,
      questions: quiz.questions.map(q => ({
        ...q,
        options: q.options.map(o => ({
          id: o.id,
          text: o.text,
          order: o.order,
          questionId: o.questionId,
        })),
      })),
    }
    return NextResponse.json(sanitized)
  }

  return NextResponse.json(quiz)
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getWorkrynSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!isManagerOrAbove(session.user.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { id } = await params
  const body = await req.json().catch(() => ({}))

  const data: Record<string, unknown> = {}
  if (body.title !== undefined) data.title = String(body.title).trim()
  if (body.description !== undefined) data.description = body.description ? String(body.description).trim() : null
  if (body.passThreshold !== undefined) {
    let pt = Number(body.passThreshold)
    if (!Number.isFinite(pt)) pt = 70
    if (pt < 0) pt = 0
    if (pt > 100) pt = 100
    data.passThreshold = pt
  }

  const quiz = await db.trainingQuiz.update({ where: { id }, data })

  await db.auditLog.create({
    data: {
      userId: session.user.id,
      action: 'QUIZ_UPDATED',
      resourceType: 'TRAINING_QUIZ',
      resourceId: quiz.id,
      details: `Updated quiz: ${quiz.title}`,
    },
  })

  return NextResponse.json(quiz)
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getWorkrynSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!isManagerOrAbove(session.user.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { id } = await params
  const existing = await db.trainingQuiz.findUnique({ where: { id }, select: { id: true, title: true } })
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  await db.trainingQuiz.delete({ where: { id } })

  await db.auditLog.create({
    data: {
      userId: session.user.id,
      action: 'QUIZ_DELETED',
      resourceType: 'TRAINING_QUIZ',
      resourceId: id,
      details: `Deleted quiz: ${existing.title}`,
    },
  })

  return NextResponse.json({ ok: true })
}
