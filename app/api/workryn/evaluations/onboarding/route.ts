import { NextRequest, NextResponse } from 'next/server'
import { getWorkrynSession } from '@/lib/workryn/auth'
import { db } from '@/lib/workryn/db'
import { createNotification } from '@/lib/workryn/notifications'
import { sendEmail } from '@/lib/workryn/email'
import { canViewEvaluations, effectiveHireDate } from '@/lib/workryn/permissions'

const CALENDLY_URL = 'https://calendly.com/sabbott-9/evaluations'
const COUNTY_FORM_URL = 'https://www.blhcasesync.com/w/county-preference'
const EVAL_URL = 'https://www.blhcasesync.com/w/evaluations'
const SARAH_EMAIL = 'sarah.abbott@blhnurses.com'

type MilestoneConfig = {
  label: string; dueDay: number; reminderDaysBefore: number[]
  email: (name: string) => { subject: string; body: string }
}

const MILESTONES: Record<string, MilestoneConfig> = {
  '10-day': {
    label: '10-Day', dueDay: 10, reminderDaysBefore: [3, 1],
    email: (name) => ({
      subject: `Welcome Check-In — 10-Day Milestone | ${name}`,
      body: `Good afternoon.\n\nWelcome to the Beatrice Loving Heart family, ${name}! We hope your first week and a half has been a positive experience. We are delighted to have you on our team.\n\nAs part of your 10-day onboarding check-in, please complete the following:\n\n1. Complete the 10-Day Check-In questionnaire in your Workryn portal → Evaluations.\n2. Click the Calendly link in your portal to schedule a brief Zoom meeting to review.\n\nThis is an opportunity for us to hear about your early experience, answer any questions about your role or contract, and make sure you have the support you need to succeed.\n\nPeople are and always will be our greatest asset. Please know that you are an important member of our BLH family, and we look forward to getting to know you better during our check-in.\n\nThank you for all that you do for our agency, and please accept our good wishes.\n\nWarm regards,\nSarah Abbott\nOnboarding Supervisor\nBeatrice Loving Heart, Inc.`,
    }),
  },
  '30-day': {
    label: '30-Day', dueDay: 30, reminderDaysBefore: [7, 3, 1],
    email: (name) => ({
      subject: `Congratulations on Your 30-Day Milestone! | ${name}`,
      body: `Good afternoon.\n\nCongratulations on successfully completing your first 30-day milestone of support planning with Beatrice Loving Heart Agency! We are so glad you're a part of our company.\n\nPlease complete the attached self-assessment and return it to me by EOD Friday. You can click the Calendly link in your portal to schedule a brief Zoom meeting to review.\n\nIn addition, prior to our meeting, please complete the county preference form on your dashboard to indicate your county preferences for your caseload.\n\nPeople are and always will be our greatest asset. Please know that you are an important member of our BLH family, and your abilities and contributions to our clients will be essential to our continued success.\n\nThank you for all that you do for our agency, and please accept our good wishes.\n\nWarm regards,\nSarah Abbott\nOnboarding Supervisor\nBeatrice Loving Heart, Inc.`,
    }),
  },
  '90-day': {
    label: '90-Day', dueDay: 90, reminderDaysBefore: [14, 7, 3],
    email: (name) => ({
      subject: `90-Day Performance Evaluation — Action Required | ${name}`,
      body: `Good afternoon.\n\nCongratulations on reaching your 90-day milestone with Beatrice Loving Heart Agency, ${name}! This is a significant achievement and a testament to your dedication and hard work over the past three months.\n\nAs part of your 90-day evaluation, please complete the following before our scheduled meeting:\n\n1. Complete your 90-Day Self-Assessment in your Workryn portal → Evaluations.\n2. Click the Calendly link in your portal to schedule a brief Zoom meeting to review your progress.\n3. If you have not already done so, please ensure your county preference form is up to date on your dashboard.\n\nThis evaluation is an opportunity for us to reflect on your growth, celebrate your accomplishments, and discuss your goals for the next phase of your career with BLH. Your feedback is invaluable to us.\n\nPeople are and always will be our greatest asset. Your contributions to our clients over these 90 days have not gone unnoticed, and we are grateful to have you as part of our BLH family.\n\nThank you for all that you do for our agency, and please accept our good wishes.\n\nWarm regards,\nSarah Abbott\nOnboarding Supervisor\nBeatrice Loving Heart, Inc.`,
    }),
  },
  '6-month': {
    label: '6-Month', dueDay: 180, reminderDaysBefore: [14, 7, 3],
    email: (name) => ({
      subject: `6-Month Performance Evaluation — Action Required | ${name}`,
      body: `Good afternoon.\n\nCongratulations on reaching your 6-month milestone with Beatrice Loving Heart Agency, ${name}! Half a year of dedicated service is a wonderful accomplishment, and we are so grateful for everything you bring to our team.\n\nAs part of your 6-month evaluation, please complete the following before our scheduled meeting:\n\n1. Complete your 6-Month Self-Assessment in your Workryn portal → Evaluations.\n2. Click the Calendly link in your portal to schedule a brief Zoom meeting to discuss your progress and future goals.\n\nDuring our meeting, we will review the goals you set during your 90-day evaluation, discuss your personal development, and talk about how your manager can best support you going forward. This is also a great time to share what you enjoy most about your work and any ideas you have for improvement.\n\nPeople are and always will be our greatest asset. Your abilities, your commitment to our clients, and your presence within our BLH family make a real difference every day.\n\nThank you for all that you do for our agency, and please accept our good wishes.\n\nWarm regards,\nSarah Abbott\nOnboarding Supervisor\nBeatrice Loving Heart, Inc.`,
    }),
  },
  '1-year': {
    label: '1-Year', dueDay: 365, reminderDaysBefore: [14, 7, 3],
    email: (name) => ({
      subject: `Happy 1-Year Anniversary — Annual Evaluation | ${name}`,
      body: `Good afternoon.\n\nHappy anniversary, ${name}! Congratulations on completing one full year of support planning with Beatrice Loving Heart Agency! This is a remarkable milestone, and we want you to know how much we value your dedication, your growth, and your commitment to our clients throughout this past year.\n\nAs part of your 1-year evaluation, please complete the following before our scheduled meeting:\n\n1. Complete your 1-Year Self-Assessment in your Workryn portal → Evaluations.\n2. Click the Calendly link in your portal to schedule a brief Zoom meeting to review your year and plan ahead.\n\nDuring our meeting, we will reflect on your experience, the challenges you've overcome, and the impact you've had. We will also discuss your career aspirations, how we can better support your professional growth, and any resources that would help you continue to excel.\n\nPeople are and always will be our greatest asset. Over this past year, you have proven yourself to be a truly valued member of our BLH family. Your abilities and contributions to our clients are essential to our continued success.\n\nThank you for all that you do for our agency, and please accept our heartfelt good wishes on this special milestone.\n\nWarm regards,\nSarah Abbott\nOnboarding Supervisor\nBeatrice Loving Heart, Inc.`,
    }),
  },
  annual: {
    label: 'Annual', dueDay: 365, reminderDaysBefore: [14, 7, 3],
    email: (name) => ({
      subject: `Annual Performance Evaluation — Action Required | ${name}`,
      body: `Good afternoon.\n\nIt's time for your annual performance evaluation, ${name}! Another year of dedicated service to Beatrice Loving Heart Agency and our clients is a testament to your professionalism and commitment.\n\nAs part of your annual evaluation, please complete the following before our scheduled meeting:\n\n1. Complete your Annual Self-Assessment in your Workryn portal → Evaluations.\n2. Click the Calendly link in your portal to schedule a brief Zoom meeting to review your performance and goals.\n\nThis is an opportunity to look back on your accomplishments, discuss how your responsibilities have evolved, and set meaningful goals for the year ahead. Your honest self-reflection helps us understand how we can better support you and ensure your continued growth within our organization.\n\nPeople are and always will be our greatest asset. We are proud to have you as part of our BLH family, and your contributions to our clients continue to be essential to our mission and our success.\n\nThank you for all that you do for our agency, and please accept our good wishes.\n\nWarm regards,\nSarah Abbott\nOnboarding Supervisor\nBeatrice Loving Heart, Inc.`,
    }),
  },
}

