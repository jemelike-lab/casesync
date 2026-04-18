import { NextRequest, NextResponse } from 'next/server'
import { getWorkrynSession } from '@/lib/workryn/auth'

import { db } from '@/lib/workryn/db'
import { createNotification } from '@/lib/workryn/notifications'

export async function POST(req: NextRequest) {
  const session = await getWorkrynSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { role } = session.user
  if (role !== 'ADMIN' && role !== 'MANAGER') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { userId, title, note, dueAt } = await req.json()
  if (!userId || !title || !dueAt) {
    return NextResponse.json({ error: 'userId, title, dueAt required' }, { status: 400 })
  }

  // Create the reminder
  const reminder = await db.reminder.create({
    data: { userId, title, note: note || null, dueAt: new Date(dueAt), createdById: session.user.id },
  })

  // Also create a notification so the user sees the bell badge
  await createNotification({
    userId,
    category: 'SCHEDULE',
    type: 'REMINDER',
    title: 'New Reminder',
    message: `${session.user.name ?? 'Your manager'} set a reminder: "${title}" due ${new Date(dueAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}`,
    link: '/schedule',
  })

  return NextResponse.json(reminder, { status: 201 })
}

export async function GET(req: NextRequest) {
  const session = await getWorkrynSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const reminders = await db.reminder.findMany({
    where: { userId: session.user.id },
    orderBy: { dueAt: 'asc' },
  })

  return NextResponse.json(reminders)
}
