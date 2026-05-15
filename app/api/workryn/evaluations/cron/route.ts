import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/workryn/db'
import { createNotification } from '@/lib/workryn/notifications'

/**
 * Cron-triggered route: Deliver due reminders as in-app notifications.
 * Runs daily via Vercel cron — finds all w_reminder rows where
 * dueAt <= now AND isRead = false, creates a notification for each,
 * and marks them as delivered (isRead = true).
 *
 * Protected by CRON_SECRET header or Vercel's internal auth.
 */
export async function GET(req: NextRequest) {
  // Vercel cron sends an Authorization header; also accept CRON_SECRET
  const authHeader = req.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET
  const isVercelCron = authHeader === `Bearer ${cronSecret}`
  const isInternalCall = req.headers.get('x-vercel-cron') === '1'

  if (!isVercelCron && !isInternalCall && cronSecret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const now = new Date()

    // Find all undelivered reminders that are now due
    const dueReminders = await db.reminder.findMany({
      where: {
        isRead: false,
        dueAt: { lte: now },
      },
      include: {
        user: { select: { id: true, name: true, email: true } },
      },
      take: 100, // safety cap per run
    })

    let delivered = 0

    for (const reminder of dueReminders) {
      // Create the in-app notification
      await createNotification({
        userId: reminder.userId,
        category: 'EVALUATION',
        type: 'REMINDER_DELIVERY',
        title: reminder.title,
        message: reminder.note || reminder.title,
        link: '/w/evaluations',
      })

      // Mark as delivered
      await db.reminder.update({
        where: { id: reminder.id },
        data: { isRead: true },
      })

      delivered++
    }

    return NextResponse.json({
      ok: true,
      delivered,
      checked: dueReminders.length,
      timestamp: now.toISOString(),
    })
  } catch (error) {
    console.error('[reminder-cron] Error:', error)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
