import { NextResponse } from 'next/server'
import { withRlsContext, isAzureConfigured } from '@/lib/db/azure'
import { createClient as createSupabaseServerClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

/**
 * Phase 3 diagnostic route - proves the direct Azure data path end-to-end.
 *
 * Flow:
 *   1. Resolve the caller from the existing Supabase session (identity source
 *      of truth is unchanged during Phase 3 - only the data read moves).
 *   2. Open a reserved Azure connection scoped to that user via withRlsContext.
 *   3. Run an RLS-filtered read of `clients` and report what the caller sees.
 *
 * Expected: visibleClientCount matches the Supabase path (e.g. 16 for a
 * supervisor). Additive and deletable; alters no existing data path. Only
 * functions where CASESYNC_DATABASE_URL is set (Preview).
 */
export async function GET() {
  if (!isAzureConfigured()) {
    return NextResponse.json(
      {
        ok: false,
        reason:
          'CASESYNC_DATABASE_URL not configured in this environment ' +
          '(expected: only Preview during Phase 3).',
      },
      { status: 503 },
    )
  }

  const supabase = await createSupabaseServerClient()
  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser()

  if (authErr || !user) {
    return NextResponse.json({ ok: false, reason: 'Unauthorized' }, { status: 401 })
  }

  try {
    const result = await withRlsContext(user.id, async (sql) => {
      const sessionInfo = await sql<
        { session_user: string; current_user: string; app_user_id: string }[]
      >`
        SELECT
          session_user        AS session_user,
          current_user        AS current_user,
          current_setting('app.user_id', true) AS app_user_id
      `
      const clientRows = await sql<{ id: string }[]>`
        SELECT id FROM clients ORDER BY id LIMIT 25
      `
      return { sessionInfo: sessionInfo[0], clientRows }
    })

    return NextResponse.json({
      ok: true,
      identity: {
        suppliedUserId: user.id,
        sessionUser: result.sessionInfo?.session_user,
        currentUser: result.sessionInfo?.current_user,
        appUserId: result.sessionInfo?.app_user_id,
      },
      visibleClientCount: result.clientRows.length,
      sampleClientIds: result.clientRows.map((r) => r.id),
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error('[diag/azure-clients] error:', message)
    return NextResponse.json({ ok: false, reason: message }, { status: 500 })
  }
}
