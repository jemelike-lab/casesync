-- Migration 028: PHI RLS lockdown (2026-05-22)
--
-- Live-DB inventory turned up multiple P0 RLS holes that the migration 016
-- + 022 set didn't close:
--
--   1. profiles  — "Supervisors and team managers can view team profiles"
--      trusted auth.jwt() user_metadata, which the user can self-edit via
--      supabase.auth.updateUser({ data: { role: 'supervisor' } }). Anyone
--      could elevate themselves and read every profile.
--
--   2. client_notes  — "Authenticated users can read notes" had qual
--      (auth.uid() IS NOT NULL). Any logged-in user could read every
--      client's notes (PHI).  The matching insert policy had no qual,
--      so any user could write notes against any client.
--
--   3. activity_log — same shape as client_notes: open SELECT + open
--      INSERT. Audit trail readable by all, forgeable by all.
--
--   4. client_documents — "Assigned users can insert documents" had no
--      qual; any user could insert a document row for any client.
--
--   5. clients — four stale "TO public" policies survived migration 016
--      and overlap with the new "TO authenticated" set. The stale ones
--      have looser OR semantics and shouldn't be there.
--
--   6. file_transfer — RLS disabled, table empty and unreferenced.
--      Enable default-deny so it can't be used as a sneaky read path.
--
--   7. is_supervisor() — STABLE function but no SET search_path. Add it.
--
-- All policy changes are conservative: tighter, never looser. Service-role
-- access (used by every server-side route) is unaffected.

-- ── 1. profiles: replace JWT-metadata-trusting policy ────────────────────────
DROP POLICY IF EXISTS "Supervisors and team managers can view team profiles" ON public.profiles;

-- Replacement: read from profiles.role (table-based), not JWT metadata.
-- Anyone can see their own profile (already covered by users_can_view_own_profile).
-- Elevated roles can see all. Team managers can see their direct reports.
CREATE POLICY "elevated_can_view_all_profiles"
  ON public.profiles
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles me
      WHERE me.id = auth.uid()
        AND me.role IN ('supervisor', 'it', 'team_manager')
    )
  );

-- Team managers can see direct-report profiles even if the policy above
-- says no (kept separate so it's auditable). This is redundant with the
-- elevated policy for team_manager but makes intent explicit.
CREATE POLICY "team_managers_can_view_reports"
  ON public.profiles
  FOR SELECT
  TO authenticated
  USING (
    team_manager_id = auth.uid()
  );

-- ── 2. clients: drop stale TO-public policies ────────────────────────────────
DROP POLICY IF EXISTS "Supports planners see assigned clients"        ON public.clients;
DROP POLICY IF EXISTS "Supports planners can update assigned clients" ON public.clients;
DROP POLICY IF EXISTS "Supervisors and IT can delete clients"         ON public.clients;
DROP POLICY IF EXISTS "Team managers and supervisors can insert clients" ON public.clients;
-- (The replacements from migration 016 are already in place:
--  supports_planner_select_own_clients, managers_and_supervisors_select_all_clients,
--  managers_and_supervisors_write_clients.)

-- ── 3. client_notes: lock down to assigned-or-elevated ───────────────────────
DROP POLICY IF EXISTS "Authenticated users can read notes"   ON public.client_notes;
DROP POLICY IF EXISTS "Authenticated users can insert notes" ON public.client_notes;
-- We keep any update/delete policies in place — those are typically narrower.

CREATE POLICY "client_notes_select_assigned_or_elevated"
  ON public.client_notes
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.clients c
      WHERE c.id = client_notes.client_id
        AND (
          c.assigned_to = auth.uid()
          OR EXISTS (
            SELECT 1 FROM public.profiles p
            WHERE p.id = auth.uid()
              AND p.role IN ('team_manager', 'supervisor', 'it')
          )
        )
    )
  );

CREATE POLICY "client_notes_insert_assigned_or_elevated"
  ON public.client_notes
  FOR INSERT
  TO authenticated
  WITH CHECK (
    author_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.clients c
      WHERE c.id = client_notes.client_id
        AND (
          c.assigned_to = auth.uid()
          OR EXISTS (
            SELECT 1 FROM public.profiles p
            WHERE p.id = auth.uid()
              AND p.role IN ('team_manager', 'supervisor', 'it')
          )
        )
    )
  );

-- ── 4. activity_log: lock down to assigned-or-elevated ───────────────────────
DROP POLICY IF EXISTS "Authenticated users can read activity"   ON public.activity_log;
DROP POLICY IF EXISTS "Authenticated users can insert activity" ON public.activity_log;

CREATE POLICY "activity_log_select_assigned_or_elevated"
  ON public.activity_log
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.clients c
      WHERE c.id = activity_log.client_id
        AND (
          c.assigned_to = auth.uid()
          OR EXISTS (
            SELECT 1 FROM public.profiles p
            WHERE p.id = auth.uid()
              AND p.role IN ('team_manager', 'supervisor', 'it')
          )
        )
    )
  );

CREATE POLICY "activity_log_insert_self_only"
  ON public.activity_log
  FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.clients c
      WHERE c.id = activity_log.client_id
        AND (
          c.assigned_to = auth.uid()
          OR EXISTS (
            SELECT 1 FROM public.profiles p
            WHERE p.id = auth.uid()
              AND p.role IN ('team_manager', 'supervisor', 'it')
          )
        )
    )
  );

-- ── 5. client_documents: tighten unscoped insert ─────────────────────────────
DROP POLICY IF EXISTS "Assigned users can insert documents" ON public.client_documents;

CREATE POLICY "client_documents_insert_assigned_or_elevated"
  ON public.client_documents
  FOR INSERT
  TO authenticated
  WITH CHECK (
    uploaded_by = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.clients c
      WHERE c.id = client_documents.client_id
        AND (
          c.assigned_to = auth.uid()
          OR EXISTS (
            SELECT 1 FROM public.profiles p
            WHERE p.id = auth.uid()
              AND p.role IN ('team_manager', 'supervisor', 'it')
          )
        )
    )
  );

-- ── 6. notifications: tighten unscoped insert ────────────────────────────────
DROP POLICY IF EXISTS "System can insert notifications" ON public.notifications;

-- Users can insert notifications targeted at themselves (e.g. local dismissal
-- markers).  System-generated notifications come through the service role.
CREATE POLICY "notifications_insert_self"
  ON public.notifications
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

-- ── 7. file_transfer: default-deny RLS on the orphan ─────────────────────────
ALTER TABLE public.file_transfer ENABLE ROW LEVEL SECURITY;
-- Intentionally no policy: only the service role can read or write it.
COMMENT ON TABLE public.file_transfer IS
  'Orphaned scratch table. RLS enabled, no policies — service role access only. Drop in a future migration once confirmed unused.';

-- ── 8. is_supervisor(): pin search_path ──────────────────────────────────────
CREATE OR REPLACE FUNCTION public.is_supervisor()
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = auth.uid()
      AND p.role = 'supervisor'
  );
$$;
