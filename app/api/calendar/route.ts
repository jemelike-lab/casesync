import { isSupervisorLike, canManageTeam, getRoleLabel, getRoleColor } from '@/lib/roles'
import { createClient as createSupabaseJsClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

const DEADLINE_FIELDS = [
  { key: 'eligibility_end_date', label: 'Eligibility End' },
  { key: 'three_month_visit_due', label: '3-Month Visit Due' },
  { key: 'quarterly_waiver_date', label: 'Quarterly Waiver' },
  { key: 'med_tech_redet_date', label: 'Med-Tech Redet' },
  { key: 'pos_deadline', label: 'POS Deadline' },
  { key: 'assessment_due', label: 'Assessment Due' },
  { key: 'thirty_day_letter_date', label: '30-Day Letter' },
  { key: 'spm_next_due', label: 'SPM Due' },
  { key: 'co_financial_redet_date', label: 'CO Financial Redet' },
  { key: 'mfp_consent_date', label: 'MFP Consent' },
  { key: 'two57_date', label: '257 Date' },
  { key: 'doc_mdh_date', label: 'MDH Documentation' },
] as const

function toDateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function getUrgency(dateStr: string, todayKey: string) {
  if (dateStr === todayKey) return 'today'
  const date = new Date(dateStr + 'T12:00:00')
  const now = new Date(todayKey + 'T12:00:00')
  const diff = Math.ceil((date.getTime() - now.getTime()) / 86400000)
  if (diff < 0) return 'overdue'
  if (diff <= 7) return 'this_week'
  if (diff <= 30) return 'this_month'
  return 'future'
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url)
    const start = searchParams.get('start') ?? ''
    const end = searchParams.get('end') ?? ''
    const assignedTo = searchParams.get('assignedTo') ?? ''

    if (!start || !end) {
      return new Response(JSON.stringify({ error: 'Missing start/end range' }), { status: 400 })
    }

    const supabase = await createServerClient()
    const { data: authData, error: authErr } = await supabase.auth.getUser()

    if (authErr || !authData?.user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })
    }

    const userId = authData.user.id

    const { data: profile, error: profileErr } = await supabase
      .from('profiles')
      .select('id, role')
      .eq('id', userId)
      .single()

    if (profileErr || !profile) {
      return new Response(JSON.stringify({ error: 'Profile not found' }), { status: 403 })
    }

    const role = String(profile.role ?? '')

    const admin = createSupabaseJsClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    let query = admin
      .from('clients')
      .select('id, client_id, first_name, last_name, assigned_to, profiles!clients_assigned_to_fkey(id, full_name, role), eligibility_end_date, three_month_visit_due, quarterly_waiver_date, med_tech_redet_date, pos_deadline, assessment_due, thirty_day_letter_date, spm_next_due, co_financial_redet_date, mfp_consent_date, two57_date, doc_mdh_date')
      .eq('is_active', true)

    if (role === 'supports_planner') {
      query = query.eq('assigned_to', userId)
    } else if ((role === 'team_manager' || isSupervisorLike(role)) && assignedTo) {
      query = query.eq('assigned_to', assignedTo)
    }

    const { data, error } = await query

    if (error) {
      return new Response(JSON.stringify({ error: error.message }), { status: 500 })
    }

    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const todayKey = toDateKey(today)

    const events = [] as Array<{
      clientId: string
      clientName: string
      client_id: string
      plannerName: string | null
      label: string
      date: string
      urgency: 'overdue' | 'today' | 'this_week' | 'this_month' | 'future'
    }>

    for (const client of data ?? []) {
      const clientName = `${client.last_name}${client.first_name ? `, ${client.first_name}` : ''}`
      const plannerProfile = Array.isArray(client.profiles) ? client.profiles[0] : client.profiles
      const plannerName = plannerProfile?.full_name ?? null

      for (const field of DEADLINE_FIELDS) {
        const value = client[field.key]
        if (!value) continue
        const dateKey = String(value).split('T')[0]
        if (dateKey < start || dateKey > end) continue

        events.push({
          clientId: client.id,
          clientName,
          client_id: client.client_id,
          plannerName,
          label: field.label,
          date: dateKey,
          urgency: getUrgency(dateKey, todayKey),
        })
      }
    }

    events.sort((a, b) => {
      if (a.date !== b.date) return a.date.localeCompare(b.date)
      if (a.clientName !== b.clientName) return a.clientName.localeCompare(b.clientName)
      return a.label.localeCompare(b.label)
    })

    return new Response(JSON.stringify({ events }), {
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Internal error'
    return new Response(JSON.stringify({ error: msg }), { status: 500 })
  }
}
