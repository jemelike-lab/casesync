import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { isAzureConfigured, withRlsContext } from '@/lib/db/azure'
import { sendEmail } from '@/lib/email'
import { deadlineAlertEmail, dailyDigestEmail, teamManagerPlannerAlertEmail } from '@/lib/email-templates'

export const dynamic = 'force-dynamic'

/**
 * Deadline fields — aligned with lib/types.ts isOverdue/isDueThisWeek (12 core fields)
 * plus spm_next_due and doc_mdh_date for completeness.
 *
 * H2 fix: doc_mdh_date was selected but missing from this array.
 * H3 fix: spm_next_due is now included here AND in the dashboard checks.
 */
const DEADLINE_FIELDS = [
  { key: 'eligibility_end_date', label: 'Eligibility End Date' },
  { key: 'three_month_visit_due', label: '3-Month Visit Due' },
  { key: 'pos_deadline', label: 'POS Deadline' },
  { key: 'assessment_due', label: 'Assessment Due' },
  { key: 'thirty_day_letter_date', label: '30-Day Letter Date' },
  { key: 'spm_next_due', label: 'SPM Next Due' },
  { key: 'co_financial_redet_date', label: 'CO Financial Redet Date' },
  { key: 'quarterly_waiver_date', label: 'Quarterly Waiver Date' },
  { key: 'med_tech_redet_date', label: 'Med Tech Redet Date' },
  { key: 'co_app_date', label: 'CO App Date' },
  { key: 'mfp_consent_date', label: 'MFP Consent Date' },
  { key: 'two57_date', label: '257 Date' },
  { key: 'doc_mdh_date', label: 'Doc MDH Date' },
]

/**
 * C3 fix: notify on approach AND on overdue milestones.
 * Approaching: 1, 3, 7 days before due.
 * Overdue: 0 (due today), then every 7 days overdue (7, 14, 21, 28...).
 */
function shouldNotify(diffDays: number): boolean {
  if ([1, 3, 7].includes(diffDays)) return true
  if (diffDays === 0) return true
  if (diffDays < 0 && diffDays % 7 === 0) return true
  return false
}

function getNotifLabel(diffDays: number): string {
  if (diffDays === 0) return 'today'
  if (diffDays === 1) return 'tomorrow'
  if (diffDays > 1) return `in ${diffDays} days`
  const abs = Math.abs(diffDays)
  return `overdue by ${abs} day${abs === 1 ? '' : 's'}`
}

function getNotifEmoji(diffDays: number): string {
  if (diffDays < 0) return '🚨'
  if (diffDays === 0) return '⏰'
  return '📅'
}

