import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getWorkrynSession } from '@/lib/workryn/auth'
import { db } from '@/lib/workryn/db'
import WorkrynSidebar from '@/components/workryn/WorkrynSidebar'

/** Map CaseSync role to Workryn role */
function mapRole(csRole?: string): string {
  switch (csRole) {
    case 'supervisor': return 'ADMIN'
    case 'planner': return 'MANAGER'
    default: return 'STAFF'
  }
}

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
  let session = await getWorkrynSession()

  // Auto-provision: if no Workryn user record exists, create one from CaseSync profile
  if (!session) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single()

    try {
      await db.user.create({
        data: {
          supabaseId: user.id,
          email: user.email ?? '',
          name: profile?.full_name ?? user.email ?? '',
          role: mapRole(profile?.role),
          avatarColor: '#6366f1',
          isActive: true,
        },
      })
      // Re-fetch session now that the record exists
      session = await getWorkrynSession()
    } catch (err) {
      // Record may already exist (race condition) — try fetching again
      console.error('[Workryn Layout] Auto-provision failed:', err)
      session = await getWorkrynSession()
    }
  }

  const workrynUser = session?.user ?? {
    id: user.id,
    email: user.email ?? '',
    name: user.email ?? '',
    role: 'STAFF',
    avatarColor: '#6366f1',
    image: null,
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
