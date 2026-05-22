-- Migration 031: revoke implicit PUBLIC EXECUTE on internal SECURITY DEFINER
-- functions (companion to 030). EXECUTE is granted to PUBLIC by default in
-- Postgres; revoking from anon/authenticated alone leaves the PUBLIC grant
-- in place, so the Supabase advisor still flagged the RPCs as callable.
REVOKE EXECUTE ON FUNCTION public.cleanup_expired_mfa_codes()      FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.cleanup_old_rate_limit_windows() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.rls_auto_enable()                FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.log_audit()                      FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.sync_invite_acceptance()         FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.handle_new_user()                FROM PUBLIC;

-- These three ARE called from RLS USING() clauses; keep callable by the
-- roles that need them, but revoke from PUBLIC so the advisor clears.
REVOKE EXECUTE ON FUNCTION public.is_active_user()                 FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.is_active_user()                 TO authenticated, anon;

REVOKE EXECUTE ON FUNCTION public.is_workryn_admin()               FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.is_workryn_admin()               TO authenticated;

REVOKE EXECUTE ON FUNCTION public.get_workryn_user_id()            FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.get_workryn_user_id()            TO authenticated;

REVOKE EXECUTE ON FUNCTION public.block_disabled_users()           FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.block_disabled_users()           TO authenticated;
