import { getWorkrynSession } from '@/lib/workryn/auth'

import { isManagerOrAbove } from '@/lib/workryn/permissions'
import { redirect } from 'next/navigation'
import CourseBuilderClient from '@/components/workryn/CourseBuilderClient'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Course Builder' }

export default async function BuilderPage() {
  const session = await getWorkrynSession()
  if (!session) redirect('/login')
  if (!isManagerOrAbove(session.user.role)) {
    redirect('/training')
  }

  return (
    <CourseBuilderClient
      currentUser={{ id: session.user.id, role: session.user.role }}
    />
  )
}
