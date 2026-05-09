import { NextRequest, NextResponse } from 'next/server'
import { getWorkrynSession } from '@/lib/workryn/auth'
import { db } from '@/lib/workryn/db'
import { isManagerOrAbove } from '@/lib/workryn/permissions'

// GET /api/workryn/training/courses/[id]/report
// Returns all enrollments with user details + lesson progress for admin tracking.
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getWorkrynSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!isManagerOrAbove(session.user.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { id: courseId } = await params
  const course = await db.trainingCourse.findUnique({
    where: { id: courseId },
    select: {
      id: true,
      title: true,
      _count: { select: { lessons: true } },
    },
  })
  if (!course) return NextResponse.json({ error: 'Course not found' }, { status: 404 })

  const enrollments = await db.trainingEnrollment.findMany({
    where: { courseId },
    orderBy: { enrolledAt: 'desc' },
    include: {
      user: {
        select: {
          id: true,
          name: true,
          email: true,
          avatarColor: true,
          role: true,
          jobTitle: true,
          departmentId: true,
          department: { select: { name: true } },
        },
      },
    },
  })

  // Get lesson progress counts per user
  const lessonProgress = await db.lessonProgress.findMany({
    where: {
      lesson: { courseId },
      completed: true,
    },
    select: { userId: true, lessonId: true },
  })

  const progressByUser = new Map<string, number>()
  for (const lp of lessonProgress) {
    progressByUser.set(lp.userId, (progressByUser.get(lp.userId) ?? 0) + 1)
  }

  const report = enrollments.map(e => ({
    enrollmentId: e.id,
    status: e.status,
    enrolledAt: e.enrolledAt,
    completedAt: e.completedAt,
    user: e.user,
    lessonsCompleted: progressByUser.get(e.userId) ?? 0,
    totalLessons: course._count.lessons,
  }))

  return NextResponse.json({
    course: { id: course.id, title: course.title, totalLessons: course._count.lessons },
    enrollments: report,
  })
}
