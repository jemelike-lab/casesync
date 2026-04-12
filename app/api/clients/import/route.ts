import { NextRequest, NextResponse } from 'next/server'
import { canManageTeam } from '@/lib/roles'
import { createClient as createServerClient } from '@/lib/supabase/server'
import {
  buildClientInsertPayload,
  parseClientImportText,
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

export async function POST(req: NextRequest) {
  const auth = await getAuthorizedContext()
  if (auth.error) return auth.error

  const body = await req.json().catch(() => null)
  const csvText = typeof body?.csvText === 'string' ? body.csvText : ''
  const mode: Mode = body?.mode === 'import' ? 'import' : 'validate'

  if (!csvText.trim()) {
    return NextResponse.json({ error: 'CSV text is required.' }, { status: 400 })
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
  if (mode === 'validate') {
    return NextResponse.json({
      mode,
      ok: allErrors.length === 0,
      summary: {
        totalRows: parseResult.rows.length,
        validRows: parseResult.normalizedRows.length,
        errorCount: allErrors.length,
        warningCount: parseResult.warnings.length,
      },
      errors: allErrors,
      warnings: parseResult.warnings,
      rows: parseResult.normalizedRows.map(row => ({
        rowNumber: row.rowNumber,
        client_id: row.client_id,
        last_name: row.last_name,
        first_name: row.first_name,
        category: row.category,
        assigned_to_name: row.assigned_to_name,
        assigned_to: row.assigned_to,
      })),
    })
  }

  if (allErrors.length > 0) {
    return NextResponse.json({
      mode,
      ok: false,
      error: 'Resolve validation errors before importing.',
      summary: {
        totalRows: parseResult.rows.length,
        validRows: parseResult.normalizedRows.length,
        errorCount: allErrors.length,
        warningCount: parseResult.warnings.length,
      },
      errors: allErrors,
      warnings: parseResult.warnings,
    }, { status: 400 })
  }

  const payload = parseResult.normalizedRows.map(buildClientInsertPayload)
  if (payload.length === 0) {
    return NextResponse.json({ error: 'No valid rows to import.' }, { status: 400 })
  }

  const { data: insertedRows, error: insertError } = await supabase
    .from('clients')
    .insert(payload)
    .select('id, client_id')

  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 500 })
  }

  const activityRows = (insertedRows ?? []).map((client) => ({
    client_id: client.id,
    user_id: userId,
    action: 'Client created via batch import',
    field_name: null,
    old_value: null,
    new_value: client.client_id,
  }))

  if (activityRows.length > 0) {
    await supabase.from('activity_log').insert(activityRows)
  }

  return NextResponse.json({
    mode,
    ok: true,
    summary: {
      totalRows: parseResult.rows.length,
      importedRows: insertedRows?.length ?? 0,
      warningCount: parseResult.warnings.length,
    },
    warnings: parseResult.warnings,
    inserted: insertedRows ?? [],
  })
}
