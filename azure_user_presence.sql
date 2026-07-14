-- azure_user_presence.sql
-- Presence table for the Activity Monitor (Option A, 2026-07-13).
-- Run in Azure Cloud Shell (bash):
--   curl -sO https://raw.githubusercontent.com/jemelike-lab/casesync/main/azure_user_presence.sql
--   export PGPASSWORD=$(az account get-access-token --resource-type oss-rdbms --query accessToken -o tsv)
--   psql "host=blh-casesync-prod.postgres.database.azure.com dbname=casesync user=Jemelike@blhnurses.com sslmode=require" -f azure_user_presence.sql
--
-- Access model mirrors feedback_reports/pilot tables: app via withRlsContext
-- (SET ROLE authenticated + app.user_id), policies target `authenticated`
-- with the auth.uid() shim, (SELECT ...)-wrapped for InitPlan.
-- Users may upsert ONLY their own row. Elevated read is supervisor/
-- administrator (outer bound); the app enforces the strict two-person
-- allowlist in lib/monitor-access.ts.

\pset pager off

BEGIN;

CREATE TABLE IF NOT EXISTS public.user_presence (
  user_id            uuid PRIMARY KEY,
  last_seen_at       timestamptz NOT NULL DEFAULT now(),
  session_started_at timestamptz NOT NULL DEFAULT now(),
  current_path       text CHECK (current_path IS NULL OR length(current_path) <= 200),
  user_agent         text CHECK (user_agent IS NULL OR length(user_agent) <= 300)
);

ALTER TABLE public.user_presence ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_presence FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS presence_insert_own ON public.user_presence;
CREATE POLICY presence_insert_own ON public.user_presence
  FOR INSERT TO authenticated
  WITH CHECK (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS presence_update_own ON public.user_presence;
CREATE POLICY presence_update_own ON public.user_presence
  FOR UPDATE TO authenticated
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS presence_select_own_or_elevated ON public.user_presence;
CREATE POLICY presence_select_own_or_elevated ON public.user_presence
  FOR SELECT TO authenticated
  USING (
    user_id = (SELECT auth.uid())
    OR (SELECT EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('supervisor', 'administrator')
    ))
  );

GRANT SELECT, INSERT, UPDATE ON public.user_presence TO authenticated;

COMMIT;

\echo '[V1] Table with RLS forced (EXPECT: 1 row, t/t):'
SELECT c.relname, c.relrowsecurity, c.relforcerowsecurity
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relname = 'user_presence';

\echo '[V2] Policies (EXPECT: 3 rows):'
SELECT policyname, cmd FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'user_presence' ORDER BY policyname;

\echo '[V3] Cross-user insert denied (EXPECT: ERROR row-level security):'
BEGIN;
SET ROLE authenticated;
SELECT set_config('app.user_id', '00000000-0000-0000-0000-000000000002', true) AS acting_as;
INSERT INTO public.user_presence (user_id) VALUES ('00000000-0000-0000-0000-000000000003');
ROLLBACK;
