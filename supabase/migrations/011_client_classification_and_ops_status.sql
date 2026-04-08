alter table public.clients
  add column if not exists client_classification text not null default 'real'
  check (client_classification in ('real', 'trial', 'test'));

create index if not exists clients_client_classification_idx
  on public.clients (client_classification);

create or replace view public.ops_client_counts as
select
  count(*) filter (where is_active = true) as active_client_count,
  count(*) filter (where is_active = true and client_classification = 'real') as real_client_count,
  count(*) filter (where is_active = true and client_classification = 'trial') as trial_client_count,
  count(*) filter (where is_active = true and client_classification = 'test') as test_client_count
from public.clients;
