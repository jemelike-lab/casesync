import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { isAzureConfigured, withRlsTransaction, withRlsContext } from '@/lib/db/azure'
import { listSheets, getSheet, sheetToRows } from '@/lib/smartsheet'
import { parseClientImportText, buildClientInsertPayload, parseDelimitedRowsToCsv } from '@/lib/client-import'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

/**
 * Smartsheet -> CaseSync nightly reconciliation.
 *
 * Each planner's sheet (matched to a profile by sheet NAME) is pulled, run
 * through the SAME normalizer a manual CSV import uses, then reconciled:
 *
 *   in sheet, not in CaseSync   -> INSERT, assigned to that planner
 *   in both, fields differ      -> UPDATE only the changed fields
 *   in CaseSync, not in sheet   -> FLAGGED for review, never auto-removed
 *
 * The last case is deliberate. A client vanishing from a sheet can mean
 * transferred, discharged, or simply a row someone deleted by accident —
 * three very different actions on PHI — so the sync records it and a human
 * decides. (Josh 08-03: exactly the ambiguity behind Mariama's seven.)
 *
 * Every write is attributed to SMARTSHEET_SYNC_ACTOR_ID so the audit trail
 * distinguishes automation from a person.
 */

interface SyncCounts {
  planner: string
  sheetId: number
  created: number
  updated: number
  flagged: number
  errors: string[]
}

// Fields the sync is allowed to update. Deliberately excludes assigned_to,
// is_active and client_id — reassignment and deactivation stay human actions.
const SYNCABLE_FIELDS = [
  'last_name', 'category', 'eligibility_code', 'eligibility_end_date',
  'last_contact_date', 'three_month_visit_date', 'three_month_visit_due',
  'quarterly_waiver_date', 'drop_in_visit_date', 'poc_date', 'loc_date',
  'med_tech_redet_date', 'med_tech_status', 'pos_deadline', 'pos_status',
  'assessment_due', 'spm_completed', 'foc', 'provider_forms',
  'signatures_needed', 'schedule_docs', 'atp', 'snfs', 'lease',
  'reportable_events', 'appeals', 'thirty_day_letter_date',
  'co_financial_redet_date', 'co_app_date', 'request_letter',
  'mfp_consent_date', 'two57_date', 'doc_mdh_date', 'audit_review', 'qa_review',
] as const

