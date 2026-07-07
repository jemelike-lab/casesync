import { NextRequest, NextResponse } from 'next/server'
import * as XLSX from 'xlsx'
import { isSupervisorLike } from '@/lib/roles'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { auditLog } from '@/lib/audit'
import { isAzureConfigured, withRlsContext, withRlsTransaction } from '@/lib/db/azure'
import {
  buildClientInsertPayload,
  buildImportIssueCsv,
  parseClientImportText,
  parseDelimitedRowsToCsv,
} from '@/lib/client-import'

export const dynamic = 'force-dynamic'

type Mode = 'validate' | 'import'

// Fix 2026-05-22: tightened role gate from canManageTeam (allowed
// team_manager) to isSupervisorLike (supervisor/it only). Mass client
// import is a HIPAA-significant operation that mints PHI records and
// must not be available to team managers per the audit spec §2A.
async function getAuthorizedContext() {
  const supabase = await createServerClient()
  const { data: authData, error: authError } = await supabase.auth.getUser()

  if (authError || !authData.user) {
    return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  }

  let profile: { id: string; role: string } | null = null
  let profileError: unknown = null
  if (isAzureConfigured()) {
    try {
      profile = await withRlsContext(authData.user.id, async (sql) => {
        const rows = await sql`SELECT id, role FROM profiles WHERE id = ${authData.user.id} LIMIT 1`
        return (rows[0] ?? null) as unknown as { id: string; role: string } | null
      })
    } catch (e) {
      profileError = e
    }
  } else {
    const { data, error } = await supabase
      .from('profiles')
      .select('id, role')
      .eq('id', authData.user.id)
      .single()
    profile = data
    profileError = error
  }

  if (profileError || !profile || !isSupervisorLike(profile.role)) {
    return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  }

  return { supabase, userId: authData.user.id }
}

function workbookToCsv(buffer: ArrayBuffer) {
  // Audit B1: raw:false returned cells as DISPLAYED text, so Excel date
  // cells arrived as M/D/YY and failed the strict ISO check on every row.
  // cellDates + raw:true yields real Date objects, emitted as YYYY-MM-DD.
  // (Server runs UTC, so toISOString cannot day-shift the parsed date.)
  const workbook = XLSX.read(Buffer.from(buffer), { type: 'buffer', cellDates: true })
  const firstSheet = workbook.SheetNames[0]
  if (!firstSheet) throw new Error('Workbook has no sheets.')
  const worksheet = workbook.Sheets[firstSheet]
  const rows = XLSX.utils.sheet_to_json<unknown[]>(worksheet, { header: 1, raw: true, defval: '' }) as unknown[][]
  if (!rows.length) return ''
  const toCell = (cell: unknown): string => {
    if (cell instanceof Date && !Number.isNaN(cell.getTime())) {
      return cell.toISOString().slice(0, 10)
    }
    return String(cell ?? '').trim()
  }
  const [headers, ...dataRows] = rows.map(row => row.map(toCell))
  return parseDelimitedRowsToCsv(headers, dataRows)
}

function issueDownloadHref(csvText: string) {
  return `data:text/csv;charset=utf-8,${encodeURIComponent(csvText)}`
}

