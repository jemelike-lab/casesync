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

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getWorkrynSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!isManagerOrAbove(session.user.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { id } = await params
  const template = await db.evaluationTemplate.findUnique({
    where: { id },
    include: {
      criteria: { orderBy: { order: 'asc' } },
      _count: { select: { evaluations: true } },
    },
  })
  if (!template) return NextResponse.json({ error: 'Template not found' }, { status: 404 })
  return NextResponse.json(template)
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getWorkrynSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!isAdminOrAbove(session.user.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { id } = await params
  const existing = await db.evaluationTemplate.findUnique({ where: { id } })
  if (!existing) return NextResponse.json({ error: 'Template not found' }, { status: 404 })

  const body = await req.json()
  const name: string | undefined = body?.name
  const description: string | null | undefined = body?.description
  const isActive: boolean | undefined = body?.isActive
  const criteria: CriterionInput[] | undefined = Array.isArray(body?.criteria) ? body.criteria : undefined

  // Document fields: explicit null = remove all three; undefined = leave alone
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

  // Pre-validate criteria outside the transaction so we can return a clean 400.
  let normalizedCriteria: { label: string; description: string | null; order: number; maxScore: number }[] | null = null
  if (criteria !== undefined) {
    normalizedCriteria = criteria
      .map((c, i) => ({
        label: (c.label ?? '').trim(),
        description: c.description?.toString().trim() || null,
        order: Number.isFinite(c.order) ? Number(c.order) : i,
        maxScore: Number.isFinite(c.maxScore) ? Math.max(1, Math.min(10, Number(c.maxScore))) : 5,
      }))
      .filter((c) => c.label.length > 0)

    if (normalizedCriteria.length === 0) {
      return NextResponse.json({ error: 'At least one criterion with a label is required' }, { status: 400 })
    }
  }

  const updated = await db.$transaction(async (tx: any) => {
    const data: Record<string, unknown> = {}
    if (typeof name === 'string') data.name = name.trim()
    if (description !== undefined) data.description = description?.toString().trim() || null
    if (typeof isActive === 'boolean') data.isActive = isActive
    if (documentUrl !== undefined) data.documentUrl = documentUrl
    if (documentName !== undefined) data.documentName = documentName
    if (documentSize !== undefined) data.documentSize = documentSize

    if (normalizedCriteria) {
      // Replace criteria. Scores reference criteria — we only allow full replacement
      // when the template has no evaluations yet, otherwise we keep existing criteria
      // to preserve referential integrity.
      const existingEvalCount = await tx.evaluation.count({ where: { templateId: id } })
      if (existingEvalCount === 0) {
        await tx.evaluationCriterion.deleteMany({ where: { templateId: id } })
        await tx.evaluationCriterion.createMany({
          data: normalizedCriteria.map((c) => ({ ...c, templateId: id })),
        })
      }
    }

    return tx.evaluationTemplate.update({
      where: { id },
      data,
      include: { criteria: { orderBy: { order: 'asc' } } },
    })
  })

  await db.auditLog.create({
    data: {
      userId: session.user.id,
      action: 'EVALUATION_TEMPLATE_UPDATED',
      resourceType: 'EVALUATION_TEMPLATE',
      resourceId: id,
      details: `Updated evaluation template: ${existing.name}`,
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
  const existing = await db.evaluationTemplate.findUnique({ where: { id } })
  if (!existing) return NextResponse.json({ error: 'Template not found' }, { status: 404 })

  await db.evaluationTemplate.update({
    where: { id },
    data: { isActive: false },
  })

  await db.auditLog.create({
    data: {
      userId: session.user.id,
      action: 'EVALUATION_TEMPLATE_ARCHIVED',
      resourceType: 'EVALUATION_TEMPLATE',
      resourceId: id,
      details: `Archived evaluation template: ${existing.name}`,
    },
  })

  return NextResponse.json({ ok: true })
}
