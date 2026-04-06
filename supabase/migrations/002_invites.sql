-- Invite tracking for admin panel and reminder flow

create table if not exists public.user_invites (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  full_name text,
  role text check (role in ('supports_planner', 'team_manager', 'supervisor')) not null,
  invited_user_id uuid references auth.users(id) on delete set null,
  invited_by uuid references public.profiles(id) on delete set null,
  invite_sent_at timestamptz not null default now(),
  accepted_at timestamptz,
  reminder_sent_at timestamptz,
  reminder_count integer not null default 0,
  expires_at timestamptz,
  status text check (status in ('pending', 'accepted', 'expired')) not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists user_invites_email_pending_idx
  on public.user_invites (lower(email))
  where status = 'pending';

create index if not exists user_invites_status_idx on public.user_invites (status, invite_sent_at desc);
create index if not exists user_invites_invited_user_id_idx on public.user_invites (invited_user_id);

alter table public.user_invites enable row level security;

create policy if not exists "Supervisors can manage invites" on public.user_invites
for all using (
  exists (select 1 from public.profiles where id = auth.uid() and role = 'supervisor')
)
with check (
  exists (select 1 from public.profiles where id = auth.uid() and role = 'supervisor')
);

create or replace function public.touch_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists user_invites_touch_updated_at on public.user_invites;
create trigger user_invites_touch_updated_at
before update on public.user_invites
for each row execute procedure public.touch_updated_at();

create or replace function public.sync_invite_acceptance()
returns trigger as $$
begin
  update public.user_invites
     set invited_user_id = new.id,
         accepted_at = coalesce(accepted_at, new.created_at, now()),
         status = 'accepted',
         updated_at = now()
   where lower(email) = lower(new.email)
     and status = 'pending';
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_user_invite_acceptance on auth.users;
create trigger on_user_invite_acceptance
after insert on auth.users
for each row execute procedure public.sync_invite_acceptance();

create or replace view public.user_invites_with_state as
select
  ui.*,
  case
    when ui.status = 'accepted' then 'accepted'
    when ui.status = 'pending' and ui.expires_at is not null and ui.expires_at < now() then 'expired'
    else ui.status
  end as computed_status
from public.user_invites ui;
