import { getWorkrynSession } from '@/lib/workryn/auth'
import { redirect } from 'next/navigation'

import { db } from '@/lib/workryn/db'
import ProfileClient from '@/components/workryn/ProfileClient'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Profile' }

export default async function ProfilePage() {
  const session = await getWorkrynSession()
  if (!session?.user?.id) redirect('/login')

  const userId = session.user.id

  const [user, taskCount, ticketCount, completedCourses, evaluationCount, enrollments] = await Promise.all([
    db.user.findUnique({
      where: { id: userId },
      include: {
        department: {
          select: { id: true, name: true, color: true, icon: true },
        },
      },
    }),
    db.task.count({ where: { assignedToId: userId } }),
    db.ticket.count({ where: { createdById: userId } }),
    db.trainingEnrollment.count({
      where: { userId, status: 'COMPLETED' },
    }),
    db.evaluation.count({ where: { agentId: userId } }),
    db.trainingEnrollment.findMany({
      where: { userId },
      orderBy: { enrolledAt: 'desc' },
      include: {
        course: {
          select: {
            id: true,
            title: true,
            description: true,
            category: true,
            _count: { select: { lessons: true } },
          },
        },
      },
    }),
  ])

  if (!user) redirect('/login')

  // Calculate progress % per enrollment (completed lessons / total lessons)
  const enrollmentsSerialized = await Promise.all(
    enrollments.map(async (e) => {
      const totalLessons = e.course._count.lessons
      const completedLessons = totalLessons > 0
        ? await db.lessonProgress.count({
            where: {
              userId,
              completed: true,
              lesson: { courseId: e.courseId },
            },
          })
        : 0
      const progress = totalLessons > 0 ? Math.round((completedLessons / totalLessons) * 100) : 0
      return {
        id: e.id,
        status: e.status,
        enrolledAt: e.enrolledAt.toISOString(),
        completedAt: e.completedAt ? e.completedAt.toISOString() : null,
        progress,
        course: {
          id: e.course.id,
          title: e.course.title,
          description: e.course.description,
          category: e.course.category,
        },
      }
    })
  )

  const profile = {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    jobTitle: user.jobTitle,
    phone: user.phone,
    avatarColor: user.avatarColor,
    mfaEnabled: user.mfaEnabled,
    isActive: user.isActive,
    lastLogin: user.lastLogin ? user.lastLogin.toISOString() : null,
    createdAt: user.createdAt.toISOString(),
    departmentId: user.departmentId,
    department: user.department
      ? {
          id: user.department.id,
          name: user.department.name,
          color: user.department.color,
          icon: user.department.icon,
        }
      : null,
  }

  return (
    <ProfileClient
      profile={profile}
      stats={{
        tasksAssigned: taskCount,
        ticketsCreated: ticketCount,
        trainingCompleted: completedCourses,
        evaluationsReceived: evaluationCount,
      }}
      initialEnrollments={enrollmentsSerialized}
    />
  )
}
