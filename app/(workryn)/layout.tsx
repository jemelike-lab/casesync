import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getWorkrynSession } from '@/lib/workryn/auth'
import WorkrynSidebar from '@/components/workryn/WorkrynSidebar'

export default async function WorkrynLayout({
  children,
}: {
  children: React.ReactNode
}) {
  // Check Supabase auth
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Get Workryn session (maps Supabase user to Workryn user record)
  const session = await getWorkrynSession()

  // If no Workryn user record exists yet, we'll auto-provision one
  // For now, create a fallback from the Supabase profile
  let workrynUser = session?.user
  if (!workrynUser) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single()

    workrynUser = {
      id: user.id,
      email: user.email ?? '',
      name: profile?.full_name ?? user.email ?? '',
      role: 'STAFF',
      avatarColor: '#6366f1',
      image: null,
    }
  }

  return (
    <div className="w-app-shell">
      <WorkrynSidebar user={workrynUser} />
      <main className="w-page-content">
        {children}
      </main>
    </div>
  )
}
