import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { isAzureConfigured, withRlsContext } from '@/lib/db/azure'

export const dynamic = 'force-dynamic'

function sanitizeClientForAI(client: Record<string, any>) {
  // Keep this intentionally minimal: only what the bot needs.
  // Add more fields later as needed.
  return {
    id: client.id,
    client_id: client.client_id,
    first_name: client.first_name,
    last_name: client.last_name,
    category: client.category,
    eligibility_code: client.eligibility_code,
    pos_status: client.pos_status,
    goal_pct: client.goal_pct,
    last_contact_date: client.last_contact_date,
    last_contact_type: client.last_contact_type,
    spm_completed: client.spm_completed,
    spm_next_due: client.spm_next_due,
    eligibility_end_date: client.eligibility_end_date,
    pos_deadline: client.pos_deadline,
    assessment_due: client.assessment_due,
    three_month_visit_due: client.three_month_visit_due,
    quarterly_waiver_date: client.quarterly_waiver_date,
    med_tech_redet_date: client.med_tech_redet_date,
    med_tech_status: client.med_tech_status,
    // notes-like fields
    provider_forms: client.provider_forms,
    signatures_needed: client.signatures_needed,
    reportable_events: client.reportable_events,
    appeals: client.appeals,
  }
}

export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({})) as { id?: string; question?: string }
  const id = body.id
  const question = (body.question ?? '').trim()

  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 })
  if (!question) return NextResponse.json({ error: 'question is required' }, { status: 400 })

  // Validate id format before it reaches the DB.
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ error: 'Invalid client id' }, { status: 400 })
  }

  // Resolve the client with the caller's RLS scope. Azure (Entra) in prod,
  // Supabase fallback otherwise; RLS enforces the per-user scope either way.
  let client: Record<string, any> | null = null
  if (isAzureConfigured()) {
    const rows: any[] = await withRlsContext(user.id, (sql: any) => sql`SELECT id, client_id, first_name, last_name, category, eligibility_code, pos_status, goal_pct, last_contact_date, last_contact_type, spm_completed, spm_next_due, eligibility_end_date, pos_deadline, assessment_due, three_month_visit_due, quarterly_waiver_date, med_tech_redet_date, med_tech_status, provider_forms, signatures_needed, reportable_events, appeals FROM clients WHERE id = ${id}`)
    client = rows[0] ?? null
  } else {
    const { data, error } = await supabase
      .from('clients')
      .select('id, client_id, first_name, last_name, category, eligibility_code, pos_status, goal_pct, last_contact_date, last_contact_type, spm_completed, spm_next_due, eligibility_end_date, pos_deadline, assessment_due, three_month_visit_due, quarterly_waiver_date, med_tech_redet_date, med_tech_status, provider_forms, signatures_needed, reportable_events, appeals')
      .eq('id', id)
      .single()
    client = error ? null : data
  }

  if (!client) {
    return NextResponse.json({ error: 'Client not found (or access denied)' }, { status: 404 })
  }

  // If you want stricter server-side checks beyond RLS, add them here.
  // Example: ensure assigned_to matches unless supervisor.

  // For now, use the existing case-ai summarizer endpoint logic by calling it internally later.
  // This is an MVP: return sanitized context + question so the front-end can feed it to the bot.
  // Next iteration: plug in LLM call here.
  const context = sanitizeClientForAI(client as any)

  return NextResponse.json({ ok: true, context, question })
}
