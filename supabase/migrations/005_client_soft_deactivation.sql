-- Soft deactivation for clients (e.g. deceased) while preserving records

alter table public.clients
  add column if not exists is_active boolean not null default true,
  add column if not exists deactivation_reason text,
  add column if not exists deactivated_at timestamptz,
  add column if not exists deactivated_by uuid references public.profiles(id) on delete set null;

create index if not exists clients_is_active_idx on public.clients (is_active);
