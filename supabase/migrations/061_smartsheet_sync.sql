-- Smartsheet sync: run log + human review queue.
-- The sync never removes or reassigns a client on its own; anything it can't
-- resolve safely lands in smartsheet_review_queue for a supervisor to action.

CREATE TABLE IF NOT EXISTS public.smartsheet_sync_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ran_at timestamptz NOT NULL DEFAULT now(),
  sheets_processed integer NOT NULL DEFAULT 0,
  created integer NOT NULL DEFAULT 0,
  updated integer NOT NULL DEFAULT 0,
  flagged integer NOT NULL DEFAULT 0,
  unmatched_sheets text,
  errors text
);

CREATE TABLE IF NOT EXISTS public.smartsheet_review_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  client_id_text text NOT NULL,
  client_uuid uuid,
  planner_id uuid,
  reason text NOT NULL CHECK (reason IN ('missing_from_sheet', 'on_sheet_assigned_elsewhere')),
  detail text,
  resolved_at timestamptz,
  resolved_by uuid,
  resolution text
);

CREATE INDEX IF NOT EXISTS idx_ss_review_open
  ON public.smartsheet_review_queue (created_at DESC) WHERE resolved_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_ss_review_client
  ON public.smartsheet_review_queue (client_id_text);

ALTER TABLE public.smartsheet_sync_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.smartsheet_review_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.smartsheet_sync_runs FORCE ROW LEVEL SECURITY;
ALTER TABLE public.smartsheet_review_queue FORCE ROW LEVEL SECURITY;

-- Elevated roles only: these tables describe caseload-wide movement, not a
-- single planner's clients. Helper calls wrapped in (SELECT ...) so they are
-- evaluated once per query as an InitPlan, not per row.
DROP POLICY IF EXISTS ss_runs_elevated_all ON public.smartsheet_sync_runs;
CREATE POLICY ss_runs_elevated_all ON public.smartsheet_sync_runs
  FOR ALL USING (
    (SELECT current_user_role()) = ANY (ARRAY['supervisor','it','administrator','team_manager'])
  ) WITH CHECK (
    (SELECT current_user_role()) = ANY (ARRAY['supervisor','it','administrator','team_manager'])
  );

DROP POLICY IF EXISTS ss_review_elevated_all ON public.smartsheet_review_queue;
CREATE POLICY ss_review_elevated_all ON public.smartsheet_review_queue
  FOR ALL USING (
    (SELECT current_user_role()) = ANY (ARRAY['supervisor','it','administrator','team_manager'])
  ) WITH CHECK (
    (SELECT current_user_role()) = ANY (ARRAY['supervisor','it','administrator','team_manager'])
  );
