import { redirect } from 'next/navigation'
import { getWorkrynSession } from '@/lib/workryn/auth'
import { db } from '@/lib/workryn/db'
import PTOClient from '@/components/workryn/PTOClient'

const ELEVATED_ROLES = ['OWNER', 'ADMIN', 'MANAGER', 'SUPERVISOR', 'TEAM_MANAGER']

export const metadata = { title: 'PTO - Workryn' }

export default async function PTOPage() {
  const session = await getWorkrynSession()

  const { user } = session
  const isElevated = ELEVATED_ROLES.includes(user.role)

  const [types, balances, requests, allUsers, intuitMappings] = await Promise.all([
    db.ptoType.findMany({ where: { isActive: true }, orderBy: { name: 'asc' } }),
    db.ptoBalance.findMany({ where: { userId: user.id }, include: { type: true } }),
    db.ptoRequest.findMany({
      where: isElevated ? {} : { userId: user.id },
      include: {
        user: { select: { id: true, name: true, avatarColor: true, email: true, jobTitle: true } },
        type: { select: { id: true, name: true, code: true, color: true, icon: true, excludeFromPayroll: true } },
        reviewedBy: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 200,
    }),
    isElevated
      ? db.user.findMany({
          where: { isActive: true },
          select: { id: true, name: true, email: true, avatarColor: true, jobTitle: true, role: true },
          orderBy: { name: 'asc' },
        })
      : [],
    isElevated
      ? db.intuitEmployeeMap.findMany({
          include: { user: { select: { id: true, name: true, email: true } } },
          orderBy: { createdAt: 'desc' },
        })
      : [],
  ])

  const balancesWithAvailable = balances.map((b) => ({
    ...b,
    available: b.accrued + b.adjustment - b.used - b.pending,
  }))

  const pendingCount = isElevated ? requests.filter((r) => r.status === 'PENDING').length : 0

  const serializedRequests = requests.map((r) => ({
    ...r,
    startDate: r.startDate.toISOString(),
    endDate: r.endDate.toISOString(),
    reviewedAt: r.reviewedAt?.toISOString() ?? null,
    createdAt: r.createdAt.toISOString(),
  }))

  return (
    <PTOClient
      currentUser={{ id: user.id, name: user.name, role: user.role, avatarColor: user.avatarColor }}
      types={types}
      balances={balancesWithAvailable}
      initialRequests={serializedRequests}
      allUsers={allUsers}
      pendingCount={pendingCount}
      intuitMappings={intuitMappings}
      isElevated={isElevated}
    />
  )
}