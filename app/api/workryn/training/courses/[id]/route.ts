import { NextRequest, NextResponse } from 'next/server'
import { getWorkrynSession } from '@/lib/workryn/auth'

import { db } from '@/lib/workryn/db'
import { isManagerOrAbove, isAdminOrAbove } from '@/lib/workryn/permissions'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getWorkrynSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params

  const course = await db.trainingCourse.findUnique({
    where: { id },
    include: {
      createdBy: { select: { id: true, name: true, avatarColor: true } },
      lessons: {
        orderBy: { order: 'asc' },
        include: {
          progress: {
            where: { userId: session.user.id },
            select: { id: true, completed: true, watchedSeconds: true },
          },
        },
      },
      quizzes: {
        orderBy: { createdAt: 'asc' },
        include: {
          _count: { select: { questions: true } },
        },
      },
      enrollments: {
        where: { userId: session.user.id },
        select: { id: true, status: true, enrolledAt: true, completedAt: true },
      },
      _count: { select: { lessons: true, quizzes: true, enrollments: true } },
    },
  })

  if (!course) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // STAFF cannot see unpublished courses
  if (!isManagerOrAbove(session.user.role) && !course.isPublished) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  return NextResponse.json(course)
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
  if (body.category !== undefined) data.category = body.category ? String(body.category).trim() : null
  if (body.thumbnail !== undefined) data.thumbnail = body.thumbnail ? String(body.thumbnail) : null
  if (body.isRequired !== undefined) data.isRequired = Boolean(body.isRequired)
  if (body.isPublished !== undefined) data.isPublished = Boolean(body.isPublished)
  if (body.passThreshold !== undefined) {
    let pt = Number(body.passThreshold)
    if (!Number.isFinite(pt)) pt = 70
    if (pt < 0) pt = 0
    if (pt > 100) pt = 100
    data.passThreshold = pt
  }

  const course = await db.trainingCourse.update({
    where: { id },
    data,
    include: {
      createdBy: { select: { id: true, name: true, avatarColor: true } },
      _count: { select: { lessons: true, quizzes: true, enrollments: true } },
    },
  })

  await db.auditLog.create({
    data: {
      userId: session.user.id,
      action: 'COURSE_UPDATED',
      resourceType: 'TRAINING_COURSE',
      resourceId: course.id,
      details: `Updated course: ${course.title}`,
    },
  })

  return NextResponse.json(course)
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getWorkrynSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!isAdminOrAbove(session.user.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { id } = await params
  const course = await db.trainingCourse.findUnique({ where: { id } })
  if (!course) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  await db.trainingCourse.delete({ where: { id } })

  await db.auditLog.create({
    data: {
      userId: session.user.id,
      action: 'COURSE_DELETED',
      resourceType: 'TRAINING_COURSE',
      resourceId: id,
      details: `Deleted course: ${course.title}`,
    },
  })

  return NextResponse.json({ ok: true })
}
