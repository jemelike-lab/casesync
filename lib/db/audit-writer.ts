import postgres from 'postgres'
import { isAzureConfigured, withAuditRole } from '@/lib/db/azure'

/**
 * Audit-log writer for the Azure PHI plane (Entra-era design, 2026-07-04).
 *
 * `audit_logs` must capture events the acting user cannot see under RLS
 * (denied-access attempts) and events with NO user at all (auth.failed,
 * unauthenticated hits). The app's normal Azure path (`withRlsContext`) is
 * `authenticated`-only and RLS-scoped, so it cannot serve those — and it
 * throws on an empty userId, which would silently drop null-user audit rows.
 *
 * History: "audit option 1" connected as a dedicated PASSWORD login
 * (`casesync_audit`) via CASESYNC_AUDIT_DATABASE_URL. The 2026-06-28
 * Entra-only cutover disabled password auth server-wide, which silently
 * killed every prod audit write ("[audit] Failed to write audit log" on all
 * audited actions — root-caused 2026-07-04). The role survives as a NOLOGIN
 * group role: INSERT-only on `audit_logs` via its scoped policy
 * (`TO casesync_audit WITH CHECK (true)`), no SELECT/UPDATE/DELETE —
 * append-only, tamper-resistant semantics fully preserved.
 *
 * Current design: audit writes ride the SAME warm Entra pool as the data
 * plane, but each write runs on a RESERVED connection under
 * `SET ROLE casesync_audit` (membership granted to `casesync-db-client`,
 * and to `casesync_app` for password-mode dev parity), with RESET ROLE in
 * `finally`. No RLS user context is set — deliberately, per the above.
 *
 * The legacy CASESYNC_AUDIT_DATABASE_URL branch remains ONLY for
 * environments still running password auth. It is dead against prod Azure;
 * the env var should be removed from Vercel production.
 */

const AUDIT_CONNECTION_STRING = process.env.CASESYNC_AUDIT_DATABASE_URL

let _legacyAuditSql: postgres.Sql | null = null

function getLegacyAuditSql(): postgres.Sql {
  if (!AUDIT_CONNECTION_STRING) {
    throw new Error('CASESYNC_AUDIT_DATABASE_URL is not set')
  }
  if (!_legacyAuditSql) {
    _legacyAuditSql = postgres(AUDIT_CONNECTION_STRING, {
      max: 2,
      idle_timeout: 20,
      connect_timeout: 10,
      ssl: 'require',
      prepare: false,
    })
  }
  return _legacyAuditSql
}

/** True when ANY Azure audit path is available (Entra/data-plane pool, or the legacy dedicated login). */
export function isAzureAuditConfigured(): boolean {
  return isAzureConfigured() || Boolean(AUDIT_CONNECTION_STRING)
}

/**
 * Run `fn` under the INSERT-only `casesync_audit` role. Prefers the warm
 * Entra/data-plane pool (SET ROLE on a reserved connection); falls back to
 * the legacy dedicated password login only when the main plane is not
 * configured at all.
 */
export async function withAuditWriter<T>(fn: (sql: postgres.Sql) => Promise<T>): Promise<T> {
  if (isAzureConfigured()) {
    return withAuditRole(fn)
  }
  return fn(getLegacyAuditSql())
}
