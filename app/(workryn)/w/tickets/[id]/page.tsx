import { getWorkrynSession } from '@/lib/workryn/auth'
import { notFound } from 'next/navigation'

import { db } from '@/lib/workryn/db'
import dynamic from 'next/dynamic'

const TicketDetailClient = dynamic(
  () => import('@/components/workryn/TicketDetailClient'),
  { loading: () => <div style={{ padding: 32, color: '#94a3b8', fontSize: 14 }}>Loading ticket...</div> }
)
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Ticket Detail' }

export default async function TicketDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const session = await getWorkrynSession()

  const [ticket, users, departments, auditLogs] = await Promise.all([
    db.ticket.findUnique({
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
    }),
    db.user.findMany({
      where: { isActive: true },
      select: { id: true, name: true, avatarColor: true, role: true },
      orderBy: { name: 'asc' },
    }),
    db.department.findMany({
      select: { id: true, name: true, color: true },
      orderBy: { name: 'asc' },
    }),
    db.auditLog.findMany({
      where: { resourceType: 'TICKET', resourceId: id },
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: {
        user: { select: { id: true, name: true, avatarColor: true } },
      },
    }),
  ])

  if (!ticket) notFound()

  return (
    <TicketDetailClient
      initialTicket={JSON.parse(JSON.stringify(ticket))}
      users={JSON.parse(JSON.stringify(users))}
      departments={JSON.parse(JSON.stringify(departments))}
      initialActivity={JSON.parse(JSON.stringify(auditLogs))}
      currentUser={{
        id: session!.user.id,
        role: session!.user.role,
        name: session!.user.name || null,
        avatarColor: session!.user.avatarColor || '#6366f1',
      }}
    />
  )
}
