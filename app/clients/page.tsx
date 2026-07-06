import { redirect } from 'next/navigation'
import { getCurrentUserAndProfile } from '@/lib/queries'
import { isSupervisorLike } from '@/lib/roles'

export const dynamic = 'force-dynamic'

/**
 * /clients redirect stub (2026-07-05).
 *
 * The clients namespace has always been detail-and-actions only
 * ([id], import, new) — a bare /clients 404'd even though the client-detail
 * breadcrumb implied it existed. Until the real client index ships
 * (planned post-onboarding: flat searchable RLS-scoped table), route the
 * guessable URL to each role's canonical list surface instead of a 404:
 * supervisor-likes and team managers get the /team queue views, everyone
 * else gets their dashboard caseload.
 */
export default async function ClientsIndexRedirect() {
  const { user, profile } = await getCurrentUserAndProfile()
  if (!user) redirect('/login')
  if (isSupervisorLike(profile?.role) || profile?.role === 'team_manager') {
    redirect('/team?filter=all')
  }
  redirect('/dashboard')
}
