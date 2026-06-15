import { isSupervisorLike, canManageTeam, getRoleLabel, getRoleColor } from '@/lib/roles'
import { createClient as createSupabaseJsClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { isAzureConfigured, withRlsContext } from '@/lib/db/azure'

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

    let data: any[] = []
    if (isAzureConfigured()) {
      const rows = await withRlsContext(userId, async (sql) => {
        let scope = sql``
        let skip = false
        if (role === 'supports_planner') {
          scope = sql`AND c.assigned_to = ${userId}`
        } else if (role === 'team_manager') {
          const planners = await sql`SELECT id FROM profiles WHERE role = 'supports_planner' AND team_manager_id = ${userId}`
          const plannerIds = (planners as Array<{ id: string }>).map((pl) => pl.id).filter(Boolean)
          if (assignedTo) {
            scope = sql`AND c.assigned_to = ${assignedTo}`
          } else if (plannerIds.length > 0) {
            scope = sql`AND c.assigned_to = ANY(${plannerIds}::uuid[])`
          } else {
            skip = true
          }
        } else if (isSupervisorLike(role) && assignedTo) {
          scope = sql`AND c.assigned_to = ${assignedTo}`
        }
        if (skip) return [] as Array<Record<string, unknown>>
        return await sql`
          SELECT c.id, c.client_id, c.first_name, c.last_name, c.assigned_to,
                 p.id AS p_id, p.full_name AS p_full_name, p.role AS p_role,
                 c.eligibility_end_date, c.three_month_visit_due, c.quarterly_waiver_date, c.med_tech_redet_date,
                 c.pos_deadline, c.assessment_due, c.thirty_day_letter_date, c.spm_next_due,
                 c.co_financial_redet_date, c.mfp_consent_date, c.two57_date, c.doc_mdh_date
          FROM clients c
          LEFT JOIN profiles p ON p.id = c.assigned_to
          WHERE c.is_active = true AND c.client_classification = 'real' ${scope}
        ` as unknown as Array<Record<string, unknown>>
      })
      data = (rows as Array<Record<string, any>>).map((r) => ({
        ...r,
        profiles: r.p_id ? { id: r.p_id, full_name: r.p_full_name, role: r.p_role } : null,
      }))
    } else {
      const admin = createSupabaseJsClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
      )

      let query = admin
        .from('clients')
        .select('id, client_id, first_name, last_name, assigned_to, profiles!clients_assigned_to_fkey(id, full_name, role), eligibility_end_date, three_month_visit_due, quarterly_waiver_date, med_tech_redet_date, pos_deadline, assessment_due, thirty_day_letter_date, spm_next_due, co_financial_redet_date, mfp_consent_date, two57_date, doc_mdh_date')
        .eq('is_active', true)
        .eq('client_classification', 'real')

      if (role === 'supports_planner') {
        query = query.eq('assigned_to', userId)
      } else if (role === 'team_manager') {
        const { data: planners, error: plannerErr } = await admin
          .from('profiles')
          .select('id')
          .eq('role', 'supports_planner')
          .eq('team_manager_id', userId)

        if (plannerErr) {
          return new Response(JSON.stringify({ error: plannerErr.message }), { status: 500 })
        }

        const plannerIds = (planners ?? []).map((p) => p.id).filter(Boolean)
        if (assignedTo) {
          query = query.eq('assigned_to', assignedTo)
        } else if (plannerIds.length > 0) {
          query = query.in('assigned_to', plannerIds)
        } else {
          return new Response(JSON.stringify({ events: [] }), {
            headers: { 'Content-Type': 'application/json' },
          })
        }
      } else if (isSupervisorLike(role) && assignedTo) {
        query = query.eq('assigned_to', assignedTo)
      }

      const res = await query
      if (res.error) {
        return new Response(JSON.stringify({ error: res.error.message }), { status: 500 })
      }
      data = res.data ?? []
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
