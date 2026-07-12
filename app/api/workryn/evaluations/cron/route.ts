import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/workryn/db'
import { createNotification } from '@/lib/workryn/notifications'
import { sendEmail } from '@/lib/workryn/email'
import { PLANNER_ROLES, effectiveHireDate } from '@/lib/workryn/permissions'

const EVAL_URL = 'https://www.blhcasesync.com/w/evaluations'
const CALENDLY_URL = 'https://calendly.com/sabbott-9/evaluations'
const EVALUATOR_EMAIL = 'sarah.abbott@blhnurses.com'

// Mirrors MILESTONES in /api/workryn/evaluations/onboarding (source of truth
// for copy) and dueDays in /milestones. Keep the three in sync.
const SWEEP_MILESTONES: { key: string; label: string; maxDays: number; dueDay: number; alerts: number[]; keywords: string[] }[] = [
  { key: '10-day', label: '10-Day', maxDays: 15, dueDay: 10, alerts: [3, 1, 0], keywords: ['10-Day', '10 Day'] },
  { key: '30-day', label: '30-Day', maxDays: 45, dueDay: 30, alerts: [7, 3, 1, 0], keywords: ['30-Day', '30 Day'] },
  { key: '90-day', label: '90-Day', maxDays: 120, dueDay: 90, alerts: [14, 7, 3, 0], keywords: ['90-Day', '90 Day'] },
  { key: '6-month', label: '6-Month', maxDays: 210, dueDay: 180, alerts: [14, 7, 3, 0], keywords: ['6-Month', '6 Month'] },
  { key: '1-year', label: '1-Year', maxDays: 395, dueDay: 365, alerts: [14, 7, 3, 0], keywords: ['1-Year', '1 Year', 'Annual Self'] },
  { key: 'annual', label: 'Annual', maxDays: Infinity, dueDay: 730, alerts: [14, 7, 3, 0], keywords: ['Annual'] },
]

function sweepMilestoneFor(daysEmployed: number) {
  return SWEEP_MILESTONES.find((m) => daysEmployed <= m.maxDays) ?? SWEEP_MILESTONES[SWEEP_MILESTONES.length - 1]
}

/**
 * Cron-triggered route: Deliver due reminders as in-app notifications.
 * Runs daily via Vercel cron — finds all w_reminder rows where
 * dueAt <= now AND isRead = false, creates a notification for each,
 * and marks them as delivered (isRead = true).
 *
 * Protected by CRON_SECRET header or Vercel's internal auth.
 */
