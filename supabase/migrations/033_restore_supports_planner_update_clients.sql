-- Migration 033: restore supports_planner UPDATE on assigned clients (2026-05-22)
--
-- Regression introduced by migration 028: dropping the stale
-- "Supports planners can update assigned clients" TO-public policy left
-- planners unable to update any client. The only remaining UPDATE policy
-- was migration 016's managers_and_supervisors_write_clients, which
-- explicitly excludes supports_planner. Every save in ClientEditForm.tsx
-- (line 550 etc.) was silently failing RLS for planners.
--
-- Fix: re-add a narrowly scoped UPDATE policy for planners on their own
-- assigned clients. WITH CHECK pins assigned_to to the caller so a
-- planner cannot reassign clients via this path.
CREATE POLICY "supports_planner_update_assigned_clients"
  ON public.clients
  FOR UPDATE
  TO authenticated
  USING (
    assigned_to = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role = 'supports_planner'
    )
  )
  WITH CHECK (
    assigned_to = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role = 'supports_planner'
    )
  );
-- NOTE: superseded by migration 034 which switches to current_user_role()
-- to break a profiles-RLS recursion cycle. This file is kept for history.
