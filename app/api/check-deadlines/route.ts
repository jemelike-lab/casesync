import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { isAzureConfigured, withRlsContext } from '@/lib/db/azure'
import { upsertAzureIdentity } from '@/lib/db/identity-sync'
import { sendEmail } from '@/lib/email'
import { deadlineAlertEmail, dailyDigestEmail, teamManagerPlannerAlertEmail } from '@/lib/email-templates'
import { computeTodayPacket } from '@/lib/today'
import { isAppealActive, isAppealGatingActive, appealDecisionOverdueDays, appealDecisionDue, APPEAL_GATED_FIELDS } from '@/lib/types'
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
 * Notify on approach AND on bounded overdue milestones.
 * Approaching: 1, 3, 7 days before due.
 * Overdue: 0 (due today), then 7, 14, 21, and 30 days overdue — THEN STOP.
 * (Megan 08-05: the old `diffDays % 7 === 0` re-fired every stale item weekly
 * forever — a field 266 days overdue still emailed. Long-stale items now live
 * in the Monday long-horizon digest section instead of daily alert emails.)
 */
function shouldNotify(diffDays: number): boolean {
  if ([1, 3, 7].includes(diffDays)) return true
  if (diffDays === 0) return true
  if (diffDays < 0 && [7, 14, 21, 30].includes(Math.abs(diffDays))) return true
  return false
}

/** "Next required action" statement (Megan 08-05 copy spec — replaces
 *  time-remaining phrasing in notifications and alert emails). */
