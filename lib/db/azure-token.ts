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
 * REQUEST-SCOPED: getVercelOidcToken() reads the `x-vercel-oidc-token` header
 * off the *current* request, so everything here must run within request scope —
 * never at module load / cold start. ClientAssertionCredential invokes the
 * getVercelOidcToken callback whenever it needs a fresh client assertion, so it
 * must likewise be constructed per request.
 */

const OSSRDBMS_SCOPE = 'https://ossrdbms-aad.database.windows.net/.default'

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

/** Mint a short-lived Entra access token for Azure Postgres. Request-scoped. */
export async function getAzureDbToken(): Promise<string> {
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
  return token.token
}
