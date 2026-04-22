import { getWorkrynSession } from '@/lib/workryn/auth'

import { db } from '@/lib/workryn/db'
import { redirect } from 'next/navigation'
import AdminClient from '@/components/workryn/AdminClient'
import { isManagerOrAbove } from '@/lib/workryn/permissions'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Admin' }

export default async function AdminPage() {
  const session = await getWorkrynSession()
  if (!session || !isManagerOrAbove(session.user.role)) redirect('/dashboard')

  const [users, departments, auditLogs] = await Promise.all([
    db.user.findMany({
      orderBy: { createdAt: 'desc' },
      include: { department: { select: { id: true, name: true, color: true } } },
    }),
    db.department.findMany({
      orderBy: { name: 'asc' },
      include: { _count: { select: { users: true, tasks: true } } },
    }),
    db.auditLog.findMany({
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: { user: { select: { id: true, name: true, avatarColor: true } } },
    })])

  return (
    <AdminClient
      initialUsers={JSON.parse(JSON.stringify(users))}
      initialDepartments={JSON.parse(JSON.stringify(departments))}
      auditLogs={JSON.parse(JSON.stringify(auditLogs))}
      session={{ user: { id: session.user.id, role: session.user.role } }}
    />
  )
}
