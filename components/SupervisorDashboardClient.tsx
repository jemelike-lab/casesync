'use client'

import { useMemo } from 'react'
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
}

function StatCard({ label, value, color, href, active }: { label: string; value: number | string; color?: string; href?: string; active?: boolean }) {
  const interactive = Boolean(href)

  return (
    <button
      type="button"
      onClick={() => { if (href) window.location.href = href }}
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

export default function SupervisorDashboardClient({ clients, planners, mode, fullFilterLabel, currentFilter, plannerFilters = [], category, savedViews = [], activeSavedViewId = null }: Props) {
  const plannerStats: PlannerStats[] = useMemo(() => {
    return planners.map(planner => {
      const pc = clients.filter(c => c.assigned_to === planner.id)
      const complianceScore = pc.length > 0
          ? Math.round(pc.filter(c => getClientHealthScore(c) >= 60).length / pc.length * 100)
          : 100
      return {
        planner,
        clientCount: pc.length,
        overdue: pc.filter(isOverdue).length,
        dueThisWeek: pc.filter(isDueThisWeek).length,
        avgGoalPct: pc.length > 0
          ? Math.round(pc.reduce((sum, c) => sum + (c.goal_pct ?? 0), 0) / pc.length)
          : 0,
        complianceScore,
      }
    })
  }, [clients, planners])

  const totalStats = useMemo(() => ({
    clients: clients.length,
    overdue: clients.filter(isOverdue).length,
    dueToday: clients.filter(isDueToday).length,
    dueThisWeek: clients.filter(isDueThisWeek).length,
    dueNext14Days: clients.filter(client => isDueNext14Days(client) && !isOverdue(client) && !isDueToday(client) && !isDueThisWeek(client)).length,
    noContact7: clients.filter(client => {
      const days = getDaysSinceContact(client.last_contact_date)
      return days !== null && days >= 7
    }).length,
  }), [clients])

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

      {fullFilterLabel && (
        <>
          <TeamSavedViewsBar views={savedViews} activeSavedViewId={activeSavedViewId} />
          <div className="card" style={{ marginBottom: 20, background: 'rgba(0,122,255,0.08)', border: '1px solid rgba(0,122,255,0.2)' }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', marginBottom: 4 }}>
              Queue view
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6, marginBottom: 12 }}>
              Working queue: <strong style={{ color: 'var(--text)' }}>{fullFilterLabel}</strong>
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <QueueSwitchButton label="Active Clients" href={fullViewHref('all')} active={currentFilter === 'all'} />
              <QueueSwitchButton label="🔴 Overdue" href={fullViewHref('overdue')} active={currentFilter === 'overdue'} />
              <QueueSwitchButton label="📍 Due Today" href={fullViewHref('due_today')} active={currentFilter === 'due_today'} />
              <QueueSwitchButton label="🟠 Due This Week" href={fullViewHref('due_this_week')} active={currentFilter === 'due_this_week'} />
              <QueueSwitchButton label="🗓️ Next 14 Days" href={fullViewHref('due_next_14_days')} active={currentFilter === 'due_next_14_days'} />
              <QueueSwitchButton label="📵 No Contact 7+ Days" href={fullViewHref('no_contact_7')} active={currentFilter === 'no_contact_7'} />
            </div>
          </div>
        </>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 12, marginBottom: 28 }}>
        <StatCard label="Active Clients" value={totalStats.clients} href={fullFilterLabel ? undefined : fullViewHref('all')} active={currentFilter === 'all'} />
        <StatCard label="Overdue" value={totalStats.overdue} color="var(--red)" href={fullFilterLabel ? undefined : fullViewHref('overdue')} active={currentFilter === 'overdue'} />
        <StatCard label="Due Today" value={totalStats.dueToday} color="#ff7a00" href={fullFilterLabel ? undefined : fullViewHref('due_today')} active={currentFilter === 'due_today'} />
        <StatCard label="Due This Week" value={totalStats.dueThisWeek} color="var(--orange)" href={fullFilterLabel ? undefined : fullViewHref('due_this_week')} active={currentFilter === 'due_this_week'} />
        <StatCard label="Next 14 Days" value={totalStats.dueNext14Days} color="var(--accent)" href={fullFilterLabel ? undefined : fullViewHref('due_next_14_days')} active={currentFilter === 'due_next_14_days'} />
        <StatCard label="Supports Planners" value={planners.length} href={fullFilterLabel ? undefined : '/supervisor'} active={!fullFilterLabel} />
      </div>

      {fullFilterLabel && (
        <div className="card" style={{ marginBottom: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'center', marginBottom: 12 }}>
            <h3 style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', margin: 0, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Queue Items
            </h3>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
              {clients.length} client{clients.length !== 1 ? 's' : ''} in this queue
            </div>
          </div>
          {clients.length === 0 ? (
            <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>No clients matched this queue.</div>
          ) : (
            <ClientGrid clients={clients} pinnedIds={[]} onTogglePin={() => {}} />
          )}
        </div>
      )}

      <div className="card" style={{ marginBottom: 16, background: 'rgba(255,159,10,0.08)', border: '1px solid rgba(255,159,10,0.18)' }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', marginBottom: 6 }}>
          Team analytics temporarily simplified
        </div>
        <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
          The queue and planner surfaces stay available while the richer analytics widgets are stabilized.
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
                  {['Planner', 'Compliance', 'Clients', 'Overdue', 'Due This Week', 'Avg Goal %'].map(h => <th key={h} style={{ padding: '8px 12px', textAlign: 'left', color: 'var(--text-secondary)', fontWeight: 600, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {plannerStats.map(ps => (
                  <tr key={ps.planner.id} style={{ borderBottom: '1px solid var(--border)', cursor: 'pointer', transition: 'background 0.15s' }} onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface-2)')} onMouseLeave={e => (e.currentTarget.style.background = 'transparent')} onClick={() => { window.location.href = `/dashboard?planner=${ps.planner.id}` }}>
                    <td style={{ padding: '10px 12px', fontWeight: 500 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>{ps.planner.full_name ?? 'Unknown'}</div>
                    </td>
                    <td style={{ padding: '10px 12px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }} title={`${ps.complianceScore}% of clients have health score ≥ 60`}>
                        <HealthScoreRing score={ps.complianceScore} size={32} strokeWidth={3} />
                      </div>
                    </td>
                    <td style={{ padding: '10px 12px' }}>{ps.clientCount}</td>
                    <td style={{ padding: '10px 12px', color: ps.overdue > 0 ? 'var(--red)' : 'var(--text)' }}>{ps.overdue > 0 ? `🔴 ${ps.overdue}` : ps.overdue}</td>
                    <td style={{ padding: '10px 12px', color: ps.dueThisWeek > 0 ? 'var(--orange)' : 'var(--text)' }}>{ps.dueThisWeek > 0 ? `🟠 ${ps.dueThisWeek}` : ps.dueThisWeek}</td>
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
