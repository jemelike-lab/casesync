import { isAzureConfigured, withIdentityShimWrite } from '@/lib/db/azure'

/**
 * Azure identity-shim sync (2026-07-06 launch fix).
 *
 * The Azure PHI plane resolves the caller's role via current_user_role(),
 * which reads the AZURE public.profiles table through the auth.uid() shim
 * (app.user_id). Identity lives in Supabase, and until this module existed
 * nothing wrote new users into the Azure shim — so every account accepted
 * after the 2026-06-28 cutover resolved to role NULL on the data plane and
 * saw ZERO clients (launch-day finding: all three new supervisors blind).
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

export async function upsertAzureIdentity(identity: AzureIdentity): Promise<boolean> {
  if (!isAzureConfigured()) return true
  try {
    await withIdentityShimWrite(async (sql) => {
      await sql`
        INSERT INTO profiles (id, full_name, role, team_manager_id)
        VALUES (${identity.id}, ${identity.full_name}, ${identity.role}, ${identity.team_manager_id ?? null})
        ON CONFLICT (id) DO UPDATE SET
          full_name = EXCLUDED.full_name,
          role = EXCLUDED.role,
          team_manager_id = EXCLUDED.team_manager_id
      `
    })
    return true
  } catch (err) {
    console.error('[identity-sync] AZURE PROFILE UPSERT FAILED \u2014 user invisible on PHI plane:', identity.id, err)
    return false
  }
}

export async function deleteAzureIdentity(userId: string): Promise<boolean> {
  if (!isAzureConfigured()) return true
  try {
    await withIdentityShimWrite(async (sql) => {
      await sql`DELETE FROM profiles WHERE id = ${userId}`
    })
    return true
  } catch (err) {
    console.error('[identity-sync] AZURE PROFILE DELETE FAILED:', userId, err)
    return false
  }
}
