import { NextRequest, NextResponse } from 'next/server'
import { getWorkrynSession } from '@/lib/workryn/auth'

import { db } from '@/lib/workryn/db'
import { isManagerOrAbove } from '@/lib/workryn/permissions'

const VALID_TYPES = ['MULTIPLE_CHOICE', 'MULTIPLE_CHOICE_MULTI', 'TRUE_FALSE']

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getWorkrynSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!isManagerOrAbove(session.user.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { id: quizId } = await params
  const questions = await db.quizQuestion.findMany({
    where: { quizId },
    orderBy: { order: 'asc' },
    include: { options: { orderBy: { order: 'asc' } } },
  })
  return NextResponse.json(questions)
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

  const { id: quizId } = await params
  const body = await req.json().catch(() => ({}))

  const text = (body.text ?? '').toString().trim()
  if (!text) return NextResponse.json({ error: 'Question text is required' }, { status: 400 })

  // Verify quiz exists before we try to create a question under it
  const quiz = await db.trainingQuiz.findUnique({ where: { id: quizId }, select: { id: true } })
  if (!quiz) return NextResponse.json({ error: 'Quiz not found' }, { status: 404 })

  const type = VALID_TYPES.includes(body.type) ? body.type : 'MULTIPLE_CHOICE'
  let points = Number.isFinite(body.points) ? Number(body.points) : 1
  if (points < 0) points = 0

  const rawOptions = Array.isArray(body.options) ? body.options : []
  if (rawOptions.length < 2) {
    return NextResponse.json({ error: 'At least 2 options are required' }, { status: 400 })
  }
  // Require at least one correct option — prevents unanswerable questions.
  if (!rawOptions.some((o: { isCorrect?: boolean }) => o?.isCorrect)) {
    return NextResponse.json({ error: 'At least one option must be marked correct' }, { status: 400 })
  }

  // Auto-assign order if not supplied: append to end
  let order: number
  if (Number.isFinite(body.order)) {
    order = Number(body.order)
  } else {
    const last = await db.quizQuestion.findFirst({
      where: { quizId },
      orderBy: { order: 'desc' },
      select: { order: true },
    })
    order = last ? last.order + 1 : 0
  }

  const result = await db.$transaction(async (tx) => {
    const question = await tx.quizQuestion.create({
      data: {
        text,
        type,
        points,
        order,
        quizId,
      },
    })
    await tx.quizOption.createMany({
      data: rawOptions.map((o: { text?: string; isCorrect?: boolean; order?: number }, i: number) => ({
        text: String(o?.text ?? '').trim(),
        isCorrect: Boolean(o?.isCorrect),
        order: Number.isFinite(o?.order) ? Number(o.order) : i,
        questionId: question.id,
      })),
    })
    return tx.quizQuestion.findUnique({
      where: { id: question.id },
      include: { options: { orderBy: { order: 'asc' } } },
    })
  })

  await db.auditLog.create({
    data: {
      userId: session.user.id,
      action: 'QUIZ_QUESTION_CREATED',
      resourceType: 'QUIZ_QUESTION',
      resourceId: result?.id ?? '',
      details: `Added question to quiz`,
    },
  })

  return NextResponse.json(result, { status: 201 })
}
