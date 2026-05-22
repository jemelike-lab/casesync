-- Migration 034: break profiles-RLS infinite recursion (2026-05-22)
--
-- elevated_can_view_all_profiles (from 028) did
--   EXISTS (SELECT 1 FROM profiles me WHERE me.id = auth.uid() AND me.role IN (...))
-- The inner subquery is also subject to RLS on profiles -> evaluates
-- elevated_can_view_all_profiles again -> Postgres detects the cycle:
--   "infinite recursion detected in policy for relation 'profiles'"
--
-- This blocked EVERY query against profiles or any table whose policy did
-- EXISTS (SELECT FROM profiles ...) — which is: clients, client_notes,
-- activity_log, client_documents, and the supports_planner_update policy
-- from migration 033. Effectively most of CaseSync's RLS-bound surface.
--
-- Fix: a SECURITY DEFINER helper that returns the caller's role, owned by
-- postgres (BYPASSRLS). All policies that previously did EXISTS-on-profiles
-- now call the helper. Standard Supabase idiom.

CREATE OR REPLACE FUNCTION public.current_user_role()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = ''
AS $func$
DECLARE
  v_role text;
BEGIN
  SELECT role INTO v_role FROM public.profiles WHERE id = auth.uid();
  RETURN v_role;
END;
$func$;

REVOKE EXECUTE ON FUNCTION public.current_user_role() FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.current_user_role() TO authenticated;

-- profiles
DROP POLICY IF EXISTS "elevated_can_view_all_profiles" ON public.profiles;
CREATE POLICY "elevated_can_view_all_profiles"
  ON public.profiles FOR SELECT TO authenticated
  USING ( public.current_user_role() IN ('supervisor', 'it', 'team_manager') );

-- client_notes
DROP POLICY IF EXISTS "client_notes_select_assigned_or_elevated" ON public.client_notes;
CREATE POLICY "client_notes_select_assigned_or_elevated"
  ON public.client_notes FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.clients c
       WHERE c.id = client_notes.client_id
         AND ( c.assigned_to = auth.uid() OR public.current_user_role() IN ('team_manager','supervisor','it') )
    )
  );

DROP POLICY IF EXISTS "client_notes_insert_assigned_or_elevated" ON public.client_notes;
CREATE POLICY "client_notes_insert_assigned_or_elevated"
  ON public.client_notes FOR INSERT TO authenticated
  WITH CHECK (
    author_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.clients c
       WHERE c.id = client_notes.client_id
         AND ( c.assigned_to = auth.uid() OR public.current_user_role() IN ('team_manager','supervisor','it') )
    )
  );

-- activity_log
DROP POLICY IF EXISTS "activity_log_select_assigned_or_elevated" ON public.activity_log;
CREATE POLICY "activity_log_select_assigned_or_elevated"
  ON public.activity_log FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.clients c
       WHERE c.id = activity_log.client_id
         AND ( c.assigned_to = auth.uid() OR public.current_user_role() IN ('team_manager','supervisor','it') )
    )
  );

DROP POLICY IF EXISTS "activity_log_insert_self_only" ON public.activity_log;
CREATE POLICY "activity_log_insert_self_only"
  ON public.activity_log FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.clients c
       WHERE c.id = activity_log.client_id
         AND ( c.assigned_to = auth.uid() OR public.current_user_role() IN ('team_manager','supervisor','it') )
    )
  );

-- client_documents
DROP POLICY IF EXISTS "client_documents_insert_assigned_or_elevated" ON public.client_documents;
CREATE POLICY "client_documents_insert_assigned_or_elevated"
  ON public.client_documents FOR INSERT TO authenticated
  WITH CHECK (
    uploaded_by = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.clients c
       WHERE c.id = client_documents.client_id
         AND ( c.assigned_to = auth.uid() OR public.current_user_role() IN ('team_manager','supervisor','it') )
    )
  );

-- clients (rewrites of migration 016's policies + migration 033's restore)
DROP POLICY IF EXISTS "supports_planner_update_assigned_clients"   ON public.clients;
CREATE POLICY "supports_planner_update_assigned_clients"
  ON public.clients FOR UPDATE TO authenticated
  USING      ( assigned_to = auth.uid() AND public.current_user_role() = 'supports_planner' )
  WITH CHECK ( assigned_to = auth.uid() AND public.current_user_role() = 'supports_planner' );

DROP POLICY IF EXISTS "managers_and_supervisors_select_all_clients" ON public.clients;
CREATE POLICY "managers_and_supervisors_select_all_clients"
  ON public.clients FOR SELECT TO authenticated
  USING ( public.current_user_role() IN ('team_manager', 'supervisor', 'it') );

DROP POLICY IF EXISTS "managers_and_supervisors_write_clients" ON public.clients;
CREATE POLICY "managers_and_supervisors_write_clients"
  ON public.clients FOR ALL TO authenticated
  USING      ( public.current_user_role() IN ('team_manager', 'supervisor', 'it') )
  WITH CHECK ( public.current_user_role() IN ('team_manager', 'supervisor', 'it') );

DROP POLICY IF EXISTS "supports_planner_select_own_clients" ON public.clients;
CREATE POLICY "supports_planner_select_own_clients"
  ON public.clients FOR SELECT TO authenticated
  USING ( assigned_to = auth.uid() AND public.current_user_role() = 'supports_planner' );
