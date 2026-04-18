import { NextRequest, NextResponse } from 'next/server'
import { getWorkrynSession } from '@/lib/workryn/auth'

import { db } from '@/lib/workryn/db'

export async function GET(req: NextRequest) {
  const session = await getWorkrynSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const tasks = await db.task.findMany({
    orderBy: { createdAt: 'desc' },
    include: {
      assignedTo: { select: { id: true, name: true, avatarColor: true } },
      createdBy: { select: { id: true, name: true } },
      department: { select: { id: true, name: true, color: true } },
      _count: { select: { comments: true } },
    },
  })
  return NextResponse.json(tasks)
}

export async function POST(req: NextRequest) {
  const session = await getWorkrynSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { title, description, priority, assignedToId, departmentId, dueDate, tags } = body

  if (!title?.trim()) return NextResponse.json({ error: 'Title required' }, { status: 400 })

  const task = await db.task.create({
    data: {
      title: title.trim(),
      description: description?.trim() || null,
      priority: priority || 'MEDIUM',
      status: 'TODO',
      tags: tags?.trim() || null,
      dueDate: dueDate ? new Date(dueDate) : null,
      createdById: session.user.id,
      assignedToId: assignedToId || null,
      departmentId: departmentId || null,
    },
    include: {
      assignedTo: { select: { id: true, name: true, avatarColor: true } },
      createdBy: { select: { id: true, name: true } },
      department: { select: { id: true, name: true, color: true } },
      _count: { select: { comments: true } },
    },
  })

  await db.auditLog.create({
    data: {
      userId: session.user.id,
      action: 'TASK_CREATED',
      resourceType: 'TASK',
      resourceId: task.id,
      details: `Created task: ${task.title}`,
    },
  })

  return NextResponse.json(task, { status: 201 })
}