function normalizeForCompare(v: unknown): string {
  if (v === null || v === undefined) return ''
  if (v instanceof Date) return v.toISOString().slice(0, 10)
  if (typeof v === 'boolean') return v ? 'true' : 'false'
  const s = String(v).trim()
  const m = /^(\d{4}-\d{2}-\d{2})T/.exec(s)
  return m ? m[1] : s
}

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (!process.env.SMARTSHEET_API_TOKEN) {
    return NextResponse.json({ error: 'SMARTSHEET_API_TOKEN not configured' }, { status: 503 })
  }
  if (!isAzureConfigured()) {
    return NextResponse.json({ error: 'Azure data plane not configured' }, { status: 503 })
  }

  const actorId = process.env.SMARTSHEET_SYNC_ACTOR_ID
  if (!actorId) {
    return NextResponse.json({ error: 'SMARTSHEET_SYNC_ACTOR_ID not configured' }, { status: 503 })
  }

  const dryRun = new URL(request.url).searchParams.get('dry_run') === '1'

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // Planner directory — sheets are matched to profiles by full name.
  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, full_name, role')
  const planners = (profiles ?? []).filter(p => p.full_name)
  const byName = new Map(planners.map(p => [p.full_name.trim().toLowerCase(), p]))

  let sheets
  try {
    sheets = await listSheets()
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 })
  }

  const results: SyncCounts[] = []
  const unmatchedSheets: string[] = []

  for (const listed of sheets) {
    const profile = byName.get(listed.name.trim().toLowerCase())
    if (!profile) { unmatchedSheets.push(listed.name); continue }

    const counts: SyncCounts = {
      planner: profile.full_name, sheetId: listed.id,
      created: 0, updated: 0, flagged: 0, errors: [],
    }

    try {
      const sheet = await getSheet(listed.id)
      const rows = sheetToRows(sheet)
      if (rows.length === 0) { results.push(counts); continue }

      // Existing caseload for this planner, keyed by client_id.
      const existing = await withRlsContext(actorId, (sql) =>
        sql`SELECT * FROM clients WHERE assigned_to = ${profile.id} AND is_active = true`
      ) as unknown as Record<string, unknown>[]
      const existingByClientId = new Map(existing.map(c => [String(c.client_id), c]))

      // Every client_id already in the system — a row may exist under another
      // planner (a transfer), which must never be double-created.
      const allIds = await withRlsContext(actorId, (sql) =>
        sql`SELECT client_id FROM clients`
      ) as unknown as { client_id: string }[]
      const allClientIds = new Set(allIds.map(r => String(r.client_id)))

      // Run sheet rows through the real import normalizer via CSV.
      const headers = Array.from(
        rows.reduce((set, r) => { Object.keys(r.values).forEach(k => set.add(k)); return set },
          new Set<string>(['client_id']))
      )
      const dataRows = rows.map(r => headers.map(h => r.values[h] ?? ''))
      const csv = parseDelimitedRowsToCsv(headers, dataRows)
      const parsed = parseClientImportText(csv, [], [])

      for (const err of parsed.parseErrors ?? []) {
        counts.errors.push(`row ${err.rowNumber ?? '?'}: ${err.message}`)
      }
      for (const err of parsed.validationErrors ?? []) {
        counts.errors.push(`row ${err.rowNumber}: ${err.column} — ${err.message}`)
      }

      const notesByClientId = new Map(rows.map(r => [r.values.client_id, r.notes]))
      const sheetClientIds = new Set<string>()

      for (const norm of parsed.normalizedRows ?? []) {
        const payload = buildClientInsertPayload(norm)
        const cid = String(payload.client_id)
        sheetClientIds.add(cid)
        const current = existingByClientId.get(cid)

        if (!current) {
          if (allClientIds.has(cid)) {
            // Exists but assigned elsewhere — a transfer, which is a human call.
            counts.flagged += 1
            if (!dryRun) {
              await withRlsTransaction(actorId, async (sql) => {
                await sql`INSERT INTO smartsheet_review_queue ${sql({
                  client_id_text: cid,
                  planner_id: profile.id,
                  reason: 'on_sheet_assigned_elsewhere',
                  detail: `${cid} appears on ${profile.full_name}'s sheet but is assigned to another planner in CaseSync.`,
                })}`
              })
            }
            continue
          }
          counts.created += 1
          if (dryRun) continue
          const insert = { ...payload, assigned_to: profile.id }
          const note = (notesByClientId.get(cid) ?? []).join(' · ')
          await withRlsTransaction(actorId, async (sql) => {
            const inserted = await sql`INSERT INTO clients ${sql(insert as unknown as Record<string, unknown>)} RETURNING id` as unknown as { id: string }[]
            const newId = inserted[0].id
            if (note) {
              await sql`INSERT INTO client_notes ${sql({ client_id: newId, author_id: actorId, content: `Smartsheet sync: ${note}` })}`
            }
            await sql`INSERT INTO activity_log ${sql({
              client_id: newId, user_id: actorId,
              action: 'Client created via Smartsheet sync',
              field_name: null, old_value: null, new_value: cid,
            })}`
          })
          continue
        }

        // Update only genuinely changed, syncable fields.
        const changes: Record<string, unknown> = {}
        for (const f of SYNCABLE_FIELDS) {
          const next = (payload as Record<string, unknown>)[f]
          if (next === null || next === undefined || next === '') continue
          if (normalizeForCompare(next) !== normalizeForCompare(current[f])) {
            changes[f] = next
          }
        }
        if (Object.keys(changes).length === 0) continue

        counts.updated += 1
        if (dryRun) continue
        await withRlsTransaction(actorId, async (sql) => {
          await sql`UPDATE clients SET ${sql(changes)} WHERE id = ${current.id as string}`
          for (const [field, value] of Object.entries(changes)) {
            await sql`INSERT INTO activity_log ${sql({
              client_id: current.id as string, user_id: actorId,
              action: 'Updated via Smartsheet sync',
              field_name: field,
              old_value: normalizeForCompare(current[field]) || null,
              new_value: normalizeForCompare(value) || null,
            })}`
          }
        })
      }

      // In CaseSync but gone from the sheet — flag, never remove.
      for (const [cid, current] of existingByClientId) {
        if (sheetClientIds.has(cid)) continue
        counts.flagged += 1
        if (dryRun) continue
        await withRlsTransaction(actorId, async (sql) => {
          await sql`INSERT INTO smartsheet_review_queue ${sql({
            client_id_text: cid,
            client_uuid: current.id as string,
            planner_id: profile.id,
            reason: 'missing_from_sheet',
            detail: `${cid} (${String(current.last_name ?? '')}) is assigned to ${profile.full_name} in CaseSync but no longer appears on their Smartsheet. Transferred, discharged, or deleted in error?`,
          })}`
        })
      }
    } catch (e) {
      counts.errors.push((e as Error).message)
    }

    results.push(counts)
  }

  const totals = results.reduce((a, r) => ({
    created: a.created + r.created,
    updated: a.updated + r.updated,
    flagged: a.flagged + r.flagged,
  }), { created: 0, updated: 0, flagged: 0 })

  if (!dryRun) {
    await withRlsContext(actorId, (sql) =>
      sql`INSERT INTO smartsheet_sync_runs ${sql({
        sheets_processed: results.length,
        created: totals.created,
        updated: totals.updated,
        flagged: totals.flagged,
        unmatched_sheets: unmatchedSheets.join(', ') || null,
        errors: results.flatMap(r => r.errors).join(' | ').slice(0, 4000) || null,
      })}`
    ).catch(() => {})
  }

  return NextResponse.json({
    ok: true, dryRun, totals, unmatchedSheets, results,
  })
}
