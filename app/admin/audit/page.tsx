import { createClient } from '@/lib/supabase/server'
import { isAzureConfigured, withRlsContext } from '@/lib/db/azure'
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

  if (!(profile?.role === 'supervisor' || profile?.role === 'it')) redirect('/dashboard')

  // Phase 3 data plane: activity_log lives in Azure when configured. The page
  // is supervisor/IT-gated above, so the caller's RLS scope sees all rows.
  let logs: Record<string, unknown>[] | null = null
  if (isAzureConfigured()) {
    const rows = await withRlsContext(user.id, (sql) => sql`
      SELECT a.*, p.full_name AS p_full_name, c.first_name AS c_first_name, c.last_name AS c_last_name, c.client_id AS c_client_id
      FROM activity_log a
      LEFT JOIN profiles p ON p.id = a.user_id
      LEFT JOIN clients c ON c.id = a.client_id
      ORDER BY a.created_at DESC
      LIMIT 1000
    `)
    logs = (rows as Record<string, unknown>[]).map(({ p_full_name, c_first_name, c_last_name, c_client_id, ...a }) => ({
      ...a,
      profiles: { full_name: (p_full_name as string | null) ?? null },
      clients: (c_client_id ?? c_first_name ?? c_last_name) != null
        ? { first_name: c_first_name ?? null, last_name: c_last_name ?? null, client_id: c_client_id ?? null }
        : null,
    }))
  } else {
    const { data } = await supabase
      .from('activity_log')
      .select('*, profiles!activity_log_user_id_fkey(full_name), clients!activity_log_client_id_fkey(first_name, last_name, client_id)')
      .order('created_at', { ascending: false })
      .limit(1000)
    logs = data
  }

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
