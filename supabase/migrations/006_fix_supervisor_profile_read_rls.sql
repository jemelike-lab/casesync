-- Fix supervisor/team-manager profile reads without recursive profile-policy checks

-- Replace recursive supervisor profile select policy with JWT-based checks.
drop policy if exists "Supervisors can view all profiles" on public.profiles;

create policy "Supervisors and team managers can view team profiles"
  on public.profiles
  for select
  to authenticated
  using (
    auth.uid() = id
    or (auth.jwt() -> 'user_metadata' ->> 'role') in ('supervisor', 'team_manager')
  );
