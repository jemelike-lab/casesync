import { getWorkrynSession } from '@/lib/workryn/auth'

import { db } from '@/lib/workryn/db'
import TicketsClient from '@/components/workryn/TicketsClient'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Help Desk' }

export default async function TicketsPage() {
  const session = await getWorkrynSession()

  const [tickets, users, departments] = await Promise.all([
    db.ticket.findMany({
      where: { archivedAt: null },
      orderBy: { createdAt: 'desc' },
      include: {
        createdBy: { select: { id: true, name: true, avatarColor: true } },
        assignedTo: { select: { id: true, name: true, avatarColor: true } },
        department: { select: { id: true, name: true, color: true } },
        _count: { select: { messages: true, internalNotes: true } },
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
  ])

  return (
    <TicketsClient
      initialTickets={JSON.parse(JSON.stringify(tickets))}
      users={JSON.parse(JSON.stringify(users))}
      departments={JSON.parse(JSON.stringify(departments))}
      currentUser={{ id: session!.user.id, role: session!.user.role }}
    />
  )
}
