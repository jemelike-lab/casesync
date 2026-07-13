-- azure_pilot_tables.sql
-- Pilot cohort roster + checklist progress (Option A build, 2026-07-13).
--
-- Run in Azure Cloud Shell as Jemelike@blhnurses.com:
--   export PGPASSWORD=$(az account get-access-token --resource-type oss-rdbms --query accessToken -o tsv)
--   psql "host=blh-casesync-prod.postgres.database.azure.com dbname=casesync user=Jemelike@blhnurses.com sslmode=require" -f azure_pilot_tables.sql
--
-- Same access model as feedback_reports: app reaches these via
-- withRlsContext() (SET ROLE authenticated + app.user_id); every policy
-- targets `authenticated` + the auth.uid() shim; every subquery is
-- (SELECT ...)-wrapped for InitPlan evaluation.
--
--   * pilot_roster: members read their own row; supervisor/administrator
--     manage and read all. Ending a pilot = set ended_at (never DELETE).
--   * pilot_checklist_progress: members insert/delete their OWN rows, and
--     only while their roster row is active. Elevated read for the live
--     supervisor view. No UPDATE (a row either exists or it doesn't).

\pset pager off

BEGIN;

CREATE TABLE IF NOT EXISTS public.pilot_roster (
  user_id    uuid PRIMARY KEY,
  cohort     text NOT NULL DEFAULT 'sp-pilot-1' CHECK (length(cohort) BETWEEN 1 AND 40),
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at   timestamptz NULL
);

CREATE TABLE IF NOT EXISTS public.pilot_checklist_progress (
  user_id      uuid NOT NULL,
  task_key     text NOT NULL CHECK (length(task_key) BETWEEN 1 AND 60),
  completed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, task_key)
);

CREATE INDEX IF NOT EXISTS pilot_progress_user_idx
  ON public.pilot_checklist_progress (user_id);

ALTER TABLE public.pilot_roster ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pilot_roster FORCE ROW LEVEL SECURITY;
ALTER TABLE public.pilot_checklist_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pilot_checklist_progress FORCE ROW LEVEL SECURITY;

-- roster: read own or elevated
DROP POLICY IF EXISTS pilot_roster_select_own_or_elevated ON public.pilot_roster;
CREATE POLICY pilot_roster_select_own_or_elevated ON public.pilot_roster
  FOR SELECT TO authenticated
  USING (
    user_id = (SELECT auth.uid())
    OR (SELECT EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('supervisor', 'administrator')
    ))
  );

-- roster: manage elevated only
DROP POLICY IF EXISTS pilot_roster_insert_elevated ON public.pilot_roster;
CREATE POLICY pilot_roster_insert_elevated ON public.pilot_roster
  FOR INSERT TO authenticated
  WITH CHECK (
    (SELECT EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('supervisor', 'administrator')
    ))
  );

DROP POLICY IF EXISTS pilot_roster_update_elevated ON public.pilot_roster;
CREATE POLICY pilot_roster_update_elevated ON public.pilot_roster
  FOR UPDATE TO authenticated
  USING (
    (SELECT EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('supervisor', 'administrator')
    ))
  )
  WITH CHECK (
    (SELECT EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('supervisor', 'administrator')
    ))
  );

-- progress: insert own, only while an active roster member
DROP POLICY IF EXISTS pilot_progress_insert_own_active ON public.pilot_checklist_progress;
CREATE POLICY pilot_progress_insert_own_active ON public.pilot_checklist_progress
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = (SELECT auth.uid())
    AND (SELECT EXISTS (
      SELECT 1 FROM public.pilot_roster r
      WHERE r.user_id = auth.uid() AND r.ended_at IS NULL
    ))
  );

-- progress: read own or elevated
DROP POLICY IF EXISTS pilot_progress_select_own_or_elevated ON public.pilot_checklist_progress;
CREATE POLICY pilot_progress_select_own_or_elevated ON public.pilot_checklist_progress
  FOR SELECT TO authenticated
  USING (
    user_id = (SELECT auth.uid())
    OR (SELECT EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('supervisor', 'administrator')
    ))
  );

-- progress: un-check own
DROP POLICY IF EXISTS pilot_progress_delete_own ON public.pilot_checklist_progress;
CREATE POLICY pilot_progress_delete_own ON public.pilot_checklist_progress
  FOR DELETE TO authenticated
  USING (user_id = (SELECT auth.uid()));

GRANT SELECT, INSERT, UPDATE ON public.pilot_roster TO authenticated;
GRANT SELECT, INSERT, DELETE ON public.pilot_checklist_progress TO authenticated;

COMMIT;

\echo '[V1] Tables present with RLS forced (EXPECT: 2 rows, both t/t):'
SELECT c.relname, c.relrowsecurity AS rowsecurity, c.relforcerowsecurity AS forcerowsecurity
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relname IN ('pilot_roster', 'pilot_checklist_progress')
ORDER BY c.relname;

\echo '[V2] Policies (EXPECT: 6 rows):'
SELECT tablename, policyname, cmd
FROM pg_policies
WHERE schemaname = 'public' AND tablename IN ('pilot_roster', 'pilot_checklist_progress')
ORDER BY tablename, policyname;

\echo '[V3] Non-member insert denied (EXPECT: ERROR row-level security):'
BEGIN;
SET ROLE authenticated;
SELECT set_config('app.user_id', '00000000-0000-0000-0000-000000000001', true) AS acting_as_nonmember;
INSERT INTO public.pilot_checklist_progress (user_id, task_key)
VALUES ('00000000-0000-0000-0000-000000000001', 'verify.roster');
ROLLBACK;

-- ── Seed template (run per SP AFTER invite acceptance; get uuid from profiles) ──
-- INSERT INTO public.pilot_roster (user_id, cohort) VALUES ('<sp-profile-uuid>', 'sp-pilot-1')
--   ON CONFLICT (user_id) DO UPDATE SET ended_at = NULL;
