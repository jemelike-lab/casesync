import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getWorkrynSession } from '@/lib/workryn/auth'
import { db } from '@/lib/workryn/db'
import WorkrynSidebar from '@/components/workryn/WorkrynSidebar'
import WorkrynOnboardingTour from '@/components/workryn/WorkrynOnboardingTour'

/**
 * Maps CaseSync profile role → Workryn role.
 * CaseSync roles (from profiles table): supervisor, team_manager, support_planner, it, admin
 */
function mapRole(csRole?: string | null): string {
  switch (csRole?.toLowerCase()) {
    case 'supervisor':       return 'SUPERVISOR'
    case 'it':               return 'ADMIN'
    case 'admin':            return 'ADMIN'
    case 'team_manager':     return 'TEAM_MANAGER'
    case 'support_planner':
    case 'supports_planner': return 'SUPPORT_PLANNER'
    default:                 return 'SUPPORT_PLANNER'
  }
}

export default async function WorkrynLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  let session = await getWorkrynSession()

  // Auto-provision: create w_user from CaseSync profile if missing
  if (!session) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single()

    try {
      await db.user.upsert({
        where: { supabaseId: user.id },
        create: {
          supabaseId: user.id,
          email: user.email ?? '',
          name: profile?.full_name ?? user.email ?? '',
          role: mapRole(profile?.role),
          avatarColor: '#6366f1',
          isActive: true,
        },
        update: {
          // On conflict, update role/name in case they changed in CaseSync
          name: profile?.full_name ?? user.email ?? '',
          role: mapRole(profile?.role),
        },
      })
      session = await getWorkrynSession()
    } catch (err) {
      console.error('[Workryn Layout] Auto-provision failed:', err)
      session = await getWorkrynSession()
    }
  }

  const workrynUser = session?.user ?? {
    id: user.id,
    email: user.email ?? '',
    name: user.email ?? '',
    role: 'SUPPORT_PLANNER',
    avatarColor: '#6366f1',
    image: null,
  }

  return (
    <div className="w-app-shell">
      <WorkrynSidebar user={workrynUser} />
      <main className="w-page-content">
        {children}
      </main>
      <WorkrynOnboardingTour />
    </div>
  )
}
