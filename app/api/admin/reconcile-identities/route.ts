import { NextResponse } from 'next/server'
import { createClient as createSupabaseAdminClient } from '@supabase/supabase-js'
import { withAuth } from '@/lib/api-auth'
import { isAzureConfigured } from '@/lib/db/azure'
import { upsertAzureIdentity } from '@/lib/db/identity-sync'

export const dynamic = 'force-dynamic'

/**
 * POST /api/admin/reconcile-identities \u2014 mirror every Supabase profile into
 * the Azure identity shim (idempotent upserts). Fixes accumulated drift: any
 * user accepted or changed since the 2026-06-28 cutover has no Azure profiles
 * row, resolves to role NULL under current_user_role(), and sees zero rows on
 * the PHI data plane. Elevated-only; safe to re-run any time.
 */
export const POST = withAuth(
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
      .select('id, full_name, role, team_manager_id')
    if (error || !profiles) {
      return NextResponse.json({ error: error?.message ?? 'Could not read profiles' }, { status: 500 })
    }
    const failed: string[] = []
    for (const p of profiles) {
      const ok = await upsertAzureIdentity(p)
      if (!ok) failed.push(p.id)
    }
    console.log(`[reconcile-identities] total=${profiles.length} synced=${profiles.length - failed.length} failed=${failed.length}`)
    return NextResponse.json({ total: profiles.length, synced: profiles.length - failed.length, failed })
  },
  { roles: ['supervisor', 'it', 'administrator'] },
)
