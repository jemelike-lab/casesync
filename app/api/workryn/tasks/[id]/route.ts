import { NextRequest, NextResponse } from 'next/server'
import { getWorkrynSession } from '@/lib/workryn/auth'

import { db } from '@/lib/workryn/db'

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getWorkrynSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const body = await req.json()
  const { title, description, priority, status, assignedToId, departmentId, dueDate, tags } = body

  const data: Record<string, unknown> = {}
  if (title !== undefined) data.title = title.trim()
  if (description !== undefined) data.description = description?.trim() || null
  if (priority !== undefined) data.priority = priority
  if (status !== undefined) {
    data.status = status
    data.completedAt = status === 'DONE' ? new Date() : null
  }
  if (assignedToId !== undefined) data.assignedToId = assignedToId || null
  if (departmentId !== undefined) data.departmentId = departmentId || null
  if (dueDate !== undefined) data.dueDate = dueDate ? new Date(dueDate) : null
  if (tags !== undefined) data.tags = tags?.trim() || null

  const task = await db.task.update({
    where: { id },
    data,
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
      action: 'TASK_UPDATED',
      resourceType: 'TASK',
      resourceId: task.id,
      details: status ? `Moved task to ${status}` : `Updated task: ${task.title}`,
    },
  })

  return NextResponse.json(task)
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getWorkrynSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params

  await db.task.delete({ where: { id } })

  await db.auditLog.create({
    data: {
      userId: session.user.id,
      action: 'TASK_DELETED',
      resourceType: 'TASK',
      resourceId: id,
      details: 'Task deleted',
    },
  })

  return NextResponse.json({ ok: true })
}
