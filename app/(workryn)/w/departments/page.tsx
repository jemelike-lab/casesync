import { getWorkrynSession } from '@/lib/workryn/auth'
import { redirect } from 'next/navigation'

import { db } from '@/lib/workryn/db'
import DepartmentsClient from '@/components/workryn/DepartmentsClient'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Departments' }

export default async function DepartmentsPage() {
  const session = await getWorkrynSession()
  if (!session) redirect('/login')

  const [departments, users] = await Promise.all([
    db.department.findMany({
      orderBy: { name: 'asc' },
      include: {
        head: {
          select: {
            id: true,
            name: true,
            avatarColor: true,
            jobTitle: true,
            role: true,
          },
        },
        _count: {
          select: {
            users: true,
            tasks: true,
            tickets: true,
          },
        },
      },
    }),
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
  ])

  return (
    <DepartmentsClient
      initialDepartments={JSON.parse(JSON.stringify(departments))}
      users={JSON.parse(JSON.stringify(users))}
      currentUserRole={session.user.role}
    />
  )
}
