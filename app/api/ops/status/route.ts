import { createClient as createSupabaseJsClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { isSupervisorLike } from '@/lib/roles'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const supabase = await createServerClient()
    const { data: authData, error: authErr } = await supabase.auth.getUser()

    if (authErr || !authData?.user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })
    }

    const userId = authData.user.id

    const { data: profile, error: profileErr } = await supabase
      .from('profiles')
      .select('id, role')
      .eq('id', userId)
      .single()

    if (profileErr || !profile || !(profile.role === 'team_manager' || isSupervisorLike(String(profile.role ?? '')))) {
      return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403 })
    }

    const admin = createSupabaseJsClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    const [{ data: countsRow, error: countsError }, { data: backupRow, error: backupError }] = await Promise.all([
      admin
        .from('ops_client_counts')
        .select('active_client_count, real_client_count, trial_client_count, test_client_count')
        .single(),
      admin
        .from('ops_backup_status')
        .select('ok, source, latest_artifact, latest_artifact_path, latest_artifact_size_bytes, latest_artifact_age_hours, last_verified_line, checked_at, updated_at')
        .eq('key', 'casesync-db-backup')
        .single(),
    ])

    if (countsError) {
      return new Response(JSON.stringify({ error: countsError.message }), { status: 500 })
    }

    const activeClientCount = Number(countsRow?.active_client_count ?? 0)
    const realClientCount = Number(countsRow?.real_client_count ?? 0)
    const trialClientCount = Number(countsRow?.trial_client_count ?? 0)
    const testClientCount = Number(countsRow?.test_client_count ?? 0)

    return new Response(JSON.stringify({
      active_client_count: activeClientCount,
      real_client_count: realClientCount,
      trial_client_count: trialClientCount,
      test_client_count: testClientCount,
      milestone_status: {
        target: 15,
        reached: realClientCount >= 15,
        remaining: Math.max(0, 15 - realClientCount),
      },
      backup_status: backupError
        ? {
            ok: null,
            source: 'ops-backup-status-read-failed',
            reason: backupError.message,
          }
        : backupRow ?? {
            ok: null,
            source: 'pending-vps-sync',
          },
      production_version: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? 'dev',
    }), {
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Internal error'
    return new Response(JSON.stringify({ error: msg }), { status: 500 })
  }
}
