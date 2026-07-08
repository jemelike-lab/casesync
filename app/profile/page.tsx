import { redirect } from 'next/navigation'
import { getCurrentUserAndProfile } from '@/lib/queries'
import { isSupervisorLike } from '@/lib/roles'
import UserProfileClient from '@/components/UserProfileClient'

export const dynamic = 'force-dynamic'

/** /profile — the defined CaseSync staff profile (facelift Batch 3). */
export default async function ProfilePage() {
  const { user, profile } = await getCurrentUserAndProfile()
  if (!user) redirect('/login')
  const elevated = isSupervisorLike(profile?.role) || profile?.role === 'team_manager'
  return (
    <UserProfileClient
      userId={user.id}
      email={user.email ?? ''}
      fullName={profile?.full_name ?? null}
      jobTitle={(profile as any)?.job_title ?? null}
      role={profile?.role ?? null}
      avatarUrl={(profile as any)?.avatar_url ?? null}
      isPlannerRole={!elevated}
    />
  )
}
