import { getWorkrynSession } from '@/lib/workryn/auth'

import { db } from '@/lib/workryn/db'
import { isManagerOrAbove } from '@/lib/workryn/permissions'
import { notFound, redirect } from 'next/navigation'
import CoursePlayerClient from '@/components/workryn/CoursePlayerClient'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Course' }

export default async function CoursePage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const session = await getWorkrynSession()
  if (!session) redirect('/login')

  const { id } = await params

  const course = await db.trainingCourse.findUnique({
    where: { id },
    include: {
      createdBy: { select: { id: true, name: true, avatarColor: true } },
      lessons: {
        orderBy: { order: 'asc' },
        include: {
          progress: {
            where: { userId: session.user.id },
            select: { id: true, completed: true, watchedSeconds: true },
          },
        },
      },
      quizzes: {
        orderBy: { createdAt: 'asc' },
        include: {
          _count: { select: { questions: true } },
        },
      },
    },
  })

  if (!course) notFound()

  const role = session.user.role
  if (!isManagerOrAbove(role) && !course.isPublished) {
    notFound()
  }

  // Previous quiz attempts for the user
  const attempts = await db.quizAttempt.findMany({
    where: { userId: session.user.id, quiz: { courseId: id } },
    orderBy: { startedAt: 'desc' },
    select: {
      id: true,
      quizId: true,
      score: true,
      passed: true,
      startedAt: true,
      completedAt: true,
    },
  })

  const enrollment = await db.trainingEnrollment.findUnique({
    where: { courseId_userId: { courseId: id, userId: session.user.id } },
    select: { id: true, status: true, completedAt: true },
  })

  return (
    <CoursePlayerClient
      course={JSON.parse(JSON.stringify(course))}
      attempts={JSON.parse(JSON.stringify(attempts))}
      enrollment={enrollment ? JSON.parse(JSON.stringify(enrollment)) : null}
      currentUser={{ id: session.user.id, role }}
    />
  )
}
