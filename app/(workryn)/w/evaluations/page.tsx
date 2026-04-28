import { getWorkrynSession } from '@/lib/workryn/auth'
import { redirect } from 'next/navigation'

import { db } from '@/lib/workryn/db'
import { isAdminOrAbove, isManagerOrAbove } from '@/lib/workryn/permissions'
import dynamic from 'next/dynamic'

const EvaluationsClient = dynamic(
  () => import('@/components/workryn/EvaluationsClient'),
  { loading: () => <div style={{ padding: 32, color: '#94a3b8', fontSize: 14 }}>Loading evaluations...</div> }
)
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Performance Evaluations' }

async function ensureDefaultTemplate() {
  const count = await db.evaluationTemplate.count()
  if (count > 0) return
  await db.evaluationTemplate.create({
    data: {
      name: 'Quarterly Performance Review',
      description: 'Standard quarterly review covering core performance areas.',
      isActive: true,
      criteria: {
        create: [
          { label: 'Communication', description: 'Clarity, listening, and responsiveness with the team and clients.', order: 0, maxScore: 5 },
          { label: 'Teamwork', description: 'Collaboration, helpfulness, and contribution to team success.', order: 1, maxScore: 5 },
          { label: 'Quality of Work', description: 'Accuracy, thoroughness, and attention to detail.', order: 2, maxScore: 5 },
          { label: 'Initiative', description: 'Proactive problem solving and ownership of outcomes.', order: 3, maxScore: 5 },
          { label: 'Punctuality', description: 'Reliability with schedules, deadlines, and attendance.', order: 4, maxScore: 5 },
        ],
      },
    },
  })
}

export default async function EvaluationsPage() {
  const session = await getWorkrynSession()
  if (!session) redirect('/login')

  await ensureDefaultTemplate()

  const role = session.user.role
  const userId = session.user.id
  const isManager = isManagerOrAbove(role)
  const isAdmin = isAdminOrAbove(role)

  // Determine which evaluations to fetch for the initial render.
  // The client may still refetch with filters/tabs.
  let evaluationsWhere: Record<string, unknown>
  if (isAdmin) {
    evaluationsWhere = {}
  } else if (isManager) {
    const me = await db.user.findUnique({ where: { id: userId }, select: { departmentId: true } })
    const orClauses: Record<string, unknown>[] = [
      { evaluatorId: userId },
      { AND: [{ agentId: userId }, { isPrivate: false }] },
    ]
    if (me?.departmentId) {
      orClauses.push({ agent: { departmentId: me.departmentId, role: 'STAFF' } })
    }
    evaluationsWhere = { OR: orClauses }
  } else {
    evaluationsWhere = { agentId: userId, isPrivate: false }
  }

  const [evaluations, templates, users] = await Promise.all([
    db.evaluation.findMany({
      where: evaluationsWhere,
      orderBy: { createdAt: 'desc' },
      include: {
        template: { select: { id: true, name: true, description: true } },
        agent: { select: { id: true, name: true, email: true, role: true, avatarColor: true, jobTitle: true, departmentId: true } },
        evaluator: { select: { id: true, name: true, email: true, role: true, avatarColor: true, jobTitle: true } },
        scores: {
          include: {
            criterion: { select: { id: true, label: true, description: true, order: true, maxScore: true } },
          },
        },
      },
    }),
    db.evaluationTemplate.findMany({
      orderBy: [{ isActive: 'desc' }, { createdAt: 'desc' }],
      include: {
        criteria: { orderBy: { order: 'asc' } },
        _count: { select: { evaluations: true } },
      },
    }),
    isManager
      ? db.user.findMany({
          where: { isActive: true },
          select: { id: true, name: true, email: true, role: true, avatarColor: true, jobTitle: true, departmentId: true },
          orderBy: [{ role: 'asc' }, { name: 'asc' }],
        })
      : Promise.resolve([]),
  ])

  const serialized = JSON.parse(JSON.stringify({ evaluations, templates, users }))

  return (
    <EvaluationsClient
      initialEvaluations={serialized.evaluations}
      initialTemplates={serialized.templates}
      users={serialized.users}
      currentUser={{
        id: userId,
        name: session.user.name ?? '',
        role,
        avatarColor: session.user.avatarColor,
      }}
    />
  )
}
