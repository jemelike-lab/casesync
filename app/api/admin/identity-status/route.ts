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
 */
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
    const statuses = []
    for (const p of profiles) {
      let resolvedRole: string | null = null
      let clientsVisible: number | null = null
      let shimRowVisible = false
      let probeError: string | null = null
      try {
        await withRlsContext(p.id, async (sql) => {
          const roleRows = (await sql`SELECT public.current_user_role() AS role`) as unknown as { role: string | null }[]
          resolvedRole = roleRows[0]?.role ?? null
          const existRows = (await sql`SELECT EXISTS(SELECT 1 FROM profiles WHERE id = auth.uid()) AS present`) as unknown as { present: boolean }[]
          shimRowVisible = Boolean(existRows[0]?.present)
          const countRows = (await sql`SELECT count(*)::int AS n FROM clients WHERE is_active = true`) as unknown as { n: number }[]
          clientsVisible = countRows[0]?.n ?? 0
        })
      } catch (err) {
        probeError = err instanceof Error ? err.message : String(err)
      }
      statuses.push({
        id: p.id,
        full_name: p.full_name,
        supabase_role: p.role,
        azure_resolved_role: resolvedRole,
        azure_shim_row_visible: shimRowVisible,
        clients_visible: clientsVisible,
        probe_error: probeError,
      })
    }
    return NextResponse.json({ total: statuses.length, statuses })
  },
  { roles: ['supervisor', 'it', 'administrator'] },
)
