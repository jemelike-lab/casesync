-- Fix data scoping leak on public.clients.
--
-- The previous policies (managers_and_supervisors_select_all_clients and
-- managers_and_supervisors_write_clients) allowed any team_manager to read
-- and modify any client in the database, contradicting the rule that team
-- managers may only access clients assigned to planners on their own team.
--
-- This migration:
--   - Drops the over-permissive bundled policies
--   - Splits into role-specific policies:
--       team_managers_select_own_team_clients (SELECT, team-scoped)
--       supervisors_and_it_select_all_clients (SELECT, unrestricted)
--       team_managers_insert_clients          (INSERT, role-only -- preserves
--         existing create-anything behavior; can be tightened later)
--       team_managers_update_own_team_clients (UPDATE, team-scoped)
--       team_managers_delete_own_team_clients (DELETE, team-scoped)
--       supervisors_and_it_modify_all_clients (ALL, unrestricted)
--
-- Unaffected:
--   - supports_planner_* policies (SP scoping was already correct)
--   - block_disabled_clients (RESTRICTIVE policy stays)
--   - reassign_client() SECURITY DEFINER function (bypasses RLS, has its
--     own role check)
--   - BLH bot endpoints (use the service role, bypass RLS)

DROP POLICY IF EXISTS "managers_and_supervisors_select_all_clients" ON public.clients;
DROP POLICY IF EXISTS "managers_and_supervisors_write_clients" ON public.clients;

CREATE POLICY "supervisors_and_it_select_all_clients"
  ON public.clients
  FOR SELECT
  TO authenticated
  USING ( current_user_role() = ANY (ARRAY['supervisor', 'it']) );

CREATE POLICY "team_managers_select_own_team_clients"
  ON public.clients
  FOR SELECT
  TO authenticated
  USING (
    current_user_role() = 'team_manager'
    AND assigned_to IN (
      SELECT id FROM public.profiles
      WHERE team_manager_id = auth.uid()
        AND role = 'supports_planner'
    )
  );

CREATE POLICY "supervisors_and_it_modify_all_clients"
  ON public.clients
  FOR ALL
  TO authenticated
  USING ( current_user_role() = ANY (ARRAY['supervisor', 'it']) )
  WITH CHECK ( current_user_role() = ANY (ARRAY['supervisor', 'it']) );

CREATE POLICY "team_managers_insert_clients"
  ON public.clients
  FOR INSERT
  TO authenticated
  WITH CHECK ( current_user_role() = 'team_manager' );

CREATE POLICY "team_managers_update_own_team_clients"
  ON public.clients
  FOR UPDATE
  TO authenticated
  USING (
    current_user_role() = 'team_manager'
    AND assigned_to IN (
      SELECT id FROM public.profiles
      WHERE team_manager_id = auth.uid()
        AND role = 'supports_planner'
    )
  )
  WITH CHECK (
    current_user_role() = 'team_manager'
    AND assigned_to IN (
      SELECT id FROM public.profiles
      WHERE team_manager_id = auth.uid()
        AND role = 'supports_planner'
    )
  );

CREATE POLICY "team_managers_delete_own_team_clients"
  ON public.clients
  FOR DELETE
  TO authenticated
  USING (
    current_user_role() = 'team_manager'
    AND assigned_to IN (
      SELECT id FROM public.profiles
      WHERE team_manager_id = auth.uid()
        AND role = 'supports_planner'
    )
  );
