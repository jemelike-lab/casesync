import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

const MFA_REQUIRED_ROLES = ['supervisor', 'it', 'team_manager', 'supports_planner', 'case_manager']

/**
 * Check if the current user's role requires MFA and if they have it enabled.
 * Call this in server-rendered layouts for protected routes.
 * Redirects to /settings/security if MFA is required but not enrolled.
 *
 * All roles now require MFA for HIPAA compliance (Phase 1, April 2026).
 */
export async function enforceMfa() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()

    if (!profile || !MFA_REQUIRED_ROLES.includes(profile.role)) return

    // Check if user has MFA enrolled
    const { data: factors } = await supabase.auth.mfa.listFactors()
    const totpFactors = (factors as any)?.totp ?? (factors as any)?.all?.filter((f: any) => f.factor_type === 'totp') ?? []
    const hasVerifiedFactor = Array.isArray(totpFactors) && totpFactors.some(
      (f: any) => f.status === 'verified'
    )

    if (!hasVerifiedFactor) {
      redirect('/settings/security?mfa_required=1')
    }
  } catch (e: any) {
    // Don't block on MFA check errors — log and continue
    if (e?.digest?.includes('NEXT_REDIRECT')) throw e // re-throw redirect
    console.error('[enforceMfa] Error checking MFA:', e?.message)
  }
}
