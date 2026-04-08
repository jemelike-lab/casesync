create table if not exists public.ops_backup_status (
  key text primary key,
  ok boolean,
  source text,
  latest_artifact text,
  latest_artifact_path text,
  latest_artifact_size_bytes bigint,
  latest_artifact_age_hours integer,
  last_verified_line text,
  checked_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.ops_backup_status (
  key,
  ok,
  source,
  latest_artifact,
  latest_artifact_path,
  latest_artifact_size_bytes,
  latest_artifact_age_hours,
  last_verified_line
)
values (
  'casesync-db-backup',
  null,
  'pending-vps-sync',
  null,
  null,
  null,
  null,
  null
)
on conflict (key) do nothing;
