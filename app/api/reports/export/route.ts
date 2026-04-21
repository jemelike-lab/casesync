import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/**
 * GET /api/reports/export
 * Server-side CSV export with audit trail.
 * Query params: filter, assignedTo, search, format (csv)
 */
export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Get profile for role-based scoping
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

  // Use service role for the query to bypass RLS
  const { createClient: createServiceClient } = await import('@supabase/supabase-js')
  const serviceSupabase = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SECRET_KEY!
  )

  let query = serviceSupabase
    .from('clients')
    .select(`
      client_id, first_name, last_name, category,
      eligibility_code, eligibility_end_date,
      last_contact_date, last_contact_type,
      co_app_date, loc_date, doc_adh_date, drop_in_visit_date,
      co_financial_redet_date, med_tech_redet_date,
      is_active, assigned_to,
      profiles!clients_assigned_to_fkey(full_name)
    `)
    .eq('is_active', true)
    .order('last_name', { ascending: true })

  // Role-based scoping
  if (profile.role === 'supports_planner') {
    query = query.eq('assigned_to', user.id)
  } else if (profile.role === 'team_manager') {
    // Team managers see their planners' clients
    const { data: planners } = await serviceSupabase
      .from('profiles')
      .select('id')
      .eq('team_manager_id', user.id)
    const plannerIds = planners?.map(p => p.id) ?? []
    plannerIds.push(user.id)
    query = query.in('assigned_to', plannerIds)
  }
  // Supervisors and IT see all

  if (assignedTo) {
    query = query.eq('assigned_to', assignedTo)
  }

  if (search) {
    const s = search.toLowerCase()
    query = query.or(`last_name.ilike.%${s}%,first_name.ilike.%${s}%,client_id.ilike.%${s}%`)
  }

  // Apply filter
  const today = new Date().toISOString().split('T')[0]
  const weekFromNow = new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0]
  const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString().split('T')[0]

  if (filter === 'overdue') {
    query = query.or(`co_app_date.lt.${today},loc_date.lt.${today},doc_adh_date.lt.${today},drop_in_visit_date.lt.${today},co_financial_redet_date.lt.${today},med_tech_redet_date.lt.${today}`)
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

  // Build CSV
  const headers = [
    'Client ID', 'First Name', 'Last Name', 'Category',
    'Eligibility Code', 'Eligibility End Date',
    'Last Contact Date', 'Last Contact Type',
    'CO App Date', 'LOC Date', 'Doc ADH Date',
    'Drop-In Visit Date', 'CO Financial Redet Date', 'Med Tech Redet Date',
    'Assigned To',
  ]

  const csvRows = [headers.join(',')]
  for (const c of rows) {
    const assignee = (c as any).profiles?.full_name ?? 'Unassigned'
    csvRows.push([
      c.client_id, c.first_name, c.last_name, c.category ?? '',
      c.eligibility_code ?? '', c.eligibility_end_date ?? '',
      c.last_contact_date ?? '', c.last_contact_type ?? '',
      c.co_app_date ?? '', c.loc_date ?? '', c.doc_adh_date ?? '',
      c.drop_in_visit_date ?? '', c.co_financial_redet_date ?? '',
      c.med_tech_redet_date ?? '', assignee,
    ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(','))
  }

  const csv = csvRows.join('\n')

  // Audit trail
  await serviceSupabase.from('audit_exports').insert({
    user_id: user.id,
    export_type: 'clients_csv',
    filter_params: { filter, assignedTo, search },
    row_count: rows.length,
  })

  const filename = `casesync-export-${filter}-${new Date().toISOString().split('T')[0]}.csv`

  return new NextResponse(csv, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  })
}
