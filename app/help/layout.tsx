import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import Header from '@/components/Header'
import IdleTimeout from '@/components/IdleTimeout'
import YourCaseAI from '@/components/YourCaseAI'

export default async function HelpLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single()

  return (
    <div style={{ minHeight: '100dvh', background: 'var(--bg)' }}>
      <Header user={user} profile={profile} />
      <IdleTimeout timeoutMs={15 * 60 * 1000} />
      <main style={{ padding: '24px', maxWidth: 1400, margin: '0 auto' }}>
        {children}
      </main>
      <YourCaseAI />
    </div>
  )
}
