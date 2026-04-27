-- Migration 022: Active User Guard
-- Prevents disabled/deleted users from accessing data even with valid JWT
-- Two-pronged approach:
--   1. JWT expiry reduced to 5 minutes (via Supabase auth config)
--   2. RESTRICTIVE RLS policies on critical tables using is_active_user()

-- ── Helper function: is_active_user() ────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.is_active_user()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  user_disabled boolean;
  user_exists boolean;
BEGIN
  SELECT 
    EXISTS(SELECT 1 FROM auth.users WHERE id = auth.uid()),
    COALESCE((SELECT (raw_user_meta_data->>'disabled')::boolean FROM auth.users WHERE id = auth.uid()), false)
  INTO user_exists, user_disabled;
  
  RETURN user_exists AND NOT user_disabled;
END;
$$;

GRANT EXECUTE ON FUNCTION public.is_active_user() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_active_user() TO anon;
COMMENT ON FUNCTION public.is_active_user() IS 'Returns true only if the current JWT belongs to an existing, non-disabled user.';

-- ── Helper function: block_disabled_users() ──────────────────────────────────
CREATE OR REPLACE FUNCTION public.block_disabled_users()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_disabled boolean;
BEGIN
  IF auth.uid() IS NULL THEN RETURN; END IF;

  SELECT COALESCE((raw_user_meta_data->>'disabled')::boolean, false)
  INTO v_disabled
  FROM auth.users
  WHERE id = auth.uid();

  IF NOT FOUND OR v_disabled THEN
    RAISE EXCEPTION 'Account has been deactivated or removed.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.block_disabled_users() TO authenticated;
GRANT EXECUTE ON FUNCTION public.block_disabled_users() TO anon;

-- ── RESTRICTIVE policies on CaseSync critical tables ─────────────────────────
CREATE POLICY "block_disabled_clients"        ON public.clients          AS RESTRICTIVE FOR ALL TO authenticated USING (is_active_user());
CREATE POLICY "block_disabled_client_notes"   ON public.client_notes     AS RESTRICTIVE FOR ALL TO authenticated USING (is_active_user());
CREATE POLICY "block_disabled_client_documents" ON public.client_documents AS RESTRICTIVE FOR ALL TO authenticated USING (is_active_user());
CREATE POLICY "block_disabled_profiles"       ON public.profiles         AS RESTRICTIVE FOR ALL TO authenticated USING (is_active_user());
CREATE POLICY "block_disabled_activity_log"   ON public.activity_log     AS RESTRICTIVE FOR ALL TO authenticated USING (is_active_user());
CREATE POLICY "block_disabled_notifications"  ON public.notifications    AS RESTRICTIVE FOR ALL TO authenticated USING (is_active_user());
CREATE POLICY "block_disabled_chat_messages"  ON public.chat_messages    AS RESTRICTIVE FOR ALL TO authenticated USING (is_active_user());
CREATE POLICY "block_disabled_chat_channels"  ON public.chat_channels    AS RESTRICTIVE FOR ALL TO authenticated USING (is_active_user());
CREATE POLICY "block_disabled_audit_logs"     ON public.audit_logs       AS RESTRICTIVE FOR ALL TO authenticated USING (is_active_user());
CREATE POLICY "block_disabled_user_invites"   ON public.user_invites     AS RESTRICTIVE FOR ALL TO authenticated USING (is_active_user());

-- ── RESTRICTIVE policies on Workryn critical tables ──────────────────────────
CREATE POLICY "block_disabled_w_user"         ON public.w_user           AS RESTRICTIVE FOR ALL TO authenticated USING (is_active_user());
CREATE POLICY "block_disabled_w_time_entry"   ON public.w_time_entry     AS RESTRICTIVE FOR ALL TO authenticated USING (is_active_user());
CREATE POLICY "block_disabled_w_evaluation"   ON public.w_evaluation     AS RESTRICTIVE FOR ALL TO authenticated USING (is_active_user());
CREATE POLICY "block_disabled_w_shift"        ON public.w_shift          AS RESTRICTIVE FOR ALL TO authenticated USING (is_active_user());
CREATE POLICY "block_disabled_w_task"         ON public.w_task           AS RESTRICTIVE FOR ALL TO authenticated USING (is_active_user());
CREATE POLICY "block_disabled_w_ticket"       ON public.w_ticket         AS RESTRICTIVE FOR ALL TO authenticated USING (is_active_user());
CREATE POLICY "block_disabled_w_pto_request"  ON public.w_pto_request    AS RESTRICTIVE FOR ALL TO authenticated USING (is_active_user());
CREATE POLICY "block_disabled_w_pto_balance"  ON public.w_pto_balance    AS RESTRICTIVE FOR ALL TO authenticated USING (is_active_user());
