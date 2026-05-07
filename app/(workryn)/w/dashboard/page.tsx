import { redirect } from 'next/navigation'
import { getWorkrynSession } from '@/lib/workryn/auth'
import { db } from '@/lib/workryn/db'
import { createClient } from '@/lib/supabase/server'
import DashboardClient from '@/components/workryn/DashboardClient'
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
  const session = await getWorkrynSession()

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
  try {
    const supabase = await createClient()
    const { data: { user: authUser } } = await supabase.auth.getUser()
    if (authUser) {
      // Get CaseSync profile for role check
      const { data: profile } = await supabase
        .from('profiles')
        .select('id, role, team_manager_id')
        .eq('id', authUser.id)
        .single()

      csRole = profile?.role ?? null

      if (profile?.role === 'supervisor' || profile?.role === 'it') {
        // Supervisors/IT: aggregate from per-assignee view (matches CaseSync Supervisor Overview)
        // This excludes unassigned clients, matching what the CaseSync dashboard shows
        const { data: allPlanners } = await supabase
          .from('profiles')
          .select('id')
          .in('role', ['supports_planner', 'team_manager', 'supervisor', 'it'])
        const allIds = (allPlanners ?? []).map(p => p.id)
        if (allIds.length > 0) {
          const { data: rows } = await supabase
            .from('client_status_summary_by_assignee')
            .select('*')
            .in('assigned_to', allIds)
          if (rows) {
            csAlerts = rows.reduce((acc, row) => ({
              totalClients: acc.totalClients + (row.total_clients ?? 0),
              overdueClients: acc.overdueClients + (row.overdue_clients ?? 0),
              dueThisWeek: acc.dueThisWeek + (row.due_this_week_clients ?? 0),
              eligibilityEndingSoon: acc.eligibilityEndingSoon + (row.eligibility_ending_soon_clients ?? 0),
              noContact7Days: acc.noContact7Days + (row.no_contact_7_days_clients ?? 0),
            }), csAlerts)
          }
        }
      } else if (profile?.role === 'team_manager') {
        // Team Managers see aggregate for planners they manage
        const { data: managedPlanners } = await supabase
          .from('profiles')
          .select('id')
          .eq('team_manager_id', authUser.id)
        const plannerIds = (managedPlanners ?? []).map(p => p.id)
        // Include own clients too
        plannerIds.push(authUser.id)
        if (plannerIds.length > 0) {
          const { data: rows } = await supabase
            .from('client_status_summary_by_assignee')
            .select('*')
            .in('assigned_to', plannerIds)
          if (rows) {
            csAlerts = rows.reduce((acc, row) => ({
              totalClients: acc.totalClients + (row.total_clients ?? 0),
              overdueClients: acc.overdueClients + (row.overdue_clients ?? 0),
              dueThisWeek: acc.dueThisWeek + (row.due_this_week_clients ?? 0),
              eligibilityEndingSoon: acc.eligibilityEndingSoon + (row.eligibility_ending_soon_clients ?? 0),
              noContact7Days: acc.noContact7Days + (row.no_contact_7_days_clients ?? 0),
            }), csAlerts)
          }
        }
      } else {
        // Support Planners see only their own clients
        const { data: row } = await supabase
          .from('client_status_summary_by_assignee')
          .select('*')
          .eq('assigned_to', authUser.id)
          .single()
        if (row) {
          csAlerts = {
            totalClients: row.total_clients ?? 0,
            overdueClients: row.overdue_clients ?? 0,
            dueThisWeek: row.due_this_week_clients ?? 0,
            eligibilityEndingSoon: row.eligibility_ending_soon_clients ?? 0,
            noContact7Days: row.no_contact_7_days_clients ?? 0,
          }
        }
      }
    }
  } catch (csError) {
    console.error('[Workryn Dashboard] CaseSync alert query failed:', csError)
    // Non-fatal — renders with zero alerts
  }

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
      csRole={csRole}
    />
  )
}
