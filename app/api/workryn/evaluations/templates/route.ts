import { NextRequest, NextResponse } from 'next/server'
import { getWorkrynSession } from '@/lib/workryn/auth'

import { db } from '@/lib/workryn/db'
import { isAdminOrAbove, isManagerOrAbove } from '@/lib/workryn/permissions'

type CriterionInput = {
  label?: string
  description?: string | null
  order?: number
  maxScore?: number
}

export async function GET() {
  const session = await getWorkrynSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  // Only evaluators (MANAGER and up) need to see templates.
  if (!isManagerOrAbove(session.user.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // Seed a default template the first time the UI loads so the list is never empty.
  const count = await db.evaluationTemplate.count()
  if (count === 0) {
    await db.evaluationTemplate.create({
      data: {
        name: 'Quarterly Performance Review',
        description: 'Standard quarterly review covering core performance areas.',
        isActive: true,
        criteria: {
          create: [
            { label: 'Communication', description: 'Clarity, listening, and responsiveness with the team and clients.', order: 0, maxScore: 5 },
            { label: 'Teamwork', description: 'Collaboration, helpfulness, and contribution to team success.', order: 1, maxScore: 5 },
            { label: 'Quality of Work', description: 'Accuracy, thoroughness, and attention to detail.', order: 2, maxScore: 5 },
            { label: 'Initiative', description: 'Proactive problem solving and ownership of outcomes.', order: 3, maxScore: 5 },
            { label: 'Punctuality', description: 'Reliability with schedules, deadlines, and attendance.', order: 4, maxScore: 5 },
          ],
        },
      },
    })
  }

  const templates = await db.evaluationTemplate.findMany({
    orderBy: [{ isActive: 'desc' }, { createdAt: 'desc' }],
    include: {
      criteria: { orderBy: { order: 'asc' } },
      _count: { select: { evaluations: true } },
    },
  })

  return NextResponse.json(templates)
}

export async function POST(req: NextRequest) {
  const session = await getWorkrynSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!isAdminOrAbove(session.user.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await req.json()
  const name: string | undefined = body?.name
  const description: string | null = body?.description ?? null
  const criteria: CriterionInput[] = Array.isArray(body?.criteria) ? body.criteria : []
  const documentUrl: string | null = typeof body?.documentUrl === 'string' && body.documentUrl.trim() ? body.documentUrl.trim() : null
  const documentName: string | null = typeof body?.documentName === 'string' && body.documentName.trim() ? body.documentName.trim() : null
  const documentSize: number | null = typeof body?.documentSize === 'number' && Number.isFinite(body.documentSize) ? Math.max(0, Math.floor(body.documentSize)) : null

  if (!name?.trim()) {
    return NextResponse.json({ error: 'Name is required' }, { status: 400 })
  }
  if (criteria.length === 0) {
    return NextResponse.json({ error: 'At least one criterion is required' }, { status: 400 })
  }

  const normalized = criteria
    .map((c, i) => ({
      label: (c.label ?? '').trim(),
      description: c.description?.toString().trim() || null,
      order: Number.isFinite(c.order) ? Number(c.order) : i,
      maxScore: Number.isFinite(c.maxScore) ? Math.max(1, Math.min(10, Number(c.maxScore))) : 5,
    }))
    .filter((c) => c.label.length > 0)

  if (normalized.length === 0) {
    return NextResponse.json({ error: 'At least one criterion with a label is required' }, { status: 400 })
  }

  const template = await db.$transaction(async (tx: any) => {
    return tx.evaluationTemplate.create({
      data: {
        name: name.trim(),
        description: description?.toString().trim() || null,
        isActive: true,
        documentUrl,
        documentName,
        documentSize,
        criteria: { create: normalized },
      },
      include: { criteria: { orderBy: { order: 'asc' } } },
    })
  })

  await db.auditLog.create({
    data: {
      userId: session.user.id,
      action: 'EVALUATION_TEMPLATE_CREATED',
      resourceType: 'EVALUATION_TEMPLATE',
      resourceId: template.id,
      details: `Created evaluation template: ${template.name}`,
    },
  })

  return NextResponse.json(template, { status: 201 })
}
