import { getWorkrynSession } from '@/lib/workryn/auth'
import { redirect } from 'next/navigation'

import { db } from '@/lib/workryn/db'
import TimeClockClient from '@/components/workryn/TimeClockClient'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Time Clock' }

function getWeekStart(date: Date): Date {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  const day = d.getDay()
  const diff = day === 0 ? -6 : 1 - day
  d.setDate(d.getDate() + diff)
  return d
}

export default async function TimeClockPage() {
  const session = await getWorkrynSession()
  if (!session) redirect('/login')

  const userId = session.user.id
  const now = new Date()
  const weekStart = getWeekStart(now)
  const weekEnd = new Date(weekStart)
  weekEnd.setDate(weekEnd.getDate() + 7)

  const [currentEntry, weekEntries] = await Promise.all([
    db.timeEntry.findFirst({
      where: { userId, status: 'ACTIVE' },
      include: { breaks: { orderBy: { startAt: 'asc' } } },
    }),
    db.timeEntry.findMany({
      where: {
        userId,
        clockInAt: { gte: weekStart, lt: weekEnd },
      },
      include: { breaks: { orderBy: { startAt: 'asc' } } },
      orderBy: { clockInAt: 'asc' },
    }),
  ])

  return (
    <TimeClockClient
      initialCurrentEntry={JSON.parse(JSON.stringify(currentEntry))}
      initialWeekEntries={JSON.parse(JSON.stringify(weekEntries))}
      initialWeekStart={weekStart.toISOString()}
      userName={session.user.name ?? ''}
    />
  )
}
