import { getWorkrynSession } from '@/lib/workryn/auth'
import { db } from '@/lib/workryn/db'
import PTOClient from '@/components/workryn/PTOClient'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'PTO' }

const ELEVATED_ROLES = ['TEAM_MANAGER', 'SUPERVISOR', 'OWNER', 'ADMIN', 'MANAGER']

export default async function PTOPage() {
  const session = await getWorkrynSession()
  const isElevated = ELEVATED_ROLES.includes(session!.user.role)

  const [types, myBalances, myRequests, allUsers, pendingCount, intuitMappings] = await Promise.all([
    db.ptoType.findMany({ where: { isActive: true }, orderBy: { sortOrder: 'asc' } }),
    db.ptoBalance.findMany({
      where: { userId: session!.user.id },
      include: { type: { select: { id: true, name: true, code: true, color: true, icon: true, maxAccrual: true, accrualRate: true } } },
      orderBy: { type: { sortOrder: 'asc' } },
    }),
    db.ptoRequest.findMany({
      where: isElevated ? {} : { userId: session!.user.id },
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: {
        user: { select: { id: true, name: true, avatarColor: true, email: true, jobTitle: true } },
        type: { select: { id: true, name: true, code: true, color: true, icon: true, excludeFromPayroll: true } },
        reviewedBy: { select: { id: true, name: true } },
      },
    }),
    isElevated ? db.user.findMany({ where: { isActive: true }, select: { id: true, name: true, email: true, avatarColor: true, jobTitle: true, role: true }, orderBy: { name: 'asc' } }) : Promise.resolve([]),
    isElevated ? db.ptoRequest.count({ where: { status: 'PENDING' } }) : Promise.resolve(0),
    isElevated ? db.intuitEmployeeMap.findMany({ include: { user: { select: { id: true, name: true, email: true } } }, orderBy: { user: { name: 'asc' } } }) : Promise.resolve([]),
  ])

  const enrichedBalances = myBalances.map(b => ({ ...b, available: b.accrued + b.adjustment - b.used - b.pending }))

  return (
    <PTOClient
      currentUser={{ id: session!.user.id, name: session!.user.name || 'User', role: session!.user.role, avatarColor: session!.user.avatarColor }}
      types={JSON.parse(JSON.stringify(types))}
      balances={JSON.parse(JSON.stringify(enrichedBalances))}
      initialRequests={JSON.parse(JSON.stringify(myRequests))}
      allUsers={JSON.parse(JSON.stringify(allUsers))}
      pendingCount={pendingCount}
      intuitMappings={JSON.parse(JSON.stringify(intuitMappings))}
      isElevated={isElevated}
    />
  )
}