import { NextRequest, NextResponse } from 'next/server'
import { getWorkrynSession } from '@/lib/workryn/auth'

import { db } from '@/lib/workryn/db'
import { sendEmail, renderEmailHtml } from '@/lib/workryn/email'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getWorkrynSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params

  const messages = await db.ticketMessage.findMany({
    where: { ticketId: id },
    orderBy: { createdAt: 'asc' },
    include: {
      author: { select: { id: true, name: true, avatarColor: true, role: true } },
    },
  })

  return NextResponse.json(messages)
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getWorkrynSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const body = await req.json()
  const { content, isFromAgent = true, sendEmail: shouldSendEmail = false } = body

  if (!content?.trim()) {
    return NextResponse.json({ error: 'Message content is required' }, { status: 400 })
  }

  const ticket = await db.ticket.findUnique({
    where: { id },
    select: { id: true, title: true, requesterEmail: true, requesterFirstName: true },
  })
  if (!ticket) return NextResponse.json({ error: 'Ticket not found' }, { status: 404 })

  let emailSent = false
  let emailError: string | undefined

  if (shouldSendEmail) {
    if (!ticket.requesterEmail) {
      emailError = 'No requester email address on file — message saved but not emailed.'
    } else {
      try {
        const html = renderEmailHtml({
          heading: `Re: ${ticket.title}`,
          body: content.trim(),
          ticketId: ticket.id,
        })
        const result = await sendEmail({
          to: ticket.requesterEmail,
          subject: `Re: ${ticket.title} [#${ticket.id.slice(-8).toUpperCase()}]`,
          text: content.trim(),
          html,
          replyTo: session.user.email || undefined,
        })
        emailSent = result.ok
        if (!result.ok) emailError = result.error
      } catch (err) {
        // Don't crash the reply just because email failed — log and surface.
        console.error('[ticket-reply] sendEmail threw:', err)
        emailError = err instanceof Error ? err.message : 'Email send failed'
      }
    }
  }

  const message = await db.ticketMessage.create({
    data: {
      content: content.trim(),
      isFromAgent,
      sentViaEmail: emailSent,
      ticketId: id,
      authorId: session.user.id,
    },
    include: {
      author: { select: { id: true, name: true, avatarColor: true, role: true } },
    },
  })

  // Touch ticket updatedAt
  await db.ticket.update({
    where: { id },
    data: { updatedAt: new Date() },
  })

  await db.auditLog.create({
    data: {
      userId: session.user.id,
      action: emailSent ? 'TICKET_REPLY_EMAIL' : 'TICKET_REPLY',
      resourceType: 'TICKET',
      resourceId: id,
      details: emailSent ? `Replied via email to ${ticket.requesterEmail}` : 'Posted reply in-app',
    },
  })

  return NextResponse.json({ ...message, emailError }, { status: 201 })
}
