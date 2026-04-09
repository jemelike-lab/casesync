'use client'

import { isSupervisorLike, canManageTeam, getRoleLabel, getRoleColor } from '@/lib/roles'
import { useState, useMemo, useEffect, useCallback, useTransition } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import {
  Client,
  Profile,
  FilterType,
  SortField,
  SortDir,
  PaginatedClientsResponse,
  SavedViewFilter,
  SavedViewOwnershipScope,
  SavedViewRecord,
  isOverdue,
  isDueThisWeek,
  isEligibilityEndingSoon,
  getDaysSinceContact,
  clientPriorityScore,
  sortClients,
  formatDate,
  getOverdueCount,
  getClientHealthScore,
  getRiskLevel,
} from '@/lib/types'
import FilterBar from './FilterBar'
import ClientGrid from './ClientGrid'
import PinnedClients from './PinnedClients'
import WeekStrip from './WeekStrip'
import Confetti from './Confetti'
import QuickActions from './QuickActions'
import SavedViewsBar, { type DashboardSavedView } from './SavedViewsBar'
import KeyboardShortcutsModal from './KeyboardShortcutsModal'
import { useCountUp } from '@/hooks/useCountUp'
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts'
import { createClient } from '@/lib/supabase/client'
import Link from 'next/link'
import ClientQuickSearch from './ClientQuickSearch'
import { createSavedView, updateSavedView, deleteSavedView } from '@/app/actions/saved-views'

interface Props {
  profile: Profile | null
  currentUserId: string
  planners?: Profile[]
  teamManagers?: Profile[]
  savedViews?: SavedViewRecord[]
  hasProfile?: boolean
}

type DashboardViewMode = 'grid' | 'table'

function StatCard({ label, value, color, onClick, active }: {
  label: string; value: number; color?: string; onClick?: () => void; active?: boolean
}) {
  const animated = useCountUp(value)
  return (
    <div
      className="card"
      onClick={onClick}
      style={{
        textAlign: 'center',
        padding: '16px 20px',
        cursor: onClick ? 'pointer' : 'default',
        borderColor: active ? 'var(--accent)' : undefined,
        transition: 'border-color 0.2s',
      }}
    >
      <div style={{ fontSize: 28, fontWeight: 700, color: color ?? 'var(--text)' }}>{animated}</div>
      <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4 }}>{label}</div>
    </div>
  )
}

function AlertBanner({ overdue, dueThisWeek, eligibilitySoon, activeAlert, onAlert }: {
  overdue: number; dueThisWeek: number; eligibilitySoon: number;
  activeAlert: FilterType | null; onAlert: (f: FilterType | null) => void
}) {
  if (overdue === 0 && dueThisWeek === 0 && eligibilitySoon === 0) return null

  return (
    <div style={{
      background: 'rgba(255,69,58,0.08)',
      border: '1px solid rgba(255,69,58,0.25)',
      borderRadius: 10,
      padding: '10px 16px',
      marginBottom: 20,
      display: 'flex',
      gap: 16,
      flexWrap: 'wrap',
      alignItems: 'center',
    }}>
      <span style={{ fontSize: 12, color: 'var(--text-secondary)', fontWeight: 500 }}>Needs attention:</span>
      {overdue > 0 && (
        <button
          onClick={() => onAlert(activeAlert === 'overdue' ? null : 'overdue')}
          style={{
            background: activeAlert === 'overdue' ? 'rgba(255,69,58,0.2)' : 'transparent',
            border: '1px solid rgba(255,69,58,0.4)',
            borderRadius: 6,
            color: 'var(--red)',
            fontSize: 12,
            fontWeight: 600,
            padding: '4px 10px',
            cursor: 'pointer',
            minHeight: 28,
          }}
        >
          🔴 {overdue} overdue
        </button>
      )}
      {dueThisWeek > 0 && (
        <button
          onClick={() => onAlert(activeAlert === 'due_this_week' ? null : 'due_this_week')}
          style={{
            background: activeAlert === 'due_this_week' ? 'rgba(255,159,10,0.2)' : 'transparent',
            border: '1px solid rgba(255,159,10,0.4)',
            borderRadius: 6,
            color: 'var(--orange)',
            fontSize: 12,
            fontWeight: 600,
            padding: '4px 10px',
            cursor: 'pointer',
            minHeight: 28,
          }}
        >
          🟠 {dueThisWeek} due this week
        </button>
      )}
      {eligibilitySoon > 0 && (
        <button
          onClick={() => onAlert(activeAlert === 'eligibility_ending_soon' ? null : 'eligibility_ending_soon')}
          style={{
            background: activeAlert === 'eligibility_ending_soon' ? 'rgba(255,214,10,0.2)' : 'transparent',
            border: '1px solid rgba(255,214,10,0.4)',
            borderRadius: 6,
            color: 'var(--yellow)',
            fontSize: 12,
            fontWeight: 600,
            padding: '4px 10px',
            cursor: 'pointer',
            minHeight: 28,
          }}
        >
          ⏳ {eligibilitySoon} eligibility ending soon
        </button>
      )}
    </div>
  )
}

