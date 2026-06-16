import { NextRequest, NextResponse } from 'next/server'
import * as XLSX from 'xlsx'
import { isSupervisorLike } from '@/lib/roles'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { auditLog } from '@/lib/audit'
import { isAzureConfigured, withRlsContext } from '@/lib/db/azure'
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
  const workbook = XLSX.read(Buffer.from(buffer), { type: 'buffer' })
  const firstSheet = workbook.SheetNames[0]
  if (!firstSheet) throw new Error('Workbook has no sheets.')
  const worksheet = workbook.Sheets[firstSheet]
  const rows = XLSX.utils.sheet_to_json<string[]>(worksheet, { header: 1, raw: false, defval: '' }) as string[][]
  if (!rows.length) return ''
  const [headers, ...dataRows] = rows.map(row => row.map(cell => String(cell ?? '').trim()))
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
    await auditLog(req, { userId, action: 'client.create', resourceType: 'clients', details: { operation: 'bulk_import' } }).catch(() => {})
    return NextResponse.json({
      mode,
      ok: allErrors.length === 0,
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
    try {
      insertedRows = await withRlsContext(userId, async (sql) => {
        const rows = await sql`INSERT INTO clients ${sql(payload as readonly object[])} RETURNING id, client_id`
        return rows as unknown as { id: string; client_id: string }[]
      })
    } catch (e) {
      insertError = { message: (e as Error).message }
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
    if (isAzureConfigured()) {
      await withRlsContext(userId, (sql) => sql`INSERT INTO client_import_runs ${sql({ ...importRunBase, status: 'failed' })}`)
    } else {
      await supabase.from('client_import_runs').insert({ ...importRunBase, status: 'failed' })
    }
    return NextResponse.json({ error: insertError.message }, { status: 500 })
  }

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
    if (isAzureConfigured()) {
      await withRlsContext(userId, (sql) => sql`INSERT INTO client_notes ${sql(importedNotes, 'client_id', 'author_id', 'content')}`)
    } else {
      await supabase.from('client_notes').insert(importedNotes)
    }
  }

  if (activityRows.length > 0) {
    if (isAzureConfigured()) {
      await withRlsContext(userId, (sql) => sql`INSERT INTO activity_log ${sql(activityRows, 'client_id', 'user_id', 'action', 'field_name', 'old_value', 'new_value')}`)
    } else {
      await supabase.from('activity_log').insert(activityRows)
    }
  }

  if (isAzureConfigured()) {
    await withRlsContext(userId, (sql) => sql`INSERT INTO client_import_runs ${sql({ ...importRunBase, imported_rows: insertedRows?.length ?? 0 })}`)
  } else {
    await supabase.from('client_import_runs').insert({
      ...importRunBase,
      imported_rows: insertedRows?.length ?? 0,
    })
  }

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
