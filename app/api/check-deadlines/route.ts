import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { isAzureConfigured, withRlsContext } from '@/lib/db/azure'
import { sendEmail } from '@/lib/email'
import { deadlineAlertEmail, dailyDigestEmail, teamManagerPlannerAlertEmail } from '@/lib/email-templates'
import { businessTodayStr, businessTodayEpoch, daysFromBusinessToday, DAY_MS } from '@/lib/business-date'

export const dynamic = 'force-dynamic'

// 2026-07-04 accuracy-at-scale rebuild:
//   • listUsers is now paginated — the bare call returned only the first 50
//     users, silently dropping alert/digest emails for everyone past #50.
//   • Dedupe is claim-based via the cron_dedupe table (INSERT ... ON CONFLICT
//     DO NOTHING). The old read-back body-matching dedupe capped at 1000
//     rows/day and NEVER matched for emails (keys were checked but never
//     written), so every alert email went out twice a day (12:00 + 20:00 UTC
//     runs). A claimed key = the action already happened today.
//   • Notification inserts are chunked (500/insert) so 5k-client days don't
//     hit payload limits; emails send with bounded concurrency in small
//     claim-then-send slices so a timeout loses at most one slice, never
//     duplicates.
//   • "Today" is the America/New_York business date (lib/business-date), not
//     server-UTC — matches the dashboard SQL and browser badges.
export const maxDuration = 300

/**
 * Deadline fields — aligned with lib/types.ts isOverdue/isDueThisWeek (12 core fields)
 * plus spm_next_due and doc_mdh_date for completeness.
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
 * Notify on approach AND on overdue milestones.
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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseAdmin = any

/**
 * Claim dedupe keys via cron_dedupe (unique PK + ignoreDuplicates upsert).
 * Returns the set of keys THIS run claimed — a missing key means the action
 * already happened today. Fail-open on transport errors: for compliance
 * alerts, a rare duplicate is safer than a silent miss.
 */
async function claimKeys(supabase: SupabaseAdmin, keys: string[]): Promise<Set<string>> {
  const claimed = new Set<string>()
  for (let i = 0; i < keys.length; i += 500) {
    const chunk = keys.slice(i, i + 500)
    const { data, error } = await supabase
      .from('cron_dedupe')
      .upsert(chunk.map((key: string) => ({ key })), { onConflict: 'key', ignoreDuplicates: true })
      .select('key')
    if (error) {
      console.error('[check-deadlines] dedupe claim error (failing open):', error.message)
      for (const key of chunk) claimed.add(key)
      continue
    }
    for (const row of (data ?? []) as { key: string }[]) claimed.add(row.key)
  }
  return claimed
}

