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

  // Today boundaries for schedule
  const todayStart = new Date()
  todayStart.setHours(0, 0, 0, 0)
  const todayEnd = new Date()
  todayEnd.setHours(23, 59, 59, 999)

  let taskCount = 0
  let openTickets = 0
  let weeklyHours = 0
  let auditLogs: any[] = []
  let recentTasks: any[] = []
  let completedCount = 0
  let totalTaskCount = 0
  let todayShifts: any[] = []

  try {
    const [tc, ot, weekEntries, al, rt, done, total, shifts] = await Promise.all([
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
      // Completed task count for productivity
      db.task.count({
        where: { assignedToId: userId, status: { in: ['DONE', 'COMPLETED'] } },
      }),
      // Total tasks for productivity denominator
      db.task.count({
        where: { assignedToId: userId },
      }),
      // Real shifts for today's schedule
      db.shift.findMany({
        where: {
          userId,
          startTime: { gte: todayStart, lte: todayEnd },
        },
        orderBy: { startTime: 'asc' },
        take: 6,
      }),
    ])

    taskCount = tc
    openTickets = ot
    const weeklyMinutes = weekEntries.reduce((sum: number, e: any) => sum + (e.workedMinutes || 0), 0)
    weeklyHours = Math.round((weeklyMinutes / 60) * 10) / 10
    auditLogs = JSON.parse(JSON.stringify(al))
    recentTasks = JSON.parse(JSON.stringify(rt))
    completedCount = done
    totalTaskCount = total
    todayShifts = JSON.parse(JSON.stringify(shifts))
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
      completedCount={completedCount}
      totalTaskCount={totalTaskCount}
      todayShifts={todayShifts}
    />
  )
}