export async function GET(req: NextRequest) {
  // Hardened 2026-07-12 (audit P1-9): require the cron bearer secret
  // outright. The old x-vercel-cron header bypass was client-settable, and an
  // unset CRON_SECRET left the route fully open. Mirrors /api/check-deadlines.
  const authHeader = req.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
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

    // ── Phase 2: deadline sweep ─────────────────────────────────────────
    // Built-in reminders that require no manual "start": staff nearing an
    // unsubmitted milestone get auto-reminded (only if the onboarding
    // workflow never scheduled reminders for them), and the evaluator gets
    // one daily digest of everyone inside the alert horizon.
    let autoReminded = 0
    let digestSent = false
    let sweepChecked = 0

    try {
      const staff = await db.user.findMany({
        where: { isActive: true, role: { in: PLANNER_ROLES } },
        select: { id: true, name: true, email: true, createdAt: true, hireDate: true },
      })
      sweepChecked = staff.length

      if (staff.length > 0) {
        const selfEvals = await db.evaluation.findMany({
          where: {
            agentId: { in: staff.map((s) => s.id) },
            comments: { startsWith: '[SELF-ASSESSMENT]' },
          },
          select: { agentId: true, template: { select: { name: true } } },
        })

        type DigestEntry = {
          name: string; label: string; dueDate: Date
          daysLeft: number; workflowStarted: boolean
        }
        const digest: DigestEntry[] = []

        for (const person of staff) {
          const hired = effectiveHireDate(person)
          const daysEmployed = Math.floor((now.getTime() - hired.getTime()) / (1000 * 60 * 60 * 24))
          const ms = sweepMilestoneFor(daysEmployed)
          const daysLeft = ms.dueDay - daysEmployed
          const dueDate = new Date(hired)
          dueDate.setDate(dueDate.getDate() + ms.dueDay)

          const submitted = selfEvals.some(
            (e) => e.agentId === person.id && ms.keywords.some((k) => e.template.name.includes(k)),
          )
          if (submitted) continue

          const maxAlert = Math.max(...ms.alerts)
          const inHorizon = daysLeft <= maxAlert
          if (!inHorizon) continue

          const windowStart = hired
          const scheduledReminders = await db.reminder.count({
            where: { userId: person.id, dueAt: { gte: windowStart, lte: dueDate } },
          })
          const workflowStarted = scheduledReminders > 0

          digest.push({ name: person.name ?? 'Team member', label: ms.label, dueDate, daysLeft, workflowStarted })

          // Auto-remind the hire only when the workflow was never started
          // (started workflows already scheduled their own w_reminder rows)
          // and only on defined trigger days, deduped forever per trigger.
          const isTrigger = ms.alerts.includes(daysLeft) || daysLeft === -1
          if (!workflowStarted && isTrigger) {
            const dedupeType = `EVAL_AUTOREMIND_${ms.key}_D${daysLeft}`
            const already = await db.notification.findFirst({ where: { userId: person.id, type: dedupeType }, select: { id: true } })
            if (!already) {
              const overdue = daysLeft < 0
              const title = overdue
                ? `⚠️ ${ms.label} Self-Assessment — Overdue`
                : `⏰ ${ms.label} Self-Assessment — ${daysLeft === 0 ? 'due today' : `${daysLeft} day${daysLeft === 1 ? '' : 's'} left`}`
              await db.notification.create({
                data: {
                  userId: person.id,
                  category: 'EVALUATION',
                  type: dedupeType,
                  title,
                  message: `Please complete your ${ms.label} self-assessment in Workryn → Evaluations${overdue ? ' as soon as possible' : ` by ${dueDate.toLocaleDateString('en-US', { month: 'long', day: 'numeric' })}`}, and schedule your review meeting via the Calendly link in your portal.`,
                  link: '/w/evaluations',
                },
              })
              if (person.email) {
                await sendEmail({
                  to: person.email,
                  subject: `${overdue ? '⚠️ Overdue: ' : 'Reminder: '}${ms.label} Self-Assessment — ${person.name ?? 'Team Member'}`,
                  html: `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#f8f9fa;font-family:Georgia,'Times New Roman',serif;color:#2d3748"><table width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td align="center" style="padding:32px 16px"><table width="100%" style="max-width:640px;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.08)"><tr><td style="background:${overdue ? '#c53030' : '#2b6cb0'};padding:20px 36px;text-align:center"><h1 style="margin:0;font-size:18px;color:#ffffff">${overdue ? '⚠️ Overdue' : '⏰ Reminder'} — ${ms.label} Self-Assessment</h1></td></tr><tr><td style="padding:28px 36px;font-size:15px;color:#4a5568;line-height:1.7"><p style="margin:0 0 16px">Good afternoon, ${person.name ?? 'Team Member'}.</p><p style="margin:0 0 16px">${overdue ? `Your ${ms.label.toLowerCase()} self-assessment is now overdue. Please complete it as soon as possible.` : `Your ${ms.label.toLowerCase()} self-assessment is due by <strong>${dueDate.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}</strong>.`}</p><p style="margin:0 0 16px">Please complete the following:</p><ul style="margin:0 0 16px;padding-left:20px"><li style="margin-bottom:6px">Your self-assessment in Workryn → Evaluations</li><li style="margin-bottom:6px">Scheduling your review meeting via Calendly</li></ul><p style="margin:0">Warm regards,<br>Sarah Abbott<br>Onboarding Supervisor</p></td></tr><tr><td style="padding:0 36px 28px"><a href="${EVAL_URL}" style="display:inline-block;padding:12px 24px;background:#2b6cb0;color:#ffffff;text-decoration:none;border-radius:8px;font-size:14px;font-weight:600">Open Workryn Portal →</a> <a href="${CALENDLY_URL}" style="display:inline-block;padding:12px 24px;background:#f7fafc;color:#2b6cb0;border:1px solid #cbd5e0;text-decoration:none;border-radius:8px;font-size:14px;font-weight:600">Schedule Meeting →</a></td></tr><tr><td style="padding:12px 36px;background:#f7fafc;border-top:1px solid #e2e8f0;font-size:12px;color:#a0aec0;text-align:center">Beatrice Loving Heart, Inc. · Workryn HR Platform</td></tr></table></td></tr></table></body></html>`,
                  replyTo: EVALUATOR_EMAIL,
                })
              }
              autoReminded++
            }
          }
        }

        // ── Evaluator digest: one per day, listing everyone in the horizon ──
        if (digest.length > 0) {
          const evaluator = await db.user.findFirst({
            where: { email: EVALUATOR_EMAIL },
            select: { id: true },
          })
          if (evaluator) {
            const dayKey = now.toISOString().slice(0, 10)
            const digestType = `EVAL_EVALUATOR_DIGEST_${dayKey}`
            const already = await db.notification.findFirst({ where: { userId: evaluator.id, type: digestType }, select: { id: true } })
            if (!already) {
              digest.sort((a, b) => a.daysLeft - b.daysLeft)
              const summary = digest
                .map((d) => `${d.name} — ${d.label} ${d.daysLeft < 0 ? `overdue by ${Math.abs(d.daysLeft)}d` : d.daysLeft === 0 ? 'due today' : `due in ${d.daysLeft}d`}${d.workflowStarted ? '' : ' (workflow not started)'}`)
                .join(' · ')
              await db.notification.create({
                data: {
                  userId: evaluator.id,
                  category: 'EVALUATION',
                  type: digestType,
                  title: `⏰ ${digest.length} evaluation deadline${digest.length === 1 ? '' : 's'} approaching`,
                  message: summary.slice(0, 900),
                  link: '/w/evaluations',
                },
              })
              const rows = digest
                .map((d) => `<tr><td style="padding:8px 12px;border-bottom:1px solid #e2e8f0">${d.name}</td><td style="padding:8px 12px;border-bottom:1px solid #e2e8f0">${d.label}</td><td style="padding:8px 12px;border-bottom:1px solid #e2e8f0">${d.dueDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</td><td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;color:${d.daysLeft < 0 ? '#c53030' : d.daysLeft <= 3 ? '#c05621' : '#2b6cb0'};font-weight:700">${d.daysLeft < 0 ? `Overdue ${Math.abs(d.daysLeft)}d` : d.daysLeft === 0 ? 'Due today' : `${d.daysLeft}d left`}</td><td style="padding:8px 12px;border-bottom:1px solid #e2e8f0">${d.workflowStarted ? 'Started' : '<span style="color:#c05621;font-weight:700">Not started</span>'}</td></tr>`)
                .join('')
              await sendEmail({
                to: EVALUATOR_EMAIL,
                subject: `Evaluation deadlines — ${digest.length} planner${digest.length === 1 ? '' : 's'} need${digest.length === 1 ? 's' : ''} attention`,
                html: `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#f8f9fa;font-family:Georgia,'Times New Roman',serif;color:#2d3748"><table width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td align="center" style="padding:32px 16px"><table width="100%" style="max-width:680px;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.08)"><tr><td style="background:#553c9a;padding:20px 36px;text-align:center"><h1 style="margin:0;font-size:18px;color:#ffffff">⏰ Evaluation Deadline Digest</h1></td></tr><tr><td style="padding:28px 36px;font-size:15px;color:#4a5568;line-height:1.7"><p style="margin:0 0 16px">Good afternoon, Sarah.</p><p style="margin:0 0 16px">The following support planners have upcoming or overdue self-assessments and have not yet submitted. Consider a nudge from the Milestones tab.</p><table width="100%" style="border-collapse:collapse;font-size:13px"><tr style="background:#f7fafc"><th style="padding:8px 12px;text-align:left;border-bottom:2px solid #e2e8f0">Planner</th><th style="padding:8px 12px;text-align:left;border-bottom:2px solid #e2e8f0">Milestone</th><th style="padding:8px 12px;text-align:left;border-bottom:2px solid #e2e8f0">Due</th><th style="padding:8px 12px;text-align:left;border-bottom:2px solid #e2e8f0">Status</th><th style="padding:8px 12px;text-align:left;border-bottom:2px solid #e2e8f0">Workflow</th></tr>${rows}</table></td></tr><tr><td style="padding:0 36px 28px"><a href="${EVAL_URL}" style="display:inline-block;padding:12px 24px;background:#553c9a;color:#ffffff;text-decoration:none;border-radius:8px;font-size:14px;font-weight:600">Open Milestones →</a></td></tr><tr><td style="padding:12px 36px;background:#f7fafc;border-top:1px solid #e2e8f0;font-size:12px;color:#a0aec0;text-align:center">Beatrice Loving Heart, Inc. · Workryn HR Platform</td></tr></table></td></tr></table></body></html>`,
              })
              digestSent = true
            }
          } else {
        console.warn('[reminder-cron] Evaluator user not found for digest:', EVALUATOR_EMAIL)
          }
        }
      }
    } catch (sweepError) {
      // The sweep must never break scheduled-reminder delivery.
      console.error('[reminder-cron] Deadline sweep error:', sweepError)
    }

    return NextResponse.json({
      ok: true,
      delivered,
      checked: dueReminders.length,
      sweepChecked,
      autoReminded,
      digestSent,
      timestamp: now.toISOString(),
    })
  } catch (error) {
    console.error('[reminder-cron] Error:', error)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
