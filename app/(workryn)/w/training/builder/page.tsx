import { getWorkrynSession } from '@/lib/workryn/auth'

import { isManagerOrAbove } from '@/lib/workryn/permissions'
import { redirect } from 'next/navigation'
import dynamic from 'next/dynamic'

const CourseBuilderClient = dynamic(
  () => import('@/components/workryn/CourseBuilderClient'),
  { loading: () => <div style={{ padding: 32, color: '#94a3b8', fontSize: 14 }}>Loading course builder...</div> }
)
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
