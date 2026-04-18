import { getWorkrynSession } from '@/lib/workryn/auth'

import { db } from '@/lib/workryn/db'
import { isManagerOrAbove } from '@/lib/workryn/permissions'
import TrainingClient from '@/components/workryn/TrainingClient'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Training' }

export default async function TrainingPage() {
  const session = await getWorkrynSession()
  if (!session) return null

  const role = session.user.role
  const isManager = isManagerOrAbove(role)

  const where = isManager ? {} : { isPublished: true }

  const [courses, enrollments] = await Promise.all([
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
  ])

  return (
    <TrainingClient
      initialCourses={JSON.parse(JSON.stringify(courses))}
      initialEnrollments={JSON.parse(JSON.stringify(enrollments))}
      currentUser={{ id: session.user.id, role }}
    />
  )
}
