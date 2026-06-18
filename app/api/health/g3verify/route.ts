import { isEntraDbConfigured } from '@/lib/db/azure-token'
import { isAzureConfigured, withRlsContext } from '@/lib/db/azure'

export const dynamic = 'force-dynamic'

/**
 * THROWAWAY Gate-3 production verification probe. DELETE immediately after use.
 *
 * Lives under /api/health (bypasses app-auth via proxy.ts PUBLIC_PATHS) and is
 * guarded by a static ?k= token. Read-only: for each of the four seed users it
 * opens an RLS-scoped connection and reports the DB principal the connection
 * lands on plus the RLS-visible client counts. No writes, no PHI in the output.
 */

const PROBE_TOKEN = 'g3-c68558ae7bb89094342ffd9a'

const SEED_USERS = [
  { role: 'supervisor',  expect: 16, userId: 'ced7dfd5-23c3-4609-b573-c69ac2bca689' },
  { role: 'team_manager', expect: 9, userId: 'b6b4b398-d0a4-4b5b-a6ca-83419b12eccb' },
  { role: 'sp_active',    expect: 3, userId: '51999fb0-691f-4d0e-9140-530948514257' },
  { role: 'sp_disabled',  expect: 0, userId: '179c5b5a-7618-42f7-aeed-3546518e8a63' },
] as const

type ProbeRow = {
  sess_user: string
  cur_user: string
  app_uid: string | null
  cnt_total: number
  cnt_real: number
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  if (searchParams.get('k') !== PROBE_TOKEN) {
    return new Response('Not found', { status: 404 })
  }

  try {
    const results = []
    for (const u of SEED_USERS) {
      const row = await withRlsContext(u.userId, async (sql) => {
        const rows = await sql`
          SELECT session_user AS sess_user,
                 current_user AS cur_user,
                 current_setting('app.user_id', true) AS app_uid,
                 (SELECT count(*)::int FROM clients) AS cnt_total,
                 (SELECT count(*)::int FROM clients WHERE client_classification = 'real') AS cnt_real
        `
        return (rows as unknown as ProbeRow[])[0]
      })
      results.push({
        role: u.role,
        expect: u.expect,
        userId: u.userId,
        sessUser: row?.sess_user,
        curUser: row?.cur_user,
        appUid: row?.app_uid,
        visibleClientsTotal: row?.cnt_total,
        visibleClientsReal: row?.cnt_real,
        match: row?.cnt_total === u.expect,
      })
    }

    return new Response(
      JSON.stringify({ ok: true, entraMode: isEntraDbConfigured(), azureConfigured: isAzureConfigured(), results }, null, 2),
      { headers: { 'Content-Type': 'application/json' } },
    )
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'probe error'
    return new Response(JSON.stringify({ ok: false, error: msg }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }
}
