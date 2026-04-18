import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { sendEmail } from '@/lib/email'
import { deadlineAlertEmail, dailyDigestEmail, teamManagerPlannerAlertEmail } from '@/lib/email-templates'

export const dynamic = 'force-dynamic'

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
]

const NOTIFY_DAYS = [1, 3, 7]

export async function GET(request: Request) {
  // Security: require cron secret — fail closed if not configured
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

  // Detect if this is an 8am run (for daily digest)
  const currentHour = new Date().getHours()
  const isMorningRun = currentHour >= 7 && currentHour <= 9

  // Fetch all clients with assigned planner
  const { data: clients, error } = await supabase
    .from('clients')
    .select('id, client_id, first_name, last_name, assigned_to, eligibility_end_date, three_month_visit_due, pos_deadline, assessment_due, thirty_day_letter_date, spm_next_due, co_financial_redet_date, quarterly_waiver_date, med_tech_redet_date, co_app_date, mfp_consent_date, two57_date, doc_mdh_date, last_contact_date')
    .not('assigned_to', 'is', null)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Fetch planner profiles (email + notification prefs + manager linkage)
  const assigneeIds = [...new Set((clients ?? []).map(c => c.assigned_to).filter(Boolean))]
  const { data: profiles } = assigneeIds.length > 0
    ? await supabase
        .from('profiles')
        .select('id, email, full_name, team_manager_id, notification_preferences')
        .in('id', assigneeIds)
    : { data: [] }

  const profileMap = new Map((profiles ?? []).map(p => [p.id, p]))
  const teamManagerIds = [...new Set((profiles ?? []).map(p => p.team_manager_id).filter(Boolean))]
  const { data: teamManagers } = teamManagerIds.length > 0
    ? await supabase
        .from('profiles')
        .select('id, email, full_name, notification_preferences')
        .in('id', teamManagerIds)
    : { data: [] }
  const managerMap = new Map((teamManagers ?? []).map(m => [m.id, m]))

  // Check which notifications were already sent today (to avoid duplicates)
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

      if (NOTIFY_DAYS.includes(diffDays) && client.assigned_to) {
        const clientName = `${client.last_name}${client.first_name ? ', ' + client.first_name : ''}`
        const daysLabel = diffDays === 1 ? 'tomorrow' : `in ${diffDays} days`
        const notifBody = `${label} is due ${daysLabel} (${dateStr})`
        const dedupeKey = `${client.assigned_to}:${notifBody}`
        const sectionByField: Record<string, string> = {
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
        const fieldKey = String(key)
        const targetSection = sectionByField[fieldKey] ?? 'section-plans-assessments'
        const deepLink = `/clients/${client.id}?highlight=${encodeURIComponent(fieldKey)}#${targetSection}`

        // Only insert in-app notification if not already sent today
        if (!sentToday.has(dedupeKey)) {
          notifications.push({
            user_id: client.assigned_to,
            title: `📅 Deadline ${daysLabel}: ${clientName}`,
            body: notifBody,
            link: deepLink,
            read: false,
          })
        }

        // Send email notification if planner has it enabled
        const profile = profileMap.get(client.assigned_to)
        if (profile?.email) {
          const prefs = (profile.notification_preferences as any) ?? {}
          const emailEnabled = prefs.deadline_7day !== false // default to true unless explicitly disabled
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

    const existing: {
      plannerId: string
      plannerName: string
      teamManagerId: string
      overdueClientCount: number
      dueSoonClientCount: number
      topIssues: Array<{ clientName: string; issue: string; dueDate: string; severity: number }>
    } = plannerEscalations.get(client.assigned_to) ?? {
      plannerId: client.assigned_to,
      plannerName: planner.full_name ?? 'Planner',
      teamManagerId,
      overdueClientCount: 0,
      dueSoonClientCount: 0,
      topIssues: [],
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

    const prefs = (manager.notification_preferences as any) ?? {}
    const managerEmailEnabled = prefs.team_deadline_alerts !== false
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
    // Group clients by assigned_to
    const clientsByPlanner: Record<string, typeof clients> = {}
    for (const client of clients ?? []) {
      if (!client.assigned_to) continue
      if (!clientsByPlanner[client.assigned_to]) clientsByPlanner[client.assigned_to] = []
      clientsByPlanner[client.assigned_to]!.push(client)
    }

    for (const [plannerId, plannerClients] of Object.entries(clientsByPlanner)) {
      const profile = profileMap.get(plannerId)
      if (!profile?.email) continue

      const prefs = (profile.notification_preferences as any) ?? {}

      // Calculate overdue + due this week
      let overdueCount = 0
      let dueThisWeekCount = 0
      const now = new Date()

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

      // Send digest if:
      // 1. Planner has daily_digest preference enabled, OR
      // 2. They have overdue items (always send regardless of preference)
      const digestEnabled = prefs.daily_digest === true || overdueCount > 0
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

          // Override subject to include client count
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
    // Batch insert
    const { error: insertError } = await supabase.from('notifications').insert(notifications)
    if (insertError) {
      return NextResponse.json({ error: insertError.message, attempted: notifications.length }, { status: 500 })
    }
  }

  return NextResponse.json({
    ok: true,
    checked: clients?.length ?? 0,
    notificationsSent: notifications.length,
    emailsSent,
    digestsSent,
    managerAlertsSent,
    timestamp: new Date().toISOString(),
  })
}
