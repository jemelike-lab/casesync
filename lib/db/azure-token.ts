import { ClientAssertionCredential } from '@azure/identity'
import { getVercelOidcToken } from '@vercel/oidc'

/**
 * Microsoft Entra access token for the Azure Postgres data plane.
 *
 * Federated, no stored secret: we prove our identity to Entra with the
 * per-request Vercel OIDC token (Workload Identity Federation), and Entra
 * returns a short-lived DB access token that Azure Postgres accepts as the
 * password for the mapped principal `casesync-db-client`.
 *
 * The DB token is an *application* credential — identical for every request,
 * regardless of which user is signed in. So it is both safe and far cheaper to
 * mint it once per warm instance and reuse it until shortly before expiry,
 * rather than calling Entra on every request. That per-request mint was a primary
 * cause of timeouts under concurrency (a burst of 100+ simultaneous Entra calls).
 *
 * Only the cache-MISS path touches getVercelOidcToken(), which reads the
 * request-scoped `x-vercel-oidc-token` header — so it must run within request
 * scope. Cache HITS are request-scope-independent. A single in-flight mint is
 * shared by concurrent callers so a cold start under load makes one Entra
 * round-trip, not a hundred.
 */

const OSSRDBMS_SCOPE = 'https://ossrdbms-aad.database.windows.net/.default'

// Refresh this far ahead of the real expiry so a connect never races expiry.
// Entra DB tokens live ~1h.
const REFRESH_MARGIN_MS = 5 * 60 * 1000

/** True when every env var the Entra DB path needs is present. */
export function isEntraDbConfigured(): boolean {
  return Boolean(
    process.env.AZURE_TENANT_ID &&
      process.env.AZURE_CLIENT_ID &&
      process.env.CASESYNC_DB_ENTRA_USER &&
      process.env.CASESYNC_DB_HOST &&
      process.env.CASESYNC_DB_NAME,
  )
}

// Module-level cache (persists across warm invocations on the same instance).
let cached: { token: string; expiresAt: number } | null = null
// Coalesces concurrent cache-miss callers into a single Entra round-trip.
let inflight: Promise<string> | null = null

async function mint(): Promise<string> {
  const tenantId = process.env.AZURE_TENANT_ID
  const clientId = process.env.AZURE_CLIENT_ID
  if (!tenantId || !clientId) {
    throw new Error(
      'AZURE_TENANT_ID / AZURE_CLIENT_ID not set; Entra DB auth is unavailable.',
    )
  }

  const credential = new ClientAssertionCredential(
    tenantId,
    clientId,
    getVercelOidcToken,
  )

  const token = await credential.getToken(OSSRDBMS_SCOPE)
  if (!token?.token) {
    throw new Error('Entra returned no access token for the Postgres data plane.')
  }

  cached = {
    token: token.token,
    expiresAt: token.expiresOnTimestamp ?? Date.now() + 60 * 60 * 1000,
  }
  return token.token
}

/**
 * Return a valid Entra access token for Azure Postgres, reusing the cached token
 * while it still has comfortable life left. Mints (and caches) a new one only on
 * a miss, coalescing concurrent misses into one Entra call.
 */
export async function getAzureDbToken(): Promise<string> {
  if (cached && cached.expiresAt - REFRESH_MARGIN_MS > Date.now()) {
    return cached.token
  }
  if (inflight) return inflight
  inflight = mint().finally(() => {
    inflight = null
  })
  return inflight
}
