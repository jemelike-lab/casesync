import { NextRequest, NextResponse } from 'next/server'
import { getWorkrynSession } from '@/lib/workryn/auth'

import { db } from '@/lib/workryn/db'
import { isManagerOrAbove } from '@/lib/workryn/permissions'

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
  if (body.content !== undefined) data.content = String(body.content ?? '')
  if (body.order !== undefined) data.order = Number(body.order)
  if (body.videoUrl !== undefined) data.videoUrl = body.videoUrl ? String(body.videoUrl) : null
  if (body.videoFileName !== undefined) data.videoFileName = body.videoFileName ? String(body.videoFileName) : null
  if (body.durationSeconds !== undefined) {
    data.durationSeconds = Number.isFinite(body.durationSeconds) ? Number(body.durationSeconds) : null
  }

  const lesson = await db.trainingLesson.update({ where: { id }, data })

  await db.auditLog.create({
    data: {
      userId: session.user.id,
      action: 'LESSON_UPDATED',
      resourceType: 'TRAINING_LESSON',
      resourceId: lesson.id,
      details: `Updated lesson: ${lesson.title}`,
    },
  })

  return NextResponse.json(lesson)
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
  const existing = await db.trainingLesson.findUnique({ where: { id }, select: { id: true, title: true } })
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  await db.trainingLesson.delete({ where: { id } })

  await db.auditLog.create({
    data: {
      userId: session.user.id,
      action: 'LESSON_DELETED',
      resourceType: 'TRAINING_LESSON',
      resourceId: id,
      details: `Deleted lesson: ${existing.title}`,
    },
  })

  return NextResponse.json({ ok: true })
}
