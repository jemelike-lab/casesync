import { createClient } from '@/lib/supabase/server'
import { Client, Profile } from '@/lib/types'

const PROFILE_FIELDS = 'id, full_name, role, created_at, team_manager_id'
const CLIENT_WITH_ASSIGNEE_FIELDS = `
  id,
  client_id,
  last_name,
  first_name,
  category,
  eligibility_code,
  eligibility_end_date,
  assigned_to,
  last_contact_date,
  last_contact_type,
  spm_completed,
  spm_next_due,
  three_month_visit_date,
  three_month_visit_due,
  quarterly_waiver_date,
  med_tech_redet_date,
  med_tech_status,
  poc_date,
  loc_date,
  doc_mdh_date,
  pos_deadline,
  pos_status,
  assessment_due,
  foc,
  provider_forms,
  signatures_needed,
  schedule_docs,
  atp,
  snfs,
  lease,
  reportable_events,
  appeals,
  thirty_day_letter_date,
  drop_in_visit_date,
  co_financial_redet_date,
  co_app_date,
  request_letter,
  mfp_consent_date,
  two57_date,
  audit_review,
  qa_review,
  goal_pct,
  is_active,
  deactivation_reason,
  deactivated_at,
  deactivated_by,
  created_at,
  updated_at,
  profiles!clients_assigned_to_fkey(id, full_name, role)
`

export async function getCurrentUserAndProfile() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { supabase, user: null, profile: null }

  const { data: profile } = await supabase
    .from('profiles')
    .select(PROFILE_FIELDS)
    .eq('id', user.id)
    .single()

  return { supabase, user, profile: (profile as Profile | null) ?? null }
}

export async function getPlanners(supabase: Awaited<ReturnType<typeof createClient>>, teamManagerId?: string) {
  let query = supabase
    .from('profiles')
    .select(PROFILE_FIELDS)
    .eq('role', 'supports_planner')
    .order('full_name')

  if (teamManagerId) query = query.eq('team_manager_id', teamManagerId)

  const { data } = await query
  return (data as Profile[]) ?? []
}

export async function getTeamManagers(supabase: Awaited<ReturnType<typeof createClient>>) {
  const { data } = await supabase
    .from('profiles')
    .select(PROFILE_FIELDS)
    .eq('role', 'team_manager')
    .order('full_name')

  return (data as Profile[]) ?? []
}

export async function getActiveClients(supabase: Awaited<ReturnType<typeof createClient>>, assignedTo?: string | string[]) {
  let query = supabase
    .from('clients')
    .select(CLIENT_WITH_ASSIGNEE_FIELDS)
    .eq('is_active', true)
    .order('last_name')

  if (Array.isArray(assignedTo)) {
    if (assignedTo.length === 0) return []
    query = query.in('assigned_to', assignedTo)
  } else if (assignedTo) {
    query = query.eq('assigned_to', assignedTo)
  }

  const { data, error } = await query
  if (error) throw error

  type ClientRow = Omit<Client, 'profiles'> & {
    profiles?: { id: string; full_name: string | null; role: Profile['role'] } | { id: string; full_name: string | null; role: Profile['role'] }[] | null
  }

  return ((data ?? []) as ClientRow[]).map((client) => ({
    ...client,
    profiles: Array.isArray(client.profiles) ? client.profiles[0] ?? null : client.profiles ?? null,
  })) as Client[]
}
