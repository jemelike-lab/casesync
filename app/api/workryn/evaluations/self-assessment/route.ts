import { NextRequest, NextResponse } from 'next/server'
import { getWorkrynSession } from '@/lib/workryn/auth'
import { db } from '@/lib/workryn/db'
import { createNotification } from '@/lib/workryn/notifications'
import { ROLES, canViewEvaluations } from '@/lib/workryn/permissions'

/**
 * Self-Assessment flow:
 * 1. Staff member submits their self-assessment (POST)
 *    - Creates an evaluation where agent = evaluator = self
 *    - Marked as a self-review via comments prefix
 * 2. Supervisor is notified to review
 * 3. GET returns the user's self-assessments
 */

// ── POST: Submit a self-assessment ──
export async function POST(req: NextRequest) {
  const session = await getWorkrynSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { templateId, scores, comments } = body

  if (!templateId) {
    return NextResponse.json({ error: 'templateId is required' }, { status: 400 })
  }

  // Validate template exists and is active
  const template = await db.evaluationTemplate.findFirst({
    where: { id: templateId, isActive: true },
    include: { criteria: { orderBy: { order: 'asc' } } },
  })

  if (!template) {
    return NextResponse.json({ error: 'Template not found or inactive' }, { status: 404 })
  }

  // Build score data — for self-assessments, score value = 0 for TEXT/COMMENT types
  // (they use the comment field), and the actual value for RATING/YES_NO
  const scoreData: { criterionId: string; score: number; comment: string | null }[] = []

  for (const criterion of template.criteria) {
    const input = scores?.[criterion.id]
    const type = (criterion as any).type ?? 'RATING'

    if (type === 'TEXT' || type === 'COMMENT') {
      scoreData.push({
        criterionId: criterion.id,
        score: 0,
        comment: input?.comment?.trim() || null,
      })
    } else if (type === 'YES_NO') {
      scoreData.push({
        criterionId: criterion.id,
        score: input?.score ?? 0, // 1 = yes, 2 = no
        comment: input?.comment?.trim() || null,
      })
    } else {
      // RATING
      scoreData.push({
        criterionId: criterion.id,
        score: input?.score ?? 0,
        comment: input?.comment?.trim() || null,
      })
    }
  }

  // Create the self-assessment evaluation
  const evaluation = await db.evaluation.create({
    data: {
      templateId,
      agentId: session.user.id,
      evaluatorId: session.user.id, // self-review
      overallRating: null, // supervisor fills this in later
      comments: `[SELF-ASSESSMENT] ${comments?.trim() || ''}`.trim(),
      isPrivate: false,
      scores: {
        create: scoreData,
      },
    },
    include: {
      template: { select: { id: true, name: true } },
      scores: {
        include: { criterion: true },
      },
    },
  })

  // Notify managers about the self-assessment submission
  const managers = await db.user.findMany({
    where: {
      isActive: true,
      role: { in: ROLES.filter(canViewEvaluations) },
    },
    select: { id: true },
  })

  const userName = session.user.name ?? 'A team member'

  for (const mgr of managers) {
    await createNotification({
      userId: mgr.id,
      category: 'EVALUATION',
      type: 'SELF_ASSESSMENT_SUBMITTED',
      title: `📝 Self-Assessment submitted by ${userName}`,
      message: `${userName} has completed their ${template.name} self-assessment and it is ready for your review.`,
      link: '/w/evaluations',
    })
  }

  return NextResponse.json({
    success: true,
    evaluation: JSON.parse(JSON.stringify(evaluation)),
  })
}

// ── GET: Retrieve self-assessments for the current user ──
// Managers can pass ?userId= to see a specific user's self-assessments
export async function GET(req: NextRequest) {
  const session = await getWorkrynSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const url = new URL(req.url)
  const targetUserId = url.searchParams.get('userId') ?? session.user.id
  const isManager = canViewEvaluations(session.user.role)

  if (targetUserId !== session.user.id && !isManager) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const selfAssessments = await db.evaluation.findMany({
    where: {
      agentId: targetUserId,
      evaluatorId: targetUserId, // self-review marker
      comments: { startsWith: '[SELF-ASSESSMENT]' },
    },
    include: {
      template: { select: { id: true, name: true, description: true } },
      scores: {
        include: {
          criterion: { select: { id: true, label: true, description: true, order: true, maxScore: true } },
        },
      },
    },
    orderBy: { createdAt: 'desc' },
  })

  // Get available self-assessment templates
  const templates = await db.evaluationTemplate.findMany({
    where: {
      isActive: true,
      name: {
        in: [
          'Eval: 30-Day Self-Assessment',
          'Eval: 90-Day Self-Assessment',
          'Eval: 6-Month Self-Assessment',
          'Annual Self-Assessment',
        ],
      },
    },
    include: {
      criteria: { orderBy: { order: 'asc' } },
    },
  })

  return NextResponse.json({
    selfAssessments: JSON.parse(JSON.stringify(selfAssessments)),
    availableTemplates: JSON.parse(JSON.stringify(templates)),
  })
}
