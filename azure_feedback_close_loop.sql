-- azure_feedback_close_loop.sql
-- Feedback response loop: assignment + reporter confirmation (pilot).
--
-- Run in Azure Cloud Shell as Jemelike@blhnurses.com:
--   export PGPASSWORD=$(az account get-access-token --resource-type oss-rdbms --query accessToken -o tsv)
--   psql "host=blh-casesync-prod.postgres.database.azure.com dbname=casesync user=Jemelike@blhnurses.com sslmode=require" -f azure_feedback_close_loop.sql
--
-- Adds to feedback_reports (azure_feedback_reports.sql):
--   * assigned_to / assigned_to_name — triage ownership so two triagers never
--     silently work the same report. Name denormalized like author_name.
--   * Two reporter-driven statuses: 'confirmed' (reporter verified the fix,
--     terminal) and 'reopened' (reporter says still broken → back to triage).
--   * reporter_note — the reporter's comment when confirming/reopening.
--   * confirmed_at / reopen_count — loop telemetry.
--   * feedback_respond_own RLS: the ONE author-update carve-out. Authors may
--     transition their OWN report, and only from 'resolved', and only to
--     'confirmed' or 'reopened'. Everything else stays elevated-only, so the
--     "authors cannot edit a filed report" triage-history rule holds.
--
-- Per the RLS load-test learning, all auth.uid() subqueries are
-- (SELECT ...)-wrapped for InitPlan evaluation.

\pset pager off

BEGIN;

-- ── Columns ───────────────────────────────────────────────────────────────────

ALTER TABLE public.feedback_reports
  ADD COLUMN IF NOT EXISTS assigned_to      uuid NULL,
  ADD COLUMN IF NOT EXISTS assigned_to_name text NULL
    CHECK (assigned_to_name IS NULL OR length(assigned_to_name) <= 120),
  ADD COLUMN IF NOT EXISTS reporter_note    text NULL
    CHECK (reporter_note IS NULL OR length(reporter_note) <= 1000),
  ADD COLUMN IF NOT EXISTS confirmed_at     timestamptz NULL,
  ADD COLUMN IF NOT EXISTS reopen_count     int NOT NULL DEFAULT 0;

-- ── Status set: + confirmed, reopened ─────────────────────────────────────────
-- The original CHECK was inline on the column → auto-named _status_check.

ALTER TABLE public.feedback_reports
  DROP CONSTRAINT IF EXISTS feedback_reports_status_check;
ALTER TABLE public.feedback_reports
  ADD CONSTRAINT feedback_reports_status_check
  CHECK (status IN ('new', 'in_progress', 'resolved', 'confirmed', 'reopened', 'wont_fix'));

CREATE INDEX IF NOT EXISTS feedback_reports_assigned_idx
  ON public.feedback_reports (assigned_to)
  WHERE assigned_to IS NOT NULL;

-- ── RLS: author confirm/reopen carve-out ──────────────────────────────────────
-- USING gates which rows the author can touch (own + currently 'resolved');
-- WITH CHECK gates what they can become (own + 'confirmed' or 'reopened').
-- The API controls which columns actually change; elevated triage keeps its
-- existing separate policy untouched.

DROP POLICY IF EXISTS feedback_respond_own ON public.feedback_reports;
CREATE POLICY feedback_respond_own ON public.feedback_reports
  FOR UPDATE TO authenticated
  USING (
    user_id = (SELECT auth.uid())
    AND status = 'resolved'
  )
  WITH CHECK (
    user_id = (SELECT auth.uid())
    AND status IN ('confirmed', 'reopened')
  );

COMMIT;

-- ── Verify ────────────────────────────────────────────────────────────────────

\echo '[V1] New columns present (EXPECT: 5 rows):'
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'feedback_reports'
  AND column_name IN ('assigned_to', 'assigned_to_name', 'reporter_note', 'confirmed_at', 'reopen_count')
ORDER BY column_name;

\echo '[V2] Status constraint includes confirmed + reopened (EXPECT: 1 row containing both):'
SELECT conname, pg_get_constraintdef(oid) AS def
FROM pg_constraint
WHERE conrelid = 'public.feedback_reports'::regclass
  AND conname = 'feedback_reports_status_check';

\echo '[V3] Policies (EXPECT: 4 rows — insert_own, select_own_or_elevated, update_elevated, respond_own):'
SELECT policyname, cmd
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'feedback_reports'
ORDER BY policyname;

\echo '[V4] Respond round-trip probe, rolled back (EXPECT: insert → resolve → confirm all return 1 row).'
\echo '     NOTE: probe runs as Josh, who is administrator, so update_elevated also applies —'
\echo '     this validates the new statuses/columns, not the SP-only path. The SP-only'
\echo '     restriction is exercised end-to-end by /api/feedback/[id]/respond in the app.'
BEGIN;
SET ROLE authenticated;
SELECT set_config('app.user_id', 'ced7dfd5-23c3-4609-b573-c69ac2bca689', true) AS acting_as_josh;
INSERT INTO public.feedback_reports (user_id, type, severity, message, page_path)
VALUES ('ced7dfd5-23c3-4609-b573-c69ac2bca689', 'bug', 'minor', 'Close-loop verification probe — safe to ignore', '/dashboard')
RETURNING id \gset probe_
UPDATE public.feedback_reports SET status = 'resolved', resolved_at = now(), updated_at = now()
WHERE id = :'probe_id'
RETURNING status;
UPDATE public.feedback_reports
SET status = 'confirmed', confirmed_at = now(), reporter_note = 'probe confirm', updated_at = now()
WHERE id = :'probe_id'
RETURNING status, confirmed_at IS NOT NULL AS has_confirmed_at, reopen_count;
ROLLBACK;
