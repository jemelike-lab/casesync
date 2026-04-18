import { NextRequest, NextResponse } from 'next/server'
import { getWorkrynSession } from '@/lib/workryn/auth'

import { db } from '@/lib/workryn/db'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getWorkrynSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params

  const notes = await db.ticketInternalNote.findMany({
    where: { ticketId: id },
    orderBy: { createdAt: 'asc' },
    include: {
      author: { select: { id: true, name: true, avatarColor: true, role: true } },
    },
  })

  return NextResponse.json(notes)
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getWorkrynSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const body = await req.json()
  const { content } = body

  if (!content?.trim()) {
    return NextResponse.json({ error: 'Note content is required' }, { status: 400 })
  }

  const ticket = await db.ticket.findUnique({ where: { id }, select: { id: true } })
  if (!ticket) return NextResponse.json({ error: 'Ticket not found' }, { status: 404 })

  const note = await db.ticketInternalNote.create({
    data: {
      content: content.trim(),
      ticketId: id,
      authorId: session.user.id,
    },
    include: {
      author: { select: { id: true, name: true, avatarColor: true, role: true } },
    },
  })

  await db.auditLog.create({
    data: {
      userId: session.user.id,
      action: 'TICKET_NOTE_ADDED',
      resourceType: 'TICKET',
      resourceId: id,
      details: 'Added internal note',
    },
  })

  return NextResponse.json(note, { status: 201 })
}