function GreetingCard({ profile, stats, onFilter, activeFilter, showConfetti, onDismissConfetti }: {
  profile: Profile | null
  stats: { overdue: number; dueThisWeek: number; noContact: number }
  onFilter: (f: FilterType | null) => void
  activeFilter: FilterType | null
  showConfetti: boolean
  onDismissConfetti: () => void
}) {
  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'
  const icon = hour < 12 ? '☀️' : hour < 17 ? '🌤️' : '🌙'
  const firstName = profile?.full_name?.split(' ')[0] ?? 'there'

  const totalNeedAttention = stats.overdue + stats.dueThisWeek
  const allCurrent = totalNeedAttention === 0 && stats.noContact === 0

  const overdueCount = useCountUp(stats.overdue)
  const dueCount = useCountUp(stats.dueThisWeek)
  const noContactCount = useCountUp(stats.noContact)

  const role = profile?.role
  const isSupervisorRole = role === 'supervisor' || role === 'it'
  const isTeamManagerRole = role === 'team_manager'

  let summaryHeadline = ''
  let summaryBody = ''

  if (allCurrent) {
    summaryHeadline = isSupervisorRole
      ? 'Team looks good.'
      : isTeamManagerRole
        ? 'Your team is in good shape.'
        : 'Everything looks good.'
    summaryBody = isSupervisorRole
      ? 'No overdue pressure is surfacing right now, and the team queue looks steady.'
      : isTeamManagerRole
        ? 'No overdue pressure is bubbling up right now, and your planners look under control.'
        : 'No overdue items, nothing urgent this week, and your caseload is in a good spot.'
  } else if (stats.overdue > 0 && stats.dueThisWeek > 0) {
    summaryHeadline = isSupervisorRole
      ? `The team has ${stats.overdue} overdue and ${stats.dueThisWeek} due this week.`
      : isTeamManagerRole
        ? `Your team has ${stats.overdue} overdue and ${stats.dueThisWeek} due this week.`
        : `You’ve got ${stats.overdue} overdue and ${stats.dueThisWeek} due this week.`
    summaryBody = isSupervisorRole
      ? 'Best move: check the pressure points first, then work the queues that are coming up next.'
      : isTeamManagerRole
        ? 'Best move: rebalance overdue pressure first, then clear what’s stacking up this week.'
        : 'Best move: clear the overdue items first, then work through what’s coming up next.'
  } else if (stats.overdue > 0) {
    summaryHeadline = isSupervisorRole
      ? `The team has ${stats.overdue} overdue item${stats.overdue !== 1 ? 's' : ''}.`
      : isTeamManagerRole
        ? `Your team has ${stats.overdue} overdue item${stats.overdue !== 1 ? 's' : ''}.`
        : `You’ve got ${stats.overdue} overdue item${stats.overdue !== 1 ? 's' : ''}.`
    summaryBody = isSupervisorRole
      ? 'Start with the team members carrying the most pressure.'
      : isTeamManagerRole
        ? 'Start there first — that’s the fastest way to steady the team workload.'
        : 'Start there first — that’s the fastest way to get back on track.'
  } else if (stats.dueThisWeek > 0) {
    summaryHeadline = isSupervisorRole
      ? `The team has ${stats.dueThisWeek} thing${stats.dueThisWeek !== 1 ? 's' : ''} due this week.`
      : isTeamManagerRole
        ? `Your team has ${stats.dueThisWeek} thing${stats.dueThisWeek !== 1 ? 's' : ''} due this week.`
        : `You’ve got ${stats.dueThisWeek} thing${stats.dueThisWeek !== 1 ? 's' : ''} due this week.`
    summaryBody = isSupervisorRole
      ? 'Nothing is overdue right now, so this is a good window to stay ahead of the next queue.'
      : isTeamManagerRole
        ? 'Nothing is overdue right now, so this is a good time to keep the team from bunching up later.'
        : 'Nothing is overdue right now, so this is a good time to knock out the next few deadlines.'
  } else {
    summaryHeadline = isSupervisorRole
      ? `The team has ${stats.noContact} client${stats.noContact !== 1 ? 's' : ''} with no contact in 7+ days.`
      : isTeamManagerRole
        ? `Your team has ${stats.noContact} client${stats.noContact !== 1 ? 's' : ''} with no contact in 7+ days.`
        : `You’ve got ${stats.noContact} client${stats.noContact !== 1 ? 's' : ''} with no contact in 7+ days.`
    summaryBody = isSupervisorRole
      ? 'Worth a quick pass so quiet cases don’t turn into overdue cases.'
      : isTeamManagerRole
        ? 'Worth a quick check so quiet cases don’t slip across your planner team.'
        : 'Worth a quick check so nothing quietly slips.'
  }

  return (
    <div className="card slide-in-up" style={{
      marginBottom: 16,
      background: allCurrent
        ? 'linear-gradient(135deg, rgba(48,209,88,0.08) 0%, rgba(0,0,0,0) 100%)'
        : 'linear-gradient(135deg, rgba(0,122,255,0.08) 0%, rgba(0,0,0,0) 100%)',
      border: allCurrent
        ? '1px solid rgba(48,209,88,0.2)'
        : '1px solid rgba(0,122,255,0.15)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <span style={{ fontSize: 20 }}>{icon}</span>
        <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: 'var(--text)' }}>
          {greeting}, {firstName}
        </h2>
      </div>

      <div style={{ marginBottom: 12 }}>
        <p style={{ margin: '0 0 6px', fontSize: 15, color: allCurrent ? 'var(--green)' : 'var(--text)', fontWeight: 700 }}>
          {allCurrent ? '✅ ' : ''}{summaryHeadline}
        </p>
        <p style={{ margin: 0, fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
          {summaryBody}
        </p>
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {stats.overdue > 0 && (
          <button
            onClick={() => onFilter(activeFilter === 'overdue' ? null : 'overdue')}
            style={{
              background: activeFilter === 'overdue' ? 'rgba(255,69,58,0.25)' : 'rgba(255,69,58,0.15)',
              border: '1px solid rgba(255,69,58,0.4)',
              borderRadius: 20,
              color: '#ff453a',
              fontSize: 12,
              fontWeight: 600,
              padding: '5px 12px',
              cursor: 'pointer',
              minHeight: 30,
              transition: 'background 0.15s',
            }}
          >
            🔴 {overdueCount} overdue
          </button>
        )}
        {stats.dueThisWeek > 0 && (
          <button
            onClick={() => onFilter(activeFilter === 'due_this_week' ? null : 'due_this_week')}
            style={{
              background: activeFilter === 'due_this_week' ? 'rgba(255,159,10,0.25)' : 'rgba(255,159,10,0.15)',
              border: '1px solid rgba(255,159,10,0.4)',
              borderRadius: 20,
              color: '#ff9f0a',
              fontSize: 12,
              fontWeight: 600,
              padding: '5px 12px',
              cursor: 'pointer',
              minHeight: 30,
              transition: 'background 0.15s',
            }}
          >
            🟠 {dueCount} due this week
          </button>
        )}
        {stats.noContact > 0 && (
          <button
            onClick={() => onFilter(activeFilter === 'no_contact_7' ? null : 'no_contact_7')}
            style={{
              background: activeFilter === 'no_contact_7' ? 'rgba(255,214,10,0.25)' : 'rgba(255,214,10,0.12)',
              border: '1px solid rgba(255,214,10,0.3)',
              borderRadius: 20,
              color: '#ffd60a',
              fontSize: 12,
              fontWeight: 600,
              padding: '5px 12px',
              cursor: 'pointer',
              minHeight: 30,
              transition: 'background 0.15s',
            }}
          >
            ⏰ {noContactCount} no contact 7d+
          </button>
        )}
      </div>
    </div>
  )
}

function SupervisorOverviewStrip({
  clients,
  planners,
  teamManagers,
  onOpenAllClients,
  onOpenOverdue,
  onOpenDueThisWeek,
  onOpenQuiet,
}: {
  clients: Client[]
  planners: Profile[]
  teamManagers: Profile[]
  onOpenAllClients?: () => void
  onOpenOverdue?: () => void
  onOpenDueThisWeek?: () => void
  onOpenQuiet?: () => void
}) {
  const overdue = clients.filter(isOverdue).length
  const dueThisWeek = clients.filter(isDueThisWeek).length
  const quiet = clients.filter(c => {
    if (!c.last_contact_date) return true
    const days = getDaysSinceContact(c.last_contact_date)
    return days !== null && days > 7
  }).length
  const unassignedPlanners = planners.filter(p => !p.team_manager_id).length

  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10, marginBottom: 12 }}>
        <StatCard label="Active Clients" value={clients.length} onClick={onOpenAllClients} />
        <StatCard label="Overdue" value={overdue} color="var(--red)" onClick={onOpenOverdue} />
        <StatCard label="Due This Week" value={dueThisWeek} color="var(--orange)" onClick={onOpenDueThisWeek} />
        <StatCard label="No Contact 7+ Days" value={quiet} color="#ffd60a" onClick={onOpenQuiet} />
        <StatCard label="Support Planners" value={planners.length} />
        <StatCard label="Team Managers" value={teamManagers.length} />
        <StatCard label="Unassigned Planners" value={unassignedPlanners} color={unassignedPlanners > 0 ? 'var(--orange)' : 'var(--green)'} />
      </div>
      <div className="card" style={{ background: 'linear-gradient(135deg, rgba(88,86,214,0.08) 0%, rgba(0,0,0,0) 100%)', border: '1px solid rgba(88,86,214,0.18)' }}>
        <div style={{ fontSize: 12, color: '#b7a7ff', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>
          Supervisor Overview
        </div>
        <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', marginBottom: 6 }}>
          Team snapshot at login.
        </div>
        <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
          Use this view for quick oversight, then jump into Transfer Board, Team Manager Board, or the full Supervisor panel when you need to act.
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 12 }}>
          <Link href="/team?view=transfer" style={{ fontSize: 12, color: 'var(--text)', textDecoration: 'none', padding: '6px 10px', border: '1px solid var(--border)', borderRadius: 8, background: 'var(--surface-2)' }}>
            Transfer Board →
          </Link>
          <Link href="/team?view=assign-planners" style={{ fontSize: 12, color: 'var(--text)', textDecoration: 'none', padding: '6px 10px', border: '1px solid var(--border)', borderRadius: 8, background: 'var(--surface-2)' }}>
            Team Manager Board →
          </Link>
          <Link href="/supervisor" style={{ fontSize: 12, color: 'var(--text)', textDecoration: 'none', padding: '6px 10px', border: '1px solid var(--border)', borderRadius: 8, background: 'var(--surface-2)' }}>
            Supervisor Panel →
          </Link>
        </div>
      </div>
    </div>
  )
}

