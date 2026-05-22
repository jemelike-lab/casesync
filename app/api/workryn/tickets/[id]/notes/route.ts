import { NextRequest, NextResponse } from 'next/server'
import { getWorkrynSession } from '@/lib/workryn/auth'
import { isManagerOrAbove } from '@/lib/workryn/permissions'
import { db } from '@/lib/workryn/db'

/**
 * Ticket Internal Notes
 *
 * STAFF / SUPPORT_PLANNER must NOT read or write internal notes.
 * Notes are private manager+ commentary on a ticket.
 *
 * Fix 2026-05-22: previously any authenticated Workryn user could read
 * and create internal notes on any ticket. See AUDIT_2026-05-22.md §7C
 * finding P0-2. STAFF could see what managers wrote about their own
 * tickets — privacy and HR-risk issue.
 */

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getWorkrynSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!isManagerOrAbove(session.user.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

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
  if (!isManagerOrAbove(session.user.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { id } = await params

  let body: { content?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const content = typeof body.content === 'string' ? body.content.trim() : ''
  if (!content) {
    return NextResponse.json({ error: 'Note content is required' }, { status: 400 })
  }
  if (content.length > 5000) {
    return NextResponse.json({ error: 'Note content too long (max 5000 chars)' }, { status: 400 })
  }

  const ticket = await db.ticket.findUnique({ where: { id }, select: { id: true } })
  if (!ticket) return NextResponse.json({ error: 'Ticket not found' }, { status: 404 })

  const note = await db.ticketInternalNote.create({
    data: {
      content: content.slice(0, 5000),
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
