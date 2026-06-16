import postgres from 'postgres'

/**
 * Dedicated audit-log writer connection for Azure (Phase 3 — audit option 1).
 *
 * `audit_logs` must capture events the acting user cannot see under RLS
 * (denied-access attempts) and events with NO user at all (auth.failed,
 * unauthenticated hits). The app's normal Azure path (`withRlsContext`) is
 * `authenticated`-only and RLS-scoped, so it cannot serve those — and it throws
 * on an empty userId, which would silently drop null-user audit rows.
 *
 * This module connects as the dedicated `casesync_audit` login, which holds
 * INSERT-only on `audit_logs` via a scoped policy (`TO casesync_audit WITH
 * CHECK (true)`) and has no SELECT/UPDATE/DELETE — preserving append-only,
 * tamper-resistant semantics, mirroring the service-role intent of the Supabase
 * path. It is deliberately NOT RLS-scoped: no SET ROLE / app.user_id.
 *
 * Prod-inert: dormant until CASESYNC_AUDIT_DATABASE_URL is set. Production has
 * it unset, so auditLog() falls back to the Supabase service-role client.
 */

const AUDIT_CONNECTION_STRING = process.env.CASESYNC_AUDIT_DATABASE_URL

let _auditSql: postgres.Sql | null = null

function getAuditSql(): postgres.Sql {
  if (!AUDIT_CONNECTION_STRING) {
    throw new Error('CASESYNC_AUDIT_DATABASE_URL is not set')
  }
  if (!_auditSql) {
    _auditSql = postgres(AUDIT_CONNECTION_STRING, {
      max: 2,
      idle_timeout: 20,
      connect_timeout: 10,
      ssl: 'require',
      prepare: false,
    })
  }
  return _auditSql
}

/** True when the dedicated Azure audit-writer connection is configured. */
export function isAzureAuditConfigured(): boolean {
  return Boolean(AUDIT_CONNECTION_STRING)
}

/**
 * Run `fn` against the dedicated audit-writer connection. No RLS context is set
 * — the connection authenticates as `casesync_audit`, which is permitted to
 * INSERT (and only INSERT) into audit_logs regardless of the acting user.
 */
export async function withAuditWriter<T>(fn: (sql: postgres.Sql) => Promise<T>): Promise<T> {
  return fn(getAuditSql())
}
