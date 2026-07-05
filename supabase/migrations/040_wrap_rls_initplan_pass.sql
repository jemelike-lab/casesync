-- (SELECT)-wrap perf pass on RLS policies (2026-07-05 cleanup item).
-- Bare calls to auth.uid(), is_workryn_admin(), get_workryn_user_id(), and
-- current_user_role() in policy expressions are re-evaluated per row; wrapping
-- them in a scalar subselect forces one-time InitPlan evaluation (STABLE alone
-- is insufficient -- proven on the clients-table pass). This block rewrites
-- every affected policy mechanically from pg_policies itself, preserving
-- semantics exactly. Already-wrapped forms are protected from double-wrapping.
-- user_can_access_client(client_id) takes a row argument and cannot be
-- init-planned; it is intentionally left alone.
-- Applied to iiqttbpaufzlinbufsdx via Supabase MCP on 2026-07-05 (all bare
-- calls cleared across 189 policies; auth_rls_initplan advisor warnings gone).
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
      AND (
        coalesce(qual, '') ~ '(auth\.uid|is_workryn_admin|get_workryn_user_id|current_user_role)\(\)'
        OR coalesce(with_check, '') ~ '(auth\.uid|is_workryn_admin|get_workryn_user_id|current_user_role)\(\)'
      )
  LOOP
    new_qual := pol.qual;
    new_check := pol.with_check;

    IF new_qual IS NOT NULL THEN
      new_qual := replace(new_qual, '( SELECT auth.uid() AS uid)', '__W_UID__');
      new_qual := replace(new_qual, '( SELECT current_user_role() AS current_user_role)', '__W_ROLE__');
      new_qual := replace(new_qual, 'auth.uid()', '(SELECT auth.uid())');
      new_qual := replace(new_qual, 'current_user_role()', '(SELECT current_user_role())');
      new_qual := replace(new_qual, 'is_workryn_admin()', '(SELECT is_workryn_admin())');
      new_qual := replace(new_qual, 'get_workryn_user_id()', '(SELECT get_workryn_user_id())');
      new_qual := replace(new_qual, '__W_UID__', '( SELECT auth.uid() AS uid)');
      new_qual := replace(new_qual, '__W_ROLE__', '( SELECT current_user_role() AS current_user_role)');
    END IF;

    IF new_check IS NOT NULL THEN
      new_check := replace(new_check, '( SELECT auth.uid() AS uid)', '__W_UID__');
      new_check := replace(new_check, '( SELECT current_user_role() AS current_user_role)', '__W_ROLE__');
      new_check := replace(new_check, 'auth.uid()', '(SELECT auth.uid())');
      new_check := replace(new_check, 'current_user_role()', '(SELECT current_user_role())');
      new_check := replace(new_check, 'is_workryn_admin()', '(SELECT is_workryn_admin())');
      new_check := replace(new_check, 'get_workryn_user_id()', '(SELECT get_workryn_user_id())');
      new_check := replace(new_check, '__W_UID__', '( SELECT auth.uid() AS uid)');
      new_check := replace(new_check, '__W_ROLE__', '( SELECT current_user_role() AS current_user_role)');
    END IF;

    IF new_qual IS NOT DISTINCT FROM pol.qual AND new_check IS NOT DISTINCT FROM pol.with_check THEN
      CONTINUE;
    END IF;

    stmt := format('ALTER POLICY %I ON %I.%I', pol.policyname, pol.schemaname, pol.tablename);
    IF new_qual IS NOT NULL THEN
      stmt := stmt || format(' USING (%s)', new_qual);
    END IF;
    IF new_check IS NOT NULL THEN
      stmt := stmt || format(' WITH CHECK (%s)', new_check);
    END IF;

    EXECUTE stmt;
    changed := changed + 1;
  END LOOP;

  RAISE NOTICE 'wrap_rls_initplan_pass: % policies rewritten', changed;
END $$;
