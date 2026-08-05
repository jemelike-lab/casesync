import { NextResponse } from 'next/server'
import { withAuth } from '@/lib/api-auth'
import { auditLog } from '@/lib/audit'
import { isAzureConfigured, withRlsContext } from '@/lib/db/azure'

export const dynamic = 'force-dynamic'

/**
 * /api/clients/[id] — single-client read + field update (Azure-aware).
 *
 * Phase 3 data plane: the clients table lives in Azure when configured
 * (Entra token auth). Both handlers run with the CALLER's RLS scope via
 * withRlsContext, so Supports Planners reach only their own clients, Team
 * Managers their team's, Supervisors/IT all — identical to the Supabase
 * policies. The Supabase branch uses the session client (ctx.supabase),
 * never the service role, so RLS applies there too.
 *
 * PATCH accepts ONLY the whitelisted editable columns below. Assignment,
 * activation, and classification changes are rejected here by omission —
 * they have dedicated, individually audited routes (/reassign, /deactivate).
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// Date-typed editable columns (validated as YYYY-MM-DD or null).
const DATE_FIELDS = [
  'eligibility_end_date', 'last_contact_date', 'three_month_visit_date',
  'three_month_visit_due', 'quarterly_waiver_date', 'med_tech_redet_date',
  'poc_date', 'loc_date', 'doc_mdh_date', 'pos_deadline', 'assessment_due',
  'spm_next_due', 'co_financial_redet_date', 'co_app_date', 'mfp_consent_date',
  'two57_date', 'thirty_day_letter_date', 'drop_in_visit_date',
  'pos_effective_date', 'foc_date',
  'appeal_received_date', 'appeal_hearing_date', 'appeal_decision_date',
  'med_tech_date',
] as const

// Everything PATCH may touch. Mirrors the legacy ClientEditForm formData set
// plus the identity fields the Batch 3 hero Edit action will need.
const EDITABLE_FIELDS = new Set<string>([
  ...DATE_FIELDS,
  'first_name', 'last_name', 'category', 'eligibility_code',
  'last_contact_type', 'med_tech_status', 'pos_status',
  'appeal_status', 'services_continuing_during_appeal', 'services_continuing_source',
  'co_application_source',
  'spm_completed', 'schedule_docs',
  'foc', 'provider_forms', 'signatures_needed', 'atp', 'snfs', 'lease',
  'request_letter', 'reportable_events', 'appeals', 'audit_review', 'qa_review',
  'goal_pct',
])

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

function validateUpdates(body: Record<string, unknown>): { updates: Record<string, unknown>; error?: string } {
  const updates: Record<string, unknown> = {}
  for (const [key, raw] of Object.entries(body)) {
    if (!EDITABLE_FIELDS.has(key)) continue // ignore unknown/protected keys
    let value = raw
    if ((DATE_FIELDS as readonly string[]).includes(key)) {
      if (value === '') value = null
      if (value !== null && (typeof value !== 'string' || !DATE_RE.test(value))) {
        return { updates: {}, error: `${key} must be a YYYY-MM-DD date or null` }
      }
    } else if (key === 'goal_pct') {
      const n = Number(value)
      if (!Number.isFinite(n) || n < 0 || n > 100) {
        return { updates: {}, error: 'goal_pct must be a number between 0 and 100' }
      }
      value = n
    } else if (key === 'spm_completed' || key === 'schedule_docs') {
      value = Boolean(value)
    } else if (key === 'services_continuing_during_appeal') {
      if (value === '' || value === null) value = null
      else value = Boolean(value)
    } else if (key === 'appeal_status') {
      if (value === '') value = null
      if (value !== null && (typeof value !== 'string' || !['none', 'filed', 'received', 'hearing_scheduled', 'decision_issued'].includes(value))) {
        return { updates: {}, error: 'appeal_status must be one of none, filed, received, hearing_scheduled, decision_issued' }
      }
    } else if (key === 'co_application_source') {
      if (value === '') value = null
      if (value !== null && (typeof value !== 'string' || !['community', 'nursing_facility'].includes(value))) {
        return { updates: {}, error: 'co_application_source must be community or nursing_facility' }
      }
    } else if (typeof value === 'string') {
      if (value.length > 2000) return { updates: {}, error: `${key} exceeds 2000 characters` }
    } else if (value !== null && typeof value !== 'boolean' && typeof value !== 'number') {
      return { updates: {}, error: `${key} has an unsupported value type` }
    }
    updates[key] = value
  }
  return { updates }
}

export const GET = withAuth(async (_req, ctx, routeCtx) => {
  const { id } = (await routeCtx?.params) ?? {}
  if (!id || !UUID_RE.test(id)) {
    return NextResponse.json({ error: 'Invalid client id' }, { status: 400 })
  }

  if (isAzureConfigured()) {
    const rows = await withRlsContext(ctx.user.id, (sql) => sql`
      SELECT c.*, p.id AS assigned_profile_id, p.full_name AS assigned_profile_name, p.role AS assigned_profile_role
      FROM clients c
      LEFT JOIN profiles p ON p.id = c.assigned_to
      WHERE c.id = ${id}
      LIMIT 1
    `)
    const row = rows[0] as Record<string, unknown> | undefined
    if (!row) return NextResponse.json({ error: 'Client not found' }, { status: 404 })
    const { assigned_profile_id, assigned_profile_name, assigned_profile_role, ...client } = row
    return NextResponse.json({
      client: {
        ...client,
        profiles: assigned_profile_id
          ? { id: assigned_profile_id, full_name: assigned_profile_name ?? null, role: assigned_profile_role ?? null }
          : null,
      },
    })
  }

  const { data: client, error } = await ctx.supabase
    .from('clients')
    .select('*, profiles!clients_assigned_to_fkey(id, full_name, role)')
    .eq('id', id)
    .single()
  if (error || !client) return NextResponse.json({ error: 'Client not found' }, { status: 404 })
  return NextResponse.json({ client })
})

export const PATCH = withAuth(async (req, ctx, routeCtx) => {
  const { id } = (await routeCtx?.params) ?? {}
  if (!id || !UUID_RE.test(id)) {
    return NextResponse.json({ error: 'Invalid client id' }, { status: 400 })
  }

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return NextResponse.json({ error: 'Body must be an object' }, { status: 400 })
  }

  const { updates, error: vErr } = validateUpdates(body)
  if (vErr) return NextResponse.json({ error: vErr }, { status: 400 })
  const cols = Object.keys(updates)
  if (cols.length === 0) {
    return NextResponse.json({ error: 'No editable fields in body' }, { status: 400 })
  }

  let updatedId: string | null = null
  let updateErr: string | null = null

  if (isAzureConfigured()) {
    try {
      const rows = await withRlsContext(ctx.user.id, (sql) =>
        sql`UPDATE clients SET ${sql(updates, ...cols)} WHERE id = ${id} RETURNING id`
      )
      updatedId = (rows[0] as { id?: string } | undefined)?.id ?? null
    } catch (e) {
      updateErr = (e as Error).message
    }
  } else {
    const { data, error } = await ctx.supabase
      .from('clients')
      .update(updates)
      .eq('id', id)
      .select('id')
      .single()
    if (error) updateErr = error.message
    else updatedId = data?.id ?? null
  }

  if (updateErr) {
    await auditLog(req, {
      userId: ctx.user.id, userEmail: ctx.user.email, userRole: ctx.role,
      action: 'client.update.denied', resourceType: 'client', resourceId: id,
      details: { fields: cols, error: updateErr },
    })
    return NextResponse.json({ error: updateErr }, { status: 400 })
  }
  if (!updatedId) {
    // RLS returned no row — either it doesn't exist or the caller can't see it.
    return NextResponse.json({ error: 'Client not found (or access denied)' }, { status: 404 })
  }

  await auditLog(req, {
    userId: ctx.user.id, userEmail: ctx.user.email, userRole: ctx.role,
    action: 'client.update', resourceType: 'client', resourceId: id,
    details: { fields: cols },
  })

  return NextResponse.json({ ok: true, id: updatedId })
})
