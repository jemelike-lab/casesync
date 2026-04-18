import { getWorkrynSession } from '@/lib/workryn/auth'

import { db } from '@/lib/workryn/db'
import ScheduleClient from '@/components/workryn/ScheduleClient'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Schedule' }

export default async function SchedulePage() {
  const session = await getWorkrynSession()

  // Get shifts for the next 4 weeks
  const from = new Date()
  from.setDate(from.getDate() - from.getDay()) // start of this week
  from.setHours(0, 0, 0, 0)
  const to = new Date(from)
  to.setDate(to.getDate() + 28)

  const [shifts, users, departments] = await Promise.all([
    db.shift.findMany({
      where: { startTime: { gte: from, lte: to } },
      orderBy: { startTime: 'asc' },
      include: {
        user: { select: { id: true, name: true, avatarColor: true, jobTitle: true } },
      },
    }),
    db.user.findMany({
      where: { isActive: true },
      select: { id: true, name: true, avatarColor: true, role: true, jobTitle: true },
      orderBy: { name: 'asc' },
    }),
    db.department.findMany({ select: { id: true, name: true, color: true }, orderBy: { name: 'asc' } }),
  ])

  return (
    <ScheduleClient
      initialShifts={JSON.parse(JSON.stringify(shifts))}
      users={JSON.parse(JSON.stringify(users))}
      departments={JSON.parse(JSON.stringify(departments))}
      currentUser={{ id: session!.user.id, role: session!.user.role }}
      weekStart={from.toISOString()}
    />
  )
}
