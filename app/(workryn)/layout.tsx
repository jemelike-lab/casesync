import { redirect } from 'next/navigation'
import { GeistSans } from 'geist/font/sans'
import { createClient } from '@/lib/supabase/server'
import { enforceMfa } from '@/lib/enforce-mfa'
import { getWorkrynSession } from '@/lib/workryn/auth'
import { mapCaseSyncRoleToWorkryn } from '@/lib/workryn/permissions'
import { db } from '@/lib/workryn/db'
import WorkrynSidebar from '@/components/workryn/WorkrynSidebar'
import WorkrynOnboardingTour from '@/components/workryn/WorkrynOnboardingTour'
import OfflineBanner from '@/components/workryn/OfflineBanner'
import WorkrynMantineProvider from '@/components/workryn/WorkrynMantineProvider'
import AuroraBackground from '@/components/workryn/AuroraBackground'

// Mantine core styles — scoped to /w/* routes via this route group layout.
// CaseSync routes never import these, so the existing app shell is unaffected.
import '@mantine/core/styles.css'
import '@mantine/notifications/styles.css'
import '@mantine/dates/styles.css'
import '@mantine/charts/styles.css'

// Aurora shell aesthetic — fixed gradient bg + per-route accent vars.
import './aurora.css'

/**
 * Maps CaseSync profile role → Workryn role.
 * CaseSync roles (from profiles table): supervisor, team_manager, support_planner, it, admin
 */
const mapRole = mapCaseSyncRoleToWorkryn

export default async function WorkrynLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Enforce MFA for all roles (HIPAA compliance)
  await enforceMfa()

  // Wrap the session lookup + auto-provision in one guard so any DB hiccup
  // degrades to the fallback user below instead of crashing the layout (which
  // would 500 every /w/* route before the page's own guard could run).
  let session: Awaited<ReturnType<typeof getWorkrynSession>> = null
  try {
    session = await getWorkrynSession()

    // Auto-provision: create w_user from CaseSync profile if missing
    if (!session) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single()

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
    }
  } catch (err) {
    console.error('[Workryn Layout] session/auto-provision failed:', err)
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
    <WorkrynMantineProvider>
      <div className={`w-app-shell ${GeistSans.variable}`}>
        <AuroraBackground />
        <WorkrynSidebar user={workrynUser} />
        <main className="w-page-content">
          {children}
        </main>
        <WorkrynOnboardingTour />
        <OfflineBanner />
      </div>
    </WorkrynMantineProvider>
  )
}
