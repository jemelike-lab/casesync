import { isSupervisorLike, canManageTeam, getRoleLabel, getRoleColor } from '@/lib/roles'
import { createClient as createSupabaseJsClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

const DEADLINE_FIELDS = [
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
  'spm_next_due',
] as const

function dateKey(offsetDays: number) {
  const date = new Date()
  date.setHours(0, 0, 0, 0)
  date.setDate(date.getDate() + offsetDays)
  return date.toISOString().split('T')[0]
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url)
    const assignedTo = searchParams.get('assignedTo') ?? ''

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
      .select('id, assigned_to, eligibility_end_date, three_month_visit_due, quarterly_waiver_date, med_tech_redet_date, pos_deadline, assessment_due, thirty_day_letter_date, co_financial_redet_date, co_app_date, mfp_consent_date, two57_date, doc_mdh_date, spm_next_due')
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

    const targets = Array.from({ length: 7 }, (_, i) => dateKey(i))
    const counts: Record<string, number> = Object.fromEntries(targets.map((key) => [key, 0]))

    for (const row of data ?? []) {
      for (const field of DEADLINE_FIELDS) {
        const value = row[field]
        if (!value) continue
        const key = String(value).split('T')[0]
        if (key in counts) counts[key] += 1
      }
    }

    return new Response(JSON.stringify({ counts }), {
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Internal error'
    return new Response(JSON.stringify({ error: msg }), { status: 500 })
  }
}
