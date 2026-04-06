create or replace view public.client_status_summary_global as
select
  count(*) as total_clients,
  count(*) filter (where has_overdue) as overdue_clients,
  count(*) filter (where due_this_week) as due_this_week_clients,
  count(*) filter (where eligibility_ending_soon) as eligibility_ending_soon_clients,
  count(*) filter (where no_contact_7_days) as no_contact_7_days_clients
from public.client_status_summary;
