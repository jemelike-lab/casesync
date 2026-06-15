import postgres from 'postgres'
import { getAzureDbToken, isEntraDbConfigured } from './azure-token'

/**
 * Direct Azure Postgres connection for CaseSync (Phase 3 data layer).
 *
 * Two auth modes, selected at runtime:
 *
 *  1. Entra federated token (preferred — the pre-PHI gate). When the Entra env
 *     vars are present we connect as the dedicated principal `casesync-db-client`
 *     using a short-lived access token (no stored secret). The token is minted
 *     per-request from the Vercel OIDC token, so the client is built per-request
 *     rather than as a module singleton.
 *
 *  2. Long-lived password (interim, test data only). When CASESYNC_DATABASE_URL
 *     is present we connect as `casesync_app` (NOINHERIT, RLS-bound). Singleton.
 *
 * Either way RLS is preserved via the `auth.uid()` shim: every unit of work runs
 * `SET ROLE authenticated` + `set_config('app.user_id', <uuid>)` on a RESERVED
 * connection, and resets in `finally`. Production has NEITHER configured, so the
 * Azure path stays dormant there and the route falls back to Supabase.
 */

const CONNECTION_STRING = process.env.CASESYNC_DATABASE_URL

// Shared porsager type override: make date/timestamp columns come back as raw
// 'YYYY-MM-DD' strings (PostgREST parity) instead of JS Date objects, which the
// @/lib/types helpers (.split('-')) require.
const DATE_AS_STRING = {
  date: {
    to: 1184,
    from: [1082, 1083, 1114, 1184],
    serialize: (v: string) => v,
    parse: (v: string) => v,
  },
}

// --- Mode 2: password singleton (CASESYNC_DATABASE_URL) -------------------------
let _sql: postgres.Sql | null = null

function getSql(): postgres.Sql {
  if (!CONNECTION_STRING) {
    throw new Error(
      'CASESYNC_DATABASE_URL is not set and Entra DB auth is not configured.',
    )
  }
  if (!_sql) {
    _sql = postgres(CONNECTION_STRING, {
      max: 3,
      idle_timeout: 20,
      connect_timeout: 10,
      ssl: 'require',
      prepare: false,
      types: DATE_AS_STRING,
    })
  }
  return _sql
}

// --- Mode 1: Entra per-request client -------------------------------------------
// Built fresh per request because the access token is short-lived and derived
// from the request-scoped Vercel OIDC token. Small pool; ended after the unit of
// work so nothing outlives the request.
function buildEntraClient(token: string): postgres.Sql {
  return postgres({
    host: process.env.CASESYNC_DB_HOST!,
    port: 5432,
    database: process.env.CASESYNC_DB_NAME!,
    username: process.env.CASESYNC_DB_ENTRA_USER!,
    password: token,
    ssl: 'require',
    prepare: false,
    max: 2,
    idle_timeout: 20,
    connect_timeout: 10,
    types: DATE_AS_STRING,
  })
}

/**
 * Run `fn` against a RESERVED connection scoped to the given user's identity,
 * exactly as the RLS policies expect. SET ROLE authenticated + app.user_id so
 * context cannot leak to other pooled requests; role/context reset and the
 * connection released in finally even if `fn` throws. When `endAfter` is true
 * (Entra per-request client) the pool is closed afterwards.
 */
async function runReserved<T>(
  sql: postgres.Sql,
  userId: string,
  fn: (sql: postgres.Sql) => Promise<T>,
  endAfter: boolean,
): Promise<T> {
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
    if (endAfter) {
      try {
        await sql.end({ timeout: 5 })
      } catch {
        // best-effort teardown of the per-request pool
      }
    }
  }
}

/**
 * Run `fn` against a connection scoped to the given user's identity. Prefers the
 * Entra federated-token path (no stored secret) when configured, otherwise the
 * long-lived-password singleton.
 */
export async function withRlsContext<T>(
  userId: string,
  fn: (sql: postgres.Sql) => Promise<T>,
): Promise<T> {
  if (!userId) {
    throw new Error('withRlsContext requires a non-empty userId')
  }
  if (isEntraDbConfigured()) {
    const token = await getAzureDbToken()
    const sql = buildEntraClient(token)
    return runReserved(sql, userId, fn, true)
  }
  return runReserved(getSql(), userId, fn, false)
}

/**
 * Health probe: confirms a connection can be made and a trivial query succeeds.
 * Does NOT set any RLS context. Diagnostics only. Honors the same mode selection.
 */
export async function azurePing(): Promise<{ ok: boolean; serverVersion?: string }> {
  const run = async (sql: postgres.Sql) => {
    const rows = await sql<{ server_version: string }[]>`
      SELECT current_setting('server_version') AS server_version
    `
    return { ok: true, serverVersion: rows[0]?.server_version }
  }
  if (isEntraDbConfigured()) {
    const token = await getAzureDbToken()
    const sql = buildEntraClient(token)
    try {
      return await run(sql)
    } finally {
      try {
        await sql.end({ timeout: 5 })
      } catch {
        // best-effort teardown
      }
    }
  }
  return run(getSql())
}

/** True when either the Entra path or the password path is configured. */
export function isAzureConfigured(): boolean {
  return isEntraDbConfigured() || Boolean(CONNECTION_STRING)
}
