import { businessTodayStr, businessTodayEpoch, dateStrToEpoch, dateToBusinessStr, DAY_MS } from './business-date'

export type Role = 'supports_planner' | 'team_manager' | 'supervisor' | 'it' | 'administrator' | 'admin_assistant'
export type Category = 'co' | 'cfc' | 'cpas'

export interface Profile {
  id: string
  full_name: string | null
  role: Role
  created_at: string
  team_manager_id?: string | null
  joined_at?: string | null
  mfa_email_enabled?: boolean
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
  pos_effective_date: string | null
  foc_date: string | null
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
  client_classification?: ClientClassification | null
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

export type StatusLevel = 'green' | 'yellow' | 'orange' | 'red' | 'critical' | 'none'

/**
 * 5-tier urgency system:
 *   🟢 green    — On track (7+ days out)
 *   🟡 yellow   — Due within 7 days
 *   🟠 orange   — Due within 3 days
 *   🔴 red      — Overdue 1-14 days
 *   🔴💥 critical — Critically overdue (14+ days)
 */
export type UrgencyTier = 'green' | 'yellow' | 'orange' | 'red' | 'critical'

export type FilterType =
  | 'all'
  | 'overdue'
  | 'due_today'
  | 'due_this_week'
  | 'due_next_14_days'
  | 'no_contact_7'
  | 'eligibility_ending_soon'
  | 'co'
  | 'cfc'
  | 'cpas'

export type SavedViewEntityType = 'clients'
export type SavedViewVisibilityType = 'personal' | 'system'
export type SavedViewOwnershipScope = 'me' | 'my_team' | 'org' | 'specific_planner' | 'specific_team_manager'
export type SavedViewDueState = 'overdue' | 'due_today' | 'due_this_week' | 'due_next_14_days' | 'no_due_date'
export type SavedViewAssignmentState = 'assigned' | 'unassigned' | 'needs_reassignment'
export type ClientClassification = 'real' | 'trial' | 'test'

export interface SavedViewFilter {
  ownershipScope?: SavedViewOwnershipScope
  assignedToUserId?: string | null
  teamManagerId?: string | null
  dueStates?: SavedViewDueState[]
  categories?: Category[]
  clientStatuses?: string[]
  documentationStates?: string[]
  assignmentStates?: SavedViewAssignmentState[]
  clientClassifications?: ClientClassification[]
  recentActivityDays?: number | null
  searchTerm?: string | null
  includeInactive?: boolean
}

export interface SavedViewSortDefinition {
  field: SortField
  dir: SortDir
}

export interface SavedViewRecord {
  id: string
  name: string
  description: string | null
  owner_user_id: string | null
  visibility_type: SavedViewVisibilityType
  allowed_roles: Role[] | null
  entity_type: SavedViewEntityType
  filter_definition: SavedViewFilter
  sort_definition: SavedViewSortDefinition | null
  is_favorite_default: boolean
  created_at: string
  updated_at: string
}

export type SortField = 'name' | 'goal_pct' | 'last_contact_date' | 'eligibility_end_date' | 'priority'

export interface PaginatedClientsResponse {
  clients: Client[]
  total: number
  hasMore: boolean
  summary?: {
    total: number
    overdue: number
    dueThisWeek: number
    eligibilitySoon: number
    noContact: number
  }
  fullSummary?: {
    total: number
    overdue: number
    dueThisWeek: number
    eligibilitySoon: number
    noContact: number
  }
}
export type SortDir = 'asc' | 'desc'

export function getDateStatus(dateStr: string | null): StatusLevel {
  if (!dateStr) return 'none'
  if (isNeverExpires(dateStr)) return 'none'
  // Date-only comparison anchored to the America/New_York business day —
  // the same anchor as the dashboard SQL ((now() at time zone
  // 'America/New_York')::date), so badges and counters never disagree.
  const dateEpoch = dateStrToEpoch(dateStr)
  if (dateEpoch === null) return 'none'
  const diffDays = Math.round((dateEpoch - businessTodayEpoch()) / DAY_MS)

  if (diffDays < -14) return 'critical'  // 14+ days overdue — pulsing red
  if (diffDays < 0) return 'red'          // 1-14 days overdue
  if (diffDays <= 3) return 'orange'      // due within 3 days (including today)
  if (diffDays <= 7) return 'yellow'      // due within 7 days
  return 'green'                           // 7+ days out
}

/**
 * getUrgencyTier — named alias matching the Enhancement Roadmap spec.
 * Use this in new code; getDateStatus is kept for backward compatibility.
 */
export function getUrgencyTier(dueDate: Date | string | null): UrgencyTier | 'none' {
  if (!dueDate) return 'none'
  const dateStr = typeof dueDate === 'string' ? dueDate : dateToBusinessStr(dueDate)
  return getDateStatus(dateStr)
}

/** Human-readable labels for each urgency tier */
export const URGENCY_LABELS: Record<StatusLevel, string> = {
  critical: 'Critical',
  red: 'Overdue',
  orange: '≤ 3 days',
  yellow: '≤ 7 days',
  green: 'On track',
  none: '',
}

/** RGB color values for urgency tiers (used in rgba backgrounds) */
export const URGENCY_COLORS_RGB: Record<StatusLevel, string> = {
  critical: '255,69,58',
  red: '255,69,58',
  orange: '255,159,10',
  yellow: '255,214,10',
  green: '48,209,88',
  none: '150,150,150',
}

export function getSpmDateStatus(dateStr: string | null): StatusLevel {
  if (!dateStr) return 'none'
  const dateEpoch = dateStrToEpoch(dateStr)
  if (dateEpoch === null) return 'none'
  const diffDays = Math.round((dateEpoch - businessTodayEpoch()) / DAY_MS)

  if (diffDays < -14) return 'critical'
  if (diffDays < 0) return 'red'
  if (diffDays <= 3) return 'orange'
  if (diffDays <= 7) return 'yellow'
  return 'green'
}

export function getDaysSinceContact(dateStr: string | null): number | null {
  if (!dateStr) return null
  const dateEpoch = dateStrToEpoch(dateStr)
  if (dateEpoch === null) return null
  return Math.round((businessTodayEpoch() - dateEpoch) / DAY_MS)
}

/**
 * Canonical "no contact in 15+ days" (SPM compliance window, Megan 07-31): never-contacted counts as no-contact.
 * Must match the no_contact SQL aggregates (last_contact_date IS NULL OR
 * last_contact_date <= business_today - 15).
 */
export function isNoContact7Days(client: Client): boolean {
  const days = getDaysSinceContact(client.last_contact_date)
  return days === null || days >= 15
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
    client.spm_next_due,
  ]
  return datesToCheck.some(d => {
    const s = d ? getDateStatus(d) : 'none'
    return s === 'red' || s === 'critical'
  })
}

