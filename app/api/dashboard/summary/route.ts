import { isSupervisorLike, canManageTeam, getRoleLabel, getRoleColor } from '@/lib/roles'
import { createClient as createSupabaseJsClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { isAzureConfigured, withRlsContext } from '@/lib/db/azure'
import { businessDateOffsetStr } from '@/lib/business-date'

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

// Next-7-days agenda keys anchored to the America/New_York business date —
// deriving them from server-local UTC shifted the window a day early every
// evening ET.
function dateKey(offsetDays: number) {
  return businessDateOffsetStr(offsetDays)
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

    let data: Array<Record<string, unknown>> = []
    if (isAzureConfigured()) {
      data = await withRlsContext(userId, async (sql) => {
        let scope = sql``
        if (role === 'supports_planner') {
          scope = sql`AND assigned_to = ${userId}`
        } else if (role === 'team_manager') {
          // TM auto-scope (2026-07-12 audit, P2-15): a TM with no assignedTo
          // previously received org-wide agenda counts. Mirror the
          // /api/clients TM scope: own team's planners only; an assignedTo
          // outside the team falls back to team-wide; an empty team gets a
          // never-matching sentinel (zero counts).
          const planners = await sql`SELECT id FROM profiles WHERE team_manager_id = ${userId}`
          const plannerIds = (planners as unknown as Array<{ id: string }>).map((p) => p.id).filter(Boolean)
          if (assignedTo && plannerIds.includes(assignedTo)) {
            scope = sql`AND assigned_to = ${assignedTo}`
          } else if (plannerIds.length > 0) {
            scope = sql`AND assigned_to = ANY(${plannerIds}::uuid[])`
          } else {
            scope = sql`AND assigned_to = ${'00000000-0000-0000-0000-000000000000'}`
          }
        } else if (isSupervisorLike(role) && assignedTo) {
          scope = sql`AND assigned_to = ${assignedTo}`
        }
        const rows = await sql`
          SELECT id, assigned_to, eligibility_end_date, three_month_visit_due, quarterly_waiver_date,
                 med_tech_redet_date, pos_deadline, assessment_due, thirty_day_letter_date,
                 co_financial_redet_date, co_app_date, mfp_consent_date, two57_date, doc_mdh_date, spm_next_due
          FROM clients
          WHERE is_active = true AND client_classification = 'real' ${scope}
        `
        return rows as unknown as Array<Record<string, unknown>>
      })
    } else {
      const admin = createSupabaseJsClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
      )

      let query = admin
        .from('clients')
        .select('id, assigned_to, eligibility_end_date, three_month_visit_due, quarterly_waiver_date, med_tech_redet_date, pos_deadline, assessment_due, thirty_day_letter_date, co_financial_redet_date, co_app_date, mfp_consent_date, two57_date, doc_mdh_date, spm_next_due')
        .eq('is_active', true)
        .eq('client_classification', 'real')

      if (role === 'supports_planner') {
        query = query.eq('assigned_to', userId)
      } else if (role === 'team_manager') {
        // TM auto-scope — see the Azure branch above (P2-15).
        const { data: planners, error: plannerErr } = await admin
          .from('profiles')
          .select('id')
          .eq('team_manager_id', userId)
        if (plannerErr) {
          return new Response(JSON.stringify({ error: plannerErr.message }), { status: 500 })
        }
        const plannerIds = (planners ?? []).map((p) => p.id as string).filter(Boolean)
        if (assignedTo && plannerIds.includes(assignedTo)) {
          query = query.eq('assigned_to', assignedTo)
        } else if (plannerIds.length > 0) {
          query = query.in('assigned_to', plannerIds)
        } else {
          // Empty team → never-matching sentinel → zero counts.
          query = query.eq('assigned_to', '00000000-0000-0000-0000-000000000000')
        }
      } else if (isSupervisorLike(role) && assignedTo) {
        query = query.eq('assigned_to', assignedTo)
      }

      const res = await query
      if (res.error) {
        return new Response(JSON.stringify({ error: res.error.message }), { status: 500 })
      }
      data = (res.data ?? []) as Array<Record<string, unknown>>
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
