import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { createClient as createSupabaseJsClient } from '@supabase/supabase-js'

/**
 * CaseSync — Centralized API Authorization Guard
 *
 * Wraps any API route handler with auth + role validation so individual
 * routes never need to repeat the getUser → getProfile → check role flow.
 *
 * Usage:
 *   import { withAuth } from '@/lib/api-auth'
 *
 *   // Allow any authenticated user
 *   export const GET = withAuth(async (req, ctx) => {
 *     // ctx.user, ctx.profile, ctx.role, ctx.supabase, ctx.admin
 *     return NextResponse.json({ ok: true })
 *   })
 *
 *   // Restrict to specific roles
 *   export const POST = withAuth(
 *     async (req, ctx) => { ... },
 *     { roles: ['supervisor', 'it'] }
 *   )
 *
 *   // Restrict to elevated roles (team_manager, supervisor, it)
 *   export const DELETE = withAuth(
 *     async (req, ctx) => { ... },
 *     { roles: 'elevated' }
 *   )
 */

// ---------- types ----------

export type CaseSyncRole = 'supports_planner' | 'team_manager' | 'supervisor' | 'it'

const ELEVATED_ROLES: CaseSyncRole[] = ['team_manager', 'supervisor', 'it']
const ALL_ROLES: CaseSyncRole[] = ['supports_planner', ...ELEVATED_ROLES]

export interface AuthContext {
  /** The authenticated Supabase user */
  user: { id: string; email?: string }
  /** The user's profile row from the `profiles` table */
  profile: { id: string; role: string; full_name?: string | null }
  /** Shorthand for profile.role */
  role: string
  /** Supabase client authenticated as the user (uses publishable key + cookies) */
  supabase: ReturnType<typeof createSupabaseJsClient>
  /** Supabase admin client (service role) — use only after auth is confirmed */
  admin: ReturnType<typeof createSupabaseJsClient>
}

export interface WithAuthOptions {
  /**
   * Which roles are allowed to access this route.
   * - `CaseSyncRole[]` — explicit list of allowed roles
   * - `'elevated'` — shorthand for team_manager, supervisor, it
   * - `'any'` (default) — any authenticated user with a valid profile
   */
  roles?: CaseSyncRole[] | 'elevated' | 'any'
}

type ApiHandler = (
  req: NextRequest,
  ctx: AuthContext,
  routeCtx?: { params: Record<string, string> }
) => Promise<NextResponse | Response>

// ---------- helpers ----------

function getAllowedRoles(roles: WithAuthOptions['roles']): CaseSyncRole[] {
  if (!roles || roles === 'any') return ALL_ROLES
  if (roles === 'elevated') return ELEVATED_ROLES
  return roles
}

// ---------- withAuth ----------

export function withAuth(handler: ApiHandler, options?: WithAuthOptions) {
  const allowedRoles = getAllowedRoles(options?.roles)

  return async function authedHandler(
    req: NextRequest,
    routeCtx?: { params: Record<string, string> }
  ): Promise<NextResponse | Response> {
    try {
      // 1. Authenticate via Supabase session cookie
      const supabase = await createServerClient()
      const { data: authData, error: authErr } = await supabase.auth.getUser()

      if (authErr || !authData?.user) {
        return NextResponse.json(
          { error: 'Unauthorized' },
          { status: 401 }
        )
      }

      const user = authData.user

      // 2. Fetch the caller's profile (role lives here)
      const { data: profile, error: profileErr } = await supabase
        .from('profiles')
        .select('id, role, full_name')
        .eq('id', user.id)
        .single()

      if (profileErr || !profile) {
        return NextResponse.json(
          { error: 'Profile not found — contact your administrator' },
          { status: 403 }
        )
      }

      // 3. Check role authorization
      const role = String(profile.role ?? '').toLowerCase()
      if (!allowedRoles.includes(role as CaseSyncRole)) {
        return NextResponse.json(
          { error: `Forbidden — role '${role}' does not have access to this resource` },
          { status: 403 }
        )
      }

      // 4. Build the admin client (service role) for queries that need to bypass RLS
      const admin = createSupabaseJsClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
      )

      // 5. Invoke the actual route handler
      const ctx: AuthContext = {
        user: { id: user.id, email: user.email ?? undefined },
        profile: {
          id: profile.id,
          role,
          full_name: profile.full_name ?? null,
        },
        role,
        supabase: supabase as unknown as ReturnType<typeof createSupabaseJsClient>,
        admin,
      }

      return await handler(req, ctx, routeCtx)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Internal server error'
      console.error('[api-auth] Unhandled error:', message)
      return NextResponse.json({ error: message }, { status: 500 })
    }
  }
}