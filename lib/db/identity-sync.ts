import { isAzureConfigured, withRlsContext } from '@/lib/db/azure'

/**
 * Azure identity-shim sync (2026-07-06 launch fix, v2).
 *
 * The Azure PHI plane resolves the caller's role via current_user_role(),
 * which reads the AZURE public.profiles table through the auth.uid() shim
 * (app.user_id). Identity lives in Supabase; nothing wrote new users into the
 * Azure shim, so every account accepted after the 2026-06-28 cutover resolved
 * to role NULL on the data plane and saw ZERO clients.
 *
 * v2: Azure profiles has NO INSERT policy for `authenticated` (RLS write
 * probes fail 42501), so all shim writes go through the SECURITY DEFINER
 * functions public.sync_user_identity() / public.delete_user_identity()
 * (created by azure_identity_shim_fix.sql, owner-level, RLS-exempt, with
 * their own authorization guards):
 *   - self-provision: a caller may insert their OWN missing row (acceptance)
 *   - elevated callers (supervisor/it/administrator) may sync anyone
 *   - self role changes require an elevated caller (mirrors the
 *     enforce_role_change trigger semantics)
 *
 * Every mutation of a Supabase profile that affects data-plane access
 * (acceptance, role change, team assignment, deletion) must mirror here.
 * POST /api/admin/reconcile-identities re-syncs the full set idempotently.
 */

export interface AzureIdentity {
  id: string
  full_name: string | null
  role: string
  team_manager_id?: string | null
}

export async function upsertAzureIdentity(identity: AzureIdentity, actorId?: string): Promise<boolean> {
  if (!isAzureConfigured()) return true
  try {
    await withRlsContext(actorId ?? identity.id, async (sql) => {
      await sql`SELECT public.sync_user_identity(${identity.id}::uuid, ${identity.full_name}, ${identity.role}, ${identity.team_manager_id ?? null}::uuid)`
    })
    return true
  } catch (err) {
    console.error('[identity-sync] AZURE PROFILE UPSERT FAILED \u2014 user invisible on PHI plane:', identity.id, err)
    return false
  }
}

export async function deleteAzureIdentity(userId: string, actorId: string): Promise<boolean> {
  if (!isAzureConfigured()) return true
  try {
    await withRlsContext(actorId, async (sql) => {
      await sql`SELECT public.delete_user_identity(${userId}::uuid)`
    })
    return true
  } catch (err) {
    console.error('[identity-sync] AZURE PROFILE DELETE FAILED:', userId, err)
    return false
  }
}