export function isDueToday(client: Client): boolean {
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
    client.spm_next_due,
  ]

  const today = businessTodayStr()
  return datesToCheck.some(d => d === today)
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
    client.spm_next_due,
  ]
  return datesToCheck.some(d => {
    const s = d ? getDateStatus(d) : 'none'
    return s === 'orange' || s === 'yellow'
  })
}

export function isDueNext14Days(client: Client): boolean {
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
    client.spm_next_due,
  ]

  const todayEpoch = businessTodayEpoch()
  const in14Epoch = todayEpoch + 14 * DAY_MS

  return datesToCheck.some((d) => {
    const epoch = dateStrToEpoch(d)
    return epoch !== null && epoch >= todayEpoch && epoch <= in14Epoch
  })
}

// Canonical "eligibility ending soon": within the next 30 days (inclusive of
// today), NOT already expired — expired eligibility belongs to isOverdue.
// Must stay in lockstep with the eligibility_soon / eligibility_ending_soon
// SQL aggregates in lib/db/clients-azure.ts and lib/dashboard-summary.ts.
export function isEligibilityEndingSoon(client: Client): boolean {
  const epoch = dateStrToEpoch(client.eligibility_end_date)
  if (epoch === null) return false
  const diffDays = Math.round((epoch - businessTodayEpoch()) / DAY_MS)
  return diffDays >= 0 && diffDays <= 30
}

export function formatDate(dateStr: string | null): string {
  if (!dateStr) return '—'
  const [year, month, day] = dateStr.split('-')
  return `${month}/${day}/${year}`
}

/**
 * Sentinel guard. Smartsheet carries 12/31/9999 to mean "no end date"; treating
 * it as a real date produced badges like "2912234d left". Anything in year 9000+
 * is a sentinel, not a deadline.
 */
export function isNeverExpires(dateStr: string | null | undefined): boolean {
  if (!dateStr) return false
  const y = Number(dateStr.split('T')[0].split('-')[0])
  return Number.isFinite(y) && y >= 9000
}

