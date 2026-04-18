import { NextRequest, NextResponse } from 'next/server'
import { getWorkrynSession } from '@/lib/workryn/auth'

import { db } from '@/lib/workryn/db'
import { isAdminOrAbove, isManagerOrAbove } from '@/lib/workryn/permissions'

type ScoreInput = {
  criterionId?: string
  score?: number
  comment?: string | null
}

async function loadEvaluationDetail(id: string) {
  return db.evaluation.findUnique({
    where: { id },
    include: {
      template: {
        include: { criteria: { orderBy: { order: 'asc' } } },
      },
      agent: { select: { id: true, name: true, email: true, role: true, avatarColor: true, jobTitle: true, departmentId: true } },
      evaluator: { select: { id: true, name: true, email: true, role: true, avatarColor: true, jobTitle: true } },
      scores: {
        include: {
          criterion: { select: { id: true, label: true, description: true, order: true, maxScore: true } },
        },
      },
    },
  })
}

type LoadedEvaluation = NonNullable<Awaited<ReturnType<typeof loadEvaluationDetail>>>

async function canUserView(
  evaluation: LoadedEvaluation,
  userId: string,
  role: string,
) {
  if (isAdminOrAbove(role)) return true
  if (evaluation.evaluatorId === userId) return true
  if (evaluation.agentId === userId) {
    // Agent can see their own unless marked private.
    return !evaluation.isPrivate
  }
  if (isManagerOrAbove(role)) {
    // Manager can see STAFF evaluations within their department.
    const me = await db.user.findUnique({ where: { id: userId }, select: { departmentId: true } })
    if (me?.departmentId && evaluation.agent.departmentId === me.departmentId && evaluation.agent.role === 'STAFF') {
      return true
    }
  }
  return false
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getWorkrynSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const evaluation = await loadEvaluationDetail(id)
  if (!evaluation) return NextResponse.json({ error: 'Evaluation not found' }, { status: 404 })

  const allowed = await canUserView(evaluation, session.user.id, session.user.role)
  if (!allowed) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  return NextResponse.json(evaluation)
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getWorkrynSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const existing = await db.evaluation.findUnique({
    where: { id },
    include: { template: { include: { criteria: true } } },
  })
  if (!existing) return NextResponse.json({ error: 'Evaluation not found' }, { status: 404 })

  const isCreator = existing.evaluatorId === session.user.id
  const isAdmin = isAdminOrAbove(session.user.role)
  if (!isCreator && !isAdmin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await req.json()
  const overallRating: number | null | undefined =
    body?.overallRating === null ? null : (typeof body?.overallRating === 'number' ? body.overallRating : undefined)
  const comments: string | null | undefined =
    body?.comments === undefined ? undefined : (body?.comments?.toString().trim() || null)
  const isPrivate: boolean | undefined = typeof body?.isPrivate === 'boolean' ? body.isPrivate : undefined
  const scoresInput: ScoreInput[] | undefined = Array.isArray(body?.scores) ? body.scores : undefined

  // Document: explicit null = remove; undefined = leave alone
  const docTouched =
    body?.documentUrl !== undefined || body?.documentName !== undefined || body?.documentSize !== undefined
  let documentUrl: string | null | undefined = undefined
  let documentName: string | null | undefined = undefined
  let documentSize: number | null | undefined = undefined
  if (docTouched) {
    if (body.documentUrl === null) {
      documentUrl = null
      documentName = null
      documentSize = null
    } else {
      if (typeof body.documentUrl === 'string') documentUrl = body.documentUrl.trim() || null
      if (typeof body.documentName === 'string') documentName = body.documentName.trim() || null
      if (typeof body.documentSize === 'number' && Number.isFinite(body.documentSize)) {
        documentSize = Math.max(0, Math.floor(body.documentSize))
      } else if (body.documentSize === null) {
        documentSize = null
      }
    }
  }

  if (overallRating !== undefined && overallRating !== null && (overallRating < 1 || overallRating > 5)) {
    return NextResponse.json({ error: 'Overall rating must be between 1 and 5' }, { status: 400 })
  }

  let cleanedScores: { criterionId: string; score: number; comment: string | null }[] | undefined
  if (scoresInput) {
    const criterionMap = new Map(existing.template.criteria.map((c) => [c.id, c]))
    cleanedScores = []
    for (const s of scoresInput) {
      if (!s.criterionId) continue
      const crit = criterionMap.get(s.criterionId)
      if (!crit) {
        return NextResponse.json({ error: `Unknown criterion: ${s.criterionId}` }, { status: 400 })
      }
      const scoreNum = Number(s.score)
      if (!Number.isFinite(scoreNum) || scoreNum < 1 || scoreNum > crit.maxScore) {
        return NextResponse.json(
          { error: `Score for "${crit.label}" must be between 1 and ${crit.maxScore}` },
          { status: 400 },
        )
      }
      cleanedScores.push({
        criterionId: crit.id,
        score: Math.round(scoreNum),
        comment: s.comment?.toString().trim() || null,
      })
    }
  }

  const updated = await db.$transaction(async (tx) => {
    const data: Record<string, unknown> = {}
    if (overallRating !== undefined) data.overallRating = overallRating
    if (comments !== undefined) data.comments = comments
    if (isPrivate !== undefined) data.isPrivate = isPrivate
    if (documentUrl !== undefined) data.documentUrl = documentUrl
    if (documentName !== undefined) data.documentName = documentName
    if (documentSize !== undefined) data.documentSize = documentSize

    if (cleanedScores) {
      await tx.evaluationScore.deleteMany({ where: { evaluationId: id } })
      if (cleanedScores.length > 0) {
        await tx.evaluationScore.createMany({
          data: cleanedScores.map((s) => ({ ...s, evaluationId: id })),
        })
      }
    }

    return tx.evaluation.update({
      where: { id },
      data,
      include: {
        template: {
          include: { criteria: { orderBy: { order: 'asc' } } },
        },
        agent: { select: { id: true, name: true, email: true, role: true, avatarColor: true, jobTitle: true, departmentId: true } },
        evaluator: { select: { id: true, name: true, email: true, role: true, avatarColor: true, jobTitle: true } },
        scores: {
          include: {
            criterion: { select: { id: true, label: true, description: true, order: true, maxScore: true } },
          },
        },
      },
    })
  })

  await db.auditLog.create({
    data: {
      userId: session.user.id,
      action: 'EVALUATION_UPDATED',
      resourceType: 'EVALUATION',
      resourceId: id,
      details: `Updated evaluation ${id}`,
    },
  })

  return NextResponse.json(updated)
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getWorkrynSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!isAdminOrAbove(session.user.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { id } = await params
  const existing = await db.evaluation.findUnique({ where: { id } })
  if (!existing) return NextResponse.json({ error: 'Evaluation not found' }, { status: 404 })

  await db.$transaction(async (tx) => {
    await tx.evaluationScore.deleteMany({ where: { evaluationId: id } })
    await tx.evaluation.delete({ where: { id } })
  })

  await db.auditLog.create({
    data: {
      userId: session.user.id,
      action: 'EVALUATION_DELETED',
      resourceType: 'EVALUATION',
      resourceId: id,
      details: `Deleted evaluation ${id}`,
    },
  })

  return NextResponse.json({ ok: true })
}
