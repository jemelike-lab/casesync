-- CaseSync scaling indexes for list/search/query patterns
-- Goal: improve active-client listing, assignee/category browsing, and text search.

create extension if not exists pg_trgm;

-- Common active-list access patterns
create index if not exists idx_clients_active_last_name
  on public.clients (is_active, last_name);

create index if not exists idx_clients_active_assigned_last_name
  on public.clients (is_active, assigned_to, last_name);

create index if not exists idx_clients_active_category_last_name
  on public.clients (is_active, category, last_name);

-- Common direct filters / sorts
create index if not exists idx_clients_assigned_to
  on public.clients (assigned_to);

create index if not exists idx_clients_goal_pct
  on public.clients (goal_pct);

create index if not exists idx_clients_last_contact_date
  on public.clients (last_contact_date);

create index if not exists idx_clients_eligibility_end_date
  on public.clients (eligibility_end_date);

-- Search support (ILIKE / partial matching)
create index if not exists idx_clients_last_name_trgm
  on public.clients using gin (last_name gin_trgm_ops);

create index if not exists idx_clients_first_name_trgm
  on public.clients using gin (first_name gin_trgm_ops);

create index if not exists idx_clients_client_id_trgm
  on public.clients using gin (client_id gin_trgm_ops);

create index if not exists idx_clients_eligibility_code_trgm
  on public.clients using gin (eligibility_code gin_trgm_ops);

-- Deadline/date fields used in overdue/due/day filters
create index if not exists idx_clients_three_month_visit_due
  on public.clients (three_month_visit_due);

create index if not exists idx_clients_quarterly_waiver_date
  on public.clients (quarterly_waiver_date);

create index if not exists idx_clients_med_tech_redet_date
  on public.clients (med_tech_redet_date);

create index if not exists idx_clients_pos_deadline
  on public.clients (pos_deadline);

create index if not exists idx_clients_assessment_due
  on public.clients (assessment_due);

create index if not exists idx_clients_thirty_day_letter_date
  on public.clients (thirty_day_letter_date);

create index if not exists idx_clients_co_financial_redet_date
  on public.clients (co_financial_redet_date);

create index if not exists idx_clients_co_app_date
  on public.clients (co_app_date);

create index if not exists idx_clients_mfp_consent_date
  on public.clients (mfp_consent_date);

create index if not exists idx_clients_two57_date
  on public.clients (two57_date);

create index if not exists idx_clients_doc_mdh_date
  on public.clients (doc_mdh_date);

create index if not exists idx_clients_spm_next_due
  on public.clients (spm_next_due);
