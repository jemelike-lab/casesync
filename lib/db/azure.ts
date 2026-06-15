import postgres from 'postgres'

/**
 * Direct Azure Postgres connection for CaseSync (Phase 3 data layer).
 *
 * This is the migration target connection: the app connects as the
 * dedicated `casesync_app` login (NOINHERIT, RLS-bound, no admin role).
 * Identity is supplied per-request via `withRlsContext`, which mirrors the
 * Supabase implicit-JWT context using the `auth.uid()` compatibility shim:
 *   SET ROLE authenticated; SET app.user_id = '<uuid>'
 *
 * The connection string lives in CASESYNC_DATABASE_URL (Vercel env, Preview
 * scope during Phase 3, Sensitive). It is intentionally ABSENT in Production
 * until the Phase 5 Entra-token-auth gate is cleared, so any accidental
 * production use fails closed rather than connecting with a long-lived
 * password against real PHI.
 */

const CONNECTION_STRING = process.env.CASESYNC_DATABASE_URL

// Lazily-initialised singleton so the module can be imported in environments
// where the var is absent (e.g. production) without throwing at import time.
let _sql: postgres.Sql | null = null

function getSql(): postgres.Sql {
  if (!CONNECTION_STRING) {
    throw new Error(
      'CASESYNC_DATABASE_URL is not set. The direct Azure data path is only ' +
        'wired for Preview deployments during Phase 3.',
    )
  }
  if (!_sql) {
    _sql = postgres(CONNECTION_STRING, {
      max: 3,
      idle_timeout: 20,
      connect_timeout: 10,
      ssl: 'require',
      prepare: false,
      // porsager returns date/timestamp columns as JS Date objects by default,
      // whereas PostgREST (the Supabase path) returns them as strings and the
      // helpers in @/lib/types call .split('-') on them. Parse the date/time OIDs
      // as the raw wire string so the Azure path is drop-in compatible
      // (a `date` column -> 'YYYY-MM-DD', exactly matching PostgREST).
      types: {
        date: {
          to: 1184,
          from: [1082, 1083, 1114, 1184],
          serialize: (v: string) => v,
          parse: (v: string) => v,
        },
      },
    })
  }
  return _sql
}

/**
 * Run `fn` against a connection scoped to the given user's identity, exactly
 * as the RLS policies expect. Uses a RESERVED connection so the SET ROLE /
 * app.user_id context cannot leak to other pooled requests. Role is reset and
 * the connection released in finally even if `fn` throws.
 */
export async function withRlsContext<T>(
  userId: string,
  fn: (sql: postgres.Sql) => Promise<T>,
): Promise<T> {
  if (!userId) {
    throw new Error('withRlsContext requires a non-empty userId')
  }

  const sql = getSql()
  const reserved = await sql.reserve()
  try {
    await reserved`SET ROLE authenticated`
    await reserved`SELECT set_config('app.user_id', ${userId}, false)`
    return await fn(reserved as unknown as postgres.Sql)
  } finally {
    try {
      await reserved`SELECT set_config('app.user_id', '', false)`
      await reserved`RESET ROLE`
    } catch {
      // If reset fails the connection is suspect; release still runs below.
    }
    reserved.release()
  }
}

/**
 * Health probe: confirms the connection string is present and a trivial query
 * succeeds. Does NOT set any RLS context. Diagnostics only.
 */
export async function azurePing(): Promise<{ ok: boolean; serverVersion?: string }> {
  const sql = getSql()
  const rows = await sql<{ server_version: string }[]>`
    SELECT current_setting('server_version') AS server_version
  `
  return { ok: true, serverVersion: rows[0]?.server_version }
}

export function isAzureConfigured(): boolean {
  return Boolean(CONNECTION_STRING)
}
