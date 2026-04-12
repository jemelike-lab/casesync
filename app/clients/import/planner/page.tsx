import { redirect } from 'next/navigation'
import ClientBatchImportClient from '@/components/import/ClientBatchImportClient'
import { createClient } from '@/lib/supabase/server'
import type { Profile } from '@/lib/types'

export const dynamic = 'force-dynamic'

export default async function PlannerClientImportPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single()

  if (profile?.role !== 'supports_planner') {
    redirect('/dashboard')
  }

  const { data: importRuns } = await supabase
    .from('client_import_runs')
    .select('id, created_at, mode, source_filename, total_rows, valid_rows, imported_rows, skipped_rows, error_count, warning_count, status, created_by, profiles!client_import_runs_created_by_fkey(full_name)')
    .eq('created_by', user.id)
    .order('created_at', { ascending: false })
    .limit(20)

  return (
    <ClientBatchImportClient
      planners={[profile as Profile]}
      importRuns={(importRuns as any[]) ?? []}
      mode="planner"
      defaultAssignedTo={user.id}
      currentPlannerName={profile?.full_name ?? null}
    />
  )
}
