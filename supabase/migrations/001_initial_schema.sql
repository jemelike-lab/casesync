-- CaseSync initial schema migration
-- Run this in the Supabase SQL Editor: https://supabase.com/dashboard/project/iiqttbpaufzlinbufsdx/sql/new

create table if not exists public.profiles (
  id uuid references auth.users(id) primary key,
  full_name text,
  role text check (role in ('case_manager', 'supervisor')) not null default 'case_manager',
  created_at timestamptz default now()
);

create table if not exists public.clients (
  id uuid primary key default gen_random_uuid(),
  client_id text unique not null,
  last_name text not null,
  first_name text,
  category text check (category in ('co', 'cfc', 'cpas')) not null,
  eligibility_code text,
  eligibility_end_date date,
  assigned_to uuid references public.profiles(id),
  last_contact_date date,
  last_contact_type text,
  spm_completed boolean default false,
  three_month_visit_date date,
  three_month_visit_due date,
  quarterly_waiver_date date,
  med_tech_redet_date date,
  med_tech_status text,
  poc_date date,
  loc_date date,
  pos_deadline date,
  pos_status text,
  assessment_due date,
  foc text,
  provider_forms text,
  signatures_needed text,
  schedule_docs boolean default false,
  atp text,
  snfs text,
  lease text,
  reportable_events text,
  appeals text,
  thirty_day_letter_date date,
  drop_in_visit_date date,
  co_financial_redet_date date,
  co_app_date date,
  request_letter text,
  mfp_consent_date date,
  two57_date date,
  audit_review text,
  qa_review text,
  goal_pct integer default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.profiles enable row level security;
alter table public.clients enable row level security;

create policy if not exists "Users can view own profile" on public.profiles for select using (auth.uid() = id);
create policy if not exists "Case managers see assigned clients" on public.clients for select using (
  assigned_to = auth.uid() or
  exists (select 1 from public.profiles where id = auth.uid() and role = 'supervisor')
);
create policy if not exists "Supervisors can do everything on clients" on public.clients for all using (
  exists (select 1 from public.profiles where id = auth.uid() and role = 'supervisor')
);

create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, full_name, role)
  values (new.id, new.raw_user_meta_data->>'full_name', coalesce(new.raw_user_meta_data->>'role', 'case_manager'));
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