function nextRequiredAction(label: string, dateStr: string, diffDays: number): string {
  if (diffDays < 0) return `Next required action: complete ${label} — was due ${dateStr}`
  if (diffDays === 0) return `Next required action: complete ${label} today (${dateStr})`
  return `Next required action: complete ${label} by ${dateStr}`
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
      .in('role', ['supervisor', 'administrator'])
      .order('created_at', { ascending: true })
      .limit(1)
    const supervisorId = sup?.[0]?.id
    if (!supervisorId) {
      return NextResponse.json({ error: 'No supervisor profile found to scope the Azure deadline scan' }, { status: 500 })
    }
    try {
      clients = await withRlsContext(supervisorId, async (sql) => {
        const rows = await sql`SELECT id, client_id, first_name, last_name, assigned_to, client_classification, eligibility_end_date, three_month_visit_due, pos_deadline, assessment_due, thirty_day_letter_date, spm_next_due, co_financial_redet_date, quarterly_waiver_date, med_tech_redet_date, co_app_date, mfp_consent_date, two57_date, doc_mdh_date, last_contact_date, last_contact_type, pos_status, appeal_status, appeal_received_date, appeal_hearing_date, appeal_decision_date, appeal_status_changed_at FROM clients WHERE is_active = true AND client_classification = 'real'`
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
        .select('id, client_id, first_name, last_name, assigned_to, client_classification, eligibility_end_date, three_month_visit_due, pos_deadline, assessment_due, thirty_day_letter_date, spm_next_due, co_financial_redet_date, quarterly_waiver_date, med_tech_redet_date, co_app_date, mfp_consent_date, two57_date, doc_mdh_date, last_contact_date, last_contact_type, pos_status, appeal_status, appeal_received_date, appeal_hearing_date, appeal_decision_date, appeal_status_changed_at')
        .eq('is_active', true)
        .eq('client_classification', 'real')
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
  let unassignedAlertsSent = 0
  let identitiesReconciled = 0
  let identityReconcileFailures = 0

  // ---- Pass 1: compute every candidate action deterministically ----
  type NotifRow = { user_id: string; title: string; body: string; link: string; read: boolean }
  const notifCandidates: Array<{ dedupeKey: string; row: NotifRow }> = []
  const emailCandidates: Array<{ dedupeKey: string; to: string; subject: string; html: string }> = []

  // Appeal tracker (Megan 08-05): while an appeal is active, POS-gated items
  // send NO individual alerts — each affected client gets exactly one tracker
  // line in the morning digest instead.
  const appealTrackerByPlanner = new Map<string, Array<{ id: string; name: string; note: string }>>()

  for (const client of clients ?? []) {
    if (!client.assigned_to) continue
    const appealActive = isAppealActive(client)
    const appealGating = isAppealGatingActive(client)
    const decisionOverdueDays = appealDecisionOverdueDays(client)
    if (appealActive) {
      const decisionDue = appealDecisionDue(client)
      const list = appealTrackerByPlanner.get(client.assigned_to) ?? []
      list.push({
        id: String(client.id),
        name: `${client.last_name}${client.first_name ? ', ' + client.first_name : ''}`,
        note: decisionOverdueDays !== null
          ? appealGating
            ? `Appeal decision ${decisionOverdueDays}d past due (due ${decisionDue}) — confirm the outcome and enter the decision date.`
            : `Appeal unresolved — decision ${decisionOverdueDays}d past due; POS tracking has resumed. Confirm the outcome and enter the decision date.`
          : 'Appeal active — POS items paused. Next required action resumes after the appeal decision.',
      })
      appealTrackerByPlanner.set(client.assigned_to, list)
    }
    // Overdue appeal decision escalates to its own alert once past the clock
    // (hearing+14d / received+90d / status-change+90d), re-firing on the same
    // 7/14/21/30 cadence as other overdue items via shouldNotify below.
    if (decisionOverdueDays !== null && (decisionOverdueDays === 1 || shouldNotify(-decisionOverdueDays))) {
      const clientName = `${client.last_name}${client.first_name ? ', ' + client.first_name : ''}`
      const emoji = appealGating ? '\u26a0\ufe0f' : '\ud83d\udea8'
      const bodyText = appealGating
        ? `Confirm the appeal outcome for ${clientName} — the decision is ${decisionOverdueDays} days past due. Enter the decision date to keep POS items paused or resume tracking.`
        : `Appeal outcome unconfirmed for ${clientName} — ${decisionOverdueDays} days past due. POS tracking has RESUMED. Enter the decision date.`
      notifCandidates.push({
        dedupeKey: `${client.id}:appeal_decision:${decisionOverdueDays}`,
        row: {
          user_id: client.assigned_to,
          title: `${emoji} Appeal decision overdue: ${clientName}`,
          body: bodyText,
          link: `/clients/${client.id}`,
          read: false,
        },
      })
    }
    for (const { key, label } of DEADLINE_FIELDS) {
      if (appealGating && APPEAL_GATED_FIELDS.has(String(key))) continue
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const dateStr = (client as any)[key] as string | null
      if (!dateStr) continue
      const diffDays = daysFromBusinessToday(dateStr)
      if (diffDays === null) continue

      if (!shouldNotify(diffDays)) continue

      const clientName = `${client.last_name}${client.first_name ? ', ' + client.first_name : ''}`
      const daysLabel = getNotifLabel(diffDays)
      const emoji = getNotifEmoji(diffDays)
      const notifBody = `${nextRequiredAction(label, dateStr, diffDays)} (${daysLabel})`
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
    const escAppealGating = isAppealGatingActive(client)

    for (const { key, label } of DEADLINE_FIELDS) {
      if (escAppealGating && APPEAL_GATED_FIELDS.has(String(key))) continue
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

  // ---- UNASSIGNED CLIENT ESCALATIONS (supervisors) ----
  // 2026-07-06 audit A2: unassigned clients were a reminder dead zone — the
  // scan skipped them entirely, so imported-but-not-yet-reassigned clients
  // (the highest-risk state in the system) generated zero reminders and zero
  // escalations. Per-planner loops above still skip !assigned_to; this block
  // makes the unassigned pool visible to supervisor-like staff instead.
  // Deliberately NOT gated on notification prefs: an unassigned overdue
  // client is an org-state anomaly, not a personal caseload preference.
  const unassignedClients = (clients ?? []).filter(c => !c.assigned_to)
  if (unassignedClients.length > 0) {
    let unassignedOverdueCount = 0
    let unassignedDueSoonCount = 0
    let unassignedTopIssues: Array<{ clientName: string; issue: string; dueDate: string; severity: number }> = []

    for (const client of unassignedClients) {
      let clientOverdue = false
      let clientDueThisWeek = false
      const unAppealGating = isAppealGatingActive(client)
      for (const { key, label } of DEADLINE_FIELDS) {
        if (unAppealGating && APPEAL_GATED_FIELDS.has(String(key))) continue
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const dateStr = (client as any)[key] as string | null
        if (!dateStr) continue
        const diffDays = daysFromBusinessToday(dateStr)
        if (diffDays === null) continue
        if (diffDays < 0) {
          clientOverdue = true
          unassignedTopIssues.push({
            clientName: `${client.last_name}${client.first_name ? ', ' + client.first_name : ''}`,
            issue: `${label} overdue by ${Math.abs(diffDays)} day${Math.abs(diffDays) === 1 ? '' : 's'}`,
            dueDate: dateStr,
            severity: 0,
          })
        } else if (diffDays <= 7) {
          clientDueThisWeek = true
          unassignedTopIssues.push({
            clientName: `${client.last_name}${client.first_name ? ', ' + client.first_name : ''}`,
            issue: `${label} due in ${diffDays} day${diffDays === 1 ? '' : 's'}`,
            dueDate: dateStr,
            severity: 1,
          })
        }
      }
      if (clientOverdue) unassignedOverdueCount++
      else if (clientDueThisWeek) unassignedDueSoonCount++
    }

    unassignedTopIssues = unassignedTopIssues
      .sort((a, b) => a.severity - b.severity || a.dueDate.localeCompare(b.dueDate))
      .slice(0, 8)

    if (unassignedOverdueCount > 0) {
      const { data: supervisorProfiles } = await supabase
        .from('profiles')
        .select('id, full_name')
        .in('role', ['supervisor', 'administrator'])

      for (const sup of supervisorProfiles ?? []) {
        const supEmail = emailMap.get(sup.id)
        if (!supEmail) continue

        const alertKey = `sup-unassigned:${sup.id}:${todayStr}`
        const claimed = await claimKeys(supabase, [alertKey])
        if (!claimed.has(alertKey)) continue

        try {
          const { subject, html } = teamManagerPlannerAlertEmail({
            managerName: sup.full_name?.split(' ')[0] ?? 'there',
            plannerName: 'Unassigned clients',
            overdueClientCount: unassignedOverdueCount,
            dueSoonClientCount: unassignedDueSoonCount,
            topIssues: unassignedTopIssues,
            queueHref: '/team?filter=unassigned',
          })
          await sendEmail({ to: supEmail, subject, html })
          unassignedAlertsSent++

          const { error: supNotifErr } = await supabase.from('notifications').insert({
            user_id: sup.id,
            title: `⚠️ ${unassignedOverdueCount} unassigned client${unassignedOverdueCount === 1 ? '' : 's'} with overdue deadlines`,
            body: `Unassigned clients receive no planner reminders — reassign to restore coverage.`,
            link: `/team?filter=unassigned`,
            read: false,
          })
          if (supNotifErr) console.error('[check-deadlines] unassigned notif insert error:', supNotifErr.message)
          else notificationsInserted++
        } catch (supErr) {
          console.error('[check-deadlines] unassigned alert send error:', supErr)
        }
      }
    }
  }

  // ---- IDENTITY RECONCILE (morning run only) ----
  // Audit U2: /api/admin/reconcile-identities existed but nothing scheduled
  // it, so a failed acceptance-time sync (audit U1) could leave a user blind
  // on the PHI plane indefinitely. Idempotent upserts; elevated actor is the
  // same resolved supervisor identity the deadline scan runs under.
  if (isMorningRun && isAzureConfigured()) {
    try {
      const { data: reconcileActor } = await supabase
        .from('profiles')
        .select('id')
        .in('role', ['supervisor', 'administrator'])
        .order('created_at', { ascending: true })
        .limit(1)
      const actorId = reconcileActor?.[0]?.id
      if (actorId) {
        const { data: allProfiles } = await supabase
          .from('profiles')
          .select('id, full_name, role, team_manager_id')
        for (const profileRow of allProfiles ?? []) {
          const synced = await upsertAzureIdentity(profileRow, actorId)
          if (synced) identitiesReconciled++
          else identityReconcileFailures++
        }
        if (identityReconcileFailures > 0) {
          console.error(`[check-deadlines] identity reconcile: ${identityReconcileFailures} of ${(allProfiles ?? []).length} profiles failed to sync`)
        }
      }
    } catch (reconcileErr) {
      console.error('[check-deadlines] identity reconcile pass failed:', reconcileErr)
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

    // Megan 08-05 cadence: SPMS contact is the 1st–15th signal; long-horizon
    // (>60d overdue) items surface only in the Monday edition.
    const monthPrefix = todayStr.slice(0, 7)
    const dayOfMonth = Number(todayStr.slice(8, 10))
    const isSpmsWindow = dayOfMonth >= 1 && dayOfMonth <= 15
    const isMonday = new Date(todayEpoch).getUTCDay() === 1

    for (const [plannerId, plannerClients] of Object.entries(clientsByPlanner)) {
      const profile = profileMap.get(plannerId)
      if (!profile?.email) continue

      // Phase 3: shared Today engine — the EXACT math behind the in-app
      // Today card (/api/today), so the inbox and the dashboard can never
      // disagree. Counts keep the historical semantics (due_this_week
      // excludes already-overdue clients).
      const packet = computeTodayPacket(plannerClients ?? [], todayStr)
      const overdueCount = packet.counts.overdue
      const dueThisWeekCount = packet.counts.due_this_week

      // SPMS-first: clients with no SUCCESSFUL contact logged this calendar
      // month (a logged "Attempt" does not count — Josh-confirmed 08-05).
      const spmsClients = !isSpmsWindow ? [] : (plannerClients ?? [])
        .filter(c => {
          const d = (c.last_contact_date ?? '') as string
          const t = ((c.last_contact_type ?? '') as string).trim().toLowerCase()
          const successfulThisMonth = d.slice(0, 7) === monthPrefix && t !== 'attempt'
          return !successfulThisMonth
        })
        .map(c => ({
          id: String(c.id),
          name: `${c.last_name}${c.first_name ? ', ' + c.first_name : ''}`,
          lastContact: (c.last_contact_date ?? null) as string | null,
        }))
        .sort((a, b) => (a.lastContact ?? '').localeCompare(b.lastContact ?? ''))

      const appealTracker = appealTrackerByPlanner.get(plannerId) ?? []

      const digestEnabled = profile.prefs.daily_digest === true || overdueCount > 0 || packet.counts.due_today > 0
        || (isSpmsWindow && spmsClients.length > 0) || appealTracker.length > 0
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
        counts: packet.counts,
        focus: packet.focus,
        caughtUp: packet.caught_up,
        spmsClients,
        appealTracker,
        longHorizon: isMonday ? packet.long_horizon : [],
      })

      const finalSubject = isSpmsWindow && spmsClients.length > 0
        ? `📞 Good morning ${userName} — ${spmsClients.length} client${spmsClients.length === 1 ? '' : 's'} need${spmsClients.length === 1 ? 's' : ''} SPM contact this month`
        : packet.caught_up
        ? `☀️ Good morning ${userName} — you're caught up`
        : `📋 Good morning ${userName} — ${totalNeedAttention} clients need attention today`

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
    unassignedAlertsSent,
    identitiesReconciled,
    identityReconcileFailures,
    unassignedClients: (clients ?? []).filter(c => !c.assigned_to).length,
    timestamp: new Date().toISOString(),
  })
}
