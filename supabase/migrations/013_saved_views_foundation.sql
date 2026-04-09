create table if not exists public.saved_views (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  owner_user_id uuid references public.profiles(id) on delete cascade,
  visibility_type text not null default 'personal'
    check (visibility_type in ('personal', 'system')),
  allowed_roles text[] null,
  entity_type text not null default 'clients'
    check (entity_type in ('clients')),
  filter_definition jsonb not null default '{}'::jsonb,
  sort_definition jsonb null,
  is_favorite_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint saved_views_owner_required_for_personal
    check ((visibility_type = 'personal' and owner_user_id is not null) or visibility_type = 'system')
);

create index if not exists saved_views_owner_user_id_idx
  on public.saved_views (owner_user_id);

create index if not exists saved_views_visibility_type_idx
  on public.saved_views (visibility_type);

create index if not exists saved_views_entity_type_idx
  on public.saved_views (entity_type);

create index if not exists saved_views_allowed_roles_gin_idx
  on public.saved_views using gin (allowed_roles);

create index if not exists saved_views_filter_definition_gin_idx
  on public.saved_views using gin (filter_definition);

alter table public.saved_views enable row level security;

create policy "saved views selectable by owner or allowed role"
  on public.saved_views
  for select
  to authenticated
  using (
    owner_user_id = auth.uid()
    or (
      visibility_type = 'system'
      and (
        allowed_roles is null
        or exists (
          select 1
          from public.profiles p
          where p.id = auth.uid()
            and p.role = any(allowed_roles)
        )
      )
    )
  );

create policy "users can insert personal saved views"
  on public.saved_views
  for insert
  to authenticated
  with check (
    visibility_type = 'personal'
    and owner_user_id = auth.uid()
  );

create policy "users can update own personal saved views"
  on public.saved_views
  for update
  to authenticated
  using (
    visibility_type = 'personal'
    and owner_user_id = auth.uid()
  )
  with check (
    visibility_type = 'personal'
    and owner_user_id = auth.uid()
  );

create policy "users can delete own personal saved views"
  on public.saved_views
  for delete
  to authenticated
  using (
    visibility_type = 'personal'
    and owner_user_id = auth.uid()
  );

insert into public.saved_views (
  name,
  description,
  owner_user_id,
  visibility_type,
  allowed_roles,
  entity_type,
  filter_definition,
  sort_definition,
  is_favorite_default
)
values
  (
    'My Clients',
    'Starter queue for supports planners to reopen their active assigned clients.',
    null,
    'system',
    array['supports_planner'],
    'clients',
    jsonb_build_object('ownershipScope', 'me'),
    jsonb_build_object('field', 'priority', 'dir', 'desc'),
    true
  ),
  (
    'My Overdue',
    'Starter queue for supports planners focused on overdue work.',
    null,
    'system',
    array['supports_planner'],
    'clients',
    jsonb_build_object('ownershipScope', 'me', 'dueStates', jsonb_build_array('overdue')),
    jsonb_build_object('field', 'priority', 'dir', 'desc'),
    true
  ),
  (
    'My Due This Week',
    'Starter queue for supports planners focused on work due soon.',
    null,
    'system',
    array['supports_planner'],
    'clients',
    jsonb_build_object('ownershipScope', 'me', 'dueStates', jsonb_build_array('due_this_week')),
    jsonb_build_object('field', 'priority', 'dir', 'desc'),
    true
  ),
  (
    'Team Overdue',
    'Starter queue for team managers focused on overdue team work.',
    null,
    'system',
    array['team_manager'],
    'clients',
    jsonb_build_object('ownershipScope', 'my_team', 'dueStates', jsonb_build_array('overdue')),
    jsonb_build_object('field', 'priority', 'dir', 'desc'),
    true
  ),
  (
    'Team Due Next 14 Days',
    'Starter queue for team managers to stay ahead of upcoming deadlines.',
    null,
    'system',
    array['team_manager'],
    'clients',
    jsonb_build_object('ownershipScope', 'my_team', 'dueStates', jsonb_build_array('due_next_14_days')),
    jsonb_build_object('field', 'priority', 'dir', 'desc'),
    true
  ),
  (
    'Org Overdue',
    'Starter operational queue for supervisors and IT focused on org-wide overdue work.',
    null,
    'system',
    array['supervisor', 'it'],
    'clients',
    jsonb_build_object('ownershipScope', 'org', 'dueStates', jsonb_build_array('overdue')),
    jsonb_build_object('field', 'priority', 'dir', 'desc'),
    true
  ),
  (
    'Org Due Next 14 Days',
    'Starter operational queue for supervisors and IT focused on upcoming due work.',
    null,
    'system',
    array['supervisor', 'it'],
    'clients',
    jsonb_build_object('ownershipScope', 'org', 'dueStates', jsonb_build_array('due_next_14_days')),
    jsonb_build_object('field', 'priority', 'dir', 'desc'),
    true
  ),
  (
    'Unassigned',
    'Starter queue for users allowed to work unassigned cases.',
    null,
    'system',
    array['team_manager', 'supervisor', 'it'],
    'clients',
    jsonb_build_object('ownershipScope', 'org', 'assignmentStates', jsonb_build_array('unassigned')),
    jsonb_build_object('field', 'priority', 'dir', 'desc'),
    true
  )
on conflict do nothing;
