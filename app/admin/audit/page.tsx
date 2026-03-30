import { createClient } from '@/lib/supabase/server'
import { Profile } from '@/lib/types'
import { redirect } from 'next/navigation'
import AuditLogClient from '@/components/AuditLogClient'

export const dynamic = 'force-dynamic'

export default async function AuditPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single()

  if (profile?.role !== 'supervisor') redirect('/dashboard')

  const { data: logs } = await supabase
    .from('activity_log')
    .select('*, profiles!activity_log_user_id_fkey(full_name), clients!activity_log_client_id_fkey(first_name, last_name, client_id)')
    .order('created_at', { ascending: false })
    .limit(1000)

  const { data: users } = await supabase
    .from('profiles')
    .select('id, full_name')
    .order('full_name')

  return (
    <AuditLogClient
      logs={(logs as any[]) ?? []}
      users={(users as { id: string; full_name: string | null }[]) ?? []}
      currentUser={user}
      profile={profile as Profile}
    />
  )
}
