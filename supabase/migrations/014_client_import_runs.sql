create table if not exists public.client_import_runs (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default timezone('utc', now()),
  created_by uuid not null references public.profiles(id) on delete restrict,
  mode text not null check (mode in ('validate', 'import')),
  source_filename text,
  total_rows integer not null default 0,
  valid_rows integer not null default 0,
  imported_rows integer not null default 0,
  skipped_rows integer not null default 0,
  error_count integer not null default 0,
  warning_count integer not null default 0,
  issue_report_csv text,
  status text not null default 'completed' check (status in ('completed', 'failed'))
);

create index if not exists client_import_runs_created_at_idx
  on public.client_import_runs (created_at desc);

create index if not exists client_import_runs_created_by_idx
  on public.client_import_runs (created_by, created_at desc);

alter table public.client_import_runs enable row level security;

create policy "Supervisors and IT can read import runs"
  on public.client_import_runs
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.role in ('supervisor', 'it')
    )
  );

create policy "Team managers, supervisors, and IT can insert import runs"
  on public.client_import_runs
  for insert
  to authenticated
  with check (
    created_by = auth.uid()
    and exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.role in ('team_manager', 'supervisor', 'it')
    )
  );
