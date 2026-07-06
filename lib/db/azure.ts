import postgres from 'postgres'
import { getAzureDbToken, isEntraDbConfigured } from './azure-token'

/**
 * Direct Azure Postgres connection for CaseSync (Phase 3 data layer).
 *
 * Two auth modes, selected at runtime:
 *
 *  1. Entra federated token (preferred — the pre-PHI gate). We connect as the
 *     dedicated principal `casesync-db-client` using a short-lived access token
 *     (no stored secret). The token is supplied per-connection via a `password`
 *     callback that returns the cached, auto-refreshing Entra token, so the pool
 *     is a long-lived module singleton — reused across requests rather than built
 *     and torn down per request.
 *
 *  2. Long-lived password (interim, test data only). When CASESYNC_DATABASE_URL
 *     is present we connect as `casesync_app` (NOINHERIT, RLS-bound). Singleton.
 *
 * Either way RLS is preserved via the `auth.uid()` shim: every unit of work runs
 * `SET ROLE authenticated` + `set_config('app.user_id', <uuid>)` on a RESERVED
 * connection, and resets in `finally` so identity can never leak to the next
 * request that borrows that pooled connection.
 *
 * Connection target is env-tunable (CASESYNC_DB_PORT / CASESYNC_DB_POOL_MAX) so
 * the server-side pooler (port 6432) can be adopted later without a code change.
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

// --- Mode 1: Entra warm pool ----------------------------------------------------
// One long-lived pool per warm instance. New connections authenticate with the
// cached Entra token via the `password` callback (so they always pick up a
// freshly-refreshed token), and are recycled via max_lifetime well within the
// token's ~1h life. Reused across requests: no per-request Entra mint and no
// per-request connect/teardown — the two things that prevented the data plane
// from scaling under concurrency.
let _entraSql: postgres.Sql | null = null

function getEntraSql(): postgres.Sql {
  if (!_entraSql) {
    _entraSql = postgres({
      host: process.env.CASESYNC_DB_HOST!,
      port: Number(process.env.CASESYNC_DB_PORT ?? 5432),
      database: process.env.CASESYNC_DB_NAME!,
      username: process.env.CASESYNC_DB_ENTRA_USER!,
      // Resolved per new connection -> always the current cached token.
      password: () => getAzureDbToken(),
      ssl: 'require',
      prepare: false,
      max: Number(process.env.CASESYNC_DB_POOL_MAX ?? 8),
      idle_timeout: 30,
      max_lifetime: 60 * 30, // recycle every 30 min, comfortably inside token life
      connect_timeout: 15,
      types: DATE_AS_STRING,
    })
  }
  return _entraSql
}

/**
 * Run `fn` against a RESERVED connection scoped to the given user's identity,
 * exactly as the RLS policies expect. SET ROLE authenticated + app.user_id so
 * context cannot leak to other pooled requests; role/context reset and the
 * connection released in `finally` even if `fn` throws. The pool itself is a
 * warm singleton and is never ended here.
 */
async function runReserved<T>(
  sql: postgres.Sql,
  userId: string,
  fn: (sql: postgres.Sql) => Promise<T>,
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
  }
}

/**
 * Run `fn` against a connection scoped to the given user's identity. Prefers the
 * Entra federated-token path (no stored secret) when configured, otherwise the
 * long-lived-password singleton. Both are warm pools reused across requests.
 */
export async function withRlsContext<T>(
  userId: string,
  fn: (sql: postgres.Sql) => Promise<T>,
): Promise<T> {
  if (!userId) {
    throw new Error('withRlsContext requires a non-empty userId')
  }
  const sql = isEntraDbConfigured() ? getEntraSql() : getSql()
  return runReserved(sql, userId, fn)
}

/**
 * Run `fn` on a RESERVED connection under the INSERT-only `casesync_audit`
 * role — the Entra-era audit write path (the dedicated `casesync_audit`
 * password login died with the 2026-06-28 Entra-only cutover; the role
 * survives as a NOLOGIN group role granted to the connecting principals).
 * Deliberately sets NO app.user_id: audit rows may have no acting user
 * (auth.failed, denied access). RESET ROLE in `finally` so the audit role
 * can never leak to the next pooled request.
 */
export async function withAuditRole<T>(
  fn: (sql: postgres.Sql) => Promise<T>,
): Promise<T> {
  const sql = isEntraDbConfigured() ? getEntraSql() : getSql()
  const reserved = await sql.reserve()
  try {
    await reserved`SET ROLE casesync_audit`
    return await fn(reserved as unknown as postgres.Sql)
  } finally {
    try {
      await reserved`RESET ROLE`
    } catch {
      // If reset fails the connection is suspect; release still runs below.
    }
    reserved.release()
  }
}

/**
 * Identity-shim write path — Azure `profiles` upserts ONLY (lib/db/identity-sync).
 * Runs as the raw connection principal with NO role switch and NO app.user_id:
 * profile mirroring must succeed regardless of who (if anyone) is signed in —
 * invite acceptance runs before the new user can pass any RLS check. Relies on
 * the principal's table privileges / owner standing while FORCE ROW LEVEL
 * SECURITY is not yet enabled on the PHI plane.
 * COUPLING: the queued FORCE-RLS hardening pass MUST ship a SECURITY DEFINER
 * sync_user_identity() in the same csadmin session and repoint this helper,
 * or identity sync goes dark. Never use this for client/PHI tables.
 */
export async function withIdentityShimWrite<T>(
  fn: (sql: postgres.Sql) => Promise<T>,
): Promise<T> {
  const sql = isEntraDbConfigured() ? getEntraSql() : getSql()
  const reserved = await sql.reserve()
  try {
    return await fn(reserved as unknown as postgres.Sql)
  } finally {
    reserved.release()
  }
}

/**
 * Health probe: confirms a connection can be made and a trivial query succeeds.
 * Does NOT set any RLS context. Diagnostics only. Honors the same mode selection
 * and reuses the warm pool.
 */
export async function azurePing(): Promise<{ ok: boolean; serverVersion?: string }> {
  const run = async (sql: postgres.Sql) => {
    const rows = await sql<{ server_version: string }[]>`
      SELECT current_setting('server_version') AS server_version
    `
    return { ok: true, serverVersion: rows[0]?.server_version }
  }
  const sql = isEntraDbConfigured() ? getEntraSql() : getSql()
  return run(sql)
}

/** True when either the Entra path or the password path is configured. */
export function isAzureConfigured(): boolean {
  return isEntraDbConfigured() || Boolean(CONNECTION_STRING)
}
