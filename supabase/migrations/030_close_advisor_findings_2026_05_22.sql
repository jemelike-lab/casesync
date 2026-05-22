-- Migration 030: Close Supabase advisor findings (2026-05-22)
--
-- Five corrective actions:
--   1. Recreate 5 SECURITY DEFINER views as SECURITY INVOKER
--      (user_invites_with_state, client_status_summary{_global,_by_assignee},
--       ops_client_counts, client_status_summary).
--   2. Lock down 17 personal-health tables (Bianca / Dr. Sage subproject)
--      to service-role-only — replace USING (true) with USING (false).
--   3. Scope w_county_preference INSERT/UPDATE to the calling user's w_user row.
--   4. Pin search_path = '' on 5 mutable plpgsql/sql functions.
--   5. Revoke EXECUTE on internal SECURITY DEFINER RPCs from anon/authenticated.
--
-- 1.
CREATE OR REPLACE VIEW public.client_status_summary
  WITH (security_invoker = true) AS
SELECT id, assigned_to, category, is_active,
       (eligibility_end_date IS NOT NULL AND eligibility_end_date < CURRENT_DATE)
         OR (three_month_visit_due IS NOT NULL AND three_month_visit_due < CURRENT_DATE)
         OR (quarterly_waiver_date IS NOT NULL AND quarterly_waiver_date < CURRENT_DATE)
         OR (med_tech_redet_date IS NOT NULL AND med_tech_redet_date < CURRENT_DATE)
         OR (pos_deadline IS NOT NULL AND pos_deadline < CURRENT_DATE)
         OR (assessment_due IS NOT NULL AND assessment_due < CURRENT_DATE)
         OR (thirty_day_letter_date IS NOT NULL AND thirty_day_letter_date < CURRENT_DATE)
         OR (co_financial_redet_date IS NOT NULL AND co_financial_redet_date < CURRENT_DATE)
         OR (co_app_date IS NOT NULL AND co_app_date < CURRENT_DATE)
         OR (mfp_consent_date IS NOT NULL AND mfp_consent_date < CURRENT_DATE)
         OR (two57_date IS NOT NULL AND two57_date < CURRENT_DATE)
         OR (doc_mdh_date IS NOT NULL AND doc_mdh_date < CURRENT_DATE)
         OR (spm_next_due IS NOT NULL AND spm_next_due < CURRENT_DATE)
         AS has_overdue,
       (eligibility_end_date BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '7 days')
         OR (three_month_visit_due BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '7 days')
         OR (quarterly_waiver_date BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '7 days')
         OR (med_tech_redet_date BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '7 days')
         OR (pos_deadline BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '7 days')
         OR (assessment_due BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '7 days')
         OR (thirty_day_letter_date BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '7 days')
         OR (spm_next_due BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '7 days')
         AS due_this_week,
       eligibility_end_date BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '30 days'
         AS eligibility_ending_soon,
       last_contact_date IS NULL OR last_contact_date < CURRENT_DATE - INTERVAL '7 days'
         AS no_contact_7_days
  FROM public.clients;

CREATE OR REPLACE VIEW public.client_status_summary_by_assignee
  WITH (security_invoker = true) AS
SELECT assigned_to,
       count(*) AS total_clients,
       count(*) FILTER (WHERE has_overdue) AS overdue_clients,
       count(*) FILTER (WHERE due_this_week) AS due_this_week_clients,
       count(*) FILTER (WHERE eligibility_ending_soon) AS eligibility_ending_soon_clients,
       count(*) FILTER (WHERE no_contact_7_days) AS no_contact_7_days_clients
  FROM public.client_status_summary
 GROUP BY assigned_to;

CREATE OR REPLACE VIEW public.client_status_summary_global
  WITH (security_invoker = true) AS
SELECT count(*) AS total_clients,
       count(*) FILTER (WHERE has_overdue) AS overdue_clients,
       count(*) FILTER (WHERE due_this_week) AS due_this_week_clients,
       count(*) FILTER (WHERE eligibility_ending_soon) AS eligibility_ending_soon_clients,
       count(*) FILTER (WHERE no_contact_7_days) AS no_contact_7_days_clients
  FROM public.client_status_summary;

CREATE OR REPLACE VIEW public.ops_client_counts
  WITH (security_invoker = true) AS
SELECT count(*) FILTER (WHERE is_active = true) AS active_client_count,
       count(*) FILTER (WHERE is_active = true AND client_classification = 'real')  AS real_client_count,
       count(*) FILTER (WHERE is_active = true AND client_classification = 'trial') AS trial_client_count,
       count(*) FILTER (WHERE is_active = true AND client_classification = 'test')  AS test_client_count
  FROM public.clients;

CREATE OR REPLACE VIEW public.user_invites_with_state
  WITH (security_invoker = true) AS
SELECT id, email, full_name, role, invited_user_id, invited_by,
       invite_sent_at, accepted_at, reminder_sent_at, reminder_count,
       expires_at, status, created_at, updated_at,
       CASE WHEN status = 'accepted' THEN 'accepted'
            WHEN status = 'pending' AND expires_at IS NOT NULL AND expires_at < now() THEN 'expired'
            ELSE status
       END AS computed_status
  FROM public.user_invites ui;

-- 2. Lock down personal-health tables
DO $$
DECLARE t text; pol_rec RECORD;
BEGIN
  FOR t IN SELECT unnest(ARRAY[
    'action_items','appointments','bloodwork','bp_readings','cycle_tracking',
    'dr_sage_memories','fitness_daily','health_notes','meal_log','medications',
    'meditation_sessions','notification_prefs','supplements','symptom_journal',
    'water_intake','weekly_reports','workouts'])
  LOOP
    FOR pol_rec IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename=t LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', pol_rec.policyname, t);
    END LOOP;
    EXECUTE format('CREATE POLICY "service_role_only_lockdown" ON public.%I FOR ALL TO authenticated USING (false) WITH CHECK (false)', t);
  END LOOP;
END$$;

-- 3. Scope w_county_preference
DROP POLICY IF EXISTS county_pref_insert ON public.w_county_preference;
DROP POLICY IF EXISTS county_pref_update ON public.w_county_preference;
CREATE POLICY county_pref_insert ON public.w_county_preference FOR INSERT TO authenticated
  WITH CHECK ("userId" IN (SELECT id FROM public.w_user WHERE "supabaseId"::uuid = auth.uid()));
CREATE POLICY county_pref_update ON public.w_county_preference FOR UPDATE TO authenticated
  USING      ("userId" IN (SELECT id FROM public.w_user WHERE "supabaseId"::uuid = auth.uid()))
  WITH CHECK ("userId" IN (SELECT id FROM public.w_user WHERE "supabaseId"::uuid = auth.uid()));

-- 4. Pin search_path
ALTER FUNCTION public.touch_updated_at()               SET search_path = '';
ALTER FUNCTION public.sync_invite_acceptance()         SET search_path = '';
ALTER FUNCTION public.cleanup_old_rate_limit_windows() SET search_path = '';
ALTER FUNCTION public.handle_new_user()                SET search_path = '';
ALTER FUNCTION public.cleanup_expired_mfa_codes()      SET search_path = '';

-- 5. Revoke EXECUTE
REVOKE EXECUTE ON FUNCTION public.cleanup_expired_mfa_codes()      FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.cleanup_old_rate_limit_windows() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.rls_auto_enable()                FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.log_audit()                      FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.sync_invite_acceptance()         FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user()                FROM anon, authenticated;
