import { NextRequest, NextResponse } from 'next/server'
import { getWorkrynSession } from '@/lib/workryn/auth'

import { db } from '@/lib/workryn/db'
import { isManagerOrAbove } from '@/lib/workryn/permissions'

export async function GET(req: NextRequest) {
  const session = await getWorkrynSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const publishedParam = searchParams.get('published')
  const category = searchParams.get('category')
  const search = searchParams.get('search')?.trim() || ''

  const role = session.user.role
  const where: Record<string, unknown> = {}

  // STAFF only sees published courses, regardless of the query param.
  if (!isManagerOrAbove(role)) {
    where.isPublished = true
  } else if (publishedParam === 'true') {
    where.isPublished = true
  }

  if (category) where.category = category

  if (search) {
    where.OR = [
      { title: { contains: search } },
      { description: { contains: search } },
      { category: { contains: search } },
    ]
  }

  const courses = await db.trainingCourse.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    include: {
      createdBy: { select: { id: true, name: true, avatarColor: true } },
      _count: { select: { lessons: true, quizzes: true, enrollments: true } },
    },
  })

  return NextResponse.json(courses)
}

export async function POST(req: NextRequest) {
  const session = await getWorkrynSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!isManagerOrAbove(session.user.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await req.json().catch(() => ({}))
  const title = (body.title ?? '').toString().trim()
  if (!title) return NextResponse.json({ error: 'Title is required' }, { status: 400 })

  const description = body.description ? String(body.description).trim() : null
  const category = body.category ? String(body.category).trim() : null
  const isRequired = Boolean(body.isRequired)
  const isPublished = Boolean(body.isPublished)
  let passThreshold = Number.isFinite(body.passThreshold) ? Number(body.passThreshold) : 70
  if (passThreshold < 0) passThreshold = 0
  if (passThreshold > 100) passThreshold = 100

  const course = await db.trainingCourse.create({
    data: {
      title,
      description,
      category,
      isRequired,
      isPublished,
      passThreshold,
      createdById: session.user.id,
    },
    include: {
      createdBy: { select: { id: true, name: true, avatarColor: true } },
      _count: { select: { lessons: true, quizzes: true, enrollments: true } },
    },
  })

  await db.auditLog.create({
    data: {
      userId: session.user.id,
      action: 'COURSE_CREATED',
      resourceType: 'TRAINING_COURSE',
      resourceId: course.id,
      details: `Created course: ${course.title}`,
    },
  })

  return NextResponse.json(course, { status: 201 })
}