function TeamManagerSummaryTable({
  clients,
  planners,
  teamManagers,
}: {
  clients: Client[]
  planners: Profile[]
  teamManagers: Profile[]
}) {
  const rows = teamManagers.map(manager => {
    const managerPlanners = planners.filter(p => p.team_manager_id === manager.id)
    const managerPlannerIds = new Set(managerPlanners.map(p => p.id))
    const managerClients = clients.filter(c => c.assigned_to && managerPlannerIds.has(c.assigned_to))
    const overdue = managerClients.filter(isOverdue).length
    const dueThisWeek = managerClients.filter(isDueThisWeek).length
    const quiet = managerClients.filter(c => {
      if (!c.last_contact_date) return true
      const days = getDaysSinceContact(c.last_contact_date)
      return days !== null && days > 7
    }).length
    const plannerQuery = managerPlanners.map(planner => `planner=${encodeURIComponent(planner.id)}`).join('&')
    const managerScopedBase = plannerQuery ? `/team?full=1&${plannerQuery}` : '/team?full=1'

    return {
      manager,
      plannerCount: managerPlanners.length,
      clientCount: managerClients.length,
      overdue,
      dueThisWeek,
      quiet,
      links: {
        planners: managerScopedBase,
        all: `${managerScopedBase}&filter=all`,
        overdue: `${managerScopedBase}&filter=overdue`,
        dueThisWeek: `${managerScopedBase}&filter=due_this_week`,
        quiet: `${managerScopedBase}&filter=no_contact_7`,
      },
    }
  })

  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, gap: 12, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: 12, color: '#8ab4ff', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>
            Team Manager Summary
          </div>
          <div style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
            Quick manager-level breakdown of Support Planner coverage and client load.
          </div>
        </div>
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--border)' }}>
              {['Team Manager', 'Support Planners', 'Clients', 'Overdue', 'Due This Week', 'No Contact 7+ Days'].map(h => (
                <th key={h} style={{ padding: '8px 12px', textAlign: 'left', color: 'var(--text-secondary)', fontWeight: 600, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={6} style={{ padding: '14px 12px', color: 'var(--text-secondary)' }}>
                  No team manager data available yet.
                </td>
              </tr>
            ) : rows.map(row => (
              <tr key={row.manager.id} style={{ borderBottom: '1px solid var(--border)' }}>
                <td style={{ padding: '10px 12px', fontWeight: 600 }}>{row.manager.full_name ?? 'Unknown'}</td>
                <td style={{ padding: '10px 12px' }}><Link href={row.links.planners} style={{ color: 'inherit' }}>{row.plannerCount}</Link></td>
                <td style={{ padding: '10px 12px' }}><Link href={row.links.all} style={{ color: 'inherit' }}>{row.clientCount}</Link></td>
                <td style={{ padding: '10px 12px', color: row.overdue > 0 ? 'var(--red)' : 'var(--text)' }}><Link href={row.links.overdue} style={{ color: 'inherit' }}>{row.overdue}</Link></td>
                <td style={{ padding: '10px 12px', color: row.dueThisWeek > 0 ? 'var(--orange)' : 'var(--text)' }}><Link href={row.links.dueThisWeek} style={{ color: 'inherit' }}>{row.dueThisWeek}</Link></td>
                <td style={{ padding: '10px 12px', color: row.quiet > 0 ? '#ffd60a' : 'var(--text)' }}><Link href={row.links.quiet} style={{ color: 'inherit' }}>{row.quiet}</Link></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function NextBestMoveCard({ profile, stats, onFilter }: {
  profile: Profile | null
  stats: { overdue: number; dueThisWeek: number; noContact: number; eligibilitySoon: number }
  onFilter: (f: FilterType | null) => void
}) {
  if (stats.overdue === 0 && stats.dueThisWeek === 0 && stats.noContact === 0 && stats.eligibilitySoon === 0) {
    return null
  }

  const role = profile?.role
  const isSupervisorRole = role === 'supervisor' || role === 'it'
  const isTeamManagerRole = role === 'team_manager'

  let title = isSupervisorRole ? 'Org-wide next best move' : isTeamManagerRole ? 'Team next best move' : 'Next best move'
  let body = isSupervisorRole
    ? 'A quick pass through the main pressure points will keep the org view clean.'
    : isTeamManagerRole
      ? 'A quick pass through the team queues will keep planner workload under control.'
      : 'A quick pass through today’s priorities will keep the week clean.'
  let ctaLabel = 'View priorities'
  let ctaFilter: FilterType | null = 'due_this_week'

  if (stats.overdue > 0 && stats.dueThisWeek > 0) {
    title = isSupervisorRole
      ? 'Start with overdue pressure, then work the upcoming queue.'
      : isTeamManagerRole
        ? 'Start with overdue team pressure, then clear what’s due this week.'
        : 'Start with overdue, then knock out what’s due this week.'
    body = isSupervisorRole
      ? 'That shows where the org is slipping first, then where the next wave is forming.'
      : isTeamManagerRole
        ? 'That clears the highest-risk team items first and keeps the rest of the week from stacking up.'
        : 'That clears the highest-risk items first and keeps the rest of the week from stacking up.'
    ctaLabel = `Focus overdue (${stats.overdue})`
    ctaFilter = 'overdue'
  } else if (stats.overdue > 0) {
    title = isSupervisorRole
      ? `The main pressure point is ${stats.overdue} overdue item${stats.overdue !== 1 ? 's' : ''}.`
      : isTeamManagerRole
        ? `Your team has ${stats.overdue} overdue item${stats.overdue !== 1 ? 's' : ''}.`
        : `Start with the ${stats.overdue} overdue item${stats.overdue !== 1 ? 's' : ''}.`
    body = isSupervisorRole
      ? 'Use that queue to see where intervention or rebalancing is needed.'
      : isTeamManagerRole
        ? 'Clear those first, then the rest of the team board should feel lighter.'
        : 'Once those are cleared, the rest of the board should feel a lot lighter.'
    ctaLabel = 'View overdue'
    ctaFilter = 'overdue'
  } else if (stats.dueThisWeek > 0 && stats.noContact > 0) {
    title = isSupervisorRole
      ? 'The week is manageable — just don’t let quiet cases turn into misses.'
      : isTeamManagerRole
        ? 'The week is manageable — just don’t let quiet planner queues drift.'
        : 'This week is manageable — just don’t let quiet clients slip.'
    body = isSupervisorRole
      ? `You’ve got ${stats.dueThisWeek} due this week and ${stats.noContact} quiet cases across the org.`
      : isTeamManagerRole
        ? `You’ve got ${stats.dueThisWeek} due this week and ${stats.noContact} quiet cases across your team.`
        : `You’ve got ${stats.dueThisWeek} due this week and ${stats.noContact} with no contact in 7+ days.`
    ctaLabel = 'View due this week'
    ctaFilter = 'due_this_week'
  } else if (stats.dueThisWeek > 0) {
    title = isSupervisorRole
      ? `There are ${stats.dueThisWeek} thing${stats.dueThisWeek !== 1 ? 's' : ''} due this week.`
      : isTeamManagerRole
        ? `Your team has ${stats.dueThisWeek} thing${stats.dueThisWeek !== 1 ? 's' : ''} due this week.`
        : `You’ve got ${stats.dueThisWeek} thing${stats.dueThisWeek !== 1 ? 's' : ''} due this week.`
    body = isSupervisorRole
      ? 'Good time to stay ahead of the next queue before it becomes overdue pressure.'
      : isTeamManagerRole
        ? 'Good time to chip away early instead of letting the team bunch up later.'
        : 'Good time to chip away early instead of letting everything bunch up later.'
    ctaLabel = 'View due this week'
    ctaFilter = 'due_this_week'
  } else if (stats.noContact > 0) {
    title = isSupervisorRole
      ? 'Some cases have gone quiet.'
      : isTeamManagerRole
        ? 'A few team cases have gone quiet.'
        : 'A few clients have gone quiet.'
    body = isSupervisorRole
      ? `${stats.noContact} client${stats.noContact !== 1 ? 's have' : ' has'} no contact in 7+ days. Worth a quick org-level check.`
      : isTeamManagerRole
        ? `${stats.noContact} client${stats.noContact !== 1 ? 's have' : ' has'} no contact in 7+ days across your team. Worth a quick check-in.`
        : `${stats.noContact} client${stats.noContact !== 1 ? 's have' : ' has'} no contact in 7+ days. Worth a quick check-in.`
    ctaLabel = 'View no contact'
    ctaFilter = 'no_contact_7'
  } else if (stats.eligibilitySoon > 0) {
    title = 'Keep an eye on eligibility dates.'
    body = `${stats.eligibilitySoon} client${stats.eligibilitySoon !== 1 ? 's are' : ' is'} coming up soon.`
    ctaLabel = 'View eligibility'
    ctaFilter = 'eligibility_ending_soon'
  }

  return (
    <div className="card" style={{ marginBottom: 16, background: 'linear-gradient(135deg, rgba(88,86,214,0.08) 0%, rgba(0,0,0,0) 100%)', border: '1px solid rgba(88,86,214,0.18)' }}>
      <div style={{ fontSize: 12, color: '#b7a7ff', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>
        Suggested focus
      </div>
      <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)', marginBottom: 6 }}>
        {title}
      </div>
      <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6, marginBottom: 12 }}>
        {body}
      </div>
      <button
        className="btn-secondary"
        style={{ fontSize: 12, minHeight: 34 }}
        onClick={() => onFilter(ctaFilter)}
      >
        {ctaLabel}
      </button>
    </div>
  )
}

function exportSelectedToCsv(clients: Client[]) {
  const headers = [
    'Client ID', 'Last Name', 'First Name', 'Category', 'Eligibility Code', 'Eligibility End Date',
    'Last Contact Date', 'Last Contact Type', 'Goal %', 'POS Status', 'Assigned To',
    'Assessment Due', 'SPM Next Due', 'Overdue'
  ]
  const rows = clients.map(c => [
    c.client_id, c.last_name, c.first_name ?? '',
    c.category, c.eligibility_code ?? '', c.eligibility_end_date ?? '',
    c.last_contact_date ?? '', c.last_contact_type ?? '',
    c.goal_pct, c.pos_status ?? '', c.profiles?.full_name ?? '',
    c.assessment_due ?? '', c.spm_next_due ?? '', isOverdue(c) ? 'Yes' : 'No'
  ])
  const csv = [headers, ...rows].map(row =>
    row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',')
  ).join('\n')

  const blob = new Blob([csv], { type: 'text/csv' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `casesync-selected-export-${new Date().toISOString().split('T')[0]}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

function ClientOpsTable({
  clients,
  selectedIds,
  onToggleSelect,
  showSelect,
  pinnedIds,
  onTogglePin,
  sortField,
  sortDir,
  onSortChange,
}: {
  clients: Client[]
  selectedIds: string[]
  onToggleSelect: (id: string) => void
  showSelect: boolean
  pinnedIds: string[]
  onTogglePin: (id: string) => void
  sortField: SortField
  sortDir: SortDir
  onSortChange: (field: SortField) => void
}) {
  const sorted = useMemo(() => sortClients(clients, sortField, sortDir), [clients, sortField, sortDir])

  const sortLabel = (field: SortField) => sortField === field ? ` ${sortDir === 'asc' ? '↑' : '↓'}` : ''

  return (
    <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
      <div style={{ display: 'flex', gap: 8, padding: '12px 14px', borderBottom: '1px solid var(--border)', flexWrap: 'wrap', alignItems: 'center' }}>
        <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Sort:</span>
        {[
          { field: 'priority' as const, label: 'Priority' },
          { field: 'name' as const, label: 'Name' },
          { field: 'goal_pct' as const, label: 'Goal %' },
          { field: 'last_contact_date' as const, label: 'Last Contact' },
          { field: 'eligibility_end_date' as const, label: 'Elig. End' },
        ].map(option => (
          <button
            key={option.field}
            onClick={() => onSortChange(option.field)}
            style={{
              background: sortField === option.field ? 'rgba(0,122,255,0.15)' : 'var(--surface-2)',
              border: '1px solid',
              borderColor: sortField === option.field ? 'var(--accent)' : 'var(--border)',
              borderRadius: 6,
              color: sortField === option.field ? 'var(--accent)' : 'var(--text-secondary)',
              fontSize: 11,
              padding: '4px 10px',
              cursor: 'pointer',
              minHeight: 28,
            }}
          >
            {option.label}{sortLabel(option.field)}
          </button>
        ))}
      </div>

      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 1120 }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--border)', background: 'var(--surface-2)' }}>
              {showSelect && <th style={{ padding: '10px 12px', textAlign: 'left', width: 40 }}>Sel</th>}
              <th style={{ padding: '10px 12px', textAlign: 'left' }}>Client</th>
              <th style={{ padding: '10px 12px', textAlign: 'left' }}>Planner</th>
              <th style={{ padding: '10px 12px', textAlign: 'left' }}>Priority</th>
              <th style={{ padding: '10px 12px', textAlign: 'left' }}>Risk</th>
              <th style={{ padding: '10px 12px', textAlign: 'left' }}>Overdue</th>
              <th style={{ padding: '10px 12px', textAlign: 'left' }}>Last Contact</th>
              <th style={{ padding: '10px 12px', textAlign: 'left' }}>Eligibility</th>
              <th style={{ padding: '10px 12px', textAlign: 'left' }}>SPM Due</th>
              <th style={{ padding: '10px 12px', textAlign: 'left' }}>Goal</th>
              <th style={{ padding: '10px 12px', textAlign: 'left' }}>Health</th>
              <th style={{ padding: '10px 12px', textAlign: 'left' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map(client => {
              const daysSince = getDaysSinceContact(client.last_contact_date)
              const overdueCount = getOverdueCount(client)
              const health = getClientHealthScore(client)
              const risk = getRiskLevel(client)
              const priority = clientPriorityScore(client)
              const riskColor = risk === 'high' ? 'var(--red)' : risk === 'medium' ? 'var(--orange)' : 'var(--green)'

              return (
                <tr key={client.id} style={{ borderBottom: '1px solid var(--border)' }}>
                  {showSelect && (
                    <td style={{ padding: '10px 12px' }}>
                      <input type="checkbox" checked={selectedIds.includes(client.id)} onChange={() => onToggleSelect(client.id)} />
                    </td>
                  )}
                  <td style={{ padding: '10px 12px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <button
                        onClick={() => onTogglePin(client.id)}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontSize: 15 }}
                        title={pinnedIds.includes(client.id) ? 'Unpin client' : 'Pin client'}
                      >
                        {pinnedIds.includes(client.id) ? '📌' : '📍'}
                      </button>
                      <div>
                        <Link href={`/clients/${client.id}`} style={{ color: 'var(--text)', textDecoration: 'none', fontWeight: 700 }}>
                          {client.last_name}{client.first_name ? `, ${client.first_name}` : ''}
                        </Link>
                        <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 2 }}>
                          {client.client_id} · {client.category.toUpperCase()}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td style={{ padding: '10px 12px', color: 'var(--text-secondary)' }}>{client.profiles?.full_name ?? 'Unassigned'}</td>
                  <td style={{ padding: '10px 12px', fontWeight: 700 }}>{priority}</td>
                  <td style={{ padding: '10px 12px', color: riskColor, fontWeight: 700, textTransform: 'capitalize' }}>{risk}</td>
                  <td style={{ padding: '10px 12px', color: overdueCount > 0 ? 'var(--red)' : 'var(--text-secondary)', fontWeight: overdueCount > 0 ? 700 : 500 }}>{overdueCount}</td>
                  <td style={{ padding: '10px 12px' }}>
                    <div>{formatDate(client.last_contact_date)}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                      {daysSince === null ? 'No contact logged' : `${daysSince}d ago`}
                    </div>
                  </td>
                  <td style={{ padding: '10px 12px' }}>{formatDate(client.eligibility_end_date)}</td>
                  <td style={{ padding: '10px 12px' }}>{formatDate(client.spm_next_due)}</td>
                  <td style={{ padding: '10px 12px' }}>{client.goal_pct}%</td>
                  <td style={{ padding: '10px 12px', fontWeight: 700 }}>{health}</td>
                  <td style={{ padding: '10px 12px' }}>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      <Link href={`/clients/${client.id}`} style={{ fontSize: 12, color: 'var(--accent)', textDecoration: 'none' }}>Open</Link>
                      <Link href={`/clients/${client.id}/print`} style={{ fontSize: 12, color: 'var(--text-secondary)', textDecoration: 'none' }}>Print</Link>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export default function DashboardClient({ profile, currentUserId, planners = [], teamManagers = [], savedViews = [], hasProfile = true }: Props) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const isSupervisor = profile?.role === 'supervisor' || profile?.role === 'it'
  const isTeamManager = profile?.role === 'team_manager'
  const canSeeAll = isSupervisor || isTeamManager
  const canAddClient = isSupervisor || isTeamManager

  const [clients, setClients] = useState<Client[]>([])
  const [filter, setFilter] = useState<FilterType>('all')
  const [alertFilter, setAlertFilter] = useState<FilterType | null>(null)
  const [search, setSearch] = useState('')
  const [pinnedIds, setPinnedIds] = useState<string[]>([])
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [showSelect, setShowSelect] = useState(false)
  const [activePlannerId, setActivePlannerId] = useState<string | null>(null)
  const [sortField, setSortField] = useState<SortField>('priority')
  const [sortDir, setSortDir] = useState<SortDir>('desc')
  const [bulkAssignId, setBulkAssignId] = useState('')
  const [bulkAssigning, setBulkAssigning] = useState(false)
  const [activeDayFilter, setActiveDayFilter] = useState<string | null>(null)
  const [showConfetti, setShowConfetti] = useState(false)
  const [showShortcutsModal, setShowShortcutsModal] = useState(false)
  const [page, setPage] = useState(0)
  const [total, setTotal] = useState(0)
  const [hasMore, setHasMore] = useState(false)
  const [loading, setLoading] = useState(true)
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [activeSavedViewId, setActiveSavedViewId] = useState<string | null>(null)
  const [viewMode, setViewMode] = useState<DashboardViewMode>('grid')
  const [savedViewName, setSavedViewName] = useState('')
  const [savedViewDescription, setSavedViewDescription] = useState('')
  const [savedViewMessage, setSavedViewMessage] = useState<string | null>(null)
  const [isSavingView, startSavingView] = useTransition()
  const [weekCounts, setWeekCounts] = useState<Record<string, number>>({})
  const [summaryStats, setSummaryStats] = useState({ total: 0, overdue: 0, dueThisWeek: 0, eligibilitySoon: 0, noContact: 0 })
  const fullMode = searchParams.get('full') === '1'
  const queryFilter = (searchParams.get('filter') as FilterType | null) ?? null
  const queryPlanner = searchParams.get('planner')
  const queryCategory = searchParams.get('category')
  const queryDeadlineDate = searchParams.get('deadlineDate')
  const queryViewId = searchParams.get('view')

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedSearch(search.trim())
      setPage(0)
    }, 250)

    return () => window.clearTimeout(timer)
  }, [search])

  useEffect(() => {
    if (queryViewId) {
      const matched = savedViews.find(view => view.id === queryViewId)
      if (matched) {
        const dueStates = matched.filter_definition?.dueStates ?? []
        const categories = matched.filter_definition?.categories ?? []
        const searchTerm = matched.filter_definition?.searchTerm ?? ''
        const sortDefinition = matched.sort_definition

        setActiveSavedViewId(matched.id)
        setSavedViewName(matched.name)
        setSavedViewDescription(matched.description ?? '')
        setActiveDayFilter(null)
        setAlertFilter(null)
        setActivePlannerId(matched.filter_definition?.assignedToUserId ?? null)

        if (dueStates.includes('overdue')) setFilter('overdue')
        else if (dueStates.includes('due_this_week')) setFilter('due_this_week')
        else if (categories.includes('co') || categories.includes('cfc') || categories.includes('cpas')) setFilter(categories[0])
        else setFilter('all')

        setSearch(searchTerm)
        if (sortDefinition?.field) setSortField(sortDefinition.field)
        if (sortDefinition?.dir) setSortDir(sortDefinition.dir)
        return
      }
    }

    if (queryFilter) {
      clearSavedViewSelection()
      setFilter(queryFilter)
      setAlertFilter(queryFilter === 'all' ? null : queryFilter)
    }
    if (queryPlanner) setActivePlannerId(queryPlanner)
    if (queryDeadlineDate) {
      clearSavedViewSelection()
      setActiveDayFilter(queryDeadlineDate)
      setAlertFilter(null)
      setFilter('all')
    }
    if (queryCategory && ['co', 'cfc', 'cpas'].includes(queryCategory.toLowerCase())) {
      clearSavedViewSelection()
      const mapped = queryCategory.toLowerCase() as FilterType
      setFilter(mapped)
      setAlertFilter(mapped)
    }
  }, [queryFilter, queryPlanner, queryCategory, queryDeadlineDate, queryViewId, savedViews])

  useEffect(() => {
    setPage(0)
  }, [filter, activePlannerId, sortField, sortDir])

  useEffect(() => {
    const controller = new AbortController()
    const params = new URLSearchParams()
    params.set('page', String(page))
    params.set('limit', fullMode ? '250' : (activeDayFilter ? '50' : '24'))
    params.set('filter', activeDayFilter ? 'all' : (alertFilter ?? filter))
    params.set('search', debouncedSearch)
    params.set('sortField', sortField)
    params.set('sortDir', sortDir)
    if (activeDayFilter) params.set('deadlineDate', activeDayFilter)
    if (canSeeAll && activePlannerId) params.set('assignedTo', activePlannerId)

    setLoading(true)

    fetch(`/api/clients?${params.toString()}`, { signal: controller.signal })
      .then(async (res) => {
        if (!res.ok) throw new Error(`Failed to load clients (${res.status})`)
        return res.json() as Promise<PaginatedClientsResponse>
      })
      .then((payload) => {
        setClients(payload.clients ?? [])
        setTotal(payload.total ?? 0)
        setHasMore(Boolean(payload.hasMore))
        setSummaryStats(payload.summary ?? {
          total: payload.total ?? 0,
          overdue: (payload.clients ?? []).filter(isOverdue).length,
          dueThisWeek: (payload.clients ?? []).filter(isDueThisWeek).length,
          eligibilitySoon: (payload.clients ?? []).filter(isEligibilityEndingSoon).length,
          noContact: (payload.clients ?? []).filter(c => {
            const d = getDaysSinceContact(c.last_contact_date)
            return d !== null && d >= 7
          }).length,
        })
      })
      .catch((error) => {
        if (controller.signal.aborted) return
        console.error('Error loading paginated clients:', error)
        setClients([])
        setTotal(0)
        setHasMore(false)
        setSummaryStats({ total: 0, overdue: 0, dueThisWeek: 0, eligibilitySoon: 0, noContact: 0 })
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })

    return () => controller.abort()
  }, [page, filter, alertFilter, debouncedSearch, canSeeAll, activePlannerId, sortField, sortDir, activeDayFilter, fullMode])

  useEffect(() => {
    const controller = new AbortController()
    const params = new URLSearchParams()
    if (canSeeAll && activePlannerId) params.set('assignedTo', activePlannerId)

    fetch(`/api/dashboard/summary?${params.toString()}`, { signal: controller.signal })
      .then(async (res) => {
        if (!res.ok) throw new Error(`Failed to load dashboard summary (${res.status})`)
        return res.json() as Promise<{ counts?: Record<string, number> }>
      })
      .then((payload) => {
        setWeekCounts(payload.counts ?? {})
      })
      .catch((error) => {
        if (controller.signal.aborted) return
        console.error('Error loading week strip summary:', error)
        setWeekCounts({})
      })

    return () => controller.abort()
  }, [canSeeAll, activePlannerId])

  useEffect(() => {
    try {
      const stored = localStorage.getItem(`casesync-pins-${currentUserId}`)
      if (stored) setPinnedIds(JSON.parse(stored))
    } catch {}
  }, [currentUserId])

  function togglePin(id: string) {
    setPinnedIds(prev => {
      let next: string[]
      if (prev.includes(id)) {
        next = prev.filter(p => p !== id)
      } else {
        if (prev.length >= 5) return prev
        next = [...prev, id]
      }
      try {
        localStorage.setItem(`casesync-pins-${currentUserId}`, JSON.stringify(next))
      } catch {}
      return next
    })
  }

  function toggleSelect(id: string) {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(p => p !== id) : [...prev, id])
  }

  function handleSortChange(field: SortField) {
    if (sortField === field) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    } else {
      setSortField(field)
      setSortDir(field === 'priority' ? 'desc' : 'asc')
    }
  }

  function pushResultsState(next: { filter?: string | null; deadlineDate?: string | null; viewId?: string | null; plannerId?: string | null }) {
    const params = new URLSearchParams(searchParams.toString())
    params.set('full', '1')

    if (next.viewId) params.set('view', next.viewId)
    else params.delete('view')

    if (next.filter && next.filter !== 'all') params.set('filter', next.filter)
    else params.delete('filter')

    if (next.deadlineDate) params.set('deadlineDate', next.deadlineDate)
    else params.delete('deadlineDate')

    if (next.plannerId) params.set('planner', next.plannerId)
    else params.delete('planner')

    router.push(`/dashboard?${params.toString()}`)
  }

  function clearSavedViewSelection() {
    setActiveSavedViewId(null)
  }

  function handleAlertClick(f: FilterType | null) {
    clearSavedViewSelection()
    const nextFilter = f ?? 'all'
    setAlertFilter(f)
    setFilter(nextFilter)
    setActiveDayFilter(null)
    pushResultsState({ filter: nextFilter, deadlineDate: null, viewId: null, plannerId: activePlannerId })
  }

  function handleGreetingFilter(f: FilterType | null) {
    clearSavedViewSelection()
    const nextFilter = f ?? 'all'
    setAlertFilter(f)
    setFilter(nextFilter)
    setActiveDayFilter(null)
    pushResultsState({ filter: nextFilter, deadlineDate: null, viewId: null, plannerId: activePlannerId })
  }

  function handleDayFilter(dateStr: string | null) {
    clearSavedViewSelection()
    setActiveDayFilter(dateStr)
    setAlertFilter(null)
    setFilter('all')
    pushResultsState({ filter: 'all', deadlineDate: dateStr, viewId: null, plannerId: activePlannerId })
  }

  function handleSavedViewSelect(view: DashboardSavedView) {
    setSavedViewMessage(null)
    setActiveSavedViewId(view.id)
    setSavedViewName(view.label)
    setSavedViewDescription('')
    setActiveDayFilter(null)
    setAlertFilter(null)

    const dueStates = view.definition?.dueStates ?? []
    const categories = view.definition?.categories ?? []
    const searchTerm = view.definition?.searchTerm ?? ''
    const assignedToUserId = view.definition?.assignedToUserId ?? view.plannerId ?? null

    setActivePlannerId(assignedToUserId)

    const nextFilter = dueStates.includes('overdue')
      ? 'overdue'
      : dueStates.includes('due_this_week')
        ? 'due_this_week'
        : categories.includes('co') || categories.includes('cfc') || categories.includes('cpas')
          ? categories[0]
          : (view.filter ?? 'all')

    setFilter(nextFilter)
    setSearch(searchTerm)
    pushResultsState({ filter: nextFilter, deadlineDate: null, viewId: view.id, plannerId: assignedToUserId })
  }

  function buildCurrentSavedViewPayload() {
    const ownershipScope: SavedViewOwnershipScope = canSeeAll
      ? (activePlannerId ? 'specific_planner' : (isTeamManager ? 'my_team' : isSupervisor ? 'org' : 'me'))
      : 'me'

    const dueStates: SavedViewFilter['dueStates'] = filter === 'overdue'
      ? ['overdue']
      : filter === 'due_this_week'
        ? ['due_this_week']
        : undefined

    const assignmentStates: SavedViewFilter['assignmentStates'] = activePlannerId ? ['assigned'] : undefined

    const filterDefinition: SavedViewFilter = {
      ownershipScope,
      assignedToUserId: canSeeAll ? activePlannerId : currentUserId,
      dueStates,
      assignmentStates,
      categories: filter === 'co' || filter === 'cfc' || filter === 'cpas' ? [filter] : undefined,
      searchTerm: debouncedSearch || undefined,
    }

    return {
      name: savedViewName.trim() || 'Saved view',
      description: savedViewDescription.trim() || null,
      filterDefinition,
      sortDefinition: { field: sortField, dir: sortDir },
      visibilityType: 'personal' as const,
    }
  }

  function handleSaveCurrentView() {
    setSavedViewMessage(null)
    startSavingView(async () => {
      try {
        const payload = buildCurrentSavedViewPayload()
        const result = await createSavedView(payload)
        setActiveSavedViewId(result.id)
        setSavedViewMessage('Saved view created.')
        router.refresh()
      } catch (error) {
        setSavedViewMessage(error instanceof Error ? error.message : 'Failed to save view')
      }
    })
  }

  function handleUpdateCurrentView() {
    if (!activeSavedViewId) return
    setSavedViewMessage(null)
    startSavingView(async () => {
      try {
        await updateSavedView(activeSavedViewId, buildCurrentSavedViewPayload())
        setSavedViewMessage('Saved view updated.')
        router.refresh()
      } catch (error) {
        setSavedViewMessage(error instanceof Error ? error.message : 'Failed to update view')
      }
    })
  }

  function handleDeleteCurrentView() {
    if (!activeSavedViewId || !window.confirm('Delete this saved view?')) return
    setSavedViewMessage(null)
    startSavingView(async () => {
      try {
        await deleteSavedView(activeSavedViewId)
        clearSavedViewSelection()
        setSavedViewName('')
        setSavedViewDescription('')
        setSavedViewMessage('Saved view deleted.')
        pushResultsState({ filter: 'all', deadlineDate: null, viewId: null, plannerId: null })
        router.refresh()
      } catch (error) {
        setSavedViewMessage(error instanceof Error ? error.message : 'Failed to delete view')
      }
    })
  }

  // Base: current page from API
  const baseClients = useMemo(() => clients, [clients])

  const stats = useMemo(() => summaryStats, [summaryStats])

  // Confetti: show once per session when all current
  useEffect(() => {
    if (stats.overdue === 0 && stats.dueThisWeek === 0 && baseClients.length > 0) {
      try {
        const key = `casesync-confetti-${currentUserId}-${new Date().toDateString()}`
        if (!sessionStorage.getItem(key)) {
          sessionStorage.setItem(key, '1')
          setShowConfetti(true)
        }
      } catch {}
    }
  }, [stats.overdue, stats.dueThisWeek, baseClients.length, currentUserId])

  const filtered = useMemo(() => {
    let result = baseClients

    if (search.trim()) {
      const q = search.toLowerCase()
      result = result.filter(c =>
        c.client_id.toLowerCase().includes(q) ||
        c.last_name.toLowerCase().includes(q) ||
        (c.first_name?.toLowerCase().includes(q) ?? false) ||
        (c.eligibility_code?.toLowerCase().includes(q) ?? false)
      )
    }

    if (!activeDayFilter) {
      const activeFilter = alertFilter ?? filter
      switch (activeFilter) {
        case 'overdue': result = result.filter(isOverdue); break
        case 'due_this_week': result = result.filter(isDueThisWeek); break
        case 'no_contact_7': result = result.filter(c => {
          const d = getDaysSinceContact(c.last_contact_date)
          return d !== null && d >= 7
        }); break
        case 'eligibility_ending_soon': result = result.filter(isEligibilityEndingSoon); break
        case 'co': result = result.filter(c => c.category === 'co'); break
        case 'cfc': result = result.filter(c => c.category === 'cfc'); break
        case 'cpas': result = result.filter(c => c.category === 'cpas'); break
      }
    }
    return result
  }, [baseClients, search, filter, alertFilter, activeDayFilter])

  const handleContactLogged = useCallback(async (clientId: string, date: string, type: string, note: string) => {
    const supabase = createClient()
    await supabase.from('clients').update({
      last_contact_date: date,
      last_contact_type: type,
    }).eq('id', clientId)

    if (note) {
      await supabase.from('activity_log').insert({
        client_id: clientId,
        user_id: currentUserId,
        action: `Logged contact: ${type}${note ? ' — ' + note : ''}`,
        field_name: 'last_contact_date',
        old_value: null,
        new_value: date,
      })
    }

    setClients(prev => prev.map(c => c.id === clientId
      ? { ...c, last_contact_date: date, last_contact_type: type }
      : c
    ))
  }, [currentUserId])

  async function handleBulkAssign() {
    if (!bulkAssignId || selectedIds.length === 0) return
    setBulkAssigning(true)
    const supabase = createClient()
    await supabase.from('clients').update({ assigned_to: bulkAssignId }).in('id', selectedIds)
    const planner = planners.find(p => p.id === bulkAssignId)
    setClients(prev => prev.map(c =>
      selectedIds.includes(c.id)
        ? { ...c, assigned_to: bulkAssignId, profiles: planner ?? c.profiles }
        : c
    ))
    setSelectedIds([])
    setBulkAssigning(false)
    setShowSelect(false)
  }

  const selectAll = () => setSelectedIds(filtered.map(c => c.id))
  const clearSelect = () => { setSelectedIds([]); setShowSelect(false) }

  function exportCurrentView() {
    const params = new URLSearchParams()
    params.set('filter', activeDayFilter ? 'all' : (alertFilter ?? filter))
    params.set('search', debouncedSearch)
    if (activeDayFilter) params.set('deadlineDate', activeDayFilter)
    if (canSeeAll && activePlannerId) params.set('assignedTo', activePlannerId)
    window.open(`/api/reports/clients?${params.toString()}`, '_blank')
  }

  // Keyboard shortcuts
  useKeyboardShortcuts({
    canAddClient,
    onShowShortcuts: () => setShowShortcutsModal(true),
    onCloseModal: () => setShowShortcutsModal(false),
  })

  return (
    <div style={{ paddingBottom: 'calc(180px + env(safe-area-inset-bottom))' }}>
      {/* Confetti overlay */}
      {showConfetti && (
        <Confetti onDone={() => setShowConfetti(false)} />
      )}

      {/* Keyboard shortcuts modal */}
      {showShortcutsModal && (
        <KeyboardShortcutsModal
          onClose={() => setShowShortcutsModal(false)}
          canAddClient={canAddClient}
        />
      )}

      {/* Personalized greeting */}
      <GreetingCard
        profile={profile}
        stats={{ overdue: stats.overdue, dueThisWeek: stats.dueThisWeek, noContact: stats.noContact }}
        onFilter={handleGreetingFilter}
        activeFilter={alertFilter}
        showConfetti={showConfetti}
        onDismissConfetti={() => setShowConfetti(false)}
      />

      {isTeamManager && !fullMode && (
        <div className="card" style={{ marginBottom: 16, background: 'linear-gradient(135deg, rgba(255,159,10,0.08) 0%, rgba(0,0,0,0) 100%)', border: '1px solid rgba(255,159,10,0.18)' }}>
          <div style={{ fontSize: 12, color: '#ffb340', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>
            Team Manager Focus
          </div>
          <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', marginBottom: 6 }}>
            Watch team pressure, then rebalance fast.
          </div>
          <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
            Use the overdue and due-this-week queues to spot load issues early, then jump into planner assignment and transfer flows when something is stacking up.
          </div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 12 }}>
            <Link href="/team?full=1&filter=overdue" style={{ fontSize: 12, color: 'var(--text)', textDecoration: 'none', padding: '6px 10px', border: '1px solid var(--border)', borderRadius: 8, background: 'var(--surface-2)' }}>
              Overdue Queue →
            </Link>
            <Link href="/team?view=transfer" style={{ fontSize: 12, color: 'var(--text)', textDecoration: 'none', padding: '6px 10px', border: '1px solid var(--border)', borderRadius: 8, background: 'var(--surface-2)' }}>
              Transfer Board →
            </Link>
            <Link href="/team?view=assign-planners" style={{ fontSize: 12, color: 'var(--text)', textDecoration: 'none', padding: '6px 10px', border: '1px solid var(--border)', borderRadius: 8, background: 'var(--surface-2)' }}>
              Team Manager Board →
            </Link>
          </div>
        </div>
      )}

      {isSupervisorLike(profile?.role) && (
        <>
          <SupervisorOverviewStrip
            clients={clients}
            planners={planners}
            teamManagers={teamManagers}
            onOpenAllClients={() => { window.location.href = `/team?full=1&planner=${currentUserId}&filter=all` }}
            onOpenOverdue={() => { window.location.href = `/team?full=1&planner=${currentUserId}&filter=overdue` }}
            onOpenDueThisWeek={() => { window.location.href = `/team?full=1&planner=${currentUserId}&filter=due_this_week` }}
            onOpenQuiet={() => { window.location.href = `/team?full=1&planner=${currentUserId}&filter=no_contact_7` }}
          />
          <TeamManagerSummaryTable clients={clients} planners={planners} teamManagers={teamManagers} />
        </>
      )}

      <ClientQuickSearch
        assignedTo={canSeeAll ? activePlannerId : currentUserId}
        helperText={profile?.role === 'team_manager'
          ? 'Search clients in your team scope.'
          : isSupervisorLike(profile?.role)
            ? 'Search across the current org/team scope.'
            : 'Search your current client scope.'}
        maxResults={6}
      />

      <SavedViewsBar
        profile={profile}
        activeFilter={filter}
        activePlannerId={activePlannerId}
        views={savedViews}
        activeSavedViewId={activeSavedViewId}
        onSelect={handleSavedViewSelect}
      />

      <div className="card" style={{ marginBottom: 16, padding: 14 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 10 }}>
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-secondary)' }}>
              Manage current view
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4 }}>
              Save this filter/search/sort state for one-click reuse.
            </div>
          </div>
          {savedViewMessage && (
            <div style={{ fontSize: 12, color: 'var(--accent)' }}>{savedViewMessage}</div>
          )}
        </div>
        <div style={{ display: 'grid', gap: 10 }}>
          <input
            value={savedViewName}
            onChange={e => setSavedViewName(e.target.value)}
            placeholder="Saved view name"
            style={{ width: '100%' }}
          />
          <input
            value={savedViewDescription}
            onChange={e => setSavedViewDescription(e.target.value)}
            placeholder="Description (optional)"
            style={{ width: '100%' }}
          />
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button
              type="button"
              className="btn-primary"
              style={{ fontSize: 12, minHeight: 36 }}
              onClick={handleSaveCurrentView}
              disabled={isSavingView}
            >
              {isSavingView ? 'Saving…' : 'Save current view'}
            </button>
            {activeSavedViewId && (
              <>
                <button
                  type="button"
                  className="btn-secondary"
                  style={{ fontSize: 12, minHeight: 36 }}
                  onClick={handleUpdateCurrentView}
                  disabled={isSavingView}
                >
                  Update selected view
                </button>
                <button
                  type="button"
                  className="btn-secondary"
                  style={{ fontSize: 12, minHeight: 36, borderColor: 'rgba(255,69,58,0.4)', color: 'var(--red)' }}
                  onClick={handleDeleteCurrentView}
                  disabled={isSavingView}
                >
                  Delete selected view
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* 7-day week strip */}
      <WeekStrip
        countsByDate={weekCounts}
        onDayFilter={handleDayFilter}
        activeDayFilter={activeDayFilter}
      />

      {/* Alert banner */}
      <AlertBanner
        overdue={stats.overdue}
        dueThisWeek={stats.dueThisWeek}
        eligibilitySoon={stats.eligibilitySoon}
        activeAlert={alertFilter}
        onAlert={handleAlertClick}
      />

      {/* Suggested focus */}
      <NextBestMoveCard
        profile={profile}
        stats={{ overdue: stats.overdue, dueThisWeek: stats.dueThisWeek, noContact: stats.noContact, eligibilitySoon: stats.eligibilitySoon }}
        onFilter={handleGreetingFilter}
      />

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: 10, marginBottom: 24 }}>
        <StatCard label="Caseload" value={stats.total} onClick={() => handleAlertClick(alertFilter === 'all' ? null : 'all')} active={alertFilter === 'all'} />
        <StatCard label="Overdue" value={stats.overdue} color="var(--red)" onClick={() => handleAlertClick(alertFilter === 'overdue' ? null : 'overdue')} active={alertFilter === 'overdue'} />
        <StatCard label="Due This Week" value={stats.dueThisWeek} color="var(--orange)" onClick={() => handleAlertClick(alertFilter === 'due_this_week' ? null : 'due_this_week')} active={alertFilter === 'due_this_week'} />
        <StatCard label="No Contact 7+ Days" value={stats.noContact} color="var(--yellow)" onClick={() => handleAlertClick(alertFilter === 'no_contact_7' ? null : 'no_contact_7')} active={alertFilter === 'no_contact_7'} />
      </div>

      {fullMode && (
        <div className="card" style={{ marginBottom: 16, background: 'rgba(0,122,255,0.08)', border: '1px solid rgba(0,122,255,0.2)' }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', marginBottom: 4 }}>
            Full filtered view
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
            You’re in the full dashboard view for this filter. Use paging, search, and filters here instead of the compact preview.
          </div>
          <div style={{ fontSize: 12, color: 'var(--text)', marginTop: 8, fontWeight: 600 }}>
            Active result set: {activeDayFilter ? `Deadlines on ${activeDayFilter}` : filter === 'all' ? 'All Active Clients' : filter === 'overdue' ? 'Overdue' : filter === 'due_this_week' ? 'Due This Week' : filter === 'no_contact_7' ? 'No Contact 7+ Days' : filter.toUpperCase()}
          </div>
          <div style={{ marginTop: 10 }}>
            <button
              type="button"
              className="btn-secondary"
              style={{ fontSize: 12, minHeight: 34 }}
              onClick={() => pushResultsState({ filter: 'all', deadlineDate: null })}
            >
              Clear filter
            </button>
          </div>
        </div>
      )}

      {/* Pinned */}
      <PinnedClients clients={clients} pinnedIds={pinnedIds} onUnpin={togglePin} />

      {/* Toolbar: export, bulk select, add client */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginRight: 4 }}>
          <button
            className="btn-secondary"
            style={{ fontSize: 12, minHeight: 36, borderColor: viewMode === 'grid' ? 'var(--accent)' : undefined }}
            onClick={() => setViewMode('grid')}
          >
            Grid
          </button>
          <button
            className="btn-secondary"
            style={{ fontSize: 12, minHeight: 36, borderColor: viewMode === 'table' ? 'var(--accent)' : undefined }}
            onClick={() => setViewMode('table')}
          >
            Ops table
          </button>
        </div>
        {(isSupervisor || isTeamManager) && (
          <Link href="/clients/new" style={{ textDecoration: 'none' }}>
            <button className="btn-primary" style={{ fontSize: 12, minHeight: 36 }}>
              + Add Client
            </button>
          </Link>
        )}
        <button
          className="btn-secondary"
          style={{ fontSize: 12, minHeight: 36 }}
          onClick={exportCurrentView}
        >
          📥 Export view
        </button>
        <button
          className="btn-secondary"
          style={{ fontSize: 12, minHeight: 36, borderColor: showSelect ? 'var(--accent)' : undefined }}
          onClick={() => {
            setShowSelect(s => !s)
            if (showSelect) clearSelect()
          }}
        >
          ☑️ {showSelect ? 'Done selecting' : 'Select'}
        </button>
        {showSelect && (
          <>
            <button className="btn-secondary" style={{ fontSize: 12, minHeight: 36 }} onClick={selectAll}>Select all in view ({filtered.length})</button>
            {selectedIds.length > 0 && (
              <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{selectedIds.length} selected in this view</span>
            )}
          </>
        )}
        {showSelect && selectedIds.length > 0 && (
          <>
            <button
              className="btn-secondary"
              style={{ fontSize: 12, minHeight: 36 }}
              onClick={() => exportSelectedToCsv(clients.filter(c => selectedIds.includes(c.id)))}
            >
              📥 Export selected
            </button>
            {canSeeAll && planners.length > 0 && (
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <select value={bulkAssignId} onChange={e => setBulkAssignId(e.target.value)} style={{ fontSize: 12 }}>
                  <option value="">Assign to Support Planner…</option>
                  {planners.map(p => <option key={p.id} value={p.id}>{p.full_name}</option>)}
                </select>
                <button
                  className="btn-primary"
                  style={{ fontSize: 12, minHeight: 36 }}
                  disabled={!bulkAssignId || bulkAssigning}
                  onClick={handleBulkAssign}
                >
                  {bulkAssigning ? 'Assigning…' : 'Assign'}
                </button>
              </div>
            )}
          </>
        )}

        {/* Keyboard shortcut hint */}
        <button
          className="btn-secondary"
          style={{ fontSize: 12, minHeight: 36, marginLeft: 'auto' }}
          onClick={() => setShowShortcutsModal(true)}
          title="Keyboard shortcuts (?)"
        >
          ⌨️
        </button>
      </div>

      {/* Filters */}
      <FilterBar
        activeFilter={filter}
        search={search}
        onFilterChange={f => { setFilter(f); setAlertFilter(null); setActiveDayFilter(null) }}
        onSearchChange={setSearch}
        planners={canSeeAll ? planners : undefined}
        activePlannerId={activePlannerId}
        onPlannerChange={canSeeAll ? setActivePlannerId : undefined}
      />

      {/* Results count + active day indicator */}
      <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 14, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <span>
          {filtered.length === 0
            ? 'Nothing is showing in this view right now.'
            : activeDayFilter
              ? `Showing ${filtered.length} of ${total} client${total !== 1 ? 's' : ''} with deadlines on ${activeDayFilter}${hasMore ? ' • more pages available' : ''}`
              : `Showing ${filtered.length} of ${total} client${total !== 1 ? 's' : ''}${hasMore ? ' • more pages available' : ''}`}
        </span>
        {activeDayFilter && (
          <span style={{
            background: 'rgba(0,122,255,0.15)',
            border: '1px solid rgba(0,122,255,0.3)',
            borderRadius: 6,
            padding: '2px 8px',
            color: 'var(--accent)',
            fontSize: 11,
          }}>
            📅 {activeDayFilter} · <button onClick={() => setActiveDayFilter(null)} style={{ background: 'none', border: 'none', color: 'var(--accent)', cursor: 'pointer', fontSize: 11, padding: 0 }}>✕ Clear</button>
          </span>
        )}
      </div>

      {/* Results surface */}
      {viewMode === 'table' ? (
        <ClientOpsTable
          clients={filtered}
          selectedIds={selectedIds}
          onToggleSelect={toggleSelect}
          showSelect={showSelect}
          pinnedIds={pinnedIds}
          onTogglePin={togglePin}
          sortField={sortField}
          sortDir={sortDir}
          onSortChange={handleSortChange}
        />
      ) : (
        <ClientGrid
          clients={filtered}
          pinnedIds={pinnedIds}
          onTogglePin={togglePin}
          selectedIds={selectedIds}
          onToggleSelect={toggleSelect}
          showSelect={showSelect}
          sortField={sortField}
          sortDir={sortDir}
          onSortChange={handleSortChange}
          onContactLogged={handleContactLogged}
          loading={loading}
        />
      )}

      {!loading && filtered.length === 0 && (
        <div className="card" style={{ marginTop: 12, background: 'linear-gradient(135deg, rgba(0,122,255,0.05) 0%, rgba(0,0,0,0) 100%)', border: '1px solid rgba(0,122,255,0.12)' }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', marginBottom: 6 }}>
            {baseClients.length === 0 ? 'Quiet start.' : 'Nothing matches this view.'}
          </div>
          <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6, marginBottom: 12 }}>
            {baseClients.length === 0
              ? 'Once clients are assigned, this dashboard will start surfacing what needs attention first.'
              : 'Try clearing a filter, switching the day view, or searching a broader name, code, or client ID.'}
          </div>
          {(filter !== 'all' || alertFilter || activeDayFilter || search.trim()) && (
            <button
              className="btn-secondary"
              style={{ fontSize: 12, minHeight: 34 }}
              onClick={() => {
                setFilter('all')
                setAlertFilter(null)
                setActiveDayFilter(null)
                setSearch('')
              }}
            >
              Clear filters and search
            </button>
          )}
        </div>
      )}

      {!activeDayFilter && (
        <div style={{ display: 'flex', gap: 8, justifyContent: 'center', alignItems: 'center', marginTop: 18, flexWrap: 'wrap' }}>
          <button
            className="btn-secondary"
            style={{ fontSize: 12, minHeight: 36 }}
            onClick={() => setPage(p => Math.max(0, p - 1))}
            disabled={page === 0 || loading}
          >
            ← Previous
          </button>
          <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
            Page {page + 1}{total > 0 ? ` of ${Math.max(1, Math.ceil(total / 24))}` : ''}
          </span>
          <button
            className="btn-secondary"
            style={{ fontSize: 12, minHeight: 36 }}
            onClick={() => setPage(p => p + 1)}
            disabled={!hasMore || loading}
          >
            Next →
          </button>
        </div>
      )}

      {/* Quick Actions FAB */}
      <QuickActions
        profile={profile}
        onLogContact={() => {
          // Focus first client card log contact button or open a global contact modal
          const btn = document.querySelector('button[title="Log Contact"]') as HTMLButtonElement | null
          btn?.click()
        }}
      />
    </div>
  )
}
