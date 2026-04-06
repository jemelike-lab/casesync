export type Role = 'supports_planner' | 'team_manager' | 'supervisor' | 'it'
export type Category = 'co' | 'cfc' | 'cpas'

export interface Profile {
  id: string
  full_name: string | null
  role: Role
  created_at: string
  team_manager_id?: string | null
  joined_at?: string | null
}

export type InviteStatus = 'pending' | 'accepted' | 'expired'

export interface UserInvite {
  id: string
  email: string
  full_name: string | null
  role: Role
  invited_user_id: string | null
  invited_by: string | null
  invite_token?: string | null
  invite_token_expires_at?: string | null
  accepted_user_id?: string | null
  accepted_via?: string | null
  invite_sent_at: string
  accepted_at: string | null
  reminder_sent_at: string | null
  reminder_count: number
  expires_at: string | null
  status: InviteStatus
  computed_status?: InviteStatus
  created_at: string
  updated_at: string
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
  spm_next_due: string | null
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
  is_active?: boolean
  deactivation_reason?: string | null
  deactivated_at?: string | null
  deactivated_by?: string | null
  created_at: string
  updated_at: string
  // joined
  profiles?: Profile | null
}

export interface ClientNote {
  id: string
  client_id: string
  author_id: string
  content: string
  created_at: string
  profiles?: { full_name: string | null } | null
}

export interface ActivityLog {
  id: string
  client_id: string
  user_id: string
  action: string
  field_name: string | null
  old_value: string | null
  new_value: string | null
  created_at: string
  profiles?: { full_name: string | null } | null
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

export type SortField = 'name' | 'goal_pct' | 'last_contact_date' | 'eligibility_end_date' | 'priority'

export interface PaginatedClientsResponse {
  clients: Client[]
  total: number
  hasMore: boolean
}
export type SortDir = 'asc' | 'desc'

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

export function getSpmDateStatus(dateStr: string | null): StatusLevel {
  if (!dateStr) return 'none'
  const date = new Date(dateStr)
  const now = new Date()
  const diffMs = date.getTime() - now.getTime()
  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24))

  if (diffDays < 0) return 'red'
  if (diffDays <= 7) return 'orange'
  if (diffDays <= 14) return 'yellow'
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

export function formatDate(dateStr: string | null): string {
  if (!dateStr) return '—'
  const [year, month, day] = dateStr.split('-')
  return `${month}/${day}/${year}`
}

const PRIORITY_DATE_FIELDS: (keyof Client)[] = [
  'eligibility_end_date',
  'three_month_visit_due',
  'quarterly_waiver_date',
  'med_tech_redet_date',
  'pos_deadline',
  'assessment_due',
  'thirty_day_letter_date',
  'co_financial_redet_date',
  'co_app_date',
  'mfp_consent_date',
  'two57_date',
  'doc_mdh_date',
]

export function clientPriorityScore(client: Client): number {
  let score = 0
  for (const field of PRIORITY_DATE_FIELDS) {
    const d = client[field] as string | null
    const status = getDateStatus(d)
    if (status === 'red') score += 10
    else if (status === 'orange') score += 5
    else if (status === 'yellow') score += 2
  }
  const daysSince = getDaysSinceContact(client.last_contact_date)
  if (daysSince !== null && daysSince >= 7) score += 8
  return score
}

export function getOverdueCount(client: Client): number {
  return PRIORITY_DATE_FIELDS.filter(field => {
    const d = client[field] as string | null
    return getDateStatus(d) === 'red'
  }).length
}

export function sortClients(clients: Client[], field: SortField, dir: SortDir): Client[] {
  return [...clients].sort((a, b) => {
    let valA: string | number | null
    let valB: string | number | null
    switch (field) {
      case 'name':
        valA = `${a.last_name} ${a.first_name ?? ''}`
        valB = `${b.last_name} ${b.first_name ?? ''}`
        break
      case 'goal_pct':
        valA = a.goal_pct
        valB = b.goal_pct
        break
      case 'last_contact_date':
        valA = a.last_contact_date ?? ''
        valB = b.last_contact_date ?? ''
        break
      case 'eligibility_end_date':
        valA = a.eligibility_end_date ?? ''
        valB = b.eligibility_end_date ?? ''
        break
      case 'priority':
        valA = clientPriorityScore(a)
        valB = clientPriorityScore(b)
        break
    }
    if (valA === null || valA === '') return dir === 'asc' ? 1 : -1
    if (valB === null || valB === '') return dir === 'asc' ? -1 : 1
    if (valA < valB) return dir === 'asc' ? -1 : 1
    if (valA > valB) return dir === 'asc' ? 1 : -1
    return 0
  })
}

export function getClientHealthScore(client: Client): number {
  let score = 100

  const datesToCheck: Array<{ key: keyof Client; label: string }> = [
    { key: 'eligibility_end_date', label: 'Eligibility End' },
    { key: 'three_month_visit_due', label: '3-Month Visit' },
    { key: 'quarterly_waiver_date', label: 'Quarterly Waiver' },
    { key: 'med_tech_redet_date', label: 'Med Tech Redet' },
    { key: 'pos_deadline', label: 'POS Deadline' },
    { key: 'assessment_due', label: 'Assessment Due' },
    { key: 'thirty_day_letter_date', label: '30-Day Letter' },
    { key: 'co_financial_redet_date', label: 'CO Financial Redet' },
    { key: 'co_app_date', label: 'CO App Date' },
    { key: 'mfp_consent_date', label: 'MFP Consent' },
    { key: 'two57_date', label: '257 Date' },
    { key: 'doc_mdh_date', label: 'Doc MDH' },
    { key: 'spm_next_due', label: 'SPM Next Due' },
  ]

  const now = new Date()

  for (const { key } of datesToCheck) {
    const d = client[key] as string | null
    if (!d) continue
    const date = new Date(d)
    const diffMs = date.getTime() - now.getTime()
    const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24))

    if (diffDays < 0) {
      score -= 15 // overdue
    } else if (diffDays <= 7) {
      score -= 8 // due within 7 days
    } else if (diffDays <= 30) {
      score -= 3 // due within 30 days
    }
  }

  const daysSince = getDaysSinceContact(client.last_contact_date)
  if (daysSince !== null) {
    if (daysSince >= 14) {
      score -= 20
    } else if (daysSince >= 7) {
      score -= 10
    }
  }

  return Math.max(0, score)
}

export type RiskLevel = 'high' | 'medium' | 'low'

export function getRiskLevel(client: Client): RiskLevel {
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
  const overdueCount = datesToCheck.filter(d => d && getDateStatus(d) === 'red').length
  if (overdueCount >= 3) return 'high'
  if (overdueCount >= 1) return 'medium'
  return 'low'
}
