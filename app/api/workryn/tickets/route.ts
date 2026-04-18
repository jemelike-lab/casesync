import { NextRequest, NextResponse } from 'next/server'
import { getWorkrynSession } from '@/lib/workryn/auth'

import { db } from '@/lib/workryn/db'

export async function GET(req: NextRequest) {
  const session = await getWorkrynSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const status = searchParams.get('status')
  const priority = searchParams.get('priority')
  const assignedTo = searchParams.get('assignedTo')
  const departmentId = searchParams.get('departmentId')
  const includeArchived = searchParams.get('archived') === 'true'
  const search = searchParams.get('q')?.trim() || ''

  const where: Record<string, unknown> = {}

  if (status) where.status = status
  if (priority) where.priority = priority
  if (assignedTo) where.assignedToId = assignedTo === 'unassigned' ? null : assignedTo
  if (departmentId) where.departmentId = departmentId

  if (!includeArchived) {
    where.archivedAt = null
  }

  if (search) {
    where.OR = [
      { title: { contains: search } },
      { description: { contains: search } },
      { requesterEmail: { contains: search } },
      { requesterFirstName: { contains: search } },
      { requesterLastName: { contains: search } },
    ]
  }

  const tickets = await db.ticket.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    include: {
      createdBy: { select: { id: true, name: true, avatarColor: true } },
      assignedTo: { select: { id: true, name: true, avatarColor: true } },
      department: { select: { id: true, name: true, color: true } },
      _count: { select: { messages: true, internalNotes: true } },
    },
  })
  return NextResponse.json(tickets)
}

export async function POST(req: NextRequest) {
  const session = await getWorkrynSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const {
    title,
    description,
    priority,
    category,
    departmentId,
    assignedToId,
    tags,
    requesterFirstName,
    requesterLastName,
    requesterEmail,
    requesterPhone,
  } = body

  if (!title?.trim()) return NextResponse.json({ error: 'Title is required' }, { status: 400 })
  if (!description?.trim()) return NextResponse.json({ error: 'Description is required' }, { status: 400 })
  if (!requesterFirstName?.trim()) return NextResponse.json({ error: 'Requester first name is required' }, { status: 400 })
  if (!requesterLastName?.trim()) return NextResponse.json({ error: 'Requester last name is required' }, { status: 400 })
  if (!requesterEmail?.trim()) return NextResponse.json({ error: 'Requester email is required' }, { status: 400 })
  if (!requesterPhone?.trim()) return NextResponse.json({ error: 'Requester phone is required' }, { status: 400 })

  const ticket = await db.ticket.create({
    data: {
      title: title.trim(),
      description: description.trim(),
      priority: priority || 'MEDIUM',
      category: category || null,
      status: 'OPEN',
      tags: tags?.trim() || null,
      requesterFirstName: requesterFirstName.trim(),
      requesterLastName: requesterLastName.trim(),
      requesterEmail: requesterEmail.trim(),
      requesterPhone: requesterPhone.trim(),
      createdById: session.user.id,
      assignedToId: assignedToId || null,
      departmentId: departmentId || null,
      messages: {
        create: {
          content: description.trim(),
          isFromAgent: false,
          sentViaEmail: false,
          // authorId is null because this is the requester (external)
          authorId: null,
        },
      },
    },
    include: {
      createdBy: { select: { id: true, name: true, avatarColor: true } },
      assignedTo: { select: { id: true, name: true, avatarColor: true } },
      department: { select: { id: true, name: true, color: true } },
      _count: { select: { messages: true, internalNotes: true } },
    },
  })

  await db.auditLog.create({
    data: {
      userId: session.user.id,
      action: 'TICKET_CREATED',
      resourceType: 'TICKET',
      resourceId: ticket.id,
      details: `Created ticket: ${ticket.title}`,
    },
  })

  return NextResponse.json(ticket, { status: 201 })
}
