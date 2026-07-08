import { redirect } from 'next/navigation'
import { enforceMfa } from '@/lib/enforce-mfa'
import { createClient as createServerClient } from '@/lib/supabase/server'
import Header from '@/components/Header'

export default async function ProfileLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  await enforceMfa()
  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single()
  return (
    <div style={{ minHeight: '100dvh', background: 'var(--bg)' }}>
      <Header user={user} profile={profile} />
      <main style={{ padding: '24px', maxWidth: 1400, margin: '0 auto' }}>
        {children}
      </main>
    </div>
  )
}
