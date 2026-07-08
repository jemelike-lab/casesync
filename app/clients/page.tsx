import { redirect } from 'next/navigation'
import { getCurrentUserAndProfile } from '@/lib/queries'
import { isSupervisorLike } from '@/lib/roles'
import ClientIndexClient from '@/components/ClientIndexClient'

export const dynamic = 'force-dynamic'

/**
 * /clients — the real client index (shipped 2026-07-08 with the facelift).
 * Flat, searchable, RLS-scoped table; SPs default to "My caseload"
 * (the 60-client-scroll concern), supervisor-likes default to All Active.
 * All reads go through GET /api/clients — same predicates and scope as
 * every other surface.
 */
export default async function ClientsIndexPage() {
  const { user, profile } = await getCurrentUserAndProfile()
  if (!user) redirect('/login')
  const elevated = isSupervisorLike(profile?.role) || profile?.role === 'team_manager'
  return <ClientIndexClient userId={user.id} isPlannerRole={!elevated} />
}