const SECTION_BY_FIELD: Record<string, string> = {
  eligibility_end_date: 'section-eligibility',
  three_month_visit_due: 'section-contact-visits',
  quarterly_waiver_date: 'section-contact-visits',
  med_tech_redet_date: 'section-med-tech',
  pos_deadline: 'section-plans-assessments',
  assessment_due: 'section-plans-assessments',
  thirty_day_letter_date: 'section-contact-visits',
  co_financial_redet_date: 'section-co-details',
  co_app_date: 'section-co-details',
  mfp_consent_date: 'section-co-details',
  two57_date: 'section-co-details',
  doc_mdh_date: 'section-plans-assessments',
  spm_next_due: 'section-plans-assessments',
}

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const todayStr = today.toISOString().split('T')[0]

  const currentHour = new Date().getUTCHours()
  // Morning cron runs at 12 UTC (8am EDT / 7am EST). Daily digest only on morning run.
  const isMorningRun = currentHour >= 11 && currentHour <= 13

  // C4 fix: only fetch active, real clients with an assigned planner.
  // Phase 3 data plane: the clients table lives in Azure when configured.
  // This cron has no acting user, so it reads under a resolved SUPERVISOR's
  // RLS scope (supervisors see all clients) — RLS-honest with zero schema
  // change. Identity-plane reads (profiles, prefs, emails) stay on Supabase.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let clients: any[] | null = null
  let plane: 'azure' | 'supabase' = 'supabase'
  if (isAzureConfigured()) {
    plane = 'azure'
    const { data: sup } = await supabase
      .from('profiles')
      .select('id')
      .eq('role', 'supervisor')
      .order('created_at', { ascending: true })
      .limit(1)
    const supervisorId = sup?.[0]?.id
    if (!supervisorId) {
      return NextResponse.json({ error: 'No supervisor profile found to scope the Azure deadline scan' }, { status: 500 })
    }
    try {
      clients = await withRlsContext(supervisorId, async (sql) => {
        const rows = await sql`SELECT id, client_id, first_name, last_name, assigned_to, client_classification, eligibility_end_date, three_month_visit_due, pos_deadline, assessment_due, thirty_day_letter_date, spm_next_due, co_financial_redet_date, quarterly_waiver_date, med_tech_redet_date, co_app_date, mfp_consent_date, two57_date, doc_mdh_date, last_contact_date FROM clients WHERE is_active = true AND client_classification = 'real' AND assigned_to IS NOT NULL`
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return rows as unknown as any[]
      })
    } catch (e) {
      return NextResponse.json({ error: (e as Error).message }, { status: 500 })
    }
  } else {
    const { data, error } = await supabase
      .from('clients')
      .select('id, client_id, first_name, last_name, assigned_to, client_classification, eligibility_end_date, three_month_visit_due, pos_deadline, assessment_due, thirty_day_letter_date, spm_next_due, co_financial_redet_date, quarterly_waiver_date, med_tech_redet_date, co_app_date, mfp_consent_date, two57_date, doc_mdh_date, last_contact_date')
      .eq('is_active', true)
      .eq('client_classification', 'real')
      .not('assigned_to', 'is', null)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    clients = data
  }

  // C2 fix: fetch profiles, emails, and notification prefs from their correct tables
  const assigneeIds = [...new Set((clients ?? []).map(c => c.assigned_to).filter(Boolean))]

  const { data: profiles } = assigneeIds.length > 0
    ? await supabase
        .from('profiles')
        .select('id, full_name, team_manager_id')
        .in('id', assigneeIds)
    : { data: [] }

  // Emails from auth.users via admin API
  const { data: authData } = await supabase.auth.admin.listUsers()
  const emailMap = new Map<string, string>()
  for (const u of authData?.users ?? []) {
    if (u.id && u.email) emailMap.set(u.id, u.email)
  }

  // Notification preferences from the dedicated table
  const teamManagerIds = [...new Set((profiles ?? []).map(p => p.team_manager_id).filter(Boolean))]
  const allUserIds = [...new Set([...assigneeIds, ...teamManagerIds])]
  const { data: notifPrefs } = allUserIds.length > 0
    ? await supabase
        .from('notification_preferences')
        .select('user_id, deadline_7day, client_assigned, daily_digest')
        .in('user_id', allUserIds)
    : { data: [] }
  const prefsMap = new Map((notifPrefs ?? []).map(p => [p.user_id, p]))

  // Build enriched profile map
  type EnrichedProfile = {
    id: string
    full_name: string | null
    team_manager_id: string | null
    email: string | null
    prefs: { deadline_7day?: boolean | null; daily_digest?: boolean | null }
  }
  const profileMap = new Map<string, EnrichedProfile>()
  for (const p of profiles ?? []) {
    profileMap.set(p.id, {
      id: p.id,
      full_name: p.full_name,
      team_manager_id: p.team_manager_id,
      email: emailMap.get(p.id) ?? null,
      prefs: prefsMap.get(p.id) ?? {},
    })
  }

  // Manager profiles
  const { data: tmProfiles } = teamManagerIds.length > 0
    ? await supabase.from('profiles').select('id, full_name').in('id', teamManagerIds)
    : { data: [] }
  const managerMap = new Map<string, EnrichedProfile>()
  for (const m of tmProfiles ?? []) {
    managerMap.set(m.id, {
      id: m.id,
      full_name: m.full_name,
      team_manager_id: null,
      email: emailMap.get(m.id) ?? null,
      prefs: prefsMap.get(m.id) ?? {},
    })
  }

  // Dedup check
  const { data: todayNotifs } = await supabase
    .from('notifications')
    .select('user_id, body')
    .gte('created_at', `${todayStr}T00:00:00`)
    .lte('created_at', `${todayStr}T23:59:59`)

  const sentToday = new Set((todayNotifs ?? []).map(n => `${n.user_id}:${n.body}`))

  const notifications: any[] = []
  let emailsSent = 0
  let digestsSent = 0
  let managerAlertsSent = 0

  // ---- DEADLINE NOTIFICATIONS ----
  for (const client of clients ?? []) {
    for (const { key, label } of DEADLINE_FIELDS) {
      const dateStr = (client as any)[key] as string | null
      if (!dateStr) continue
      const date = new Date(dateStr)
      date.setHours(0, 0, 0, 0)
      const diffDays = Math.round((date.getTime() - today.getTime()) / 86400000)

      if (shouldNotify(diffDays) && client.assigned_to) {
        const clientName = `${client.last_name}${client.first_name ? ', ' + client.first_name : ''}`
        const daysLabel = getNotifLabel(diffDays)
        const emoji = getNotifEmoji(diffDays)
        const notifBody = `${label} is ${diffDays < 0 ? '' : 'due '}${daysLabel} (${dateStr})`
        const dedupeKey = `${client.assigned_to}:${notifBody}`
        const fieldKey = String(key)
        const targetSection = SECTION_BY_FIELD[fieldKey] ?? 'section-plans-assessments'
        const deepLink = `/clients/${client.id}?highlight=${encodeURIComponent(fieldKey)}#${targetSection}`

        if (!sentToday.has(dedupeKey)) {
          notifications.push({
            user_id: client.assigned_to,
            title: `${emoji} Deadline ${daysLabel}: ${clientName}`,
            body: notifBody,
            link: deepLink,
            read: false,
          })
        }

        const profile = profileMap.get(client.assigned_to)
        if (profile?.email) {
          const emailEnabled = profile.prefs.deadline_7day !== false
          const emailDedupeKey = `email:${client.assigned_to}:${key}:${todayStr}`

          if (emailEnabled && !sentToday.has(emailDedupeKey)) {
            try {
              const { subject, html } = deadlineAlertEmail({
                clientName,
                fieldLabel: label,
                dueDate: dateStr,
                daysUntil: diffDays,
                clientId: client.id,
              })
              await sendEmail({ to: profile.email, subject, html })
              emailsSent++
            } catch (emailErr) {
              console.error('[check-deadlines] email send error:', emailErr)
            }
          }
        }
      }
    }
  }

  // ---- TEAM MANAGER ESCALATIONS ----
  const plannerEscalations = new Map<string, {
    plannerId: string
    plannerName: string
    teamManagerId: string
    overdueClientCount: number
    dueSoonClientCount: number
    topIssues: Array<{ clientName: string; issue: string; dueDate: string; severity: number }>
  }>()

  for (const client of clients ?? []) {
    if (!client.assigned_to) continue
    const planner = profileMap.get(client.assigned_to)
    const teamManagerId = planner?.team_manager_id
    if (!planner || !teamManagerId) continue

    const issues: Array<{ clientName: string; issue: string; dueDate: string; severity: number }> = []
    let clientOverdue = false
    let clientDueThisWeek = false

    for (const { key, label } of DEADLINE_FIELDS) {
      const dateStr = (client as any)[key] as string | null
      if (!dateStr) continue
      const date = new Date(dateStr)
      date.setHours(0, 0, 0, 0)
      const diffDays = Math.round((date.getTime() - today.getTime()) / 86400000)
      if (diffDays < 0) {
        clientOverdue = true
        issues.push({
          clientName: `${client.last_name}${client.first_name ? ', ' + client.first_name : ''}`,
          issue: `${label} overdue by ${Math.abs(diffDays)} day${Math.abs(diffDays) === 1 ? '' : 's'}`,
          dueDate: dateStr,
          severity: 0,
        })
      } else if (diffDays <= 7) {
        clientDueThisWeek = true
        issues.push({
          clientName: `${client.last_name}${client.first_name ? ', ' + client.first_name : ''}`,
          issue: `${label} due in ${diffDays} day${diffDays === 1 ? '' : 's'}`,
          dueDate: dateStr,
          severity: 1,
        })
      }
    }

    if (!clientOverdue && !clientDueThisWeek) continue

    const existing = plannerEscalations.get(client.assigned_to) ?? {
      plannerId: client.assigned_to,
      plannerName: planner.full_name ?? 'Planner',
      teamManagerId,
      overdueClientCount: 0,
      dueSoonClientCount: 0,
      topIssues: [] as Array<{ clientName: string; issue: string; dueDate: string; severity: number }>,
    }

    if (clientOverdue) existing.overdueClientCount++
    else if (clientDueThisWeek) existing.dueSoonClientCount++

    existing.topIssues.push(...issues)
    existing.topIssues = existing.topIssues
      .sort((a, b) => a.severity - b.severity || a.dueDate.localeCompare(b.dueDate))
      .slice(0, 5)

    plannerEscalations.set(client.assigned_to, existing)
  }

  for (const escalation of plannerEscalations.values()) {
    if (escalation.overdueClientCount <= 0) continue

    const manager = managerMap.get(escalation.teamManagerId)
    if (!manager?.email) continue

    const managerEmailEnabled = manager.prefs.deadline_7day !== false
    const alertDedupeKey = `manager-alert:${manager.id}:${escalation.plannerId}:${todayStr}`
    if (!managerEmailEnabled || sentToday.has(alertDedupeKey)) continue

    try {
      const { subject, html } = teamManagerPlannerAlertEmail({
        managerName: manager.full_name?.split(' ')[0] ?? 'there',
        plannerName: escalation.plannerName,
        overdueClientCount: escalation.overdueClientCount,
        dueSoonClientCount: escalation.dueSoonClientCount,
        topIssues: escalation.topIssues,
        queueHref: '/team?full=1&filter=overdue',
      })
      await sendEmail({ to: manager.email, subject, html })
      managerAlertsSent++

      notifications.push({
        user_id: manager.id,
        title: `⚠️ ${escalation.plannerName} has overdue client deadlines`,
        body: `${escalation.overdueClientCount} overdue client${escalation.overdueClientCount === 1 ? '' : 's'} need follow-up.`,
        link: `/team?full=1&filter=overdue`,
        read: false,
      })

      notifications.push({
        user_id: manager.id,
        title: `manager-alert:${escalation.plannerId}:${todayStr}`,
        body: alertDedupeKey,
        link: `/team?full=1&filter=overdue`,
        read: true,
      })
    } catch (managerErr) {
      console.error('[check-deadlines] manager alert send error:', managerErr)
    }
  }

  // ---- DAILY DIGEST (morning run only) ----
  if (isMorningRun) {
    const clientsByPlanner: Record<string, typeof clients> = {}
    for (const client of clients ?? []) {
      if (!client.assigned_to) continue
      if (!clientsByPlanner[client.assigned_to]) clientsByPlanner[client.assigned_to] = []
      clientsByPlanner[client.assigned_to]!.push(client)
    }

    for (const [plannerId, plannerClients] of Object.entries(clientsByPlanner)) {
      const profile = profileMap.get(plannerId)
      if (!profile?.email) continue

      let overdueCount = 0
      let dueThisWeekCount = 0

      for (const client of plannerClients ?? []) {
        let clientOverdue = false
        let clientDueThisWeek = false
        for (const { key } of DEADLINE_FIELDS) {
          const dateStr = (client as any)[key] as string | null
          if (!dateStr) continue
          const date = new Date(dateStr)
          date.setHours(0, 0, 0, 0)
          const diffDays = Math.round((date.getTime() - today.getTime()) / 86400000)
          if (diffDays < 0) clientOverdue = true
          else if (diffDays <= 7) clientDueThisWeek = true
        }
        if (clientOverdue) overdueCount++
        else if (clientDueThisWeek) dueThisWeekCount++
      }

      const digestEnabled = profile.prefs.daily_digest === true || overdueCount > 0
      const digestDedupeKey = `digest:${plannerId}:${todayStr}`

      if (digestEnabled && !sentToday.has(digestDedupeKey)) {
        try {
          const userName = profile.full_name?.split(' ')[0] ?? 'there'
          const dateDisplay = today.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
          const totalNeedAttention = overdueCount + dueThisWeekCount

          const { subject, html } = dailyDigestEmail({
            userName,
            date: dateDisplay,
            overdueCount,
            dueThisWeekCount,
            recentActivity: [],
          })

          const finalSubject = `📋 Good morning ${userName} — ${totalNeedAttention > 0 ? `${totalNeedAttention} clients need attention today` : 'All clients current'}`

          await sendEmail({ to: profile.email, subject: finalSubject, html })
          digestsSent++
        } catch (digestErr) {
          console.error('[check-deadlines] digest send error:', digestErr)
        }
      }
    }
  }

  if (notifications.length > 0) {
    const { error: insertError } = await supabase.from('notifications').insert(notifications)
    if (insertError) {
      return NextResponse.json({ error: insertError.message, attempted: notifications.length }, { status: 500 })
    }
  }

  return NextResponse.json({
    ok: true,
    plane,
    checked: clients?.length ?? 0,
    notificationsSent: notifications.length,
    emailsSent,
    digestsSent,
    managerAlertsSent,
    timestamp: new Date().toISOString(),
  })
}
