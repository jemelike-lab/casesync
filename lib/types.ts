export type Role = 'case_manager' | 'supervisor'
export type Category = 'co' | 'cfc' | 'cpas'

export interface Profile {
  id: string
  full_name: string | null
  role: Role
  created_at: string
}

export interface Client {
  id: string
  client_id: string
  last_name: string
  first_name: string | null
  category: Category
  eligibility_code: string | null
  eligibility_end_date: string | null
  assigned_to: string | null
  last_contact_date: string | null
  last_contact_type: string | null
  spm_completed: boolean
  three_month_visit_date: string | null
  three_month_visit_due: string | null
  quarterly_waiver_date: string | null
  med_tech_redet_date: string | null
  med_tech_status: string | null
  poc_date: string | null
  loc_date: string | null
  doc_mdh_date: string | null
  pos_deadline: string | null
  pos_status: string | null
  assessment_due: string | null
  foc: string | null
  provider_forms: string | null
  signatures_needed: string | null
  schedule_docs: boolean
  atp: string | null
  snfs: string | null
  lease: string | null
  reportable_events: string | null
  appeals: string | null
  thirty_day_letter_date: string | null
  drop_in_visit_date: string | null
  co_financial_redet_date: string | null
  co_app_date: string | null
  request_letter: string | null
  mfp_consent_date: string | null
  two57_date: string | null
  audit_review: string | null
  qa_review: string | null
  goal_pct: number
  created_at: string
  updated_at: string
  // joined
  profiles?: Profile | null
}

export type StatusLevel = 'green' | 'yellow' | 'orange' | 'red' | 'none'

export type FilterType =
  | 'all'
  | 'overdue'
  | 'due_this_week'
  | 'no_contact_7'
  | 'eligibility_ending_soon'
  | 'co'
  | 'cfc'
  | 'cpas'

export function getDateStatus(dateStr: string | null): StatusLevel {
  if (!dateStr) return 'none'
  const date = new Date(dateStr)
  const now = new Date()
  const diffMs = date.getTime() - now.getTime()
  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24))

  if (diffDays < 0) return 'red'
  if (diffDays <= 7) return 'orange'
  if (diffDays <= 30) return 'yellow'
  return 'green'
}

export function getDaysSinceContact(dateStr: string | null): number | null {
  if (!dateStr) return null
  const date = new Date(dateStr)
  const now = new Date()
  return Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24))
}

export function isOverdue(client: Client): boolean {
  const datesToCheck = [
    client.eligibility_end_date,
    client.three_month_visit_due,
    client.quarterly_waiver_date,
    client.med_tech_redet_date,
    client.pos_deadline,
    client.assessment_due,
    client.thirty_day_letter_date,
    client.co_financial_redet_date,
    client.co_app_date,
    client.mfp_consent_date,
    client.two57_date,
    client.doc_mdh_date,
  ]
  return datesToCheck.some(d => d && getDateStatus(d) === 'red')
}

export function isDueThisWeek(client: Client): boolean {
  const datesToCheck = [
    client.eligibility_end_date,
    client.three_month_visit_due,
    client.quarterly_waiver_date,
    client.med_tech_redet_date,
    client.pos_deadline,
    client.assessment_due,
    client.thirty_day_letter_date,
    client.co_financial_redet_date,
    client.co_app_date,
    client.mfp_consent_date,
    client.two57_date,
    client.doc_mdh_date,
  ]
  return datesToCheck.some(d => d && getDateStatus(d) === 'orange')
}

export function isEligibilityEndingSoon(client: Client): boolean {
  const s = getDateStatus(client.eligibility_end_date)
  return s === 'yellow' || s === 'orange' || s === 'red'
}
