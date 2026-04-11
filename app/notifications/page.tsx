import NotificationsPageClient from '@/components/NotificationsPageClient'
import { getCurrentUserAndProfile } from '@/lib/queries'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export default async function NotificationsPage() {
  const { user, profile } = await getCurrentUserAndProfile()
  if (!user) return null

  return <NotificationsPageClient userId={user.id} profile={profile} />
}