/** Add months, clamping to the last valid day (Jan 31 + 3 months -> Apr 30). */
export function addMonthsClamped(dateStr: string | null | undefined, months: number): string | null {
  if (!dateStr) return null
  const [y, m, d] = dateStr.split('T')[0].split('-').map(Number)
  if (!y || !m || !d) return null
  const target = new Date(y, m - 1 + months, 1)
  const lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate()
  const day = Math.min(d, lastDay)
  return `${target.getFullYear()}-${String(target.getMonth() + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

/**
 * quarterly_waiver_date is the date the client SIGNED the SP waiver, not a due
 * date. The signature is good for one year and must be renewed before it lapses.
 */
export function waiverRenewalDate(signedDate: string | null | undefined): string | null {
  return addMonthsClamped(signedDate, 12)
}

/** True while a signed SP waiver is still inside its one-year life. */
/**
 * Annual FOC expiry: signed date + 12 months, month-end clamped.
 * CO clients are denied without a current FOC uploaded with the annual POS
 * (Josh policy 07-27; date-beside-reference per Josh 07-31).
 */
export function focExpiryDate(focDate: string | null | undefined): string | null {
  return addMonthsClamped(focDate, 12)
}

export function isWaiverValid(signedDate: string | null | undefined): boolean {
  const renewal = waiverRenewalDate(signedDate)
  if (!renewal) return false
  const e = dateStrToEpoch(renewal)
  if (e === null) return false
  return e >= businessTodayEpoch()
}

/** Next quarterly visit = three months after the last completed visit. */
export function nextThreeMonthVisitDue(lastCompleted: string | null | undefined): string | null {
  return addMonthsClamped(lastCompleted, 3)
}

export const PRIORITY_DATE_FIELDS: (keyof Client)[] = [
  'eligibility_end_date',
  'three_month_visit_due',
  'med_tech_redet_date',
  'pos_deadline',
  'assessment_due',
  'thirty_day_letter_date',
  'co_financial_redet_date',
  'co_app_date',
  'mfp_consent_date',
  'two57_date',
  'doc_mdh_date',
  'spm_next_due',
]

/** Human labels for the 13-field deadline canon — UI single source of truth. */
export const PRIORITY_DATE_LABELS: Record<string, string> = {
  eligibility_end_date: 'Eligibility End',
  three_month_visit_due: '3-Month Visit',
  quarterly_waiver_date: 'SP Waiver Signed',
  med_tech_redet_date: 'Med Tech Redet.',
  pos_deadline: 'POS Deadline',
  assessment_due: 'Assessment',
  thirty_day_letter_date: '30-Day Letter',
  co_financial_redet_date: 'CO Financial Redet.',
  co_app_date: 'CO Application',
  mfp_consent_date: 'MFP Consent',
  two57_date: '257 Date',
  doc_mdh_date: 'DOC/MDH',
  spm_next_due: 'SPM Next Due',
}

export function clientPriorityScore(client: Client): number {
  let score = 0
  const waiverActive = isWaiverValid(client.quarterly_waiver_date)
  for (const field of PRIORITY_DATE_FIELDS) {
    if (field === 'three_month_visit_due' && waiverActive) continue
    const d = client[field] as string | null
    const status = getDateStatus(d)
    if (status === 'critical') score += 20
    else if (status === 'red') score += 10
    else if (status === 'orange') score += 5
    else if (status === 'yellow') score += 2
  }
  const daysSince = getDaysSinceContact(client.last_contact_date)
  if (daysSince !== null && daysSince >= 15) score += 8
  return score
}

export function getOverdueCount(client: Client): number {
  const waiverActive = isWaiverValid(client.quarterly_waiver_date)
  return PRIORITY_DATE_FIELDS.filter(field => {
    if (field === 'three_month_visit_due' && waiverActive) return false
    const d = client[field] as string | null
    const s = getDateStatus(d)
    return s === 'red' || s === 'critical'
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

  const todayEpoch = businessTodayEpoch()

  for (const { key } of datesToCheck) {
    const d = client[key] as string | null
    if (!d) continue
    const dateEpoch = dateStrToEpoch(d)
    if (dateEpoch === null) continue
    const diffDays = Math.round((dateEpoch - todayEpoch) / DAY_MS)

    if (diffDays < -14) {
      score -= 25 // critically overdue (14+ days)
    } else if (diffDays < 0) {
      score -= 15 // overdue (1-14 days)
    } else if (diffDays <= 3) {
      score -= 10 // due within 3 days
    } else if (diffDays <= 7) {
      score -= 6 // due within 7 days
    }
  }

  const daysSince = getDaysSinceContact(client.last_contact_date)
  if (daysSince !== null) {
    if (daysSince >= 30) {
      score -= 20
    } else if (daysSince >= 15) {
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
  const overdueCount = datesToCheck.filter(d => {
    const s = d ? getDateStatus(d) : 'none'
    return s === 'red' || s === 'critical'
  }).length
  const hasCritical = datesToCheck.some(d => d && getDateStatus(d) === 'critical')
  if (hasCritical || overdueCount >= 3) return 'high'
  if (overdueCount >= 1) return 'medium'
  return 'low'
}
