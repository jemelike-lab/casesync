import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { createClient as createSupabaseJsClient } from '@supabase/supabase-js'
import { checkReadOnly } from '@/lib/read-only'

/**
 * CaseSync — Centralized API Authorization Guard
 *
 * Wraps any API route handler with auth + role validation so individual
 * routes never need to repeat the getUser > getProfile > check role flow.
 *
 * Also enforces read-only mode: when CASESYNC_READ_ONLY=true, all write
 * methods (POST/PUT/PATCH/DELETE) return 503 automatically.
 *
 * Usage:
 *   import { withAuth } from '@/lib/api-auth'
 *
 *   export const GET = withAuth(async (req, ctx) => {
 *     return NextResponse.json({ ok: true })
 *   })
 *
 *   export const POST = withAuth(
 *     async (req, ctx) => { ... },
 *     { roles: ['supervisor', 'it'] }
 *   )
 *
 *   export const DELETE = withAuth(
 *     async (req, ctx) => { ... },
 *     { roles: 'elevated' }
 *   )
 */

// ---------- types ----------

export type CaseSyncRole =
  | 'supports_planner'
  | 'team_manager'
  | 'supervisor'
  | 'it'

const ELEVATED_ROLES: CaseSyncRole[] = ['team_manager', 'supervisor', 'it']
const ALL_ROLES: CaseSyncRole[] = ['supports_planner', ...ELEVATED_ROLES]

export interface AuthContext {
  user: { id: string; email?: string }
  profile: { id: string; role: string; full_name?: string | null }
  role: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  admin: any
}

export interface WithAuthOptions {
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
      // 0. Read-only mode check — block writes before doing any DB work
      const readOnlyBlock = checkReadOnly(req)
      if (readOnlyBlock) return readOnlyBlock

      // 1. Authenticate via Supabase session cookie
      const supabase = await createServerClient()
      const { data: authData, error: authErr } =
        await supabase.auth.getUser()

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
          {
            error: `Forbidden — role '${role}' does not have access to this resource`,
          },
          { status: 403 }
        )
      }

      // 4. Build the admin client (service role) for RLS-bypassing queries
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
        supabase,
        admin,
      }

      return await handler(req, ctx, routeCtx)
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Internal server error'
      console.error('[api-auth] Unhandled error:', message)
      return NextResponse.json({ error: message }, { status: 500 })
    }
  }
}