/** Run async jobs with bounded concurrency; individual failures are logged, not fatal. */
async function runWithConcurrency<T>(items: T[], limit: number, fn: (item: T) => Promise<void>): Promise<void> {
  let cursor = 0
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const item = items[cursor++]
      try {
        await fn(item)
      } catch (err) {
        console.error('[check-deadlines] job error:', err)
      }
    }
  })
  await Promise.all(workers)
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

  // Business "today" — America/New_York, shared with dashboards and badges.
  const todayStr = businessTodayStr()
  const todayEpoch = businessTodayEpoch()

  // Morning cron runs at 12 UTC (8am EDT / 7am EST). Daily digest only on the
  // morning run — the gate is on the UTC schedule hour, matching vercel.json.
  const currentHour = new Date().getUTCHours()
  const isMorningRun = currentHour >= 11 && currentHour <= 13

  // Prune old dedupe claims so the table stays tiny. Non-fatal.
  {
    const cutoff = new Date(Date.now() - 7 * DAY_MS).toISOString()
    const { error: pruneErr } = await supabase.from('cron_dedupe').delete().lt('created_at', cutoff)
    if (pruneErr) console.error('[check-deadlines] dedupe prune error:', pruneErr.message)
  }

  // Only fetch active, real clients with an assigned planner.
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
    // Fallback plane: paginate explicitly — a bare select caps at the
    // PostgREST max-rows setting (1000) and would silently truncate at scale.
    const PAGE = 1000
    const all: unknown[] = []
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await supabase
        .from('clients')
        .select('id, client_id, first_name, last_name, assigned_to, client_classification, eligibility_end_date, three_month_visit_due, pos_deadline, assessment_due, thirty_day_letter_date, spm_next_due, co_financial_redet_date, quarterly_waiver_date, med_tech_redet_date, co_app_date, mfp_consent_date, two57_date, doc_mdh_date, last_contact_date')
        .eq('is_active', true)
        .eq('client_classification', 'real')
        .not('assigned_to', 'is', null)
        .order('id', { ascending: true })
        .range(from, from + PAGE - 1)
      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 })
      }
      all.push(...(data ?? []))
      if (!data || data.length < PAGE) break
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    clients = all as any[]
  }

  // Profiles, emails, and notification prefs from their correct tables.
  const assigneeIds = [...new Set((clients ?? []).map(c => c.assigned_to).filter(Boolean))]

  const { data: profiles } = assigneeIds.length > 0
    ? await supabase
        .from('profiles')
        .select('id, full_name, team_manager_id')
        .in('id', assigneeIds)
    : { data: [] }

  // Emails from auth.users via admin API — PAGINATED. The default page size
  // is 50, which at ~100 staff silently dropped emails for half the org.
  const emailMap = new Map<string, string>()
  for (let page = 1; page <= 20; page++) {
    const { data: authPage, error: listErr } = await supabase.auth.admin.listUsers({ page, perPage: 1000 })
    if (listErr) {
      console.error('[check-deadlines] listUsers error:', listErr.message)
      break
    }
    const users = authPage?.users ?? []
    for (const u of users) {
      if (u.id && u.email) emailMap.set(u.id, u.email)
    }
    if (users.length < 1000) break
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

  let notificationsInserted = 0
  let emailsSent = 0
  let digestsSent = 0
  let managerAlertsSent = 0

  // ---- Pass 1: compute every candidate action deterministically ----
  type NotifRow = { user_id: string; title: string; body: string; link: string; read: boolean }
  const notifCandidates: Array<{ dedupeKey: string; row: NotifRow }> = []
  const emailCandidates: Array<{ dedupeKey: string; to: string; subject: string; html: string }> = []

  for (const client of clients ?? []) {
    if (!client.assigned_to) continue
    for (const { key, label } of DEADLINE_FIELDS) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const dateStr = (client as any)[key] as string | null
      if (!dateStr) continue
      const diffDays = daysFromBusinessToday(dateStr)
      if (diffDays === null) continue

      if (!shouldNotify(diffDays)) continue

      const clientName = `${client.last_name}${client.first_name ? ', ' + client.first_name : ''}`
      const daysLabel = getNotifLabel(diffDays)
      const emoji = getNotifEmoji(diffDays)
      const notifBody = `${label} is ${diffDays < 0 ? '' : 'due '}${daysLabel} (${dateStr})`
      const fieldKey = String(key)
      const targetSection = SECTION_BY_FIELD[fieldKey] ?? 'section-plans-assessments'
      const deepLink = `/clients/${client.id}?highlight=${encodeURIComponent(fieldKey)}#${targetSection}`

      notifCandidates.push({
        dedupeKey: `notif:${client.assigned_to}:${client.id}:${fieldKey}:${todayStr}`,
        row: {
          user_id: client.assigned_to,
          title: `${emoji} Deadline ${daysLabel}: ${clientName}`,
          body: notifBody,
          link: deepLink,
          read: false,
        },
      })

      const profile = profileMap.get(client.assigned_to)
      if (profile?.email && profile.prefs.deadline_7day !== false) {
        const { subject, html } = deadlineAlertEmail({
          clientName,
          fieldLabel: label,
          dueDate: dateStr,
          daysUntil: diffDays,
          clientId: client.id,
        })
        emailCandidates.push({
          dedupeKey: `email:${client.assigned_to}:${client.id}:${fieldKey}:${todayStr}`,
          to: profile.email,
          subject,
          html,
        })
      }
    }
  }

  // ---- Pass 2: claim + insert in-app notifications (chunked) ----
  {
    const claimed = await claimKeys(supabase, notifCandidates.map(c => c.dedupeKey))
    const rows = notifCandidates.filter(c => claimed.has(c.dedupeKey)).map(c => c.row)
    for (let i = 0; i < rows.length; i += 500) {
      const chunk = rows.slice(i, i + 500)
      const { error: insertError } = await supabase.from('notifications').insert(chunk)
      if (insertError) {
        console.error('[check-deadlines] notification insert error:', insertError.message)
        continue
      }
      notificationsInserted += chunk.length
    }
  }

  // ---- Pass 3: claim + send alert emails in slices ----
  // Small claim-then-send slices bound the blast radius of a timeout: keys in
  // a slice are claimed immediately before their sends, so at most one slice
  // of alerts can be lost to a mid-run failure — and nothing ever duplicates.
  const EMAIL_SLICE = 25
  for (let i = 0; i < emailCandidates.length; i += EMAIL_SLICE) {
    const slice = emailCandidates.slice(i, i + EMAIL_SLICE)
    const claimed = await claimKeys(supabase, slice.map(c => c.dedupeKey))
    const toSend = slice.filter(c => claimed.has(c.dedupeKey))
    await runWithConcurrency(toSend, 5, async (c) => {
      await sendEmail({ to: c.to, subject: c.subject, html: c.html })
      emailsSent++
    })
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
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const dateStr = (client as any)[key] as string | null
      if (!dateStr) continue
      const diffDays = daysFromBusinessToday(dateStr)
      if (diffDays === null) continue
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
    if (manager.prefs.deadline_7day === false) continue

    // One claim covers the manager's email + visible notification for this
    // planner today. No more hidden marker rows in the notifications table.
    const alertKey = `mgr:${manager.id}:${escalation.plannerId}:${todayStr}`
    const claimed = await claimKeys(supabase, [alertKey])
    if (!claimed.has(alertKey)) continue

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

      const { error: mgrNotifErr } = await supabase.from('notifications').insert({
        user_id: manager.id,
        title: `⚠️ ${escalation.plannerName} has overdue client deadlines`,
        body: `${escalation.overdueClientCount} overdue client${escalation.overdueClientCount === 1 ? '' : 's'} need follow-up.`,
        link: `/team?full=1&filter=overdue`,
        read: false,
      })
      if (mgrNotifErr) console.error('[check-deadlines] manager notif insert error:', mgrNotifErr.message)
      else notificationsInserted++
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

    type DigestJob = { dedupeKey: string; to: string; subject: string; html: string }
    const digestJobs: DigestJob[] = []

    for (const [plannerId, plannerClients] of Object.entries(clientsByPlanner)) {
      const profile = profileMap.get(plannerId)
      if (!profile?.email) continue

      let overdueCount = 0
      let dueThisWeekCount = 0

      for (const client of plannerClients ?? []) {
        let clientOverdue = false
        let clientDueThisWeek = false
        for (const { key } of DEADLINE_FIELDS) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const dateStr = (client as any)[key] as string | null
          if (!dateStr) continue
          const diffDays = daysFromBusinessToday(dateStr)
          if (diffDays === null) continue
          if (diffDays < 0) clientOverdue = true
          else if (diffDays <= 7) clientDueThisWeek = true
        }
        if (clientOverdue) overdueCount++
        else if (clientDueThisWeek) dueThisWeekCount++
      }

      const digestEnabled = profile.prefs.daily_digest === true || overdueCount > 0
      if (!digestEnabled) continue

      const userName = profile.full_name?.split(' ')[0] ?? 'there'
      // Render the ET business date (the epoch is UTC-midnight of that date,
      // so format it in UTC to avoid shifting it back a day).
      const dateDisplay = new Date(todayEpoch).toLocaleDateString('en-US', {
        weekday: 'long', month: 'long', day: 'numeric', timeZone: 'UTC',
      })
      const totalNeedAttention = overdueCount + dueThisWeekCount

      const { html } = dailyDigestEmail({
        userName,
        date: dateDisplay,
        overdueCount,
        dueThisWeekCount,
        recentActivity: [],
      })

      const finalSubject = `📋 Good morning ${userName} — ${totalNeedAttention > 0 ? `${totalNeedAttention} clients need attention today` : 'All clients current'}`

      digestJobs.push({
        dedupeKey: `digest:${plannerId}:${todayStr}`,
        to: profile.email,
        subject: finalSubject,
        html,
      })
    }

    for (let i = 0; i < digestJobs.length; i += EMAIL_SLICE) {
      const slice = digestJobs.slice(i, i + EMAIL_SLICE)
      const claimed = await claimKeys(supabase, slice.map(j => j.dedupeKey))
      const toSend = slice.filter(j => claimed.has(j.dedupeKey))
      await runWithConcurrency(toSend, 5, async (j) => {
        await sendEmail({ to: j.to, subject: j.subject, html: j.html })
        digestsSent++
      })
    }
  }

  return NextResponse.json({
    ok: true,
    plane,
    businessDate: todayStr,
    checked: clients?.length ?? 0,
    notificationsSent: notificationsInserted,
    emailsSent,
    digestsSent,
    managerAlertsSent,
    timestamp: new Date().toISOString(),
  })
}
