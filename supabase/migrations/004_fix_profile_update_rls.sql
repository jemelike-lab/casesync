-- Fix recursive RLS on profile self-updates causing "stack depth limit exceeded"

drop policy if exists "Users can update own profile (no role change)" on public.profiles;

create policy "Users can update own profile"
  on public.profiles
  for update
  to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());
