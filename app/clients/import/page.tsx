import { redirect } from 'next/navigation'
import ClientBatchImportClient from '@/components/import/ClientBatchImportClient'
import { createClient } from '@/lib/supabase/server'
import { canManageTeam } from '@/lib/roles'
import type { Profile } from '@/lib/types'

export const dynamic = 'force-dynamic'

export default async function ClientImportPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, role')
    .eq('id', user.id)
    .single()

  if (!canManageTeam(profile?.role)) {
    redirect('/dashboard')
  }

  const [{ data: planners }, { data: importRuns }] = await Promise.all([
    supabase
      .from('profiles')
      .select('*')
      .eq('role', 'supports_planner')
      .order('full_name'),
    supabase
      .from('client_import_runs')
      .select('id, created_at, mode, source_filename, total_rows, valid_rows, imported_rows, skipped_rows, error_count, warning_count, status, created_by, profiles!client_import_runs_created_by_fkey(full_name)')
      .order('created_at', { ascending: false })
      .limit(20),
  ])

  return <ClientBatchImportClient planners={(planners as Profile[]) ?? []} importRuns={(importRuns as any[]) ?? []} mode="supervisor" />
}
