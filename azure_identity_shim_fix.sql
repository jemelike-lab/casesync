-- azure_identity_shim_fix.sql v2 (2026-07-06/07, launch-eve identity gap)
--
-- Run in Azure Cloud Shell as Jemelike@blhnurses.com:
--   export PGPASSWORD=$(az account get-access-token --resource-type oss-rdbms --query accessToken -o tsv)
--   psql "host=blh-casesync-prod.postgres.database.azure.com dbname=casesync user=Jemelike@blhnurses.com sslmode=require" -f azure_identity_shim_fix.sql
--
-- v1 LEARNINGS (both banked):
--   * SET ROLE csadmin WORKS from the Entra admin session — no auth-mode flip
--     needed for owner-level DDL/DML on this server.
--   * Azure public.profiles has FK profiles_id_fkey -> a users auth-shim
--     table; seeding profiles alone fails (23503). The shim is TWO tables:
--     users (auth clone) <- profiles. This script seeds both, introspecting
--     the users table's shape at runtime instead of assuming columns.
--
-- WHY: the Azure PHI plane resolves each caller's role from the AZURE
-- public.profiles shim (current_user_role() -> auth.uid() -> app.user_id).
-- Identity lives in Supabase and nothing wrote new users into the shim, so
-- every account accepted after the 2026-06-28 cutover resolved to role NULL
-- and saw zero rows (launch finding: all three new supervisors blind).
-- profiles has NO INSERT policy for `authenticated`, so app writes go through
-- the SECURITY DEFINER functions below (owned by csadmin => RLS-exempt while
-- FORCE RLS is off), each with its own authorization guard.

\pset pager off
\set ON_ERROR_STOP on

-- Assume table-owner standing (proven working from the Entra admin session).
DO $$ BEGIN
  EXECUTE 'SET ROLE csadmin';
  RAISE NOTICE 'running as csadmin';
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'csadmin not assumable - continuing as %', current_user;
END $$;

BEGIN;

-- 0a. Seed the users auth-shim rows (FK target of profiles_id_fkey).
--     Introspects the target table: id always; email + raw_user_meta_data
--     only if those columns exist. Fails loudly (full rollback) if the shim
--     has any other required column this script does not know how to fill.
DO $seed$
DECLARE
  tgt regclass;
  reqcols text;
  has_email boolean;
  has_meta boolean;
  r record;
BEGIN
  SELECT confrelid::regclass INTO tgt
  FROM pg_constraint
  WHERE conname = 'profiles_id_fkey' AND conrelid = 'public.profiles'::regclass;

  IF tgt IS NULL THEN
    RAISE NOTICE 'no profiles_id_fkey found - skipping users-shim seed';
    RETURN;
  END IF;
  RAISE NOTICE 'users auth-shim FK target: %', tgt;

  SELECT string_agg(a.attname, ',') INTO reqcols
  FROM pg_attribute a
  WHERE a.attrelid = tgt AND a.attnum > 0 AND NOT a.attisdropped
    AND a.attnotnull AND NOT a.atthasdef
    AND a.attname NOT IN ('id', 'email', 'raw_user_meta_data');
  IF reqcols IS NOT NULL THEN
    RAISE EXCEPTION 'users shim % has unhandled required columns: %', tgt, reqcols;
  END IF;

  SELECT EXISTS(SELECT 1 FROM pg_attribute WHERE attrelid = tgt AND attname = 'email' AND NOT attisdropped),
         EXISTS(SELECT 1 FROM pg_attribute WHERE attrelid = tgt AND attname = 'raw_user_meta_data' AND NOT attisdropped)
    INTO has_email, has_meta;

  FOR r IN
    SELECT * FROM (VALUES
      ('ced7dfd5-23c3-4609-b573-c69ac2bca689'::uuid, 'jemelike@gmail.com'),
      ('794e06bf-e8cd-4ad3-8fe6-b3ac7cd94d12'::uuid, 'jpritchett@blhnurses.com'),
      ('f8d3d0d1-ed36-4936-b6a7-66264e61e854'::uuid, 'bianca.parker@blhnurses.com'),
      ('aa51923f-7d05-4d67-b220-c6a276f17a8e'::uuid, 'gjannuzzio@blhnurses.com')
    ) v(id, email)
  LOOP
    EXECUTE format(
      'INSERT INTO %s (id%s%s) VALUES (%L::uuid%s%s) ON CONFLICT (id) DO NOTHING',
      tgt,
      CASE WHEN has_email THEN ', email' ELSE '' END,
      CASE WHEN has_meta THEN ', raw_user_meta_data' ELSE '' END,
      r.id,
      CASE WHEN has_email THEN format(', %L', r.email) ELSE '' END,
      CASE WHEN has_meta THEN ', ''{"disabled": false}''::jsonb' ELSE '' END
    );
  END LOOP;
  RAISE NOTICE 'users-shim seed complete';
