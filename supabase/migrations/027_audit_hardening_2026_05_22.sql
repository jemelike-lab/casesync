-- Migration 027: Audit hardening (2026-05-22)
--
-- Companion to the Opus-4.7 security audit. Applies four things:
--   1. Corrects existing w_user.role rows that were auto-provisioned as
--      ADMIN when they should have been SUPERVISOR (the auth.ts roleMap
--      previously mapped supervisor → ADMIN). Only flips users whose
--      linked CaseSync profile is currently 'supervisor'.
--   2. Locks down public.audit_logs so even authenticated users can never
--      UPDATE, DELETE, or SELECT (only INSERT is allowed; supervisor+
--      reads go through the admin client / service-role path).
--   3. Adds a 6-year retention guard on audit_logs (HIPAA §164.530(j)(2))
--      via a comment + index; actual purging happens out of band.
--   4. Records the duplicate-022 migration filename situation so future
--      Supabase CLI invocations don't trip over it.

-- ── 1. Correct existing Workryn supervisor role mappings ─────────────────────
-- For every w_user whose CaseSync profile.role = 'supervisor', upgrade
-- their Workryn role to SUPERVISOR if currently sitting at ADMIN.
-- Leaves OWNER, MANAGER, STAFF rows alone. Idempotent.
UPDATE public.w_user AS w
SET role = 'SUPERVISOR',
    "updatedAt" = NOW()
FROM public.profiles AS p
WHERE w."supabaseId"::uuid = p.id
  AND p.role = 'supervisor'
  AND w.role = 'ADMIN';

-- Same for 'it' staying as ADMIN — verify; do not overwrite if intentional.
-- (No statement: 'it' → ADMIN is correct per the new policy.)

-- ── 2. Lock down audit_logs ──────────────────────────────────────────────────
-- audit_logs has been INSERT-only by application convention. Make that a
-- DB-enforced reality:  authenticated role can INSERT only; SELECT goes
-- through the service-role admin client which bypasses RLS. UPDATE and
-- DELETE are denied for everyone except the service role.

ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- Drop any prior permissive policies on audit_logs that could have allowed
-- direct reads with the anon/authenticated key. We rebuild a minimal set.
DO $$
DECLARE
  pol RECORD;
BEGIN
  FOR pol IN
    SELECT policyname
    FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'audit_logs'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.audit_logs', pol.policyname);
  END LOOP;
END$$;

-- Authenticated users may INSERT their own audit rows (or NULL user_id for
-- pre-login events like auth.failed). The application sets user_id from the
-- server-side session, never trusting client input.
CREATE POLICY "audit_logs_insert_authenticated"
  ON public.audit_logs
  FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id IS NULL
    OR user_id = auth.uid()
  );

-- Anonymous bucket for failed-login audit rows.
CREATE POLICY "audit_logs_insert_anon"
  ON public.audit_logs
  FOR INSERT
  TO anon
  WITH CHECK (user_id IS NULL);

-- No SELECT/UPDATE/DELETE policies for authenticated or anon — operations
-- without a matching policy are denied under RLS. The service role
-- bypasses RLS entirely and is the only reader.

-- Bring the restrictive disabled-user guard from migration 022 back in
-- after the policy reset (DROP above removed it):
CREATE POLICY "block_disabled_audit_logs"
  ON public.audit_logs
  AS RESTRICTIVE
  FOR ALL
  TO authenticated
  USING (public.is_active_user());

COMMENT ON TABLE public.audit_logs IS
  'HIPAA audit trail. INSERT-only from authenticated/anon roles. SELECT via service role only. Retention: ≥6 years per 45 CFR §164.530(j)(2).';

-- ── 3. Retention helper index + comment ──────────────────────────────────────
-- An index on created_at makes the 6-year purge query cheap and supports
-- compliance dashboards that filter "events in the last N years".
CREATE INDEX IF NOT EXISTS audit_logs_created_at_idx
  ON public.audit_logs (created_at DESC);

CREATE INDEX IF NOT EXISTS audit_logs_action_created_at_idx
  ON public.audit_logs (action, created_at DESC);

-- Index for bulk-access analytics — used by the new auditBulkAccess calls
-- from /api/clients GET (see Section 5C of the audit).
CREATE INDEX IF NOT EXISTS audit_logs_user_id_action_idx
  ON public.audit_logs (user_id, action, created_at DESC);

-- ── 4. Block client-side mutation of audit_exports too ───────────────────────
-- audit_exports follows the same INSERT-only model.
ALTER TABLE public.audit_exports ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  pol RECORD;
BEGIN
  FOR pol IN
    SELECT policyname
    FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'audit_exports'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.audit_exports', pol.policyname);
  END LOOP;
END$$;

CREATE POLICY "audit_exports_insert_authenticated"
  ON public.audit_exports
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "block_disabled_audit_exports"
  ON public.audit_exports
  AS RESTRICTIVE
  FOR ALL
  TO authenticated
  USING (public.is_active_user());

COMMENT ON TABLE public.audit_exports IS
  'Export audit trail. INSERT-only from authenticated role. SELECT via service role only.';

-- ── 5. Confirm scaling indexes the audit calls out (idempotent) ──────────────
CREATE INDEX IF NOT EXISTS clients_assigned_to_active_idx
  ON public.clients (assigned_to, is_active)
  WHERE is_active = true;

CREATE INDEX IF NOT EXISTS clients_classification_active_idx
  ON public.clients (client_classification, is_active)
  WHERE is_active = true;

-- ── 6. Note on duplicate-022 migration files ─────────────────────────────────
-- Repository has both supabase/migrations/022_active_user_guard.sql and
-- supabase/migrations/022_pto_module.sql. Both have been applied by hand
-- via the Supabase SQL editor. Future migrations use 027+. Do NOT rename
-- the existing 022 files in production — the supabase_migrations table
-- already references them by full filename.
SELECT 'migration 027 audit_hardening applied' AS status;
