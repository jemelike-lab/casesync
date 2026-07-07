import { NextResponse } from 'next/server'
import { createClient as createSupabaseAdminClient } from '@supabase/supabase-js'
import { withAuth } from '@/lib/api-auth'
import { isAzureConfigured, withRlsContext } from '@/lib/db/azure'

export const dynamic = 'force-dynamic'

/**
 * GET /api/admin/identity-status — read-only observability for the Azure
 * identity shim (2026-07-06 launch finding). For every Supabase profile,
 * reports how the PHI data plane resolves that user under their OWN RLS
 * context: whether their shim row is visible, what current_user_role()
 * returns, and how many active clients their scope exposes. Counts only —
 * no PHI in the response. Supervisor-like only; safe to call any time.
 *
 * v2 (2026-07-06 evening): adds an `env` diagnostic block captured from
 * INSIDE the app's own RLS-scoped connection — current_user, search_path,
 * what unqualified `profiles` resolves to, role membership — plus
 * per-statement error capture, so identity failures can be localized
 * without out-of-band psql reproductions (which proved unfaithful: login
 * role settings like search_path are NOT re-applied by SET ROLE).
 */

type Probe = Record<string, unknown>

async function tryQuery(
  sql: (strings: TemplateStringsArray, ...args: unknown[]) => Promise<unknown>,
  label: string,
  out: Probe,
  q: () => Promise<unknown>,
): Promise<void> {
  try {
    out[label] = await q()
  } catch (err) {
    out[label] = `ERR: ${err instanceof Error ? err.message : String(err)}`
  }
}

export const GET = withAuth(
  async () => {
    if (!isAzureConfigured()) {
      return NextResponse.json({ error: 'Azure data plane is not configured' }, { status: 400 })
    }
    const admin = createSupabaseAdminClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    )
    const { data: profiles, error } = await admin
      .from('profiles')
      .select('id, full_name, role')
      .order('created_at', { ascending: true })
    if (error || !profiles) {
      return NextResponse.json({ error: error?.message ?? 'Could not read profiles' }, { status: 500 })
    }

    let env: Probe | null = null
    const statuses = []
    for (const p of profiles) {
      const probe: Probe = {
        id: p.id,
        full_name: p.full_name,
        supabase_role: p.role,
      }
      try {
        await withRlsContext(p.id, async (sql) => {
          const s = sql as unknown as (
            strings: TemplateStringsArray,
            ...args: unknown[]
          ) => Promise<Record<string, unknown>[]>

          // One-time environment snapshot from inside the app connection.
          if (!env) {
            const e: Probe = {}
            await tryQuery(s, 'who', e, async () => {
              const r = await s`SELECT current_user::text AS cu, session_user::text AS su`
              return r[0]
            })
            await tryQuery(s, 'search_path', e, async () => {
              const r = await s`SELECT current_setting('search_path') AS sp`
              return r[0]?.sp
            })
            await tryQuery(s, 'profiles_resolves_to', e, async () => {
              const r = await s`SELECT 'profiles'::regclass::text AS t`
              return r[0]?.t
            })
            await tryQuery(s, 'clients_resolves_to', e, async () => {
              const r = await s`SELECT 'clients'::regclass::text AS t`
              return r[0]?.t
            })
            await tryQuery(s, 'session_user_is_authenticated_member', e, async () => {
              const r = await s`SELECT pg_has_role(session_user, 'authenticated', 'member') AS m`
              return r[0]?.m
            })
            env = e
          }

          await tryQuery(s, 'auth_uid', probe, async () => {
            const r = await s`SELECT auth.uid()::text AS u`
            return r[0]?.u
          })
          await tryQuery(s, 'azure_resolved_role', probe, async () => {
            const r = await s`SELECT public.current_user_role() AS role`
            return r[0]?.role ?? null
          })
          await tryQuery(s, 'role_via_unqualified_profiles', probe, async () => {
            const r = await s`SELECT role FROM profiles WHERE id = auth.uid()`
            return r[0]?.role ?? null
          })
          await tryQuery(s, 'role_via_public_profiles', probe, async () => {
            const r = await s`SELECT role FROM public.profiles WHERE id = auth.uid()`
            return r[0]?.role ?? null
          })
          await tryQuery(s, 'azure_shim_row_visible', probe, async () => {
            const r = await s`SELECT EXISTS(SELECT 1 FROM profiles WHERE id = auth.uid()) AS present`
            return Boolean(r[0]?.present)
          })
          await tryQuery(s, 'clients_visible', probe, async () => {
            const r = await s`SELECT count(*)::int AS n FROM clients WHERE is_active = true`
            return r[0]?.n ?? 0
          })
        })
        probe.probe_error = null
      } catch (err) {
        probe.probe_error = err instanceof Error ? err.message : String(err)
      }
      statuses.push(probe)
    }
    return NextResponse.json({ total: statuses.length, env, statuses })
  },
  { roles: ['supervisor', 'it', 'administrator'] },
)
