-- ============================================================================
-- CaseSync — Phase 3 Gate #2: per-role RLS verification on AZURE
-- ----------------------------------------------------------------------------
-- WHAT THIS IS: read-only catalog parity + per-role read/write behavior checks
-- against the Azure Postgres DB, mirroring exactly what withRlsContext() does
-- in lib/db/azure.ts (SET ROLE authenticated; set_config('app.user_id', uuid)).
--
-- SAFE: every write check runs inside BEGIN ... ROLLBACK. NOTHING is persisted.
-- Confirmed against TEST/SEED data only (Doe family). Do NOT run against a DB
-- that has been loaded with real PHI — that is gated behind Option C (gate #3).
--
-- RUN AS the production app login (casesync_app), keyword=value conninfo form
-- (handles '@' in password). Fill the password from /tmp/secrets or pw manager:
--
--   psql "host=blh-casesync-prod.postgres.database.azure.com port=5432 \
--         dbname=casesync user=casesync_app password=REDACTED sslmode=require" \
--        -f azure_gate2_verify.sql
--
-- casesync_app is NOINHERIT and a member of 'authenticated', so SET ROLE
-- authenticated is exactly the production code path. pg_catalog is readable to
-- PUBLIC, so Part A works as casesync_app too.
-- ============================================================================
\pset pager off
\set ON_ERROR_STOP off
\timing off

\echo ''
\echo '############ PART A — CATALOG PARITY (read-only) ############'
\echo ''

\echo '[A1] RLS enabled + policy command coverage. EXPECTED (from source/Supabase):'
\echo '     activity_log      -> {ALL,INSERT,SELECT}        (3 policies)'
\echo '     client_documents  -> {ALL,DELETE,INSERT,SELECT,UPDATE} (5)'
\echo '     client_import_runs-> {INSERT,SELECT}            (2 policies)  [INSERT-only route, OK]'
\echo '     client_notes      -> {ALL,DELETE,INSERT,SELECT,UPDATE} (5)'
\echo '     clients           -> {ALL,DELETE,INSERT,SELECT,UPDATE} (9)'
\echo '     profiles          -> {ALL,SELECT,UPDATE}        (6 policies)'
\echo '     saved_views       -> ABSENT (table not deployed; feature degrades gracefully)'
SELECT
  c.relname                                   AS table_name,
  c.relrowsecurity                            AS rls_on,
  count(pol.polname)                          AS n_policies,
  array_agg(DISTINCT CASE pol.polcmd
      WHEN 'r' THEN 'SELECT' WHEN 'a' THEN 'INSERT' WHEN 'w' THEN 'UPDATE'
      WHEN 'd' THEN 'DELETE' WHEN '*' THEN 'ALL' END)
    FILTER (WHERE pol.polname IS NOT NULL)     AS commands_covered
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
LEFT JOIN pg_policy pol ON pol.polrelid = c.oid
WHERE n.nspname = 'public'
  AND c.relname IN ('clients','client_documents','saved_views','client_notes',
                    'activity_log','client_import_runs','profiles')
GROUP BY 1,2
ORDER BY 1;

\echo ''
\echo '[A2] saved_views table existence (EXPECT: NULL = absent, same as source):'
SELECT to_regclass('public.saved_views') AS saved_views_regclass;

\echo ''
\echo '[A3] SECURITY DEFINER functions present + owner + authenticated EXECUTE.'
\echo '     EXPECT: all present, prosecdef=t (except is_supervisor=f), auth_can_exec=t.'
\echo '     If reassign_client auth_can_exec=f -> reassign route will FAIL on Azure.'
SELECT
  p.proname                                                    AS function_name,
  p.prosecdef                                                  AS security_definer,
  r.rolname                                                    AS owner,
  has_function_privilege('authenticated', p.oid, 'execute')    AS auth_can_exec,
  pg_get_function_identity_arguments(p.oid)                    AS args
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
JOIN pg_roles r ON r.oid = p.proowner
WHERE n.nspname = 'public'
  AND p.proname IN ('reassign_client','revoke_user_sessions','current_user_role',
                    'user_can_access_client','is_active_user','is_supervisor')
ORDER BY p.proname;

\echo ''
\echo '[A4] auth.uid() shim present and reads app.user_id (EXPECT: 1 row, reads_app_user_id=t):'
SELECT
  n.nspname AS schema,
  p.proname AS func,
  (pg_get_functiondef(p.oid) ILIKE '%app.user_id%') AS reads_app_user_id
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'auth' AND p.proname = 'uid';

\echo ''
\echo '[A5] App/audit login attributes + role membership:'
SELECT rolname, rolcanlogin AS can_login, rolinherit AS inherit,
       rolbypassrls AS bypass_rls, rolsuper AS is_super
FROM pg_roles
WHERE rolname IN ('casesync_app','casesync_audit','authenticated');
SELECT r.rolname AS member, g.rolname AS member_of
FROM pg_auth_members m
JOIN pg_roles r ON r.oid = m.member
JOIN pg_roles g ON g.oid = m.roleid
WHERE r.rolname IN ('casesync_app','casesync_audit')
ORDER BY 1,2;

\echo ''
\echo '############ PART B/C — PER-ROLE RLS (read + write, all ROLLED BACK) ############'

-- ---------------------------------------------------------------------------
-- SUPERVISOR — Josh Evans — EXPECT clients=16 (all), profiles=ALL, writes broad
-- ---------------------------------------------------------------------------
\echo ''
\echo '===== [SUPERVISOR] Josh Evans (ced7dfd5) — expect clients_visible=16 ====='
BEGIN;
  SET LOCAL ROLE authenticated;
  SELECT set_config('app.user_id','ced7dfd5-23c3-4609-b573-c69ac2bca689', true) AS app_uid_set;
  SELECT current_user AS as_role, public.current_user_role() AS resolved_role;
  SELECT 'clients_visible'  AS chk, count(*) AS n FROM clients;            -- expect 16
  SELECT 'profiles_visible' AS chk, count(*) AS n FROM profiles;          -- expect ALL (elevated)
  -- bulk-contact bounded UPDATE: supervisor can write all active clients
  WITH u AS (UPDATE clients SET last_contact_date = current_date WHERE is_active RETURNING 1)
  SELECT 'bulkcontact_update_affected' AS chk, count(*) AS n FROM u;      -- expect = active clients (broad)
ROLLBACK;

-- ---------------------------------------------------------------------------
-- TEAM MANAGER — Paul Evans — EXPECT clients=9 (own team only), profiles=ALL
-- (elevated_can_view_all_profiles grants TM SELECT on planners' profiles)
-- ---------------------------------------------------------------------------
\echo ''
\echo '===== [TEAM_MANAGER] Paul Evans (b6b4b398) — expect clients_visible=9 ====='
BEGIN;
  SET LOCAL ROLE authenticated;
  SELECT set_config('app.user_id','b6b4b398-d0a4-4b5b-a6ca-83419b12eccb', true) AS app_uid_set;
  SELECT current_user AS as_role, public.current_user_role() AS resolved_role;
  SELECT 'clients_visible'   AS chk, count(*) AS n FROM clients;          -- expect 9
  SELECT 'profiles_visible'  AS chk, count(*) AS n FROM profiles;         -- expect ALL (>=4: own + planners)
  SELECT 'can_see_planner_profiles' AS chk, count(*) AS n FROM profiles
    WHERE id IN ('51999fb0-691f-4d0e-9140-530948514257',  -- David
                 '998ded2b-ebfa-4184-8d73-4cc0b211509d'); -- Peter Scott  -- expect 2
  -- bulk-contact bounded UPDATE: TM can write only own-team active clients
  WITH u AS (UPDATE clients SET last_contact_date = current_date WHERE is_active RETURNING 1)
  SELECT 'bulkcontact_update_affected' AS chk, count(*) AS n FROM u;      -- expect 9
  -- NEGATIVE: attempt to touch a supervisor's client (outside TM team) by id
  WITH u AS (UPDATE clients SET last_contact_date = current_date
             WHERE id = '284211da-40e3-4c10-8aca-c14f8db95324' RETURNING 1)  -- Josh's client
  SELECT 'update_outside_team_affected' AS chk, count(*) AS n FROM u;     -- expect 0 (RLS denies)
  -- reassign_client (SECURITY DEFINER) within team: David's client -> Peter Scott
  DO $$
  DECLARE n int;
  BEGIN
    PERFORM public.reassign_client(
      '12d1fc8a-bdc9-4a44-889d-b1190faaca04'::uuid,  -- David's client
      '998ded2b-ebfa-4184-8d73-4cc0b211509d'::uuid,  -- -> Peter Scott (same team)
      'gate2 verification (rolled back)');
    RAISE NOTICE 'reassign_within_team: ALLOWED (expected for TM via SECURITY DEFINER)';
  EXCEPTION WHEN others THEN
    RAISE NOTICE 'reassign_within_team: BLOCKED/err = % (SQLSTATE %)', SQLERRM, SQLSTATE;
  END $$;
ROLLBACK;

-- ---------------------------------------------------------------------------
-- SUPPORT PLANNER (active) — David Doe — EXPECT clients=3 (own), profiles=1 (own)
-- ---------------------------------------------------------------------------
\echo ''
\echo '===== [SUPPORTS_PLANNER active] David Doe (51999fb0) — expect clients_visible=3 ====='
BEGIN;
  SET LOCAL ROLE authenticated;
  SELECT set_config('app.user_id','51999fb0-691f-4d0e-9140-530948514257', true) AS app_uid_set;
  SELECT current_user AS as_role, public.current_user_role() AS resolved_role;
  SELECT 'clients_visible'  AS chk, count(*) AS n FROM clients;           -- expect 3
  SELECT 'profiles_visible' AS chk, count(*) AS n FROM profiles;          -- expect 1 (own only)
  -- bulk-contact bounded UPDATE: SP can write only own assigned active clients
  WITH u AS (UPDATE clients SET last_contact_date = current_date WHERE is_active RETURNING 1)
  SELECT 'bulkcontact_update_affected' AS chk, count(*) AS n FROM u;      -- expect 3
  -- NEGATIVE: try to update a client owned by Peter Scott (not David's)
  WITH u AS (UPDATE clients SET last_contact_date = current_date
             WHERE id = '2736f70c-8038-418f-aa4d-82f4578f0824' RETURNING 1) -- Peter Scott's
  SELECT 'update_not_owned_affected' AS chk, count(*) AS n FROM u;        -- expect 0
  -- client_notes INSERT on OWNED client as SELF (positive): expect ALLOWED rows=1
  DO $$
  DECLARE n int;
  BEGIN
    INSERT INTO client_notes (client_id, author_id, content)
    VALUES ('12d1fc8a-bdc9-4a44-889d-b1190faaca04',
            '51999fb0-691f-4d0e-9140-530948514257', 'gate2 note (rolled back)');
    GET DIAGNOSTICS n = ROW_COUNT;
    RAISE NOTICE 'notes_insert_owned_self: ALLOWED rows=% (expect 1)', n;
  EXCEPTION WHEN others THEN
    RAISE NOTICE 'notes_insert_owned_self: DENIED err=% (expect ALLOWED)', SQLERRM;
  END $$;
  -- client_notes INSERT with WRONG author_id (negative): expect DENIED by WITH CHECK
  DO $$
  BEGIN
    INSERT INTO client_notes (client_id, author_id, content)
    VALUES ('12d1fc8a-bdc9-4a44-889d-b1190faaca04',
            '998ded2b-ebfa-4184-8d73-4cc0b211509d', 'gate2 spoof (rolled back)');
    RAISE NOTICE 'notes_insert_wrong_author: UNEXPECTEDLY ALLOWED';
  EXCEPTION WHEN others THEN
    RAISE NOTICE 'notes_insert_wrong_author: DENIED (expected) [% / %]', SQLSTATE, SQLERRM;
  END $$;
  -- client_notes INSERT on a NOT-owned client (negative): expect DENIED
  DO $$
  BEGIN
    INSERT INTO client_notes (client_id, author_id, content)
    VALUES ('2736f70c-8038-418f-aa4d-82f4578f0824',
            '51999fb0-691f-4d0e-9140-530948514257', 'gate2 cross (rolled back)');
    RAISE NOTICE 'notes_insert_not_owned_client: UNEXPECTEDLY ALLOWED';
  EXCEPTION WHEN others THEN
    RAISE NOTICE 'notes_insert_not_owned_client: DENIED (expected) [%]', SQLSTATE;
  END $$;
  -- client_documents INSERT on OWNED client as SELF (positive): expect ALLOWED rows=1
  DO $$
  DECLARE n int;
  BEGIN
    INSERT INTO client_documents (client_id, uploaded_by, file_name, file_path,
                                  file_size, mime_type, category, storage_provider)
    VALUES ('12d1fc8a-bdc9-4a44-889d-b1190faaca04',
            '51999fb0-691f-4d0e-9140-530948514257',
            'gate2.txt','gate2/path',1,'text/plain','general','sharepoint');
    GET DIAGNOSTICS n = ROW_COUNT;
    RAISE NOTICE 'docs_insert_owned_self: ALLOWED rows=% (expect 1)', n;
  EXCEPTION WHEN others THEN
    RAISE NOTICE 'docs_insert_owned_self: DENIED err=% (expect ALLOWED)', SQLERRM;
  END $$;
  -- activity_log INSERT on OWNED client as SELF (positive): expect ALLOWED rows=1
  DO $$
  DECLARE n int;
  BEGIN
    INSERT INTO activity_log (client_id, user_id, action, field_name, old_value, new_value)
    VALUES ('12d1fc8a-bdc9-4a44-889d-b1190faaca04',
            '51999fb0-691f-4d0e-9140-530948514257',
            'gate2 log (rolled back)','last_contact_date',NULL,current_date::text);
    GET DIAGNOSTICS n = ROW_COUNT;
    RAISE NOTICE 'activity_insert_owned_self: ALLOWED rows=% (expect 1)', n;
  EXCEPTION WHEN others THEN
    RAISE NOTICE 'activity_insert_owned_self: DENIED err=% (expect ALLOWED)', SQLERRM;
  END $$;
ROLLBACK;

-- ---------------------------------------------------------------------------
-- SUPPORT PLANNER (DISABLED) — John Doe — EXPECT clients=0, profiles=0
-- (is_active_user() restrictive ALL gate blocks all visibility)
-- ---------------------------------------------------------------------------
\echo ''
\echo '===== [SUPPORTS_PLANNER disabled] John Doe (179c5b5a) — expect clients_visible=0 ====='
BEGIN;
  SET LOCAL ROLE authenticated;
  SELECT set_config('app.user_id','179c5b5a-7618-42f7-aeed-3546518e8a63', true) AS app_uid_set;
  SELECT public.is_active_user() AS is_active_expect_false;               -- expect f
  SELECT 'clients_visible'  AS chk, count(*) AS n FROM clients;           -- expect 0 (blocked)
  SELECT 'profiles_visible' AS chk, count(*) AS n FROM profiles;          -- expect 0 (blocked)
  -- write attempt should also touch nothing
  WITH u AS (UPDATE clients SET last_contact_date = current_date WHERE is_active RETURNING 1)
  SELECT 'bulkcontact_update_affected' AS chk, count(*) AS n FROM u;      -- expect 0
ROLLBACK;

\echo ''
\echo '############ END — review counts vs EXPECT comments above. ############'
\echo 'PASS criteria: supervisor=16, team_manager=9 (+ planner profiles visible),'
\echo 'SP active=3 (writes bounded to 3, cross-writes 0, self-inserts ALLOWED,'
\echo 'spoofed/foreign inserts DENIED), SP disabled=0 everywhere.'
