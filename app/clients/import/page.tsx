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

  const { data: planners } = await supabase
    .from('profiles')
    .select('*')
    .eq('role', 'supports_planner')
    .order('full_name')

  return <ClientBatchImportClient planners={(planners as Profile[]) ?? []} />
}
