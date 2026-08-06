-- 064 — Pilot tables wired for the Azure app plane + import-note provenance.
--
-- (a) pilot_roster / pilot_checklist_progress shipped with Supabase-dump
--     policies (TO authenticated) and raw profiles-subquery elevated checks.
--     On Azure, FORCE RLS on profiles (whose policies are also TO
--     authenticated) blanks that subquery for casesync_app — and the tables
--     carried no casesync_app grants at all — so the Pilot Scoreboard read
--     zero members. Recreate the six policies on the proven clients-table
--     pattern: TO casesync_app, elevated checks via the SECURITY DEFINER
--     helper (SELECT current_user_role()), InitPlan-wrapped.
-- (b) Backfill 'Smartsheet sync: ' provenance onto the import-era marker
--     notes (Josh-approved 08-05) so the Notes "Imported" badge covers them.
--     The UI strips the prefix on display, so rendered note text is
--     unchanged; the change is reversible by stripping the prefix.
--
-- AZURE PLANE ONLY. The Supabase mirror's pilot policies correctly target
-- authenticated for that plane, and its client_notes has zero marker notes
-- (verified 2026-08-06).

GRANT SELECT ON public.profiles TO casesync_app;
GRANT SELECT, INSERT, UPDATE, DELETE
  ON public.pilot_roster, public.pilot_checklist_progress TO casesync_app;

DROP POLICY IF EXISTS pilot_roster_select_own_or_elevated ON public.pilot_roster;
CREATE POLICY pilot_roster_select_own_or_elevated ON public.pilot_roster
  FOR SELECT TO casesync_app
  USING (user_id = (SELECT auth.uid())
     OR (SELECT current_user_role()) = ANY (ARRAY['supervisor', 'administrator']));

DROP POLICY IF EXISTS pilot_roster_insert_elevated ON public.pilot_roster;
CREATE POLICY pilot_roster_insert_elevated ON public.pilot_roster
  FOR INSERT TO casesync_app
  WITH CHECK ((SELECT current_user_role()) = ANY (ARRAY['supervisor', 'administrator']));

DROP POLICY IF EXISTS pilot_roster_update_elevated ON public.pilot_roster;
CREATE POLICY pilot_roster_update_elevated ON public.pilot_roster
  FOR UPDATE TO casesync_app
  USING ((SELECT current_user_role()) = ANY (ARRAY['supervisor', 'administrator']))
  WITH CHECK ((SELECT current_user_role()) = ANY (ARRAY['supervisor', 'administrator']));

DROP POLICY IF EXISTS pilot_progress_delete_own ON public.pilot_checklist_progress;
CREATE POLICY pilot_progress_delete_own ON public.pilot_checklist_progress
  FOR DELETE TO casesync_app
  USING (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS pilot_progress_insert_own_active ON public.pilot_checklist_progress;
CREATE POLICY pilot_progress_insert_own_active ON public.pilot_checklist_progress
  FOR INSERT TO casesync_app
  WITH CHECK (user_id = (SELECT auth.uid())
    AND (SELECT EXISTS (
      SELECT 1 FROM pilot_roster r
      WHERE r.user_id = auth.uid() AND r.ended_at IS NULL)));

DROP POLICY IF EXISTS pilot_progress_select_own_or_elevated ON public.pilot_checklist_progress;
CREATE POLICY pilot_progress_select_own_or_elevated ON public.pilot_checklist_progress
  FOR SELECT TO casesync_app
  USING (user_id = (SELECT auth.uid())
     OR (SELECT current_user_role()) = ANY (ARRAY['supervisor', 'administrator']));

UPDATE public.client_notes
SET content = 'Smartsheet sync: ' || content
WHERE author_id = 'ced7dfd5-23c3-4609-b573-c69ac2bca689'
  AND content NOT LIKE 'Smartsheet sync:%'
  AND (content LIKE 'SPM completed months:%'
    OR content LIKE 'Contact attempts%'
    OR content LIKE '%quarterly waiver:%'
    OR content LIKE '%MDH documentation:%');
