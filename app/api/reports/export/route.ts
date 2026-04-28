import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { auditLog } from '@/lib/audit'
import {
  SAFE_EXPORT_SELECT,
  SAFE_EXPORT_HEADERS,
  safeRowToCSV,
  PHI_EXPORT_SELECT,
  PHI_EXPORT_HEADERS,
  phiRowToCSV,
} from '@/lib/export-columns'

/**
 * GET /api/reports/export
 * Server-side CSV export with audit trail.
 * Query params: filter, assignedTo, search, format (csv), includePhi (true)
 *
 * By default, exports are de-identified (no names, no client_id, no eligibility_code).
 * Supervisors / IT can pass ?includePhi=true to get the full dataset.
 */
export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, id')
    .eq('id', user.id)
    .single()

  if (!profile) {
    return NextResponse.json({ error: 'No profile found' }, { status: 403 })
  }

  const { searchParams } = new URL(req.url)
  const filter = searchParams.get('filter') ?? 'all'
  const assignedTo = searchParams.get('assignedTo')
  const search = searchParams.get('search')
  const includePhi = searchParams.get('includePhi') === 'true'

  // PHI exports are supervisor/IT only
  const canSeePhi =
    includePhi && ['supervisor', 'it'].includes(profile.role ?? '')

  const { createClient: createServiceClient } = await import('@supabase/supabase-js')
  const serviceSupabase = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SECRET_KEY!
  )

  const selectString = canSeePhi ? PHI_EXPORT_SELECT : SAFE_EXPORT_SELECT

  let query = serviceSupabase
    .from('clients')
    .select(selectString)
    .eq('is_active', true)
    .order('category', { ascending: true })

  // Role-based scoping
  if (profile.role === 'supports_planner') {
    query = query.eq('assigned_to', user.id)
  } else if (profile.role === 'team_manager') {
    const { data: planners } = await serviceSupabase
      .from('profiles')
      .select('id')
      .eq('team_manager_id', user.id)
    const plannerIds = planners?.map(p => p.id) ?? []
    plannerIds.push(user.id)
    query = query.in('assigned_to', plannerIds)
  }

  if (assignedTo) {
    query = query.eq('assigned_to', assignedTo)
  }

  if (search && canSeePhi) {
    const s = search.toLowerCase()
    query = query.or(`last_name.ilike.%${s}%,first_name.ilike.%${s}%,client_id.ilike.%${s}%`)
  } else if (search) {
    const s = search.toLowerCase()
    query = query.ilike('category', `%${s}%`)
  }

  const today = new Date().toISOString().split('T')[0]
  const weekFromNow = new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0]
  const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString().split('T')[0]

  if (filter === 'overdue') {
    query = query.or(`co_app_date.lt.${today},loc_date.lt.${today},drop_in_visit_date.lt.${today},co_financial_redet_date.lt.${today},med_tech_redet_date.lt.${today}`)
  } else if (filter === 'due_this_week') {
    query = query.or(`co_app_date.gte.${today}.and.co_app_date.lte.${weekFromNow},loc_date.gte.${today}.and.loc_date.lte.${weekFromNow}`)
  } else if (filter === 'no_contact_7') {
    query = query.or(`last_contact_date.is.null,last_contact_date.lt.${sevenDaysAgo}`)
  }

  const { data: clients, error } = await query

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const rows = clients ?? []

  const headers = canSeePhi ? PHI_EXPORT_HEADERS : SAFE_EXPORT_HEADERS
  const rowMapper = canSeePhi ? phiRowToCSV : safeRowToCSV

  const csvRows = [headers.join(',')]
  for (const c of rows) {
    csvRows.push(
      rowMapper(c)
        .map(v => `"${String(v).replace(/"/g, '""')}"`)
        .join(',')
    )
  }

  const csv = csvRows.join('\n')

  // Audit trail
  await serviceSupabase.from('audit_exports').insert({
    user_id: user.id,
    export_type: canSeePhi ? 'clients_csv_phi' : 'clients_csv',
    filter_params: { filter, assignedTo, search, includePhi: canSeePhi },
    row_count: rows.length,
  })

  const label = canSeePhi ? 'phi' : 'safe'
  const filename = `casesync-export-${filter}-${label}-${new Date().toISOString().split('T')[0]}.csv`

  return new NextResponse(csv, {
    status: 200,
    headers: {

    // Audit: log CSV export
    await auditLog(req, { userId: authData.user.id, userEmail: authData.user.email ?? undefined, userRole: profile?.role, action: 'report.export', resourceType: 'clients', details: { row_count: rows.length, format: 'csv' } }).catch(() => {})
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  })
}
