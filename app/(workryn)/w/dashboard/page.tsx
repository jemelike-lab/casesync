import { redirect } from 'next/navigation'
import { getWorkrynSession } from '@/lib/workryn/auth'
import { db } from '@/lib/workryn/db'
import DashboardClient from '@/components/workryn/DashboardClient'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Dashboard' }

function startOfWeek(d = new Date()): Date {
  const date = new Date(d)
  const day = date.getDay() // 0=Sun .. 6=Sat
  // Treat Monday as start of week (ISO)
  const diff = (day + 6) % 7
  date.setDate(date.getDate() - diff)
  date.setHours(0, 0, 0, 0)
  return date
}

export default async function DashboardPage() {
  const session = await getWorkrynSession()

  if (!session) {
    // No Workryn user record linked yet — redirect to CaseSync dashboard
    redirect('/dashboard')
  }

  const userId = session.user.id
  const weekStart = startOfWeek()

  let taskCount = 0
  let openTickets = 0
  let weeklyHours = 0
  let auditLogs: any[] = []
  let recentTasks: any[] = []

  try {
    const [tc, ot, weekEntries, al, rt] = await Promise.all([
      db.task.count({ where: { assignedToId: userId } }),
      db.ticket.count({ where: { status: 'OPEN' } }),
      db.timeEntry.findMany({
        where: { userId, clockInAt: { gte: weekStart } },
        select: { workedMinutes: true },
      }),
      db.auditLog.findMany({
        take: 8,
        orderBy: { createdAt: 'desc' },
        include: { user: { select: { name: true, avatarColor: true } } },
      }),
      db.task.findMany({
        where: { assignedToId: userId, status: { not: 'DONE' } },
        take: 5,
        orderBy: { dueDate: 'asc' },
      }),
    ])

    taskCount = tc
    openTickets = ot
    const weeklyMinutes = weekEntries.reduce((sum: number, e: any) => sum + (e.workedMinutes || 0), 0)
    weeklyHours = Math.round((weeklyMinutes / 60) * 10) / 10
    auditLogs = JSON.parse(JSON.stringify(al))
    recentTasks = JSON.parse(JSON.stringify(rt))
  } catch (error) {
    console.error('[Workryn Dashboard] DB query failed:', error)
    // Render with empty data rather than crashing
  }

  return (
    <DashboardClient
      user={session.user}
      stats={{ taskCount, openTickets, weeklyHours }}
      auditLogs={auditLogs}
      recentTasks={recentTasks}
    />
  )
}
