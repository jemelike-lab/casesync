-- 043: (SELECT)-wrap the remaining RLS policies so their function calls are
-- hoisted into an InitPlan (evaluated once per query) instead of re-evaluated
-- per row. Completes the perf pass that already covered public.clients
-- (block_disabled_clients was the precedent: "( SELECT is_active_user() )").
--
-- Semantics are UNCHANGED: identical boolean result, only evaluation timing
-- differs. Verified on this database that the wrap yields
-- "One-Time Filter: (InitPlan 1)" even though is_active_user() is VOLATILE,
-- so the function's volatility / SECURITY DEFINER definition is left untouched.
--
-- ALTER POLICY (not DROP/CREATE) is used deliberately: every block_disabled_*
-- policy is RESTRICTIVE, and ALTER preserves the restrictive flag and the role
-- list with no window in which the policy is absent.
--
-- Deliberately NOT wrapped: client_documents.cd_select_authorized, which is
-- user_can_access_client(client_id) -- correlated to a column, so it would
-- become a per-row SubPlan rather than an InitPlan (no gain).
--
-- Applied to production 2026-07-13; clears the Supabase auth_rls_initplan lint.

-- CaseSync tables
ALTER POLICY block_disabled_activity_log     ON public.activity_log     USING ((SELECT is_active_user()));
ALTER POLICY block_disabled_audit_exports    ON public.audit_exports    USING ((SELECT is_active_user()));
ALTER POLICY block_disabled_audit_logs       ON public.audit_logs       USING ((SELECT is_active_user()));
ALTER POLICY block_disabled_chat_channels    ON public.chat_channels    USING ((SELECT is_active_user()));
ALTER POLICY block_disabled_chat_messages    ON public.chat_messages    USING ((SELECT is_active_user()));
ALTER POLICY block_disabled_client_documents ON public.client_documents USING ((SELECT is_active_user()));
ALTER POLICY block_disabled_client_notes     ON public.client_notes     USING ((SELECT is_active_user()));
ALTER POLICY block_disabled_notifications    ON public.notifications    USING ((SELECT is_active_user()));
ALTER POLICY block_disabled_profiles         ON public.profiles         USING ((SELECT is_active_user()));
ALTER POLICY block_disabled_user_invites     ON public.user_invites     USING ((SELECT is_active_user()));

-- Workryn tables
ALTER POLICY block_disabled_w_benefit_gym_selection       ON public.w_benefit_gym_selection       USING ((SELECT is_active_user()));
ALTER POLICY block_disabled_w_benefit_mileage_submission  ON public.w_benefit_mileage_submission  USING ((SELECT is_active_user()));
ALTER POLICY block_disabled_w_benefit_retirement_election ON public.w_benefit_retirement_election USING ((SELECT is_active_user()));
ALTER POLICY block_disabled_w_evaluation   ON public.w_evaluation   USING ((SELECT is_active_user()));
ALTER POLICY block_disabled_w_pto_balance  ON public.w_pto_balance  USING ((SELECT is_active_user()));
ALTER POLICY block_disabled_w_pto_request  ON public.w_pto_request  USING ((SELECT is_active_user()));
ALTER POLICY block_disabled_w_shift        ON public.w_shift        USING ((SELECT is_active_user()));
ALTER POLICY block_disabled_w_task         ON public.w_task         USING ((SELECT is_active_user()));
ALTER POLICY block_disabled_w_ticket       ON public.w_ticket       USING ((SELECT is_active_user()));
ALTER POLICY block_disabled_w_time_entry   ON public.w_time_entry   USING ((SELECT is_active_user()));
ALTER POLICY block_disabled_w_user         ON public.w_user         USING ((SELECT is_active_user()));

-- profiles: supervisor update path (permissive; both USING and WITH CHECK)
ALTER POLICY "Supervisors can update any profile" ON public.profiles
  USING ((SELECT is_supervisor())) WITH CHECK ((SELECT is_supervisor()));
