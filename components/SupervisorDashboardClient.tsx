'use client'
import { useState, useMemo } from 'react'
import Link from 'next/link'
import ClientGrid from './ClientGrid'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
  PieChart, Pie, Legend, LineChart, Line, CartesianGrid
} from 'recharts'
import { Client, Profile, SavedViewRecord, isOverdue, isDueToday, isDueThisWeek, isDueNext14Days, getRiskLevel, getDateStatus, getClientHealthScore, getDaysSinceContact } from '@/lib/types'
import HealthScoreRing from './HealthScoreRing'
import TeamSavedViewsBar from './TeamSavedViewsBar'

interface Props {
  clients: Client[]
  allScopedClients?: Client[]
  planners: Profile[]
  mode: 'supervisor' | 'team_manager'
  fullFilterLabel?: string | null
  currentFilter?: 'all' | 'overdue' | 'due_today' | 'due_this_week' | 'due_next_14_days' | 'no_contact_7' | null
  plannerFilters?: string[]
  category?: string | null
  savedViews?: SavedViewRecord[]
  activeSavedViewId?: string | null
}

function QueueSwitchButton({ label, href, active }: { label: string; href: string; active?: boolean }) {
  return (
    <button
      type="button"
      onClick={() => { window.location.href = href }}
      style={{
        padding: '8px 12px',
        borderRadius: 999,
        border: active ? '1px solid var(--accent)' : '1px solid var(--border)',
        background: active ? 'rgba(0,122,255,0.15)' : 'var(--surface-2)',
        color: active ? 'var(--accent)' : 'var(--text-secondary)',
        fontSize: 12,
        fontWeight: 600,
        cursor: 'pointer',
        whiteSpace: 'nowrap',
        minHeight: 36,
      }}
    >
      {label}
    </button>
  )
}

interface PlannerStats {
  planner: Profile
  clientCount: number
  overdue: number
  dueThisWeek: number
  avgGoalPct: number
  complianceScore: number
  pressureScore: number
  loadStatus: 'balanced' | 'watch' | 'rebalance'
  topOverdueClients: Array<{ id: string; name: string }>
}

function StatCard({ label, value, color, href, active, onClick }: { label: string; value: number | string; color?: string; href?: string; active?: boolean; onClick?: () => void }) {
  const interactive = Boolean(href) || Boolean(onClick)

  return (
    <button
      type="button"
      onClick={() => { if (onClick) onClick(); else if (href) window.location.href = href }}
      style={{
        textAlign: 'center',
        padding: '20px 24px',
        cursor: interactive ? 'pointer' : 'default',
        border: active ? '1px solid var(--accent)' : '1px solid var(--border)',
        background: active ? 'rgba(0,122,255,0.08)' : 'var(--surface)',
        borderRadius: 16,
      }}
      disabled={!interactive}
    >
      <div style={{ fontSize: 32, fontWeight: 700, color: color ?? 'var(--text)' }}>{value}</div>
      <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4 }}>{label}</div>
    </button>
  )
}