END $seed$;

-- 0b. Seed the four current identities into profiles.
INSERT INTO public.profiles (id, full_name, role, team_manager_id) VALUES
  ('ced7dfd5-23c3-4609-b573-c69ac2bca689', 'Josh Evans',         'supervisor', NULL),
  ('794e06bf-e8cd-4ad3-8fe6-b3ac7cd94d12', 'Jennifer Pritchett', 'supervisor', NULL),
  ('f8d3d0d1-ed36-4936-b6a7-66264e61e854', 'Bianca Parker',      'supervisor', NULL),
  ('aa51923f-7d05-4d67-b220-c6a276f17a8e', 'Gabriela Jannuzzio', 'supervisor', NULL)
ON CONFLICT (id) DO UPDATE SET
  full_name       = EXCLUDED.full_name,
  role            = EXCLUDED.role,
  team_manager_id = EXCLUDED.team_manager_id;

-- 1. sync_user_identity(): the app's ONLY write path into the shim.
--    Ensures the users auth-shim row exists (same introspection), then
--    upserts profiles. Guards (auth.uid() = app.user_id, set by the server):
--      * elevated callers (supervisor/it/administrator) may sync anyone
--      * a caller may self-provision their own MISSING row (invite acceptance
--        runs before the new user can pass any role check)
--      * self role CHANGES require an elevated caller
CREATE OR REPLACE FUNCTION public.sync_user_identity(
  p_id uuid, p_full_name text, p_role text, p_team_manager_id uuid
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $fn$
DECLARE
  v_caller        uuid := auth.uid();
  v_caller_role   text;
  v_existing_role text;
  v_tgt           regclass;
  v_email_req     boolean := false;
  v_has_meta      boolean := false;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'sync_user_identity: no caller identity';
  END IF;
  SELECT role INTO v_caller_role   FROM public.profiles WHERE id = v_caller;
  SELECT role INTO v_existing_role FROM public.profiles WHERE id = p_id;

  IF v_caller <> p_id
     AND coalesce(v_caller_role, '') NOT IN ('supervisor', 'it', 'administrator') THEN
    RAISE EXCEPTION 'sync_user_identity: not authorized';
  END IF;

  IF v_caller = p_id AND v_existing_role IS NOT NULL AND v_existing_role <> p_role
     AND coalesce(v_caller_role, '') NOT IN ('supervisor', 'it', 'administrator') THEN
    RAISE EXCEPTION 'sync_user_identity: role change requires an elevated caller';
  END IF;

  -- Ensure the auth-shim row exists first (profiles_id_fkey target).
  SELECT confrelid::regclass INTO v_tgt
  FROM pg_constraint
  WHERE conname = 'profiles_id_fkey' AND conrelid = 'public.profiles'::regclass;
  IF v_tgt IS NOT NULL THEN
    SELECT EXISTS(SELECT 1 FROM pg_attribute WHERE attrelid = v_tgt AND attname = 'email' AND NOT attisdropped AND attnotnull),
           EXISTS(SELECT 1 FROM pg_attribute WHERE attrelid = v_tgt AND attname = 'raw_user_meta_data' AND NOT attisdropped)
      INTO v_email_req, v_has_meta;
    EXECUTE format(
      'INSERT INTO %s (id%s%s) VALUES (%L::uuid%s%s) ON CONFLICT (id) DO NOTHING',
      v_tgt,
      CASE WHEN v_email_req THEN ', email' ELSE '' END,
      CASE WHEN v_has_meta THEN ', raw_user_meta_data' ELSE '' END,
      p_id,
      CASE WHEN v_email_req THEN format(', %L', p_id::text || '@sync.casesync.local') ELSE '' END,
      CASE WHEN v_has_meta THEN ', ''{"disabled": false}''::jsonb' ELSE '' END
    );
  END IF;

  INSERT INTO public.profiles (id, full_name, role, team_manager_id)
  VALUES (p_id, p_full_name, p_role, p_team_manager_id)
  ON CONFLICT (id) DO UPDATE SET
    full_name       = EXCLUDED.full_name,
    role            = EXCLUDED.role,
    team_manager_id = EXCLUDED.team_manager_id;
END;
$fn$;
REVOKE EXECUTE ON FUNCTION public.sync_user_identity(uuid, text, text, uuid) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.sync_user_identity(uuid, text, text, uuid) TO authenticated;

-- 2. delete_user_identity(): elevated-only removal (user hard-delete paths).
CREATE OR REPLACE FUNCTION public.delete_user_identity(p_id uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $fn$
DECLARE
  v_caller_role text;
BEGIN
  SELECT role INTO v_caller_role FROM public.profiles WHERE id = auth.uid();
  IF coalesce(v_caller_role, '') NOT IN ('supervisor', 'it', 'administrator') THEN
    RAISE EXCEPTION 'delete_user_identity: not authorized';
  END IF;
  DELETE FROM public.profiles WHERE id = p_id;
END;
$fn$;
REVOKE EXECUTE ON FUNCTION public.delete_user_identity(uuid) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.delete_user_identity(uuid) TO authenticated;

-- 3. Administrator parity: any policy on the PHI tables whose role array
--    grants 'supervisor' must also grant 'administrator' (isSupervisorLike =
--    supervisor|it|administrator; directive 2026-07-06). Mechanical rewrite,
--    idempotent, preserves the (SELECT ...) InitPlan wraps (040 technique).
DO $$
DECLARE
  pol record;
  new_qual text;
  new_check text;
  stmt text;
  changed int := 0;
BEGIN
  FOR pol IN
    SELECT schemaname, tablename, policyname, qual, with_check
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename IN ('clients','profiles','client_notes','activity_log','client_documents','client_import_runs')
      AND (coalesce(qual,'') LIKE '%''supervisor''%' OR coalesce(with_check,'') LIKE '%''supervisor''%')
      AND NOT (coalesce(qual,'') LIKE '%''administrator''%' OR coalesce(with_check,'') LIKE '%''administrator''%')
  LOOP
    new_qual  := replace(replace(pol.qual,
        'ARRAY[''supervisor''::text, ''it''::text]',
        'ARRAY[''supervisor''::text, ''it''::text, ''administrator''::text]'),
        'ARRAY[''team_manager''::text, ''supervisor''::text, ''it''::text]',
        'ARRAY[''team_manager''::text, ''supervisor''::text, ''it''::text, ''administrator''::text]');
    new_check := replace(replace(pol.with_check,
        'ARRAY[''supervisor''::text, ''it''::text]',
        'ARRAY[''supervisor''::text, ''it''::text, ''administrator''::text]'),
        'ARRAY[''team_manager''::text, ''supervisor''::text, ''it''::text]',
        'ARRAY[''team_manager''::text, ''supervisor''::text, ''it''::text, ''administrator''::text]');
    new_qual  := replace(new_qual,
        'ARRAY[''supervisor''::text, ''it''::text, ''team_manager''::text]',
        'ARRAY[''supervisor''::text, ''it''::text, ''team_manager''::text, ''administrator''::text]');
    new_check := replace(new_check,
        'ARRAY[''supervisor''::text, ''it''::text, ''team_manager''::text]',
        'ARRAY[''supervisor''::text, ''it''::text, ''team_manager''::text, ''administrator''::text]');

    IF new_qual IS NOT DISTINCT FROM pol.qual AND new_check IS NOT DISTINCT FROM pol.with_check THEN
      RAISE NOTICE 'UNMATCHED pattern, manual review: %.% / %', pol.schemaname, pol.tablename, pol.policyname;
      CONTINUE;
    END IF;

    stmt := format('ALTER POLICY %I ON %I.%I', pol.policyname, pol.schemaname, pol.tablename);
    IF new_qual  IS NOT NULL THEN stmt := stmt || format(' USING (%s)', new_qual); END IF;
    IF new_check IS NOT NULL THEN stmt := stmt || format(' WITH CHECK (%s)', new_check); END IF;
    EXECUTE stmt;
    changed := changed + 1;
    RAISE NOTICE 'administrator parity: %.% / %', pol.schemaname, pol.tablename, pol.policyname;
  END LOOP;
  RAISE NOTICE 'policies updated: %', changed;
END $$;

COMMIT;

-- 4. Verification (read-only, rolled back): a NEW supervisor must now see
--    the full active caseload. EXPECT clients_visible = 53.
BEGIN;
  SET LOCAL ROLE authenticated;
  SELECT set_config('app.user_id', 'aa51923f-7d05-4d67-b220-c6a276f17a8e', true) AS gabriela_ctx;
  SELECT current_user AS as_role, public.current_user_role() AS resolved_role;
  SELECT 'clients_visible' AS chk, count(*) AS n FROM public.clients WHERE is_active;
ROLLBACK;
