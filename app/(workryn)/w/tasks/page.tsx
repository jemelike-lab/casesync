import { getWorkrynSession } from '@/lib/workryn/auth'

import { db } from '@/lib/workryn/db'
import TasksClient from '@/components/workryn/TasksClient'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Tasks' }

export default async function TasksPage() {
  const session = await getWorkrynSession()

  const [tasks, users, departments] = await Promise.all([
    db.task.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        assignedTo: { select: { id: true, name: true, avatarColor: true } },
        createdBy: { select: { id: true, name: true } },
        department: { select: { id: true, name: true, color: true } },
        _count: { select: { comments: true } },
      },
    }),
    db.user.findMany({
      where: { isActive: true },
      select: { id: true, name: true, avatarColor: true, jobTitle: true },
      orderBy: { name: 'asc' },
    }),
    db.department.findMany({ select: { id: true, name: true, color: true }, orderBy: { name: 'asc' } }),
  ])

  return (
    <TasksClient
      initialTasks={JSON.parse(JSON.stringify(tasks))}
      users={JSON.parse(JSON.stringify(users))}
      departments={JSON.parse(JSON.stringify(departments))}
      currentUserId={session!.user.id}
    />
  )
}