function getMilestoneKey(daysEmployed: number): string {
  if (daysEmployed <= 15) return '10-day'
  if (daysEmployed <= 45) return '30-day'
  if (daysEmployed <= 120) return '90-day'
  if (daysEmployed <= 210) return '6-month'
  if (daysEmployed <= 395) return '1-year'
  return 'annual'
}

function buildMilestoneEmailHtml(ms: MilestoneConfig, userName: string): string {
  const { body } = ms.email(userName)
  const paragraphs = body.split('\n\n').map(p =>
    `<p style="margin:0 0 16px;line-height:1.7">${p.replace(/\n/g, '<br>')}</p>`
  ).join('')

  return `<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;background:#f8f9fa;font-family:Georgia,'Times New Roman',serif;color:#2d3748">
  <table width="100%" cellpadding="0" cellspacing="0" border="0">
    <tr><td align="center" style="padding:32px 16px">
      <table width="100%" style="max-width:640px;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.08)">
        <tr><td style="background:linear-gradient(135deg,#1a365d 0%,#2b6cb0 100%);padding:28px 36px;text-align:center">
          <h1 style="margin:0;font-size:22px;color:#ffffff;font-weight:700;letter-spacing:-0.02em">Beatrice Loving Heart</h1>
          <p style="margin:6px 0 0;font-size:13px;color:rgba(255,255,255,0.75);font-style:italic">People are and always will be our greatest asset</p>
        </td></tr>
        <tr><td align="center" style="padding:24px 36px 0">
          <div style="display:inline-block;padding:6px 20px;border-radius:99px;background:#ebf8ff;color:#2b6cb0;font-size:13px;font-weight:700;letter-spacing:0.04em;text-transform:uppercase">${ms.label} Milestone</div>
        </td></tr>
        <tr><td style="padding:24px 36px 12px;font-size:15px;color:#4a5568">${paragraphs}</td></tr>
        <tr><td style="padding:0 36px 28px">
          <table cellpadding="0" cellspacing="0" border="0" style="width:100%">
            <tr>
              <td style="padding:6px 4px 6px 0">
                <a href="${EVAL_URL}" style="display:block;padding:12px 20px;background:#2b6cb0;color:#ffffff;text-decoration:none;border-radius:8px;font-size:14px;font-weight:600;text-align:center">✏️ Complete Self-Assessment</a>
              </td>
              <td style="padding:6px 0 6px 4px">
                <a href="${CALENDLY_URL}" style="display:block;padding:12px 20px;background:#38a169;color:#ffffff;text-decoration:none;border-radius:8px;font-size:14px;font-weight:600;text-align:center">📅 Schedule Meeting</a>
              </td>
            </tr>
            ${ms.label === '30-Day' ? `<tr><td colspan="2" style="padding:6px 0 0">
              <a href="${COUNTY_FORM_URL}" style="display:block;padding:12px 20px;background:#dd6b20;color:#ffffff;text-decoration:none;border-radius:8px;font-size:14px;font-weight:600;text-align:center">📍 Complete County Preference</a>
            </td></tr>` : ''}
          </table>
        </td></tr>
        <tr><td style="padding:16px 36px;background:#f7fafc;border-top:1px solid #e2e8f0;font-size:12px;color:#a0aec0;text-align:center">
          Beatrice Loving Heart, Inc. · 4201 Mitchellville Road, Suite 300, Bowie, MD 20716<br>
          <span style="color:#718096">Sent via Workryn HR Platform</span>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`
}

