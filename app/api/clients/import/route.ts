import { NextRequest, NextResponse } from 'next/server'
import * as XLSX from 'xlsx'
import { canManageTeam } from '@/lib/roles'
import { createClient as createServerClient } from '@/lib/supabase/server'
import {
  buildClientInsertPayload,
  buildImportIssueCsv,
  parseClientImportText,
  parseDelimitedRowsToCsv,
} from '@/lib/client-import'

export const dynamic = 'force-dynamic'

type Mode = 'validate' | 'import'

async function getAuthorizedContext() {
  const supabase = await createServerClient()
  const { data: authData, error: authError } = await supabase.auth.getUser()

  if (authError || !authData.user) {
    return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  }

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('id, role')
    .eq('id', authData.user.id)
    .single()

  if (profileError || !profile || !canManageTeam(profile.role)) {
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

  const contentType = req.headers.get('content-type') ?? ''

  if (contentType.includes('multipart/form-data')) {
    const formData = await req.formData()
    mode = formData.get('mode') === 'import' ? 'import' : 'validate'
    const file = formData.get('file')
    const pastedText = formData.get('csvText')
    const sourceFileNameValue = formData.get('sourceFileName')

    if (typeof sourceFileNameValue === 'string' && sourceFileNameValue.trim()) {
      sourceFileName = sourceFileNameValue.trim()
    }

    if (file instanceof File && file.size > 0) {
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
  const [{ data: planners, error: plannersError }, { data: existingClients, error: existingError }] = await Promise.all([
    supabase
      .from('profiles')
      .select('id, full_name')
      .eq('role', 'supports_planner')
      .order('full_name'),
    supabase
      .from('clients')
      .select('client_id'),
  ])

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
    await supabase.from('client_import_runs').insert(importRunBase)

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

  const payload = parseResult.normalizedRows.map(buildClientInsertPayload)

  if (allErrors.length > 0 && payload.length === 0) {
    await supabase.from('client_import_runs').insert({ ...importRunBase, status: 'failed' })

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
    await supabase.from('client_import_runs').insert({ ...importRunBase, status: 'failed' })
    return NextResponse.json({ error: 'No valid rows to import.' }, { status: 400 })
  }

  const { data: insertedRows, error: insertError } = await supabase
    .from('clients')
    .insert(payload)
    .select('id, client_id')

  if (insertError) {
    await supabase.from('client_import_runs').insert({ ...importRunBase, status: 'failed' })
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
    await supabase.from('client_notes').insert(importedNotes)
  }

  if (activityRows.length > 0) {
    await supabase.from('activity_log').insert(activityRows)
  }

  await supabase.from('client_import_runs').insert({
    ...importRunBase,
    imported_rows: insertedRows?.length ?? 0,
  })

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
