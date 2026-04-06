-- Custom invite flow owned by the app instead of Supabase invite links

alter table public.user_invites
  add column if not exists invite_token text,
  add column if not exists invite_token_expires_at timestamptz,
  add column if not exists accepted_user_id uuid references auth.users(id) on delete set null,
  add column if not exists accepted_via text;

create unique index if not exists user_invites_invite_token_idx
  on public.user_invites (invite_token)
  where invite_token is not null;

create index if not exists user_invites_token_expires_idx
  on public.user_invites (invite_token_expires_at);

-- Keep accepted_user_id aligned with existing invited_user_id semantics where possible
update public.user_invites
set accepted_user_id = invited_user_id
where accepted_user_id is null and invited_user_id is not null;
