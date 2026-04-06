create or replace view public.client_status_summary as
select
  c.id,
  c.assigned_to,
  c.category,
  c.is_active,
  (
    (c.eligibility_end_date is not null and c.eligibility_end_date < current_date) or
    (c.three_month_visit_due is not null and c.three_month_visit_due < current_date) or
    (c.quarterly_waiver_date is not null and c.quarterly_waiver_date < current_date) or
    (c.med_tech_redet_date is not null and c.med_tech_redet_date < current_date) or
    (c.pos_deadline is not null and c.pos_deadline < current_date) or
    (c.assessment_due is not null and c.assessment_due < current_date) or
    (c.thirty_day_letter_date is not null and c.thirty_day_letter_date < current_date) or
    (c.co_financial_redet_date is not null and c.co_financial_redet_date < current_date) or
    (c.co_app_date is not null and c.co_app_date < current_date) or
    (c.mfp_consent_date is not null and c.mfp_consent_date < current_date) or
    (c.two57_date is not null and c.two57_date < current_date) or
    (c.doc_mdh_date is not null and c.doc_mdh_date < current_date)
  ) as has_overdue,
  (
    (c.eligibility_end_date is not null and c.eligibility_end_date >= current_date and c.eligibility_end_date <= current_date + 7) or
    (c.three_month_visit_due is not null and c.three_month_visit_due >= current_date and c.three_month_visit_due <= current_date + 7) or
    (c.quarterly_waiver_date is not null and c.quarterly_waiver_date >= current_date and c.quarterly_waiver_date <= current_date + 7) or
    (c.med_tech_redet_date is not null and c.med_tech_redet_date >= current_date and c.med_tech_redet_date <= current_date + 7) or
    (c.pos_deadline is not null and c.pos_deadline >= current_date and c.pos_deadline <= current_date + 7) or
    (c.assessment_due is not null and c.assessment_due >= current_date and c.assessment_due <= current_date + 7) or
    (c.thirty_day_letter_date is not null and c.thirty_day_letter_date >= current_date and c.thirty_day_letter_date <= current_date + 7) or
    (c.co_financial_redet_date is not null and c.co_financial_redet_date >= current_date and c.co_financial_redet_date <= current_date + 7) or
    (c.co_app_date is not null and c.co_app_date >= current_date and c.co_app_date <= current_date + 7) or
    (c.mfp_consent_date is not null and c.mfp_consent_date >= current_date and c.mfp_consent_date <= current_date + 7) or
    (c.two57_date is not null and c.two57_date >= current_date and c.two57_date <= current_date + 7) or
    (c.doc_mdh_date is not null and c.doc_mdh_date >= current_date and c.doc_mdh_date <= current_date + 7)
  ) as due_this_week,
  (
    c.eligibility_end_date is not null and c.eligibility_end_date <= current_date + 30
  ) as eligibility_ending_soon,
  (
    c.last_contact_date is not null and c.last_contact_date <= current_date - 7
  ) as no_contact_7_days
from public.clients c
where c.is_active = true;

create or replace view public.client_status_summary_by_assignee as
select
  assigned_to,
  count(*) as total_clients,
  count(*) filter (where has_overdue) as overdue_clients,
  count(*) filter (where due_this_week) as due_this_week_clients,
  count(*) filter (where eligibility_ending_soon) as eligibility_ending_soon_clients,
  count(*) filter (where no_contact_7_days) as no_contact_7_days_clients
from public.client_status_summary
group by assigned_to;
