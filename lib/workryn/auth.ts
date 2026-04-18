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
}

export interface WorkrynSession {
  user: WorkrynUser
}

/**
 * Server-side: get the current Workryn session.
 * Returns null if not authenticated or no Workryn user record exists.
 */
export async function getWorkrynSession(): Promise<WorkrynSession | null> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  // Look up the Workryn user record linked to this Supabase user
  const wUser = await db.user.findUnique({
    where: { supabaseId: user.id },
    include: { department: true },
  })

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
