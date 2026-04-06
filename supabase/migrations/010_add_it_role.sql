-- Add IT as a first-class role with supervisor-equivalent access in selected policies.

alter table public.user_invites
  drop constraint if exists user_invites_role_check;

alter table public.user_invites
  add constraint user_invites_role_check
  check (role in ('supports_planner', 'team_manager', 'supervisor', 'it'));

-- Allow supervisor-like users to manage invites.
drop policy if exists "Supervisors can manage invites" on public.user_invites;
create policy "Supervisors can manage invites" on public.user_invites
for all
using (
  exists (
    select 1 from public.profiles
    where id = auth.uid() and role in ('supervisor', 'it')
  )
)
with check (
  exists (
    select 1 from public.profiles
    where id = auth.uid() and role in ('supervisor', 'it')
  )
);

-- Extend profile read policy to include IT alongside supervisor/team manager.
drop policy if exists "Supervisors and team managers can view team profiles" on public.profiles;
create policy "Supervisors and team managers can view team profiles"
on public.profiles
for select
using (
  id = auth.uid()
  or team_manager_id = auth.uid()
  or (auth.jwt() -> 'user_metadata' ->> 'role') in ('supervisor', 'it', 'team_manager')
);
