import { createClient } from '@/lib/supabase/server'

export interface AssigneeSummaryRow {
  assigned_to: string | null
  total_clients: number
  overdue_clients: number
  due_this_week_clients: number
  eligibility_ending_soon_clients: number
  no_contact_7_days_clients: number
}

interface GlobalSummaryRow {
  total_clients: number
  overdue_clients: number
  due_this_week_clients: number
  eligibility_ending_soon_clients: number
  no_contact_7_days_clients: number
}

export async function getAssigneeSummaryMap(assignedTo?: string[]) {
  const supabase = await createClient()

  let query = supabase
    .from('client_status_summary_by_assignee')
    .select('*')

  if (assignedTo) {
    if (assignedTo.length === 0) return new Map<string, AssigneeSummaryRow>()
    query = query.in('assigned_to', assignedTo)
  }

  const { data, error } = await query
  if (error) throw error

  return new Map(
    ((data ?? []) as AssigneeSummaryRow[])
      .filter(row => row.assigned_to)
      .map(row => [row.assigned_to as string, row])
  )
}

export async function getGlobalSummary() {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('client_status_summary_global')
    .select('*')
    .single()

  if (error) throw error

  return (data as GlobalSummaryRow) ?? {
    total_clients: 0,
    overdue_clients: 0,
    due_this_week_clients: 0,
    eligibility_ending_soon_clients: 0,
    no_contact_7_days_clients: 0,
  }
}