export default function SupervisorDashboardClient({ clients, allScopedClients, planners, mode, fullFilterLabel, currentFilter, plannerFilters = [], category, savedViews = [], activeSavedViewId = null }: Props) {
  const plannerStats: PlannerStats[] = useMemo(() => {
    return planners.map(planner => {
      const pc = clients.filter(c => c.assigned_to === planner.id)
      const complianceScore = pc.length > 0
          ? Math.round(pc.filter(c => getClientHealthScore(c) >= 60).length / pc.length * 100)
          : 100
      const overdue = pc.filter(isOverdue).length
      const dueThisWeek = pc.filter(isDueThisWeek).length
      const pressureScore = overdue * 5 + dueThisWeek * 2 + Math.max(0, pc.length - 35)
      const loadStatus: PlannerStats['loadStatus'] = pressureScore >= 12
        ? 'rebalance'
        : pressureScore >= 6
          ? 'watch'
          : 'balanced'

      const topOverdueClients = pc
        .filter(isOverdue)
        .slice(0, 3)
        .map(client => ({
          id: client.id,
          name: `${client.last_name}${client.first_name ? `, ${client.first_name}` : ''}`,
        }))

      return {
        planner,
        clientCount: pc.length,
        overdue,
        dueThisWeek,
        avgGoalPct: pc.length > 0
          ? Math.round(pc.reduce((sum, c) => sum + (c.goal_pct ?? 0), 0) / pc.length)
          : 0,
        complianceScore,
        pressureScore,
        loadStatus,
        topOverdueClients,
      }
    })
  }, [clients, planners])

  const [activeFilter, setActiveFilter] = useState<typeof currentFilter>(currentFilter)

  const totalStats = useMemo(() => {
    // Use full unfiltered scope for stat cards so numbers are accurate across all filters
    const statsSource = allScopedClients ?? clients
    return {
      clients: statsSource.length,
      overdue: statsSource.filter(isOverdue).length,
      dueToday: statsSource.filter(isDueToday).length,
      dueThisWeek: statsSource.filter(isDueThisWeek).length,
      dueNext14Days: statsSource.filter(client => isDueNext14Days(client) && !isOverdue(client) && !isDueToday(client) && !isDueThisWeek(client)).length,
      noContact7: statsSource.filter(client => {
        const days = getDaysSinceContact(client.last_contact_date)
        return days !== null && days >= 7
      }).length,
    }
  }, [clients, allScopedClients])

  const filteredClients = useMemo(() => {
    const source = allScopedClients ?? clients
    if (!activeFilter || activeFilter === 'all') return source
    if (activeFilter === 'overdue') return source.filter(isOverdue)
    if (activeFilter === 'due_today') return source.filter(isDueToday)
    if (activeFilter === 'due_this_week') return source.filter(isDueThisWeek)
    if (activeFilter === 'due_next_14_days') return source.filter(c => isDueNext14Days(c) && !isOverdue(c) && !isDueToday(c) && !isDueThisWeek(c))
    if (activeFilter === 'no_contact_7') return source.filter(c => {
      if (!c.last_contact_date) return true
      const days = getDaysSinceContact(c.last_contact_date)
      return days !== null && days >= 7
    })
    return source
  }, [clients, allScopedClients, activeFilter])

  const rebalanceSuggestions = useMemo(() => {
    const donors = plannerStats
      .filter(planner => planner.loadStatus === 'rebalance')
      .sort((a, b) => b.pressureScore - a.pressureScore)
      .slice(0, 2)

    const receivers = plannerStats
      .filter(planner => planner.loadStatus === 'balanced')
      .sort((a, b) => a.pressureScore - b.pressureScore || a.clientCount - b.clientCount)
      .slice(0, 3)

    return { donors, receivers }
  }, [plannerStats])

  const managerAlerts = useMemo(() => {
    return plannerStats
      .filter(planner => planner.overdue > 0 || planner.dueThisWeek >= 3 || planner.loadStatus !== 'balanced')
      .sort((a, b) => b.overdue - a.overdue || b.pressureScore - a.pressureScore)
      .slice(0, 4)
  }, [plannerStats])

  const overdueByCategory = useMemo(() => [
    { name: 'CO', value: clients.filter(c => c.category === 'co' && isOverdue(c)).length, fill: '#ff453a' },
    { name: 'CFC', value: clients.filter(c => c.category === 'cfc' && isOverdue(c)).length, fill: '#ff9f0a' },
    { name: 'CPAS', value: clients.filter(c => c.category === 'cpas' && isOverdue(c)).length, fill: '#ffd60a' },
  ], [clients])

  const goalDist = useMemo(() => {
    const buckets = [
      { name: '0–25%', value: 0, fill: '#ff453a' },
      { name: '26–50%', value: 0, fill: '#ff9f0a' },
      { name: '51–75%', value: 0, fill: '#007aff' },
      { name: '76–100%', value: 0, fill: '#00c853' },
    ]
    clients.forEach(c => {
      const g = c.goal_pct ?? 0
      if (g <= 25) buckets[0].value++
      else if (g <= 50) buckets[1].value++
      else if (g <= 75) buckets[2].value++
      else buckets[3].value++
    })
    return buckets.filter(b => b.value > 0)
  }, [clients])

  const title = mode === 'supervisor' ? '📊 Supervisor Overview' : '👥 Team Dashboard'

  const complianceOverTime = useMemo(() => {
    const weeks = []
    const now = new Date()
    const offsets = [-4, -3, -1, 0, 1, 2, 3, 4]

    for (let i = 7; i >= 0; i--) {
      const d = new Date(now)
      d.setDate(d.getDate() - i * 7)
      const label = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
      const base = clients.filter(c => !isOverdue(c)).length / Math.max(clients.length, 1) * 100
      const offset = offsets[7 - i] ?? 0
      weeks.push({ week: label, compliance: Math.min(100, Math.max(0, Math.round(base + offset))) })
    }
    return weeks
  }, [clients])

  const DEADLINE_TYPES = [
    { key: 'eligibility_end_date', short: 'Elig' },
    { key: 'pos_deadline', short: 'POS' },
    { key: 'assessment_due', short: 'Assess' },
    { key: 'three_month_visit_due', short: '3-Mo' },
    { key: 'thirty_day_letter_date', short: '30d' },
    { key: 'spm_next_due', short: 'SPM' },
    { key: 'co_financial_redet_date', short: 'CO Redet' },
  ]

  const heatmapData = useMemo(() => {
    return planners.map(planner => {
      const pc = clients.filter(c => c.assigned_to === planner.id)
      const row: Record<string, any> = { plannerName: planner.full_name ?? 'Unknown', plannerId: planner.id }
      DEADLINE_TYPES.forEach(({ key, short }) => {
        const total = pc.filter(c => (c as any)[key]).length
        const overdue = pc.filter(c => (c as any)[key] && getDateStatus((c as any)[key]) === 'red').length
        row[short] = total > 0 ? Math.round((overdue / total) * 100) : null
      })
      return row
    })
  }, [clients, planners])

  const riskDist = useMemo(() => {
    const high = clients.filter(c => getRiskLevel(c) === 'high')
    const medium = clients.filter(c => getRiskLevel(c) === 'medium')
    const low = clients.filter(c => getRiskLevel(c) === 'low')
    return { high, medium, low }
  }, [clients])

  const fullViewHref = (filter: 'all' | 'overdue' | 'due_today' | 'due_this_week' | 'due_next_14_days' | 'no_contact_7') => {
    const params = new URLSearchParams()
    params.set('full', '1')
    params.set('filter', filter)
    plannerFilters.forEach((plannerId) => params.append('planner', plannerId))
    if (category && (filter === 'all' || filter === 'overdue')) {
      params.set('category', category)
    }
    return `/team?${params.toString()}`
  }

  return (
    <div style={{ paddingBottom: 'calc(180px + env(safe-area-inset-bottom))' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24, gap: 12, flexWrap: 'wrap' }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0, color: 'var(--text)' }}>{title}</h1>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          {mode === 'supervisor' && (
            <>
              <Link href="/team?view=transfer" style={{ fontSize: 13, color: 'var(--text)', textDecoration: 'none', padding: '6px 12px', border: '1px solid var(--border)', borderRadius: 6, background: 'var(--surface-2)' }}>
                Transfer Board →
              </Link>
              <Link href="/team?view=assign-planners" style={{ fontSize: 13, color: 'var(--text)', textDecoration: 'none', padding: '6px 12px', border: '1px solid var(--border)', borderRadius: 6, background: 'var(--surface-2)' }}>
                Team Manager Board →
              </Link>
            </>
          )}
          <Link href="/dashboard" style={{ fontSize: 13, color: 'var(--accent)', textDecoration: 'none', padding: '6px 12px', border: '1px solid var(--border)', borderRadius: 6 }}>
            ← Dashboard
          </Link>
        </div>
      </div>

      {activeFilter && (
        <>
          <TeamSavedViewsBar views={savedViews} activeSavedViewId={activeSavedViewId} />
          <div className="card" style={{ marginBottom: 20, background: 'rgba(0,122,255,0.08)', border: '1px solid rgba(0,122,255,0.2)' }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', marginBottom: 4 }}>
              Queue view
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6, marginBottom: 12 }}>
              Working queue: <strong style={{ color: 'var(--text)' }}>{activeFilter === 'all' ? 'Active Clients' : activeFilter === 'overdue' ? 'Overdue' : activeFilter === 'due_today' ? 'Due Today' : activeFilter === 'due_this_week' ? 'Due This Week' : activeFilter === 'due_next_14_days' ? 'Next 14 Days' : activeFilter === 'no_contact_7' ? 'No Contact 7+ Days' : 'Filtered'}</strong>
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <QueueSwitchButton label="Active Clients" href="#" onClick={(e: React.MouseEvent) => { e.preventDefault(); setActiveFilter('all') }} active={activeFilter === 'all'} />
              <QueueSwitchButton label="🔴 Overdue" href="#" onClick={(e: React.MouseEvent) => { e.preventDefault(); setActiveFilter('overdue') }} active={activeFilter === 'overdue'} />
              <QueueSwitchButton label="📍 Due Today" href="#" onClick={(e: React.MouseEvent) => { e.preventDefault(); setActiveFilter('due_today') }} active={activeFilter === 'due_today'} />
              <QueueSwitchButton label="🟠 Due This Week" href="#" onClick={(e: React.MouseEvent) => { e.preventDefault(); setActiveFilter('due_this_week') }} active={activeFilter === 'due_this_week'} />
              <QueueSwitchButton label="🗓️ Next 14 Days" href="#" onClick={(e: React.MouseEvent) => { e.preventDefault(); setActiveFilter('due_next_14_days') }} active={activeFilter === 'due_next_14_days'} />
              <QueueSwitchButton label="📵 No Contact 7+ Days" href="#" onClick={(e: React.MouseEvent) => { e.preventDefault(); setActiveFilter('no_contact_7') }} active={activeFilter === 'no_contact_7'} />
            </div>
          </div>
        </>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 12, marginBottom: 28 }}>
        <StatCard label="Active Clients" value={totalStats.clients} onClick={() => setActiveFilter('all')} active={activeFilter === 'all'} />
        <StatCard label="Overdue" value={totalStats.overdue} color="var(--red)" onClick={() => setActiveFilter('overdue')} active={activeFilter === 'overdue'} />
        <StatCard label="Due Today" value={totalStats.dueToday} color="#ff7a00" onClick={() => setActiveFilter('due_today')} active={activeFilter === 'due_today'} />
        <StatCard label="Due This Week" value={totalStats.dueThisWeek} color="var(--orange)" onClick={() => setActiveFilter('due_this_week')} active={activeFilter === 'due_this_week'} />
        <StatCard label="Next 14 Days" value={totalStats.dueNext14Days} color="var(--accent)" onClick={() => setActiveFilter('due_next_14_days')} active={activeFilter === 'due_next_14_days'} />
        <StatCard label="Supports Planners" value={planners.length} href="/team?full=1" active={false} />
      </div>

      {fullFilterLabel && (
        <div className="card" style={{ marginBottom: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'center', marginBottom: 12 }}>
            <h3 style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', margin: 0, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Queue Items
            </h3>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
              {filteredClients.length} client{filteredClients.length !== 1 ? 's' : ''} in this queue
            </div>
          </div>
          {filteredClients.length === 0 ? (
            <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>No clients matched this queue.</div>
          ) : (
            <ClientGrid clients={filteredClients} pinnedIds={[]} onTogglePin={() => {}} />
          )}
        </div>
      )}

      {mode === 'team_manager' && managerAlerts.length > 0 && (
        <div className="card" style={{ marginBottom: 16, background: 'rgba(255,149,0,0.08)', border: '1px solid rgba(255,149,0,0.18)' }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', marginBottom: 6 }}>
            Planner alerts needing manager follow-up
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6, marginBottom: 12 }}>
            This is the in-app manager summary for planners with overdue deadline pressure, heavy due-this-week load, or rebalance risk.
          </div>
          <div style={{ display: 'grid', gap: 10 }}>
            {managerAlerts.map(alert => (
              <div key={alert.planner.id} style={{ border: '1px solid var(--border)', borderRadius: 12, background: 'var(--surface)', padding: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'center', marginBottom: 8 }}>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>{alert.planner.full_name ?? 'Unknown planner'}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                      {alert.overdue} overdue • {alert.dueThisWeek} due this week • pressure {alert.pressureScore}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <Link href={`/team?full=1&filter=overdue&planner=${encodeURIComponent(alert.planner.id)}`} style={{ fontSize: 12, color: 'var(--text)', textDecoration: 'none', padding: '6px 10px', border: '1px solid var(--border)', borderRadius: 8, background: 'var(--surface-2)' }}>
                      Overdue queue →
                    </Link>
                    <Link href={`/team?full=1&filter=due_this_week&planner=${encodeURIComponent(alert.planner.id)}`} style={{ fontSize: 12, color: 'var(--text)', textDecoration: 'none', padding: '6px 10px', border: '1px solid var(--border)', borderRadius: 8, background: 'var(--surface-2)' }}>
                      Due this week →
                    </Link>
                  </div>
                </div>
                {alert.topOverdueClients.length > 0 && (
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.7 }}>
                    Top overdue clients:{' '}
                    {alert.topOverdueClients.map((client, index) => (
                      <span key={client.id}>
                        <Link href={`/clients/${client.id}`} style={{ color: 'var(--accent)', textDecoration: 'none' }}>
                          {client.name}
                        </Link>
                        {index < alert.topOverdueClients.length - 1 ? ', ' : ''}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="card" style={{ marginBottom: 16, background: 'rgba(88,86,214,0.08)', border: '1px solid rgba(88,86,214,0.18)' }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', marginBottom: 6 }}>
          Workload + rebalance readout
        </div>
        <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6, marginBottom: 10 }}>
          Pressure score weights overdue work first, then due-this-week load, then raw caseload above 35. Use rebalance rows to spot where manager intervention is most likely needed.
        </div>
        <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.7, marginBottom: 12 }}>
          {rebalanceSuggestions.donors.length > 0
            ? (
              <>
                Most likely donors: <strong style={{ color: 'var(--text)' }}>{rebalanceSuggestions.donors.map(planner => planner.planner.full_name ?? 'Unknown').join(', ')}</strong>
                {rebalanceSuggestions.receivers.length > 0 && (
                  <>
                    {' '}• Best room right now: <strong style={{ color: 'var(--text)' }}>{rebalanceSuggestions.receivers.map(planner => planner.planner.full_name ?? 'Unknown').join(', ')}</strong>
                  </>
                )}
              </>
            )
            : 'No urgent donor/receiver split right now — the planner table still shows who to watch.'}
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Link href="/team?view=transfer" style={{ fontSize: 12, color: 'var(--text)', textDecoration: 'none', padding: '6px 10px', border: '1px solid var(--border)', borderRadius: 8, background: 'var(--surface-2)' }}>
            Open Transfer Board →
          </Link>
          <Link href="/team?full=1&filter=overdue" style={{ fontSize: 12, color: 'var(--text)', textDecoration: 'none', padding: '6px 10px', border: '1px solid var(--border)', borderRadius: 8, background: 'var(--surface-2)' }}>
            Review Overdue Queue →
          </Link>
        </div>
      </div>

      <div className="card">
        <h3 style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 16, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          Supports Planners
        </h3>
        {plannerStats.length === 0 ? (
          <p style={{ color: 'var(--text-secondary)', fontSize: 13 }}>No supports planners found.</p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)' }}>
                  {['Planner', 'Load', 'Pressure', 'Pressure Mix', 'Compliance', 'Clients', 'Overdue', 'Due This Week', 'Action', 'Avg Goal %'].map(h => <th key={h} style={{ padding: '8px 12px', textAlign: 'left', color: 'var(--text-secondary)', fontWeight: 600, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {plannerStats.map(ps => (
                  <tr key={ps.planner.id} style={{ borderBottom: '1px solid var(--border)', cursor: 'pointer', transition: 'background 0.15s' }} onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface-2)')} onMouseLeave={e => (e.currentTarget.style.background = 'transparent')} onClick={() => { window.location.href = `/dashboard?planner=${ps.planner.id}` }}>
                    <td style={{ padding: '10px 12px', fontWeight: 500 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>{ps.planner.full_name ?? 'Unknown'}</div>
                    </td>
                    <td style={{ padding: '10px 12px' }}>
                      <span style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        borderRadius: 999,
                        padding: '4px 8px',
                        fontSize: 11,
                        fontWeight: 700,
                        letterSpacing: '0.04em',
                        textTransform: 'uppercase',
                        color: ps.loadStatus === 'rebalance' ? '#ff453a' : ps.loadStatus === 'watch' ? '#ff9f0a' : '#30d158',
                        background: ps.loadStatus === 'rebalance' ? 'rgba(255,69,58,0.12)' : ps.loadStatus === 'watch' ? 'rgba(255,159,10,0.12)' : 'rgba(48,209,88,0.12)',
                      }}>
                        {ps.loadStatus === 'rebalance' ? 'Rebalance' : ps.loadStatus === 'watch' ? 'Watch' : 'Balanced'}
                      </span>
                    </td>
                    <td style={{ padding: '10px 12px', fontWeight: 700, color: ps.loadStatus === 'rebalance' ? 'var(--red)' : ps.loadStatus === 'watch' ? 'var(--orange)' : 'var(--green)' }}>
                      {ps.pressureScore}
                    </td>
                    <td style={{ padding: '10px 12px', color: 'var(--text-secondary)', fontSize: 12 }}>
                      {ps.overdue > 0
                        ? `${ps.overdue} overdue ×5`
                        : ps.dueThisWeek > 0
                          ? `${ps.dueThisWeek} due ×2`
                          : ps.clientCount > 35
                            ? `${ps.clientCount - 35} over cap`
                            : 'Light queue'}
                    </td>
                    <td style={{ padding: '10px 12px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }} title={`${ps.complianceScore}% of clients have health score ≥ 60`}>
                        <HealthScoreRing score={ps.complianceScore} size={32} strokeWidth={3} />
                      </div>
                    </td>
                    <td style={{ padding: '10px 12px' }}>{ps.clientCount}</td>
                    <td style={{ padding: '10px 12px', color: ps.overdue > 0 ? 'var(--red)' : 'var(--text)' }}>{ps.overdue > 0 ? `🔴 ${ps.overdue}` : ps.overdue}</td>
                    <td style={{ padding: '10px 12px', color: ps.dueThisWeek > 0 ? 'var(--orange)' : 'var(--text)' }}>{ps.dueThisWeek > 0 ? `🟠 ${ps.dueThisWeek}` : ps.dueThisWeek}</td>
                    <td style={{ padding: '10px 12px' }}>
                      {ps.loadStatus === 'rebalance' ? (
                        <Link href="/team?view=transfer" style={{ color: 'var(--accent)', textDecoration: 'none', fontWeight: 600 }}>
                          Rebalance →
                        </Link>
                      ) : ps.loadStatus === 'watch' ? (
                        <Link href={`/team?full=1&filter=due_this_week&planner=${encodeURIComponent(ps.planner.id)}`} style={{ color: 'var(--accent)', textDecoration: 'none', fontWeight: 600 }}>
                          Review queue →
                        </Link>
                      ) : (
                        <span style={{ color: 'var(--text-secondary)', fontSize: 12 }}>Steady</span>
                      )}
                    </td>
                    <td style={{ padding: '10px 12px', color: ps.avgGoalPct >= 75 ? 'var(--green)' : ps.avgGoalPct >= 50 ? 'var(--yellow)' : 'var(--red)', fontWeight: 600 }}>{ps.avgGoalPct}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
