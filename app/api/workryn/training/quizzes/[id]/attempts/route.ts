import { NextRequest, NextResponse } from 'next/server'
import { getWorkrynSession } from '@/lib/workryn/auth'

import { db } from '@/lib/workryn/db'
import { isManagerOrAbove } from '@/lib/workryn/permissions'

type RawAnswers = Record<string, string | string[]>

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getWorkrynSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id: quizId } = await params
  const isManager = isManagerOrAbove(session.user.role)

  const attempts = await db.quizAttempt.findMany({
    where: isManager ? { quizId } : { quizId, userId: session.user.id },
    orderBy: { startedAt: 'desc' },
    include: {
      user: { select: { id: true, name: true, avatarColor: true } },
    },
  })
  return NextResponse.json(attempts)
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getWorkrynSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id: quizId } = await params
  const body = await req.json().catch(() => ({}))
  const rawAnswers: RawAnswers =
    body && typeof body.answers === 'object' && body.answers !== null ? body.answers : {}

  // Load quiz with questions and options to grade on the server
  const quiz = await db.trainingQuiz.findUnique({
    where: { id: quizId },
    include: {
      course: { select: { id: true, passThreshold: true, isPublished: true } },
      questions: {
        include: { options: true },
      },
    },
  })
  if (!quiz) return NextResponse.json({ error: 'Quiz not found' }, { status: 404 })

  // STAFF can only attempt quizzes in published courses.
  if (!quiz.course?.isPublished && !isManagerOrAbove(session.user.role)) {
    return NextResponse.json({ error: 'Quiz not found' }, { status: 404 })
  }

  let earned = 0
  let total = 0

  for (const q of quiz.questions) {
    total += q.points
    const correctOptionIds = q.options.filter(o => o.isCorrect).map(o => o.id)
    const userAnswer = rawAnswers[q.id]

    if (q.type === 'MULTIPLE_CHOICE_MULTI') {
      const selected = Array.isArray(userAnswer)
        ? userAnswer
        : (userAnswer ? [userAnswer] : [])
      if (
        selected.length === correctOptionIds.length &&
        correctOptionIds.every(id => selected.includes(id))
      ) {
        earned += q.points
      }
    } else {
      // MULTIPLE_CHOICE or TRUE_FALSE — single option
      const selected = Array.isArray(userAnswer) ? userAnswer[0] : userAnswer
      if (selected && correctOptionIds.length === 1 && selected === correctOptionIds[0]) {
        earned += q.points
      }
    }
  }

  const percentage = total > 0 ? Math.round((earned / total) * 100) : 0
  const passed = percentage >= quiz.passThreshold

  const attempt = await db.quizAttempt.create({
    data: {
      quizId,
      userId: session.user.id,
      score: percentage,
      passed,
      answers: JSON.stringify(rawAnswers),
      completedAt: new Date(),
    },
  })

  // Update enrollment if passed and all lessons completed
  if (passed && quiz.course) {
    const courseId = quiz.course.id

    // Upsert enrollment (auto-enroll on quiz submission)
    await db.trainingEnrollment.upsert({
      where: { courseId_userId: { courseId, userId: session.user.id } },
      create: { courseId, userId: session.user.id, status: 'IN_PROGRESS' },
      update: {},
    })

    const [lessons, completedCount, allQuizzes, passedQuizzes] = await Promise.all([
      db.trainingLesson.findMany({ where: { courseId }, select: { id: true } }),
      db.lessonProgress.count({
        where: { userId: session.user.id, completed: true, lesson: { courseId } },
      }),
      db.trainingQuiz.findMany({ where: { courseId }, select: { id: true } }),
      // Single grouped query instead of N+1 findFirst calls
      db.quizAttempt.findMany({
        where: {
          userId: session.user.id,
          passed: true,
          quiz: { courseId },
        },
        select: { quizId: true },
        distinct: ['quizId'],
      }),
    ])

    const lessonsDone = lessons.length === 0 || completedCount >= lessons.length
    const passedQuizIds = new Set(passedQuizzes.map((a) => a.quizId))
    const allQuizzesPassed = allQuizzes.every((qz) => passedQuizIds.has(qz.id))

    if (lessonsDone && allQuizzesPassed) {
      await db.trainingEnrollment.update({
        where: { courseId_userId: { courseId, userId: session.user.id } },
        data: { status: 'COMPLETED', completedAt: new Date() },
      })
    }
  }

  await db.auditLog.create({
    data: {
      userId: session.user.id,
      action: passed ? 'QUIZ_PASSED' : 'QUIZ_ATTEMPTED',
      resourceType: 'TRAINING_QUIZ',
      resourceId: quizId,
      details: `Quiz ${passed ? 'passed' : 'attempted'}: ${percentage}% (threshold ${quiz.passThreshold}%)`,
    },
  })

  return NextResponse.json({
    id: attempt.id,
    score: attempt.score,
    passed: attempt.passed,
    passThreshold: quiz.passThreshold,
    earned,
    total,
    completedAt: attempt.completedAt,
  }, { status: 201 })
}
