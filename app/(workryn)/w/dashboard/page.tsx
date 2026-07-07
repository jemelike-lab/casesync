import { redirect } from 'next/navigation'
import { getWorkrynSession } from '@/lib/workryn/auth'
import { db } from '@/lib/workryn/db'
import { createClient } from '@/lib/supabase/server'
import { getGlobalSummary } from '@/lib/dashboard-summary'
import { isAzureConfigured, withRlsContext } from '@/lib/db/azure'
import DashboardClient from '@/components/workryn/DashboardClient'
import { getPageBannerUrl } from '@/lib/workryn/pageBanner'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Dashboard' }

function startOfWeek(d = new Date()): Date {
  const date = new Date(d)
  const day = date.getDay() // 0=Sun .. 6=Sat
  // Treat Monday as start of week (ISO)
  const diff = (day + 6) % 7
  date.setDate(date.getDate() - diff)
  date.setHours(0, 0, 0, 0)
  return date
}

export default async function DashboardPage() {
  let session: Awaited<ReturnType<typeof getWorkrynSession>>
  try {
    session = await getWorkrynSession()
  } catch (err) {
    console.error('[Workryn Dashboard] getWorkrynSession failed:', err)
    redirect('/dashboard')
  }

  if (!session) {
    // No Workryn user record linked yet — redirect to CaseSync dashboard
    redirect('/dashboard')
  }

  const userId = session.user.id
  const weekStart = startOfWeek()

  // Today boundaries for schedule
  const todayStart = new Date()
  todayStart.setHours(0, 0, 0, 0)
  const todayEnd = new Date()
  todayEnd.setHours(23, 59, 59, 999)

  let taskCount = 0
  let openTickets = 0
  let weeklyHours = 0
  let auditLogs: any[] = []
  let recentTasks: any[] = []
  let completedCount = 0
  let totalTaskCount = 0
  let todayShifts: any[] = []

  // CaseSync client alerts — role-scoped
  let csAlerts = { totalClients: 0, overdueClients: 0, dueThisWeek: 0, eligibilityEndingSoon: 0, noContact7Days: 0 }
  let csRole: string | null = null
  let csPreview: { id: string; name: string; label: string; diffDays: number }[] = []

  try {
    const [tc, ot, weekEntries, al, rt, done, total, shifts] = await Promise.all([
      db.task.count({ where: { assignedToId: userId } }),
      db.ticket.count({ where: { status: 'OPEN' } }),
      db.timeEntry.findMany({
        where: { userId, clockInAt: { gte: weekStart } },
        select: { workedMinutes: true },
      }),
      db.auditLog.findMany({
        take: 8,
        orderBy: { createdAt: 'desc' },
        include: { user: { select: { name: true, avatarColor: true } } },
      }),
      db.task.findMany({
        where: { assignedToId: userId, status: { not: 'DONE' } },
        take: 5,
        orderBy: { dueDate: 'asc' },
      }),
      // Completed task count for productivity
      db.task.count({
        where: { assignedToId: userId, status: { in: ['DONE', 'COMPLETED'] } },
      }),
      // Total tasks for productivity denominator
      db.task.count({
        where: { assignedToId: userId },
      }),
      // Real shifts for today's schedule
      db.shift.findMany({
        where: {
          userId,
          startTime: { gte: todayStart, lte: todayEnd },
        },
        orderBy: { startTime: 'asc' },
        take: 6,
      }),
    ])

    taskCount = tc
    openTickets = ot
    const weeklyMinutes = weekEntries.reduce((sum: number, e: any) => sum + (e.workedMinutes || 0), 0)
    weeklyHours = Math.round((weeklyMinutes / 60) * 10) / 10
    auditLogs = JSON.parse(JSON.stringify(al))
    recentTasks = JSON.parse(JSON.stringify(rt))
    completedCount = done
    totalTaskCount = total
    todayShifts = JSON.parse(JSON.stringify(shifts))
  } catch (error) {
    console.error('[Workryn Dashboard] DB query failed:', error)
    // Render with empty data rather than crashing
  }

  // ── CaseSync Client Alerts (role-scoped) ──
  // 2026-07-07: this block previously queried the Supabase view
  // client_status_summary_by_assignee directly — the plane real PHI left on
  // 2026-06-28 — so the widget showed 0 across the board while CaseSync
  // showed 53. It also counted only SP-ASSIGNED clients (unassigned pool
  // invisible) and had no 'administrator' branch. getGlobalSummary() is the
  // canonical Azure-backed aggregate: RLS scopes it to exactly what the
  // caller can see (supervisor-like = all incl. unassigned, TM = own team,
  // SP = own caseload), with the 13-field deadline canon and the
  // America/New_York business date. One call replaces all three branches.
  try {
    const supabase = await createClient()
    const { data: { user: authUser } } = await supabase.auth.getUser()
    if (authUser) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('id, role')
        .eq('id', authUser.id)
        .single()
      csRole = profile?.role ?? null

      const summary = await getGlobalSummary()
      csAlerts = {
        totalClients: summary.total_clients,
        overdueClients: summary.overdue_clients,
        dueThisWeek: summary.due_this_week_clients,
        eligibilityEndingSoon: summary.eligibility_ending_soon_clients,
        noContact7Days: summary.no_contact_7_days_clients,
      }

      // Client status preview: the caller's 5 most-urgent clients by their
      // earliest tracked deadline (13-field canon, America/New_York anchor).
      // Same RLS scope as the tiles — SP sees own caseload, TM their team,
      // supervisor-like everything — so the names shown are exactly the
      // names that user can already open in CaseSync one click away.
      if (isAzureConfigured() && csAlerts.totalClients > 0) {
        const rows = await withRlsContext(authUser.id, async (sql) => {
          return await sql`
            WITH t AS (SELECT (now() at time zone 'America/New_York')::date AS today)
            SELECT c.id::text AS id,
                   (c.last_name || COALESCE(', ' || c.first_name, '')) AS name,
                   x.label,
                   (x.due_date - t.today)::int AS diff_days
            FROM clients c
            CROSS JOIN t
            JOIN LATERAL (
              SELECT v.label, v.due_date FROM (VALUES
                ('Eligibility End', c.eligibility_end_date),
                ('3-Month Visit', c.three_month_visit_due),
                ('Quarterly Waiver', c.quarterly_waiver_date),
                ('Med Tech Redet', c.med_tech_redet_date),
                ('POS Deadline', c.pos_deadline),
                ('Assessment', c.assessment_due),
                ('30-Day Letter', c.thirty_day_letter_date),
                ('CO Financial Redet', c.co_financial_redet_date),
                ('CO App', c.co_app_date),
                ('MFP Consent', c.mfp_consent_date),
                ('257', c.two57_date),
                ('Doc MDH', c.doc_mdh_date),
                ('SPM Next Due', c.spm_next_due)
              ) v(label, due_date)
              WHERE v.due_date IS NOT NULL AND v.due_date >= t.today - 730
              ORDER BY v.due_date ASC
              LIMIT 1
            ) x ON true
            WHERE c.is_active = true AND c.client_classification = 'real'
            ORDER BY x.due_date ASC
            LIMIT 5
          `
        })
        csPreview = (rows as unknown as { id: string; name: string; label: string; diff_days: number }[])
          .map(r => ({ id: r.id, name: r.name, label: r.label, diffDays: r.diff_days }))
      }
    }
  } catch (csError) {
    console.error('[Workryn Dashboard] CaseSync alert query failed:', csError)
    // Non-fatal — renders with zero alerts
  }

  const bannerUrl = await getPageBannerUrl('dashboard')

  return (
    <DashboardClient
      user={session.user}
      stats={{ taskCount, openTickets, weeklyHours }}
      auditLogs={auditLogs}
      recentTasks={recentTasks}
      completedCount={completedCount}
      totalTaskCount={totalTaskCount}
      todayShifts={todayShifts}
      csAlerts={csAlerts}
      csPreview={csPreview}
      csRole={csRole}
      bannerUrl={bannerUrl}
    />
  )
}
