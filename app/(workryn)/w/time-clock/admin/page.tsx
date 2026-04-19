import { getWorkrynSession } from '@/lib/workryn/auth'
import { redirect } from 'next/navigation'

import { db } from '@/lib/workryn/db'
import { isManagerOrAbove } from '@/lib/workryn/permissions'
import AdminTimeClockClient from '@/components/workryn/AdminTimeClockClient'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Admin: Time Tracking' }

function getWeekStart(date: Date): Date {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  const day = d.getDay()
  const diff = day === 0 ? -6 : 1 - day
  d.setDate(d.getDate() + diff)
  return d
}

function getWeekEnd(weekStart: Date): Date {
  const d = new Date(weekStart)
  d.setDate(d.getDate() + 7)
  return d
}

export default async function AdminTimeClockPage() {
  const session = await getWorkrynSession()
  if (!session) redirect('/login')
  if (!isManagerOrAbove(session.user.role)) redirect('/time-clock')

  const now = new Date()
  const weekStart = getWeekStart(now)
  const weekEnd = getWeekEnd(weekStart)

  const [users, departments, activeEntries, weekEntries, lastEntries] = await Promise.all([
    db.user.findMany({
      where: { isActive: true },
      orderBy: { name: 'asc' },
      select: {
        id: true,
        name: true,
        email: true,
        avatarColor: true,
        jobTitle: true,
        role: true,
        departmentId: true,
        department: { select: { id: true, name: true, color: true } },
      },
    }),
    db.department.findMany({
      orderBy: { name: 'asc' },
      select: { id: true, name: true, color: true },
    }),
    db.timeEntry.findMany({
      where: { status: 'ACTIVE' },
      include: { breaks: { orderBy: { startAt: 'asc' } } },
    }),
    db.timeEntry.findMany({
      where: { clockInAt: { gte: weekStart, lt: weekEnd } },
      include: { breaks: true },
    }),
    db.timeEntry.findMany({
      where: { status: { not: 'ACTIVE' } },
      orderBy: { clockInAt: 'desc' },
      take: 500,
      select: { userId: true, clockInAt: true, clockOutAt: true },
    }),
  ])

  const activeByUser = new Map<string, typeof activeEntries[number]>()
  for (const e of activeEntries) activeByUser.set(e.userId, e)

  const weekByUser = new Map<string, { workedMinutes: number; breakMinutes: number }>()
  for (const e of weekEntries) {
    let worked = e.workedMinutes
    let brk = e.breakMinutes
    if (e.status === 'ACTIVE') {
      const clockIn = new Date(e.clockInAt).getTime()
      const total = Math.max(0, Math.floor((now.getTime() - clockIn) / 60000))
      let bMins = 0
      for (const b of e.breaks) {
        if (b.endAt) bMins += b.actualMinutes ?? 0
        else bMins += Math.max(0, Math.floor((now.getTime() - new Date(b.startAt).getTime()) / 60000))
      }
      brk = bMins
      worked = Math.max(0, total - bMins)
    }
    const prev = weekByUser.get(e.userId) || { workedMinutes: 0, breakMinutes: 0 }
    weekByUser.set(e.userId, {
      workedMinutes: prev.workedMinutes + worked,
      breakMinutes: prev.breakMinutes + brk,
    })
  }

  const lastByUser = new Map<string, { clockInAt: Date; clockOutAt: Date | null }>()
  for (const e of lastEntries) {
    if (!lastByUser.has(e.userId)) {
      lastByUser.set(e.userId, { clockInAt: e.clockInAt, clockOutAt: e.clockOutAt })
    }
  }

  const initialUsers = users.map((u: any) => {
    const currentEntry = activeByUser.get(u.id) ?? null
    const currentBreak = currentEntry?.breaks.find((b: any) => !b.endAt) ?? null
    const weekTotal = weekByUser.get(u.id) || { workedMinutes: 0, breakMinutes: 0 }
    const lastEntry = lastByUser.get(u.id) || null
    return {
      id: u.id,
      name: u.name,
      email: u.email,
      avatarColor: u.avatarColor,
      jobTitle: u.jobTitle,
      role: u.role,
      departmentId: u.departmentId,
      department: u.department,
      currentEntry,
      currentBreak,
      weekTotal,
      lastEntry,
    }
  })

  return (
    <AdminTimeClockClient
      initialUsers={JSON.parse(JSON.stringify(initialUsers))}
      departments={JSON.parse(JSON.stringify(departments))}
      initialWeekStart={weekStart.toISOString()}
      session={{ user: { id: session.user.id, role: session.user.role } }}
    />
  )
}