// ── POST ──
export async function POST(req: NextRequest) {
  const session = await getWorkrynSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!canViewEvaluations(session.user.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json()
  const { userId, action = 'start' } = body
  if (!userId) return NextResponse.json({ error: 'userId is required' }, { status: 400 })

  const user = await db.user.findUnique({ where: { id: userId }, select: { id: true, name: true, email: true, createdAt: true, hireDate: true } })
  if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 })

  const userName = user.name ?? 'Team Member'
  const userEmail = user.email ?? ''
  const hired = effectiveHireDate(user)
  const daysEmployed = Math.floor((Date.now() - hired.getTime()) / (1000 * 60 * 60 * 24))
  const milestoneKey = body.milestone ?? getMilestoneKey(daysEmployed)
  const ms = MILESTONES[milestoneKey]
  if (!ms) return NextResponse.json({ error: `Unknown milestone: ${milestoneKey}` }, { status: 400 })

  if (action === 'start') {
    // Send branded milestone email
    if (userEmail) {
      const { subject } = ms.email(userName)
      await sendEmail({ to: userEmail, subject, html: buildMilestoneEmailHtml(ms, userName), replyTo: SARAH_EMAIL })
    }

    // In-app notification
    await createNotification({
      userId: user.id, category: 'EVALUATION',
      type: `ONBOARDING_${milestoneKey.toUpperCase().replace('-', '')}`,
      title: `📋 ${ms.label} Evaluation — Action Required`,
      message: `Congratulations on reaching your ${ms.label.toLowerCase()} milestone, ${userName}! Please complete your self-assessment in Workryn → Evaluations and schedule your meeting via Calendly.` + (milestoneKey === '30-day' ? ' Also complete the county preference form on your dashboard.' : ''),
      link: '/w/evaluations',
    })

    // Schedule reminders
    const now = new Date()
    const reminders: { title: string; note: string; dueAt: Date }[] = []
    for (const daysBefore of ms.reminderDaysBefore) {
      const d = new Date(hired); d.setDate(d.getDate() + ms.dueDay - daysBefore)
      if (d > now) {
        const icon = daysBefore <= 1 ? '🚨' : daysBefore <= 3 ? '🔔' : '⏰'
        reminders.push({
          title: `${icon} ${ms.label} Evaluation — ${daysBefore} Day${daysBefore !== 1 ? 's' : ''} Remaining`,
          note: `Hi ${userName}, please complete your ${ms.label} Self-Assessment before your meeting.\n\n✏️ Self-Assessment: ${EVAL_URL}\n📅 Schedule meeting: ${CALENDLY_URL}` + (milestoneKey === '30-day' ? `\n📍 County Preference: ${COUNTY_FORM_URL}` : ''),
          dueAt: d,
        })
      }
    }
    for (const r of reminders) {
      await db.reminder.create({ data: { userId: user.id, title: r.title, note: r.note, dueAt: r.dueAt, createdById: session.user.id } })
    }

    // Notify supervisor
    await createNotification({
      userId: session.user.id, category: 'EVALUATION', type: 'ONBOARDING_SUPERVISOR',
      title: `✅ ${ms.label} workflow started for ${userName}`,
      message: `${ms.label} evaluation workflow activated for ${userName}. ${reminders.length} reminder${reminders.length !== 1 ? 's' : ''} scheduled. Email sent to ${userEmail || 'N/A'}.`,
      link: '/w/evaluations',
    })

    return NextResponse.json({ success: true, action: 'start', milestone: milestoneKey, user: { id: user.id, name: userName, email: userEmail }, remindersScheduled: reminders.length, emailSent: !!userEmail })
  }

  if (action === 'remind' || action === 'nudge') {
    const isUrgent = action === 'nudge'
    if (userEmail) {
      await sendEmail({
        to: userEmail,
        subject: `${isUrgent ? '⚠️ URGENT: ' : ''}${ms.label} Evaluation Reminder — ${userName}`,
        html: `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#f8f9fa;font-family:Georgia,'Times New Roman',serif;color:#2d3748">
  <table width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td align="center" style="padding:32px 16px">
    <table width="100%" style="max-width:640px;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.08)">
      <tr><td style="background:${isUrgent ? '#c53030' : '#2b6cb0'};padding:20px 36px;text-align:center">
        <h1 style="margin:0;font-size:18px;color:#ffffff">${isUrgent ? '⚠️ Urgent Reminder' : '📋 Friendly Reminder'} — ${ms.label} Evaluation</h1>
      </td></tr>
      <tr><td style="padding:28px 36px;font-size:15px;color:#4a5568;line-height:1.7">
        <p style="margin:0 0 16px">Good afternoon, ${userName}.</p>
        <p style="margin:0 0 16px">${isUrgent ? `Your ${ms.label.toLowerCase()} evaluation is now overdue. Please complete the following items as soon as possible.` : `This is a friendly reminder to complete your ${ms.label.toLowerCase()} evaluation items before our scheduled meeting.`}</p>
        <p style="margin:0 0 16px">Please ensure you have completed:</p>
        <ul style="margin:0 0 16px;padding-left:20px"><li style="margin-bottom:6px">Your self-assessment in Workryn → Evaluations</li><li style="margin-bottom:6px">Scheduling your meeting via Calendly</li>${milestoneKey === '30-day' ? '<li style="margin-bottom:6px">Your county preference form</li>' : ''}</ul>
        <p style="margin:0 0 16px">If you have any questions or need assistance, please don't hesitate to reach out.</p>
        <p style="margin:0">Warm regards,<br>Sarah Abbott<br>Onboarding Supervisor</p>
      </td></tr>
      <tr><td style="padding:0 36px 28px"><a href="${EVAL_URL}" style="display:inline-block;padding:12px 24px;background:#2b6cb0;color:#ffffff;text-decoration:none;border-radius:8px;font-size:14px;font-weight:600">Open Workryn Portal →</a></td></tr>
      <tr><td style="padding:12px 36px;background:#f7fafc;border-top:1px solid #e2e8f0;font-size:12px;color:#a0aec0;text-align:center">Beatrice Loving Heart, Inc. · Workryn HR Platform</td></tr>
    </table>
  </td></tr></table>
</body></html>`,
        replyTo: SARAH_EMAIL,
      })
    }

    await createNotification({
      userId: user.id, category: 'EVALUATION',
      type: isUrgent ? 'ONBOARDING_NUDGE' : 'ONBOARDING_REMIND',
      title: isUrgent ? `⚠️ ${ms.label} Evaluation — Overdue` : `📋 ${ms.label} Evaluation — Reminder`,
      message: isUrgent ? `Your ${ms.label.toLowerCase()} evaluation is overdue. Please complete your self-assessment and schedule your meeting immediately.` : `Friendly reminder to complete your ${ms.label.toLowerCase()} evaluation. Open Workryn → Evaluations to get started.`,
      link: '/w/evaluations',
    })

    return NextResponse.json({ success: true, action, milestone: milestoneKey, user: { id: user.id, name: userName }, emailSent: !!userEmail })
  }

  return NextResponse.json({ error: 'Invalid action. Use: start, remind, nudge' }, { status: 400 })
}

export async function GET(req: NextRequest) {
  const session = await getWorkrynSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!canViewEvaluations(session.user.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  return NextResponse.json({ message: 'Use /api/workryn/evaluations/milestones for dashboard data' })
}