export async function POST(req: NextRequest) {
  const auth = await getAuthorizedContext()
  if (auth.error) return auth.error

  let csvText = ''
  let mode: Mode = 'validate'
  let sourceFileName: string | null = null
  let overrideAssignedTo: string | null = null

  const contentType = req.headers.get('content-type') ?? ''

  if (contentType.includes('multipart/form-data')) {
    const formData = await req.formData()
    mode = formData.get('mode') === 'import' ? 'import' : 'validate'
    const file = formData.get('file')
    const pastedText = formData.get('csvText')
    const sourceFileNameValue = formData.get('sourceFileName')
    const overrideAssignedToValue = formData.get('overrideAssignedTo')

    if (typeof sourceFileNameValue === 'string' && sourceFileNameValue.trim()) {
      sourceFileName = sourceFileNameValue.trim()
    }
    if (typeof overrideAssignedToValue === 'string' && overrideAssignedToValue.trim()) {
      overrideAssignedTo = overrideAssignedToValue.trim()
    }

    if (file instanceof File && file.size > 0) {
      // P1: file size cap (10 MB) and MIME type validation
      const MAX_SIZE = 10 * 1024 * 1024
      if (file.size > MAX_SIZE) {
        return NextResponse.json({ error: 'File too large. Maximum size is 10 MB.' }, { status: 400 })
      }
      const ALLOWED_EXTENSIONS = new Set(['.csv', '.xlsx', '.xls'])
      const ALLOWED_MIME_TYPES = new Set([
        'text/csv',
        'application/csv',
        'application/vnd.ms-excel',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'text/plain',
      ])
      const ext = '.' + file.name.toLowerCase().split('.').pop()
      if (!ALLOWED_EXTENSIONS.has(ext)) {
        return NextResponse.json({ error: 'Invalid file type. Only .csv, .xlsx, and .xls files are allowed.' }, { status: 400 })
      }
      if (file.type && !ALLOWED_MIME_TYPES.has(file.type)) {
        return NextResponse.json({ error: 'Invalid file type. Only CSV and Excel files are allowed.' }, { status: 400 })
      }
      sourceFileName = sourceFileName ?? file.name
      const lowerName = file.name.toLowerCase()
      if (lowerName.endsWith('.xlsx') || lowerName.endsWith('.xls')) {
        csvText = workbookToCsv(await file.arrayBuffer())
      } else {
        csvText = await file.text()
      }
    } else if (typeof pastedText === 'string') {
      csvText = pastedText
    }
  } else {
    const body = await req.json().catch(() => null)
    csvText = typeof body?.csvText === 'string' ? body.csvText : ''
    mode = body?.mode === 'import' ? 'import' : 'validate'
  }

  if (!csvText.trim()) {
    return NextResponse.json({ error: 'Import file or CSV text is required.' }, { status: 400 })
  }

  const { supabase, userId } = auth
  let planners: { id: string; full_name: string | null }[] | null = null
  let existingClients: { client_id: string }[] | null = null
  let plannersError: { message?: string } | null = null
  let existingError: { message?: string } | null = null
  if (isAzureConfigured()) {
    try {
      const ctx = await withRlsContext(userId, async (sql) => {
        const p = await sql`SELECT id, full_name FROM profiles WHERE role = 'supports_planner' ORDER BY full_name`
        const e = await sql`SELECT client_id FROM clients`
        return { p, e }
      })
      planners = ctx.p as unknown as { id: string; full_name: string | null }[]
      existingClients = ctx.e as unknown as { client_id: string }[]
    } catch (err) {
      plannersError = { message: (err as Error).message }
    }
  } else {
    const [{ data: pData, error: pErr }, { data: eData, error: eErr }] = await Promise.all([
      supabase
        .from('profiles')
        .select('id, full_name')
        .eq('role', 'supports_planner')
        .order('full_name'),
      supabase
        .from('clients')
        .select('client_id'),
    ])
    planners = pData
    existingClients = eData
    plannersError = pErr
    existingError = eErr
  }

  if (plannersError || existingError) {
    return NextResponse.json({ error: plannersError?.message ?? existingError?.message ?? 'Unable to load import context.' }, { status: 500 })
  }

  const parseResult = parseClientImportText(
    csvText,
    planners ?? [],
    (existingClients ?? []).map(client => client.client_id),
  )

  const allErrors = [...parseResult.parseErrors, ...parseResult.validationErrors]

  // Audit B3: blank classification silently defaults to 'real' at insert
  // time — correct for production sheets, dangerous for test sheets. Make
  // the default visible before anyone clicks Import.
  const rowsDefaultingToReal = parseResult.normalizedRows.filter(row => !row.client_classification).length
  if (rowsDefaultingToReal > 0) {
    parseResult.warnings.unshift({
      rowNumber: 1,
      column: 'client_classification',
      message: `${rowsDefaultingToReal} row(s) have no client_classification and will import as 'real'.`,
    })
  }
  const classificationCounts: Record<string, number> = {}
  for (const row of parseResult.normalizedRows) {
    const classificationKey = row.client_classification ?? 'real'
    classificationCounts[classificationKey] = (classificationCounts[classificationKey] ?? 0) + 1
  }

  const issueCsv = buildImportIssueCsv([...allErrors, ...parseResult.warnings])
  const importRunBase = {
    created_by: userId,
    mode,
    source_filename: sourceFileName,
    total_rows: parseResult.rows.length,
    valid_rows: parseResult.normalizedRows.length,
    imported_rows: 0,
    skipped_rows: parseResult.rows.length - parseResult.normalizedRows.length,
    error_count: allErrors.length,
    warning_count: parseResult.warnings.length,
    issue_report_csv: issueCsv,
    status: 'completed' as const,
  }
  const plannerSuggestions = parseResult.validationErrors
    .filter(issue => issue.column === 'assigned_to_name')
    .map(issue => ({ rowNumber: issue.rowNumber, message: issue.message }))

  if (mode === 'validate') {
    if (isAzureConfigured()) {
      await withRlsContext(userId, (sql) => sql`INSERT INTO client_import_runs ${sql(importRunBase)}`)
    } else {
      await supabase.from('client_import_runs').insert(importRunBase)
    }


    // Audit: log bulk client import
    await auditLog(req, { userId, action: 'client.import.validate', resourceType: 'clients', details: { operation: 'bulk_import_validate', total_rows: parseResult.rows.length, valid_rows: parseResult.normalizedRows.length } }).catch(() => {})
    return NextResponse.json({
      mode,
      ok: allErrors.length === 0,
      summary: {
        totalRows: parseResult.rows.length,
        validRows: parseResult.normalizedRows.length,
        skippedRows: parseResult.rows.length - parseResult.normalizedRows.length,
        errorCount: allErrors.length,
        warningCount: parseResult.warnings.length,
        classificationCounts,
      },
      errors: allErrors,
      warnings: parseResult.warnings,
      plannerSuggestions,
      issueReportCsv: issueCsv,
      issueReportFileName: 'client-import-issues.csv',
      issueReportHref: issueDownloadHref(issueCsv),
      rows: parseResult.normalizedRows.map(row => ({
        rowNumber: row.rowNumber,
        client_id: row.client_id,
        last_name: row.last_name,
        first_name: row.first_name,
        category: row.category,
        assigned_to_name: row.assigned_to_name,
        assigned_to: row.assigned_to,
        assigned_to_resolution: row.assigned_to_resolution,
      })),
    })
  }

  const plannerOverride = overrideAssignedTo && (planners ?? []).some(planner => planner.id === overrideAssignedTo)
    ? overrideAssignedTo
    : null

  const payload = parseResult.normalizedRows.map(row => buildClientInsertPayload(plannerOverride ? { ...row, assigned_to: plannerOverride } : row))

  if (allErrors.length > 0 && payload.length === 0) {
    if (isAzureConfigured()) {
      await withRlsContext(userId, (sql) => sql`INSERT INTO client_import_runs ${sql({ ...importRunBase, status: 'failed' })}`)
    } else {
      await supabase.from('client_import_runs').insert({ ...importRunBase, status: 'failed' })
    }

    return NextResponse.json({
      mode,
      ok: false,
      error: 'No valid rows are available to import. Resolve validation errors first.',
      summary: {
        totalRows: parseResult.rows.length,
        validRows: parseResult.normalizedRows.length,
        skippedRows: parseResult.rows.length - parseResult.normalizedRows.length,
        errorCount: allErrors.length,
        warningCount: parseResult.warnings.length,
      },
      errors: allErrors,
      warnings: parseResult.warnings,
      plannerSuggestions,
      issueReportCsv: issueCsv,
      issueReportFileName: 'client-import-issues.csv',
      issueReportHref: issueDownloadHref(issueCsv),
    }, { status: 400 })
  }

  if (payload.length === 0) {
    if (isAzureConfigured()) {
      await withRlsContext(userId, (sql) => sql`INSERT INTO client_import_runs ${sql({ ...importRunBase, status: 'failed' })}`)
    } else {
      await supabase.from('client_import_runs').insert({ ...importRunBase, status: 'failed' })
    }
    return NextResponse.json({ error: 'No valid rows to import.' }, { status: 400 })
  }

  let insertedRows: { id: string; client_id: string }[] | null = null
  let insertError: { message: string } | null = null
  if (isAzureConfigured()) {
    // 2026-07-06 audit A1: clients + notes + activity + run record commit as
    // ONE transaction. A mid-import failure previously stranded clients
    // without their notes and poisoned retries (dupe check rejected the
    // whole file). Now it is all-or-nothing and a retry is always safe.
    try {
      insertedRows = await withRlsTransaction(userId, async (sql) => {
        const rows = (await sql`INSERT INTO clients ${sql(payload as readonly object[])} RETURNING id, client_id`) as unknown as { id: string; client_id: string }[]

        const byClientId = new Map(rows.map(client => [client.client_id, client.id]))
        const txNotes = parseResult.normalizedRows
          .filter(row => row.notes && byClientId.has(row.client_id))
          .map(row => ({
            client_id: byClientId.get(row.client_id)!,
            author_id: userId,
            content: row.notes!,
          }))
        if (txNotes.length > 0) {
          await sql`INSERT INTO client_notes ${sql(txNotes, 'client_id', 'author_id', 'content')}`
        }

        const txActivity = rows.map((client) => ({
          client_id: client.id,
          user_id: userId,
          action: 'Client created via batch import',
          field_name: null,
          old_value: null,
          new_value: client.client_id,
        }))
        if (txActivity.length > 0) {
          await sql`INSERT INTO activity_log ${sql(txActivity, 'client_id', 'user_id', 'action', 'field_name', 'old_value', 'new_value')}`
        }

        await sql`INSERT INTO client_import_runs ${sql({ ...importRunBase, imported_rows: rows.length })}`
        return rows
      })
    } catch (e) {
      const dbError = e as { code?: string; detail?: string; message: string }
      if (dbError?.code === '23505') {
        // Audit B6: the app-level dupe check can race a concurrent import or
        // read a stale RLS-scoped view; the DB unique constraint is the real
        // guard. Surface WHICH key collided instead of a bare 500.
        const keyMatch = /\((.+?)\)=\((.+?)\)/.exec(dbError.detail ?? '')
        insertError = { message: `Duplicate ${keyMatch?.[1] ?? 'key'} rejected by the database${keyMatch ? `: ${keyMatch[2]}` : ''}. Another import may have inserted it concurrently — re-run validation and retry.` }
      } else {
        insertError = { message: dbError.message }
      }
    }
  } else {
    const { data, error } = await supabase
      .from('clients')
      .insert(payload)
      .select('id, client_id')
    insertedRows = data
    insertError = error
  }

  if (insertError) {
    // The failed-run record intentionally lives OUTSIDE the transaction: it
    // must survive the rollback so the run history shows the attempt.
    if (isAzureConfigured()) {
      await withRlsContext(userId, (sql) => sql`INSERT INTO client_import_runs ${sql({ ...importRunBase, status: 'failed' })}`)
    } else {
      await supabase.from('client_import_runs').insert({ ...importRunBase, status: 'failed' })
    }
    return NextResponse.json({ error: insertError.message }, { status: 500 })
  }

  if (!isAzureConfigured()) {
    // Supabase dev fallback (PostgREST — no client-side transaction):
    // preserve the original sequential behavior.
    const insertedByClientId = new Map((insertedRows ?? []).map(client => [client.client_id, client.id]))

    const importedNotes = parseResult.normalizedRows
      .filter(row => row.notes && insertedByClientId.has(row.client_id))
      .map(row => ({
        client_id: insertedByClientId.get(row.client_id)!,
        author_id: userId,
        content: row.notes!,
      }))

    const activityRows = (insertedRows ?? []).map((client) => ({
      client_id: client.id,
      user_id: userId,
      action: 'Client created via batch import',
      field_name: null,
      old_value: null,
      new_value: client.client_id,
    }))

    if (importedNotes.length > 0) {
      await supabase.from('client_notes').insert(importedNotes)
    }

    if (activityRows.length > 0) {
      await supabase.from('activity_log').insert(activityRows)
    }

    await supabase.from('client_import_runs').insert({
      ...importRunBase,
      imported_rows: insertedRows?.length ?? 0,
    })
  }

  // Audit A3: the PHI-minting operation itself was never audit-logged —
  // only validate mode was. Fire-and-forget like every other audit write.
  await auditLog(req, { userId, action: 'client.create', resourceType: 'clients', details: { operation: 'bulk_import', imported_rows: insertedRows?.length ?? 0, source_filename: sourceFileName, classification_counts: classificationCounts } }).catch(() => {})

  return NextResponse.json({
    mode,
    ok: true,
    summary: {
      totalRows: parseResult.rows.length,
      validRows: parseResult.normalizedRows.length,
      importedRows: insertedRows?.length ?? 0,
      skippedRows: parseResult.rows.length - parseResult.normalizedRows.length,
      errorCount: allErrors.length,
      warningCount: parseResult.warnings.length,
      classificationCounts,
    },
    errors: allErrors,
    warnings: parseResult.warnings,
    plannerSuggestions,
    issueReportCsv: issueCsv,
    issueReportFileName: 'client-import-issues.csv',
    issueReportHref: issueDownloadHref(issueCsv),
    inserted: insertedRows ?? [],
  })
}
