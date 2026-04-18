import { NextRequest, NextResponse } from 'next/server'
import { getWorkrynSession } from '@/lib/workryn/auth'

import { db } from '@/lib/workryn/db'
import { isAdminOrAbove } from '@/lib/workryn/permissions'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getWorkrynSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params

  const ticket = await db.ticket.findUnique({
    where: { id },
    include: {
      createdBy: { select: { id: true, name: true, email: true, avatarColor: true } },
      assignedTo: { select: { id: true, name: true, email: true, avatarColor: true } },
      department: { select: { id: true, name: true, color: true } },
      messages: {
        orderBy: { createdAt: 'asc' },
        include: {
          author: { select: { id: true, name: true, avatarColor: true, role: true } },
        },
      },
      internalNotes: {
        orderBy: { createdAt: 'asc' },
        include: {
          author: { select: { id: true, name: true, avatarColor: true, role: true } },
        },
      },
    },
  })

  if (!ticket) return NextResponse.json({ error: 'Ticket not found' }, { status: 404 })

  return NextResponse.json(ticket)
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getWorkrynSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const body = await req.json()
  const {
    title,
    description,
    priority,
    status,
    category,
    assignedToId,
    departmentId,
    tags,
    requesterFirstName,
    requesterLastName,
    requesterEmail,
    requesterPhone,
  } = body

  const existing = await db.ticket.findUnique({ where: { id } })
  if (!existing) return NextResponse.json({ error: 'Ticket not found' }, { status: 404 })

  const data: Record<string, unknown> = {}
  const changes: string[] = []

  if (title !== undefined) {
    data.title = title.trim()
    changes.push(`title updated`)
  }
  if (description !== undefined) {
    data.description = description?.trim() || null
  }
  if (priority !== undefined && priority !== existing.priority) {
    data.priority = priority
    changes.push(`priority: ${existing.priority} → ${priority}`)
  }
  if (category !== undefined) {
    data.category = category || null
  }
  if (tags !== undefined) {
    data.tags = tags?.trim() || null
  }
  if (requesterFirstName !== undefined) data.requesterFirstName = requesterFirstName?.trim() || null
  if (requesterLastName !== undefined) data.requesterLastName = requesterLastName?.trim() || null
  if (requesterEmail !== undefined) data.requesterEmail = requesterEmail?.trim() || null
  if (requesterPhone !== undefined) data.requesterPhone = requesterPhone?.trim() || null

  if (assignedToId !== undefined) {
    const newAssignee = assignedToId || null
    if (newAssignee !== existing.assignedToId) {
      data.assignedToId = newAssignee
      if (newAssignee) {
        const assignee = await db.user.findUnique({ where: { id: newAssignee }, select: { name: true } })
        changes.push(`assigned to ${assignee?.name || 'user'}`)
      } else {
        changes.push(`unassigned`)
      }
    }
  }

  if (departmentId !== undefined) {
    data.departmentId = departmentId || null
  }

  let addSystemClosedMessage = false

  if (status !== undefined && status !== existing.status) {
    data.status = status
    changes.push(`status: ${existing.status} → ${status}`)

    if (status === 'RESOLVED') {
      data.resolvedAt = new Date()
    } else if (status === 'CLOSED') {
      data.resolvedAt = existing.resolvedAt || new Date()
      data.archivedAt = new Date()
      addSystemClosedMessage = true
    } else if (existing.status === 'RESOLVED' || existing.status === 'CLOSED') {
      // Reopening a resolved/closed ticket
      data.resolvedAt = null
      data.archivedAt = null
    }
  }

  const ticket = await db.ticket.update({
    where: { id },
    data,
    include: {
      createdBy: { select: { id: true, name: true, email: true, avatarColor: true } },
      assignedTo: { select: { id: true, name: true, email: true, avatarColor: true } },
      department: { select: { id: true, name: true, color: true } },
      _count: { select: { messages: true, internalNotes: true } },
    },
  })

  if (addSystemClosedMessage) {
    await db.ticketMessage.create({
      data: {
        content: `Ticket closed by ${session.user.name || session.user.email || 'an agent'}.`,
        ticketId: id,
        authorId: session.user.id,
        isFromAgent: true,
        sentViaEmail: false,
      },
    })
  }

  await db.auditLog.create({
    data: {
      userId: session.user.id,
      action: 'TICKET_UPDATED',
      resourceType: 'TICKET',
      resourceId: ticket.id,
      details: changes.length > 0 ? changes.join('; ') : `Updated ticket: ${ticket.title}`,
    },
  })

  return NextResponse.json(ticket)
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getWorkrynSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  if (!isAdminOrAbove(session.user.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { id } = await params

  const existing = await db.ticket.findUnique({ where: { id } })
  if (!existing) return NextResponse.json({ error: 'Ticket not found' }, { status: 404 })

  // Soft archive (not hard delete)
  const ticket = await db.ticket.update({
    where: { id },
    data: { archivedAt: new Date(), status: 'CLOSED' },
  })

  await db.auditLog.create({
    data: {
      userId: session.user.id,
      action: 'TICKET_ARCHIVED',
      resourceType: 'TICKET',
      resourceId: ticket.id,
      details: `Archived ticket: ${ticket.title}`,
    },
  })

  return NextResponse.json({ ok: true, archived: true })
}
