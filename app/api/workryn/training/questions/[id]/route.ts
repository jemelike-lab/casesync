import { NextRequest, NextResponse } from 'next/server'
import { getWorkrynSession } from '@/lib/workryn/auth'

import { db } from '@/lib/workryn/db'
import { isManagerOrAbove } from '@/lib/workryn/permissions'

const VALID_TYPES = ['MULTIPLE_CHOICE', 'MULTIPLE_CHOICE_MULTI', 'TRUE_FALSE']

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

  const existing = await db.quizQuestion.findUnique({ where: { id } })
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const data: Record<string, unknown> = {}
  if (body.text !== undefined) data.text = String(body.text).trim()
  if (body.type !== undefined) {
    data.type = VALID_TYPES.includes(body.type) ? body.type : 'MULTIPLE_CHOICE'
  }
  if (body.order !== undefined) data.order = Number(body.order)
  if (body.points !== undefined) {
    let points = Number(body.points)
    if (!Number.isFinite(points) || points < 0) points = 1
    data.points = points
  }

  const replaceOptions = Array.isArray(body.options)

  const result = await db.$transaction(async (tx: any) => {
    const updated = await tx.quizQuestion.update({ where: { id }, data })

    if (replaceOptions) {
      await tx.quizOption.deleteMany({ where: { questionId: id } })
      if (body.options.length) {
        await tx.quizOption.createMany({
          data: body.options.map((o: { text?: string; isCorrect?: boolean; order?: number }, i: number) => ({
            text: String(o?.text ?? '').trim(),
            isCorrect: Boolean(o?.isCorrect),
            order: Number.isFinite(o?.order) ? Number(o.order) : i,
            questionId: id,
          })),
        })
      }
    }

    return tx.quizQuestion.findUnique({
      where: { id: updated.id },
      include: { options: { orderBy: { order: 'asc' } } },
    })
  })

  await db.auditLog.create({
    data: {
      userId: session.user.id,
      action: 'QUIZ_QUESTION_UPDATED',
      resourceType: 'QUIZ_QUESTION',
      resourceId: id,
      details: `Updated quiz question`,
    },
  })

  return NextResponse.json(result)
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
  const existing = await db.quizQuestion.findUnique({ where: { id }, select: { id: true } })
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  await db.quizQuestion.delete({ where: { id } })

  await db.auditLog.create({
    data: {
      userId: session.user.id,
      action: 'QUIZ_QUESTION_DELETED',
      resourceType: 'QUIZ_QUESTION',
      resourceId: id,
      details: `Deleted quiz question`,
    },
  })

  return NextResponse.json({ ok: true })
}
