import { NextRequest, NextResponse } from 'next/server'
import { getWorkrynSession } from '@/lib/workryn/auth'
import { db } from '@/lib/workryn/db'
import { createNotification } from '@/lib/workryn/notifications'
import { isManagerOrAbove } from '@/lib/workryn/permissions'

// ── 30-Day Self-Assessment Onboarding Workflow ─────────────────
//
// Links:
//   Calendly (schedule eval meeting with Sarah):
//     https://calendly.com/sabbott-9/evaluations
//   Google Form (county preference selection):
//     https://docs.google.com/forms/d/e/1FAIpQLSey8jldz9vSIbqZuHc5Z9TE4JB9j8awyk_1zLDKruto6-gkuw/viewform
//
// Workflow:
//   1. Supervisor triggers the workflow for a new support planner
//   2. System sends initial notification with both links
//   3. Automated reminders fire at: hire+23d (7 days before 30-day mark),
//      hire+27d (3 days before), hire+29d (1 day before)
//   4. Supervisor can manually re-send or nudge at any time

const CALENDLY_URL = 'https://calendly.com/sabbott-9/evaluations'
const COUNTY_FORM_URL = 'https://docs.google.com/forms/d/e/1FAIpQLSey8jldz9vSIbqZuHc5Z9TE4JB9j8awyk_1zLDKruto6-gkuw/viewform'

// ── POST: Trigger the onboarding workflow for a user ──
//   Body: { userId, hireDate?, action? }
//   action = 'start' (default) | 'remind' | 'nudge'
export async function POST(req: NextRequest) {
  const session = await getWorkrynSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!isManagerOrAbove(session.user.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await req.json()
  const { userId, hireDate, action = 'start' } = body

  if (!userId) {
    return NextResponse.json({ error: 'userId is required' }, { status: 400 })
  }

  const user = await db.user.findUnique({
    where: { id: userId },
    select: { id: true, name: true, email: true, createdAt: true },
  })

  if (!user) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 })
  }

  const supervisorName = session.user.name ?? 'Your Onboarding Supervisor'
  const userName = user.name ?? 'New Team Member'
  const effectiveHireDate = hireDate ? new Date(hireDate) : user.createdAt

  if (action === 'start') {
    // ── 1. Send the initial notification with both links ──
    await createNotification({
      userId: user.id,
      category: 'EVALUATION',
      type: 'ONBOARDING_30DAY',
      title: '📋 30-Day Self-Assessment — Action Required',
      message:
        `Welcome to BLH, ${userName}! As part of your 30-day onboarding, you must complete two important steps at least one week before your supervisor meeting:\n\n` +
        `1️⃣ Complete the 30-Day Self-Assessment evaluation in Workryn → Evaluations\n` +
        `2️⃣ Select your county preference for client assignments: ${COUNTY_FORM_URL}\n` +
        `3️⃣ Schedule your evaluation meeting with Sarah Abbott: ${CALENDLY_URL}\n\n` +
        `Please complete these before your 30-day mark. Reach out to ${supervisorName} with any questions.`,
      link: '/w/evaluations',
    })

    // ── 2. Schedule automated reminders ──
    const day23 = new Date(effectiveHireDate)
    day23.setDate(day23.getDate() + 23)

    const day27 = new Date(effectiveHireDate)
    day27.setDate(day27.getDate() + 27)

    const day29 = new Date(effectiveHireDate)
    day29.setDate(day29.getDate() + 29)

    const now = new Date()

    const reminders: { title: string; note: string; dueAt: Date }[] = []

    if (day23 > now) {
      reminders.push({
        title: '⏰ 30-Day Assessment — 7 Days Remaining',
        note:
          `Hi ${userName}, this is a reminder to complete your 30-Day Self-Assessment.\n\n` +
          `📝 County Preference Form: ${COUNTY_FORM_URL}\n` +
          `📅 Schedule meeting with Sarah: ${CALENDLY_URL}\n\n` +
          `Your assessment must be completed before your supervisor meeting.`,
        dueAt: day23,
      })
    }

    if (day27 > now) {
      reminders.push({
        title: '🔔 30-Day Assessment — 3 Days Remaining',
        note:
          `${userName}, your 30-day milestone is approaching in 3 days. Please ensure you've completed:\n\n` +
          `✅ Self-Assessment in Workryn → Evaluations\n` +
          `✅ County Preference Form: ${COUNTY_FORM_URL}\n` +
          `✅ Scheduled meeting with Sarah: ${CALENDLY_URL}`,
        dueAt: day27,
      })
    }

    if (day29 > now) {
      reminders.push({
        title: '🚨 30-Day Assessment — Due Tomorrow',
        note:
          `${userName}, your 30-day assessment is due TOMORROW. If you haven't already, please complete these immediately:\n\n` +
          `📝 County Preference Form: ${COUNTY_FORM_URL}\n` +
          `📅 Schedule meeting: ${CALENDLY_URL}\n\n` +
          `Contact Sarah Abbott if you need assistance.`,
        dueAt: day29,
      })
    }

    // Create reminder rows
    for (const r of reminders) {
      await db.reminder.create({
        data: {
          userId: user.id,
          title: r.title,
          note: r.note,
          dueAt: r.dueAt,
          createdById: session.user.id,
        },
      })
    }

    // ── 3. Also notify the supervisor (Sarah) about the workflow start ──
    await createNotification({
      userId: session.user.id,
      category: 'EVALUATION',
      type: 'ONBOARDING_SUPERVISOR',
      title: `✅ 30-Day workflow started for ${userName}`,
      message:
        `The 30-day onboarding assessment workflow has been activated for ${userName}. ` +
        `${reminders.length} automated reminders have been scheduled. ` +
        `You will be notified when they complete their assessment.`,
      link: '/w/evaluations',
    })

    return NextResponse.json({
      success: true,
      action: 'start',
      user: { id: user.id, name: userName },
      remindersScheduled: reminders.length,
      reminderDates: reminders.map(r => r.dueAt.toISOString()),
      links: { calendly: CALENDLY_URL, countyForm: COUNTY_FORM_URL },
    })
  }

  if (action === 'nudge' || action === 'remind') {
    // ── Manual nudge / re-send links ──
    const urgency = action === 'nudge'
      ? '⚠️ Please complete your 30-Day Assessment as soon as possible.'
      : 'Friendly reminder to complete your 30-Day Assessment tasks.'

    await createNotification({
      userId: user.id,
      category: 'EVALUATION',
      type: 'ONBOARDING_NUDGE',
      title: action === 'nudge' ? '⚠️ 30-Day Assessment — Supervisor Reminder' : '📋 30-Day Assessment — Reminder',
      message:
        `${urgency}\n\n` +
        `📝 County Preference Form: ${COUNTY_FORM_URL}\n` +
        `📅 Schedule meeting with Sarah: ${CALENDLY_URL}\n\n` +
        `Sent by ${supervisorName}.`,
      link: '/w/evaluations',
    })

    return NextResponse.json({
      success: true,
      action,
      user: { id: user.id, name: userName },
      links: { calendly: CALENDLY_URL, countyForm: COUNTY_FORM_URL },
    })
  }

  return NextResponse.json({ error: 'Invalid action. Use: start, remind, nudge' }, { status: 400 })
}

