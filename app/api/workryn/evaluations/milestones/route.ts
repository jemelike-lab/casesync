import { NextRequest, NextResponse } from 'next/server'
import { getWorkrynSession } from '@/lib/workryn/auth'
import { db } from '@/lib/workryn/db'
import { isManagerOrAbove } from '@/lib/workryn/permissions'

/**
 * Returns all active STAFF users grouped by their onboarding milestone,
 * with completion stats for each step (county preference, self-assessment,
 * supervisor review, reminders sent).
 */
export async function GET(req: NextRequest) {
  const session = await getWorkrynSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!isManagerOrAbove(session.user.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const staff = await db.user.findMany({
    where: { isActive: true, role: 'STAFF' },
    select: {
      id: true,
      name: true,
      email: true,
      jobTitle: true,
      avatarColor: true,
      createdAt: true,
      countyPreference: {
        select: { id: true, residenceCounty: true, preferredCounties: true, submittedAt: true },
      },
      evaluationsReceived: {
        select: {
          id: true,
          comments: true,
          overallRating: true,
          acknowledgedAt: true,
          evaluatorId: true,
          createdAt: true,
          template: { select: { id: true, name: true } },
          scores: {
            select: { id: true, score: true, comment: true, criterion: { select: { label: true, type: true } } },
          },
        },
        orderBy: { createdAt: 'desc' },
      },
      reminders: {
        where: { title: { contains: 'Day' } },
        select: { id: true, title: true, dueAt: true, isRead: true },
        orderBy: { dueAt: 'asc' },
      },
    },
    orderBy: { createdAt: 'desc' },
  })

  const now = Date.now()

  const staffWithStats = staff.map(u => {
    const daysEmployed = Math.floor((now - new Date(u.createdAt).getTime()) / (1000 * 60 * 60 * 24))

    // Determine which milestone bracket
    let milestone: string
    if (daysEmployed <= 45) milestone = '30-day'
    else if (daysEmployed <= 120) milestone = '90-day'
    else if (daysEmployed <= 210) milestone = '6-month'
    else if (daysEmployed <= 395) milestone = '1-year'
    else milestone = 'annual'

    // County preference status
    const countyDone = !!u.countyPreference

    // Self-assessments (agent = evaluator = self)
    const selfAssessments = u.evaluationsReceived.filter(
      e => e.evaluatorId === u.id && e.comments?.startsWith('[SELF-ASSESSMENT]')
    )
    const selfAssessmentDone = selfAssessments.length > 0
    const latestSelfAssessment = selfAssessments[0] ?? null

    // Supervisor reviews (evaluator != self)
    const supervisorReviews = u.evaluationsReceived.filter(
      e => e.evaluatorId !== u.id
    )
    const supervisorReviewDone = supervisorReviews.length > 0

    // Completion steps
    const stepsTotal = 3 // county pref, self-assessment, supervisor review
    const stepsComplete = (countyDone ? 1 : 0) + (selfAssessmentDone ? 1 : 0) + (supervisorReviewDone ? 1 : 0)

    // Status
    let status: string
    if (stepsComplete === stepsTotal) status = 'COMPLETED'
    else if (daysEmployed > (milestone === '30-day' ? 30 : milestone === '90-day' ? 90 : milestone === '6-month' ? 180 : 365)) {
      status = stepsComplete > 0 ? 'OVERDUE' : 'OVERDUE'
    } else if (stepsComplete > 0) status = 'IN_PROGRESS'
    else status = 'NOT_STARTED'

    return {
      id: u.id,
      name: u.name,
      email: u.email,
      jobTitle: u.jobTitle,
      avatarColor: u.avatarColor,
      hireDate: u.createdAt,
      daysEmployed,
      milestone,
      status,
      stepsComplete,
      stepsTotal,
      countyDone,
      countyData: u.countyPreference ? {
        residenceCounty: u.countyPreference.residenceCounty,
        preferredCounties: u.countyPreference.preferredCounties,
        submittedAt: u.countyPreference.submittedAt,
      } : null,
      selfAssessmentDone,
      selfAssessment: latestSelfAssessment ? {
        id: latestSelfAssessment.id,
        templateName: latestSelfAssessment.template.name,
        createdAt: latestSelfAssessment.createdAt,
        answeredCount: latestSelfAssessment.scores.filter(s => s.comment || s.score > 0).length,
        totalQuestions: latestSelfAssessment.scores.length,
      } : null,
      supervisorReviewDone,
      supervisorReview: supervisorReviews[0] ? {
        id: supervisorReviews[0].id,
        overallRating: supervisorReviews[0].overallRating,
        createdAt: supervisorReviews[0].createdAt,
      } : null,
      remindersCount: u.reminders.length,
      remindersPending: u.reminders.filter(r => !r.isRead).length,
    }
  })

  // Group by milestone
  const milestones = [
    { key: '30-day', label: '30-Day Evaluation', dueBy: 30, color: '#3b82f6' },
    { key: '90-day', label: '90-Day Evaluation', dueBy: 90, color: '#10b981' },
    { key: '6-month', label: '6-Month Evaluation', dueBy: 180, color: '#f59e0b' },
    { key: '1-year', label: '1-Year Evaluation', dueBy: 365, color: '#8b5cf6' },
    { key: 'annual', label: 'Annual Evaluation', dueBy: 730, color: '#ec4899' },
  ]

  const grouped = milestones.map(m => ({
    ...m,
    staff: staffWithStats.filter(s => s.milestone === m.key),
    completedCount: staffWithStats.filter(s => s.milestone === m.key && s.status === 'COMPLETED').length,
    overdueCount: staffWithStats.filter(s => s.milestone === m.key && s.status === 'OVERDUE').length,
    inProgressCount: staffWithStats.filter(s => s.milestone === m.key && s.status === 'IN_PROGRESS').length,
  }))

  return NextResponse.json({
    milestones: grouped.filter(m => m.staff.length > 0),
    allStaff: staffWithStats,
    summary: {
      totalStaff: staffWithStats.length,
      completed: staffWithStats.filter(s => s.status === 'COMPLETED').length,
      inProgress: staffWithStats.filter(s => s.status === 'IN_PROGRESS').length,
      overdue: staffWithStats.filter(s => s.status === 'OVERDUE').length,
      notStarted: staffWithStats.filter(s => s.status === 'NOT_STARTED').length,
    },
  })
}
