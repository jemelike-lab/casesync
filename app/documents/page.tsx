import { redirect } from 'next/navigation'
import { getCurrentUserAndProfile } from '@/lib/queries'
import { isSupervisorLike } from '@/lib/roles'
import DocumentsOverviewClient from '@/components/DocumentsOverviewClient'

export const dynamic = 'force-dynamic'

/**
 * /documents — supervisor document oversight (2026-07-12 file-organization
 * build). Two answers on one page: "is every chart complete?" (per-client
 * folder-count matrix) and "what's about to lapse?" (expired / expiring-
 * within-30-days queue). Team managers see their own team plus unassigned;
 * supervisor-likes see the org. Data comes from /api/documents/overview,
 * which reads the same Azure client_documents table Casey and the client
 * Files tab use.
 */
export default async function DocumentsPage() {
  const { user, profile } = await getCurrentUserAndProfile()
  if (!user) redirect('/login')
  const role = profile?.role
  if (!(isSupervisorLike(role) || role === 'team_manager')) redirect('/dashboard')
  return <DocumentsOverviewClient />
}
