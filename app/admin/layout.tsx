import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import Header from '@/components/Header'
import IdleTimeout from '@/components/IdleTimeout'
import { enforceMfa } from '@/lib/enforce-mfa'
import { isSupervisorLike } from '@/lib/roles'

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase.from('profiles').select('*').eq('id', user.id).single()

  // Fix 2026-05-22: defense-in-depth role gate at the layout level.
  // Individual /admin pages also check, but layout-level enforcement
  // means a forgotten check on a new sub-route can't leak.
  if (!isSupervisorLike(profile?.role)) redirect('/dashboard')

  // Fix 2026-05-22: enforceMfa was missing — supervisors hitting /admin
  // directly skipped MFA enrollment. See AUDIT_2026-05-22.md §1B.
  await enforceMfa()

  return (
    <div style={{ minHeight: '100dvh', background: 'var(--bg)' }}>
      <Header user={user} profile={profile} />
      <IdleTimeout timeoutMs={15 * 60 * 1000} />
      <main style={{ padding: '24px', maxWidth: 1400, margin: '0 auto' }}>
        {children}
      </main>
    </div>
  )
}
