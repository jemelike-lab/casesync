import { NextRequest, NextResponse } from 'next/server'
import { getWorkrynSession } from '@/lib/workryn/auth'

import { db } from '@/lib/workryn/db'
import { isAdminOrAbove, isManagerOrAbove, outranks } from '@/lib/workryn/permissions'

type ScoreInput = {
  criterionId?: string
  score?: number
  comment?: string | null
}

export async function GET(req: NextRequest) {
  const session = await getWorkrynSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const agentIdFilter = searchParams.get('agentId') ?? undefined
  const evaluatorIdFilter = searchParams.get('evaluatorId') ?? undefined
  const templateIdFilter = searchParams.get('templateId') ?? undefined

  const role = session.user.role
  const userId = session.user.id

  const where: Record<string, unknown> = {}
  if (templateIdFilter) where.templateId = templateIdFilter
  if (evaluatorIdFilter) where.evaluatorId = evaluatorIdFilter

  if (isAdminOrAbove(role)) {
    if (agentIdFilter) where.agentId = agentIdFilter
  } else if (isManagerOrAbove(role)) {
    // MANAGER sees:
    //  - evaluations they wrote
    //  - OR evaluations of STAFF in their department
    //  - OR their own received evaluations (non-private)
    const me = await db.user.findUnique({ where: { id: userId }, select: { departmentId: true } })

    const orClauses: Record<string, unknown>[] = [
      { evaluatorId: userId },
      { AND: [{ agentId: userId }, { isPrivate: false }] },
    ]
    if (me?.departmentId) {
      orClauses.push({
        agent: { departmentId: me.departmentId, role: 'STAFF' },
      })
    }
    where.OR = orClauses

    if (agentIdFilter) where.agentId = agentIdFilter
  } else {
    // STAFF: only their own non-private evaluations
    where.agentId = userId
    where.isPrivate = false
  }

  const evaluations = await db.evaluation.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    include: {
      template: { select: { id: true, name: true, description: true } },
      agent: { select: { id: true, name: true, email: true, role: true, avatarColor: true, jobTitle: true, departmentId: true } },
      evaluator: { select: { id: true, name: true, email: true, role: true, avatarColor: true, jobTitle: true } },
      scores: {
        include: {
          criterion: { select: { id: true, label: true, description: true, order: true, maxScore: true } },
        },
      },
    },
  })

  // Extra belt-and-suspenders filter for STAFF against private rows.
  const visible = isAdminOrAbove(role) || isManagerOrAbove(role)
    ? evaluations
    : evaluations.filter((e: any) => !(e.agentId === userId && e.isPrivate))

  return NextResponse.json(visible)
}

export async function POST(req: NextRequest) {
  const session = await getWorkrynSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!isManagerOrAbove(session.user.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await req.json()
  const templateId: string | undefined = body?.templateId
  const agentId: string | undefined = body?.agentId
  const overallRating: number | null = typeof body?.overallRating === 'number' ? body.overallRating : null
  const comments: string | null = body?.comments?.toString().trim() || null
  const isPrivate: boolean = !!body?.isPrivate
  const scoresInput: ScoreInput[] = Array.isArray(body?.scores) ? body.scores : []
  const documentUrl: string | null = typeof body?.documentUrl === 'string' && body.documentUrl.trim() ? body.documentUrl.trim() : null
  const documentName: string | null = typeof body?.documentName === 'string' && body.documentName.trim() ? body.documentName.trim() : null
  const documentSize: number | null = typeof body?.documentSize === 'number' && Number.isFinite(body.documentSize) ? Math.max(0, Math.floor(body.documentSize)) : null

  if (!templateId) return NextResponse.json({ error: 'Template is required' }, { status: 400 })
  if (!agentId) return NextResponse.json({ error: 'Agent is required' }, { status: 400 })
  if (agentId === session.user.id) {
    return NextResponse.json({ error: 'You cannot evaluate yourself' }, { status: 400 })
  }
  if (overallRating !== null && (overallRating < 1 || overallRating > 5)) {
    return NextResponse.json({ error: 'Overall rating must be between 1 and 5' }, { status: 400 })
  }

  const template = await db.evaluationTemplate.findUnique({
    where: { id: templateId },
    include: { criteria: true },
  })
  if (!template || !template.isActive) {
    return NextResponse.json({ error: 'Template not found or inactive' }, { status: 404 })
  }

  const agent = await db.user.findUnique({
    where: { id: agentId },
    select: { id: true, role: true, isActive: true },
  })
  if (!agent || !agent.isActive) {
    return NextResponse.json({ error: 'Agent not found' }, { status: 404 })
  }
  // The evaluator must outrank the agent.
  if (!outranks(session.user.role, agent.role)) {
    return NextResponse.json({ error: 'You can only evaluate users below your rank' }, { status: 403 })
  }

  // Validate scores: every criterion ID must belong to the template, and each score
  // must be within 1..maxScore.
  const criterionMap = new Map(template.criteria.map((c: any) => [c.id, c]))
  const cleanedScores: { criterionId: string; score: number; comment: string | null }[] = []
  for (const s of scoresInput) {
    if (!s.criterionId) continue
    const crit = criterionMap.get(s.criterionId) as any
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

  const evaluation = await db.$transaction(async (tx: any) => {
    return tx.evaluation.create({
      data: {
        templateId,
        agentId,
        evaluatorId: session.user.id,
        overallRating,
        comments,
        isPrivate,
        documentUrl,
        documentName,
        documentSize,
        scores: {
          create: cleanedScores,
        },
      },
      include: {
        template: { select: { id: true, name: true, description: true } },
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
      action: 'EVALUATION_CREATED',
      resourceType: 'EVALUATION',
      resourceId: evaluation.id,
      details: `Created evaluation for ${evaluation.agent.name || evaluation.agent.email || agentId} using "${template.name}"`,
    },
  })

  return NextResponse.json(evaluation, { status: 201 })
}
