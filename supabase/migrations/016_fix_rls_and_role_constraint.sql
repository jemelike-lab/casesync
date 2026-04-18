-- Fix stale RLS policies and profiles role constraint
-- The initial schema used 'case_manager' and 'supervisor' roles.
-- The app now uses: supports_planner, team_manager, supervisor, it
-- Most API routes bypass RLS using the service role key, but these
-- policies matter if RLS-enforced queries are ever added, and for
-- correctness when using the anon/authenticated role directly.

-- ── 1. Fix profiles role constraint ──────────────────────────────────────────
-- The initial schema constrained role to ('case_manager', 'supervisor').
-- This was already altered in production but not reflected in migrations.
-- This migration makes it explicit and idempotent.

alter table public.profiles
  drop constraint if exists profiles_role_check;

alter table public.profiles
  add constraint profiles_role_check
  check (role in ('supports_planner', 'team_manager', 'supervisor', 'it'));

-- ── 2. Fix clients RLS — add missing roles ────────────────────────────────────
-- Original policy only allowed 'supervisor'. team_manager and it also need read.

drop policy if exists "Case managers see assigned clients" on public.clients;
drop policy if exists "Supervisors can do everything on clients" on public.clients;

-- Supports planners see only their assigned active clients
create policy "supports_planner_select_own_clients"
  on public.clients
  for select
  to authenticated
  using (
    assigned_to = auth.uid()
    and exists (
      select 1 from public.profiles
      where id = auth.uid() and role = 'supports_planner'
    )
  );

-- Team managers, supervisors, and IT see all clients
create policy "managers_and_supervisors_select_all_clients"
  on public.clients
  for select
  to authenticated
  using (
    exists (
      select 1 from public.profiles
      where id = auth.uid() and role in ('team_manager', 'supervisor', 'it')
    )
  );

-- Team managers, supervisors, and IT can insert/update/delete clients
create policy "managers_and_supervisors_write_clients"
  on public.clients
  for all
  to authenticated
  using (
    exists (
      select 1 from public.profiles
      where id = auth.uid() and role in ('team_manager', 'supervisor', 'it')
    )
  )
  with check (
    exists (
      select 1 from public.profiles
      where id = auth.uid() and role in ('team_manager', 'supervisor', 'it')
    )
  );

-- ── 3. Fix profiles RLS — ensure supports_planner can read own profile ────────
-- The earlier migration 006 uses JWT metadata for role checks which can lag
-- behind the profiles table. Add a simple self-select policy as a fallback.

drop policy if exists "Users can view own profile" on public.profiles;

create policy "users_can_view_own_profile"
  on public.profiles
  for select
  to authenticated
  using (id = auth.uid());
