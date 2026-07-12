import { getWorkrynSession } from '@/lib/workryn/auth'

import { db } from '@/lib/workryn/db'
import { PLANNER_ROLES, isManagerOrAbove } from '@/lib/workryn/permissions'
import TrainingClient from '@/components/workryn/TrainingClient'
import { getPageBannerUrl } from '@/lib/workryn/pageBanner'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Training' }

export default async function TrainingPage() {
  const session = await getWorkrynSession()
  if (!session) return null

  const role = session.user.role
  const isManager = isManagerOrAbove(role)

  const where = isManager ? {} : { isPublished: true }

  const [courses, enrollments, users, departments] = await Promise.all([
    db.trainingCourse.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        createdBy: { select: { id: true, name: true, avatarColor: true } },
        _count: { select: { lessons: true, quizzes: true, enrollments: true } },
      },
    }),
    db.trainingEnrollment.findMany({
      where: { userId: session.user.id },
      select: {
        id: true,
        courseId: true,
        status: true,
        enrolledAt: true,
        completedAt: true,
      },
    }),
    // Only fetch users for managers (for assign modal)
    isManager
      ? db.user.findMany({
          where: { role: { in: PLANNER_ROLES } },
          select: { id: true, name: true, email: true, avatarColor: true, departmentId: true, jobTitle: true },
          orderBy: { name: 'asc' },
        })
      : [],
    // Departments for bulk assign
    isManager
      ? db.department.findMany({
          select: { id: true, name: true, color: true, _count: { select: { users: true } } },
          orderBy: { name: 'asc' },
        })
      : [],
  ])

  const bannerUrl = await getPageBannerUrl('training')

  return (
    <TrainingClient
      initialCourses={JSON.parse(JSON.stringify(courses))}
      initialEnrollments={JSON.parse(JSON.stringify(enrollments))}
      currentUser={{ id: session.user.id, role }}
      users={JSON.parse(JSON.stringify(users))}
      departments={JSON.parse(JSON.stringify(departments))}
      bannerUrl={bannerUrl}
    />
  )
}
