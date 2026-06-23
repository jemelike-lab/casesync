/**
 * Workryn Auth Adapter
 * 
 * Bridges CaseSync's Supabase auth to the session shape Workryn components expect.
 * Workryn pages used NextAuth's `getServerSession()` which returned:
 *   session.user.id, .email, .name, .role, .departmentId, .departmentName, .jobTitle, .avatarColor, .image
 * 
 * This adapter reads Supabase auth + queries the workryn_users table to produce the same shape.
 */

import { createClient } from '@/lib/supabase/server'
import { db } from '@/lib/workryn/db'

export interface WorkrynUser {
  id: string
  email: string
  name: string
  role: string
  departmentId?: string
  departmentName?: string
  jobTitle?: string
  avatarColor: string
  image: string | null
  createdAt?: string // hire date
}

export interface WorkrynSession {
  user: WorkrynUser
}

/**
 * Server-side: get the current Workryn session.
 * Auto-provisions a w_user record if the CaseSync user doesn't have one yet.
 */
export async function getWorkrynSession(): Promise<WorkrynSession | null> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  // Look up the Workryn user record linked to this Supabase user
  let wUser = await db.user.findUnique({
    where: { supabaseId: user.id },
    include: { department: true },
  })

  // ── Auto-provision: create w_user from CaseSync profile if missing ──
  if (!wUser) {
    try {
      const { data: profile } = await supabase
        .from('profiles')
        .select('id, full_name, role, job_title, created_at')
        .eq('id', user.id)
        .single()

      if (profile) {
        // Map CaseSync role → Workryn role.
        // Mapping is intentional and must match lib/workryn/permissions.ts
        // role hierarchy (OWNER=6, SUPERVISOR=5, ADMIN=4, MANAGER=3, STAFF=2):
        //   supervisor     → SUPERVISOR (full access in Workryn)
        //   it             → ADMIN      (full admin, cannot create SUPERVISOR/OWNER)
        //   team_manager   → MANAGER    (team management)
        //   supports_planner → STAFF    (own data only)
        // Fix 2026-05-22: supervisor previously mapped to ADMIN, which gave
        // CaseSync supervisors *less* privilege in Workryn than they should
        // have had. See AUDIT_2026-05-22.md §2B.
        const roleMap: Record<string, string> = {
          supervisor: 'SUPERVISOR',
          team_manager: 'MANAGER',
          supports_planner: 'STAFF',
          it: 'IT',
        }
        const wRole = roleMap[profile.role] ?? 'STAFF'

        // Generate a random avatar color
        const colors = ['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#06b6d4', '#ef4444', '#14b8a6']
        const avatarColor = colors[Math.floor(Math.random() * colors.length)]

        wUser = await db.user.create({
          data: {
            supabaseId: user.id,
            name: profile.full_name ?? user.user_metadata?.full_name ?? user.email ?? 'Unnamed',
            email: user.email ?? null,
            role: wRole,
            jobTitle: profile.job_title ?? (profile.role === 'supports_planner' ? 'Support Planner' : undefined),
            avatarColor,
            isActive: true,
            // Use CaseSync profile creation date as hire date
            createdAt: profile.created_at ? new Date(profile.created_at) : new Date(),
          },
          include: { department: true },
        })

        console.log(`[Workryn] Auto-provisioned user: ${wUser.name} (${wUser.email}) role=${wUser.role} from CaseSync profile ${profile.id}`)
      }
    } catch (err) {
      console.error('[Workryn] Auto-provision failed:', err)
    }
  }

  if (!wUser || !wUser.isActive) return null

  return {
    user: {
      id: wUser.id,
      email: wUser.email ?? user.email ?? '',
      name: wUser.name ?? user.user_metadata?.full_name ?? user.email ?? '',
      role: wUser.role,
      departmentId: wUser.departmentId ?? undefined,
      departmentName: wUser.department?.name ?? undefined,
      jobTitle: wUser.jobTitle ?? undefined,
      avatarColor: wUser.avatarColor,
      image: wUser.image ?? null,
      createdAt: wUser.createdAt?.toISOString(),
    },
  }
}

/**
 * API route helper: get session or return 401.
 * Usage in route handlers:
 *   const session = await requireWorkrynSession()
 *   if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
 */
export async function requireWorkrynSession(): Promise<WorkrynSession | null> {
  return getWorkrynSession()
}
