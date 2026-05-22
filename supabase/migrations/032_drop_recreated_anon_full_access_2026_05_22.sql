-- Migration 032: drop anon_full_access policies recreated post-030
-- (applied 2026-05-22 via Supabase MCP)
--
-- Between migration 030 finishing and the next advisor scan, the
-- Bianca / Dr. Sage health app (which runs in the SAME Supabase project
-- as BLH CaseSync) recreated TO-anon USING(true) policies on seven of
-- its tables. The BLH supabase publishable (anon) key is shipped in the
-- public BLH frontend bundle, so any visitor to blhcasesync.com could
-- have read these tables via /rest/v1/* using that key — Josh's PHI.
--
-- Mitigation: drop the policies again (the lib/030 service_role_only_lockdown
-- policy for `authenticated` stays in place). With no anon policy AND a
-- USING(false) policy for authenticated, both roles are denied; only the
-- service role still reaches these tables.
--
-- Durable fix (not a SQL migration — needs Josh's health app changes):
--   1. The health app should connect with the service_role key, not anon, OR
--   2. Add a user_id column to each table and scope policies to auth.uid(),
--      OR
--   3. Move these tables to a separate Postgres schema that PostgREST
--      doesn't expose on the BLH project.
DROP POLICY IF EXISTS anon_full_access ON public.bp_readings;
DROP POLICY IF EXISTS anon_full_access ON public.cycle_tracking;
DROP POLICY IF EXISTS anon_full_access ON public.medications;
DROP POLICY IF EXISTS anon_full_access ON public.meditation_sessions;
DROP POLICY IF EXISTS anon_full_access ON public.symptom_journal;
DROP POLICY IF EXISTS anon_full_access ON public.water_intake;
DROP POLICY IF EXISTS anon_full_access ON public.workouts;
