-- azure_feedback_reports.sql
-- Tester feedback / issue reporting on the Azure PHI plane.
--
-- Run in Azure Cloud Shell as Jemelike@blhnurses.com:
--   export PGPASSWORD=$(az account get-access-token --resource-type oss-rdbms --query accessToken -o tsv)
--   psql "host=blh-casesync-prod.postgres.database.azure.com dbname=casesync user=Jemelike@blhnurses.com sslmode=require" -f azure_feedback_reports.sql
--
-- Report free text and the auto-captured page path routinely reference clients
-- ("Cobb's eligibility date looks wrong", "/clients/<uuid>"), so reports live
-- on Azure — NOT Supabase. All app access goes through withRlsContext()
-- (SET ROLE authenticated + app.user_id), so every policy targets the
-- `authenticated` role and the auth.uid() shim.
--
-- Privacy model:
--   * Any authenticated user can file a report as themselves and read their
--     own reports.
--   * ELEVATED READ/TRIAGE is supervisor + administrator ONLY. Deliberately
--     NOT 'it' — post Tier-1 IT scope-down (2d49a0c) IT has no PHI access,
--     and free-text reports are PHI-adjacent. Mirrors current isSupervisorLike.
--   * No DELETE policy: reports are closed via status, never removed.
--
-- Perf (per the RLS load-test learning): every auth.uid()/profiles subquery in
-- a policy is wrapped in (SELECT ...) to force InitPlan evaluation.

\pset pager off

BEGIN;

-- ── Table ─────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.feedback_reports (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  user_id         uuid NOT NULL,   -- reporting user (auth.uid())
  author_name     text NULL,       -- denormalized at insert so triage never needs a join
  author_role     text NULL,
  type            text NOT NULL CHECK (type IN ('bug', 'suggestion', 'question')),
  severity        text NULL CHECK (severity IN ('blocking', 'annoying', 'minor')),
  message         text NOT NULL CHECK (length(message) BETWEEN 1 AND 2000),
  page_path       text NULL CHECK (page_path IS NULL OR length(page_path) <= 300),
  app_commit      text NULL CHECK (app_commit IS NULL OR length(app_commit) <= 40),
  user_agent      text NULL CHECK (user_agent IS NULL OR length(user_agent) <= 300),
  viewport        text NULL CHECK (viewport IS NULL OR length(viewport) <= 40),
  status          text NOT NULL DEFAULT 'new'
                    CHECK (status IN ('new', 'in_progress', 'resolved', 'wont_fix')),
  resolution_note text NULL CHECK (resolution_note IS NULL OR length(resolution_note) <= 1000),
  resolved_by     uuid NULL,
  resolved_at     timestamptz NULL
);

-- ── Indexes ───────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS feedback_reports_status_created_idx
  ON public.feedback_reports (status, created_at DESC);
CREATE INDEX IF NOT EXISTS feedback_reports_created_idx
  ON public.feedback_reports (created_at DESC);
CREATE INDEX IF NOT EXISTS feedback_reports_user_idx
  ON public.feedback_reports (user_id);

-- ── RLS ───────────────────────────────────────────────────────────────────────
-- FORCE is safe/free here: the app never connects as the table owner.

ALTER TABLE public.feedback_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.feedback_reports FORCE ROW LEVEL SECURITY;

-- Insert: only as yourself.
DROP POLICY IF EXISTS feedback_insert_own ON public.feedback_reports;
CREATE POLICY feedback_insert_own ON public.feedback_reports
  FOR INSERT TO authenticated
  WITH CHECK (user_id = (SELECT auth.uid()));

-- Select: your own reports, or elevated triage (supervisor/administrator only —
-- NOT 'it', see header).
DROP POLICY IF EXISTS feedback_select_own_or_elevated ON public.feedback_reports;
CREATE POLICY feedback_select_own_or_elevated ON public.feedback_reports
  FOR SELECT TO authenticated
  USING (
    user_id = (SELECT auth.uid())
    OR (SELECT EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('supervisor', 'administrator')
    ))
  );

-- Update (triage: status / resolution): elevated only. Authors cannot edit a
-- filed report — corrections go in a new report, so triage history stays honest.
DROP POLICY IF EXISTS feedback_update_elevated ON public.feedback_reports;
CREATE POLICY feedback_update_elevated ON public.feedback_reports
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

-- ── Grants ────────────────────────────────────────────────────────────────────

GRANT SELECT, INSERT, UPDATE ON public.feedback_reports TO authenticated;

COMMIT;

-- ── Verify ────────────────────────────────────────────────────────────────────

\echo '[V1] Table present with RLS forced (EXPECT: 1 row, rowsecurity=t, forcerowsecurity=t):'
SELECT c.relname, c.relrowsecurity AS rowsecurity, c.relforcerowsecurity AS forcerowsecurity
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relname = 'feedback_reports';

\echo '[V2] Policies (EXPECT: 3 rows):'
SELECT policyname, cmd
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'feedback_reports'
ORDER BY policyname;

\echo '[V3] RLS round-trip (EXPECT: own insert+select = 1 row; cross-user select as non-elevated = 0):'
BEGIN;
SET ROLE authenticated;
SELECT set_config('app.user_id', 'ced7dfd5-23c3-4609-b573-c69ac2bca689', true) AS acting_as_josh;
INSERT INTO public.feedback_reports (user_id, type, severity, message, page_path)
VALUES ('ced7dfd5-23c3-4609-b573-c69ac2bca689', 'bug', 'minor', 'RLS verification probe — safe to wont_fix', '/dashboard')
RETURNING id, status;
SELECT count(*) AS own_visible FROM public.feedback_reports
WHERE message = 'RLS verification probe — safe to wont_fix';
ROLLBACK;