// ── GET: Check onboarding status for all new hires ──
export async function GET(req: NextRequest) {
  const session = await getWorkrynSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!isManagerOrAbove(session.user.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // Find users hired in the last 45 days who have pending reminders
  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - 45)

  const newHires = await db.user.findMany({
    where: {
      isActive: true,
      role: 'STAFF',
      createdAt: { gte: cutoff },
    },
    select: {
      id: true,
      name: true,
      email: true,
      jobTitle: true,
      avatarColor: true,
      createdAt: true,
      reminders: {
        where: { title: { contains: '30-Day' } },
        orderBy: { dueAt: 'asc' },
        select: { id: true, title: true, dueAt: true, isRead: true },
      },
      evaluationsReceived: {
        where: { template: { name: { contains: '30-Day' } } },
        select: { id: true, overallRating: true, acknowledgedAt: true, createdAt: true },
      },
    },
    orderBy: { createdAt: 'desc' },
  })

  const statusList = newHires.map(u => {
    const daysSinceHire = Math.floor((Date.now() - new Date(u.createdAt).getTime()) / (1000 * 60 * 60 * 24))
    const has30DayEval = u.evaluationsReceived.length > 0
    const pendingReminders = u.reminders.filter(r => !r.isRead && new Date(r.dueAt) > new Date())

    let status: 'NOT_STARTED' | 'IN_PROGRESS' | 'OVERDUE' | 'COMPLETED'
    if (has30DayEval) {
      status = 'COMPLETED'
    } else if (daysSinceHire > 30) {
      status = 'OVERDUE'
    } else if (u.reminders.length > 0) {
      status = 'IN_PROGRESS'
    } else {
      status = 'NOT_STARTED'
    }

    return {
      id: u.id,
      name: u.name,
      email: u.email,
      jobTitle: u.jobTitle,
      avatarColor: u.avatarColor,
      hireDate: u.createdAt,
      daysSinceHire,
      status,
      remindersTotal: u.reminders.length,
      remindersPending: pendingReminders.length,
      has30DayEval,
      evalCompleted: has30DayEval ? u.evaluationsReceived[0]?.createdAt : null,
    }
  })

  return NextResponse.json({
    newHires: statusList,
    links: { calendly: CALENDLY_URL, countyForm: COUNTY_FORM_URL },
  })
}
