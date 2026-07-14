-- azure_audit_read_policy.sql (2026-07-14)
-- audit_logs was append-only with NO SELECT policy, so the Activity Monitor
-- read zero rows. Adds elevated read (supervisor/administrator) only.
-- Append-only semantics preserved: INSERT remains casesync_audit-scoped,
-- no UPDATE/DELETE grants exist.
\pset pager off
BEGIN;
DROP POLICY IF EXISTS audit_logs_select_elevated ON public.audit_logs;
CREATE POLICY audit_logs_select_elevated ON public.audit_logs
  FOR SELECT TO authenticated
  USING (
    (SELECT EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('supervisor', 'administrator')
    ))
  );
GRANT SELECT ON public.audit_logs TO authenticated;
COMMIT;
\echo '[V1] Policies on audit_logs:'
SELECT policyname, cmd FROM pg_policies WHERE schemaname='public' AND tablename='audit_logs' ORDER BY policyname;
