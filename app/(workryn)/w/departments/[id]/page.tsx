import { getWorkrynSession } from '@/lib/workryn/auth'
import { redirect, notFound } from 'next/navigation'

import { db } from '@/lib/workryn/db'
import DepartmentDetailClient from '@/components/workryn/DepartmentDetailClient'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Department' }

export default async function DepartmentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const session = await getWorkrynSession()
  if (!session) redirect('/login')

  const { id } = await params

  const department = await db.department.findUnique({
    where: { id },
    include: {
      head: {
        select: {
          id: true,
          name: true,
          email: true,
          jobTitle: true,
          role: true,
          avatarColor: true,
          phone: true,
        },
      },
      users: {
        orderBy: { name: 'asc' },
        select: {
          id: true,
          name: true,
          email: true,
          jobTitle: true,
          phone: true,
          role: true,
          avatarColor: true,
          isActive: true,
          lastLogin: true,
          createdAt: true,
          mfaEnabled: true,
        },
      },
      _count: {
        select: {
          tasks: true,
          tickets: true,
          users: true,
        },
      },
    },
  })

  if (!department) notFound()

  const [allUsers, auditLogs] = await Promise.all([
    db.user.findMany({
      where: { isActive: true },
      orderBy: { name: 'asc' },
      select: {
        id: true,
        name: true,
        email: true,
        jobTitle: true,
        role: true,
        avatarColor: true,
        departmentId: true,
      },
    }),
    db.auditLog.findMany({
      where: { resourceType: 'DEPARTMENT', resourceId: department.id },
      orderBy: { createdAt: 'desc' },
      take: 10,
      include: {
        user: {
          select: { id: true, name: true, avatarColor: true },
        },
      },
    }),
  ])

  return (
    <DepartmentDetailClient
      initialDepartment={JSON.parse(JSON.stringify(department))}
      allUsers={JSON.parse(JSON.stringify(allUsers))}
      auditLogs={JSON.parse(JSON.stringify(auditLogs))}
      currentUserId={session.user.id}
      currentUserRole={session.user.role}
    />
  )
}
