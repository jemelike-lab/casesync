import { createClient as createSupabaseJsClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { isSupervisorLike } from '@/lib/roles'
import { promises as fs } from 'fs'
import path from 'path'

export const dynamic = 'force-dynamic'

const BACKUP_DIR = '/opt/casesync-backups'
const VERIFY_LOG = path.join(BACKUP_DIR, 'logs', 'verify.log')

async function getBackupStatus() {
  try {
    const verifyLog = await fs.readFile(VERIFY_LOG, 'utf8')
    const verifyLines = verifyLog
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)

    const latestVerifyLine = verifyLines.at(-1) ?? null

    const backupFiles = (await fs.readdir(BACKUP_DIR))
      .filter((name) => /^casesync-.*\.sql\.gz$/.test(name))
      .sort()

    const latestBackupFile = backupFiles.at(-1) ?? null
    if (!latestBackupFile) {
      return {
        ok: false,
        source: 'vps-backup-verification',
        reason: 'no-backup-artifact-found',
      }
    }

    const latestBackupPath = path.join(BACKUP_DIR, latestBackupFile)
    const stats = await fs.stat(latestBackupPath)
    const sizeBytes = stats.size
    const ageHours = Math.floor((Date.now() - stats.mtimeMs) / (1000 * 60 * 60))

    const latestVerifyOk = latestVerifyLine?.startsWith('OK:') ?? false
    const latestVerifyFail = latestVerifyLine?.startsWith('FAIL:') ?? false

    return {
      ok: latestVerifyOk ? true : latestVerifyFail ? false : null,
      source: 'vps-backup-verification',
      latest_artifact: latestBackupFile,
      latest_artifact_path: latestBackupPath,
      latest_artifact_size_bytes: sizeBytes,
      latest_artifact_age_hours: ageHours,
      last_verified_line: latestVerifyLine,
    }
  } catch (error) {
    return {
      ok: null,
      source: 'vps-backup-verification',
      reason: error instanceof Error ? error.message : 'backup-status-unavailable',
    }
  }
}

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

    const [{ data: countsRow, error: countsError }, backupStatus] = await Promise.all([
      admin
        .from('ops_client_counts')
        .select('active_client_count, real_client_count, trial_client_count, test_client_count')
        .single(),
      getBackupStatus(),
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
      backup_status: backupStatus,
      production_version: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? 'dev',
    }), {
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Internal error'
    return new Response(JSON.stringify({ error: msg }), { status: 500 })
  }
}
