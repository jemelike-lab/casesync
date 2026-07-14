// /admin/activity - Activity Monitor (allowlist-gated; see lib/monitor-access).
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { canViewActivityMonitor } from '@/lib/monitor-access'
import ActivityMonitorClient from '@/components/ActivityMonitorClient'

export const dynamic = 'force-dynamic'

export default async function ActivityMonitorPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  if (!canViewActivityMonitor(user.id)) redirect('/dashboard')
  return <ActivityMonitorClient />
}
