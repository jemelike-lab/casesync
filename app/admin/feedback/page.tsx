// app/admin/feedback/page.tsx
// Tester feedback triage. Gated to isSupervisorLike (supervisor/administrator)
// — STRICTER than the /admin layout's canAccessAdmin gate, because report free
// text and captured paths are PHI-adjacent and IT has no PHI scope (Tier 1,
// 2d49a0c). The feedback_reports RLS policies enforce the same at the DB.

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { isAzureConfigured, withRlsContext } from '@/lib/db/azure'
import { isSupervisorLike } from '@/lib/roles'
import FeedbackAdminClient, { type FeedbackReport } from '@/components/FeedbackAdminClient'

export const dynamic = 'force-dynamic'

export default async function FeedbackAdminPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (!isSupervisorLike(profile?.role)) redirect('/dashboard')

  let reports: FeedbackReport[] = []
  let unavailable = false
  if (isAzureConfigured()) {
    try {
      const rows = await withRlsContext(user.id, (sql) => sql`
        SELECT id, created_at, updated_at, user_id, author_name, author_role,
               type, severity, message, page_path, app_commit, user_agent,
               viewport, status, resolution_note, resolved_by, resolved_at
        FROM feedback_reports
        ORDER BY created_at DESC
        LIMIT 500
      `)
      reports = rows as unknown as FeedbackReport[]
    } catch (err) {
      console.error('[Feedback] admin page load failed:', err)
      unavailable = true
    }
  } else {
    unavailable = true
  }

  return <FeedbackAdminClient initialReports={reports} unavailable={unavailable} />
}
