import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { auditLog } from '@/lib/audit'
import { sanitizeSearchParam } from '@/lib/validation'
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

  // M1: PHI exports require MFA to be enabled (HIPAA defense-in-depth)
  if (canSeePhi) {
    const { data: mfaProfile } = await supabase
      .from('profiles')
      .select('mfa_email_enabled')
      .eq('id', user.id)
      .single()

    const { data: factors } = await supabase.auth.mfa.listFactors()
    const totpFactors = (factors as any)?.totp ?? (factors as any)?.all?.filter((f: any) => f.factor_type === 'totp') ?? []
    const hasVerifiedTotp = Array.isArray(totpFactors) && totpFactors.some((f: any) => f.status === 'verified')
    const hasMfa = mfaProfile?.mfa_email_enabled === true || hasVerifiedTotp

    if (!hasMfa) {
      return NextResponse.json(
        { error: 'PHI exports require multi-factor authentication. Please enable MFA in Settings → Security before downloading identifiable data.' },
        { status: 403 }
      )
    }
  }

  const { createClient: createServiceClient } = await import('@supabase/supabase-js')
  const serviceSupabase = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const selectString = canSeePhi ? PHI_EXPORT_SELECT : SAFE_EXPORT_SELECT

  let query = serviceSupabase
    .from('clients')
    .select(selectString)
    .eq('is_active', true)
    .eq('client_classification', 'real')
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
    const s = sanitizeSearchParam(search)
    if (s) query = query.or(`last_name.ilike.%${s}%,first_name.ilike.%${s}%,client_id.ilike.%${s}%`)
  } else if (search) {
    const s = sanitizeSearchParam(search)
    if (s) query = query.ilike('category', `%${s}%`)
  }

  const today = new Date().toISOString().split('T')[0]
  const weekFromNow = new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0]
  const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString().split('T')[0]

  // Must match the 12 deadline fields in lib/types.ts isOverdue/isDueThisWeek
  const deadlineFields = [
    'eligibility_end_date', 'three_month_visit_due', 'quarterly_waiver_date',
    'med_tech_redet_date', 'pos_deadline', 'assessment_due', 'thirty_day_letter_date',
    'co_financial_redet_date', 'co_app_date', 'mfp_consent_date', 'two57_date',
    'doc_mdh_date',
  ]

  if (filter === 'overdue') {
    query = query.or(deadlineFields.map(f => `${f}.lt.${today}`).join(','))
  } else if (filter === 'due_this_week') {
    query = query.or(deadlineFields.map(f => `and(${f}.gte.${today},${f}.lte.${weekFromNow})`).join(','))
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

  // Audit: log CSV export
  await auditLog(req, { userId: user.id, userEmail: user.email ?? undefined, userRole: profile?.role, action: 'report.export', resourceType: 'clients', details: { row_count: rows.length, format: 'csv' } }).catch(() => {})

  const label = canSeePhi ? 'phi' : 'safe'
  const filename = `casesync-export-${filter}-${label}-${new Date().toISOString().split('T')[0]}.csv`

  return new NextResponse(csv, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  })
}
