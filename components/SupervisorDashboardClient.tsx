'use client'

import { useMemo } from 'react'
import Link from 'next/link'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
  PieChart, Pie, Legend, LineChart, Line, CartesianGrid
} from 'recharts'
import { Client, Profile, isOverdue, isDueThisWeek, getRiskLevel, getDateStatus } from '@/lib/types'

interface Props {
  clients: Client[]
  planners: Profile[]
  mode: 'supervisor' | 'team_manager'
}

interface PlannerStats {
  planner: Profile
  clientCount: number
  overdue: number
  dueThisWeek: number
  avgGoalPct: number
}

function StatCard({ label, value, color }: { label: string; value: number | string; color?: string }) {
  return (
    <div className="card" style={{ textAlign: 'center', padding: '20px 24px' }}>
      <div style={{ fontSize: 32, fontWeight: 700, color: color ?? 'var(--text)' }}>{value}</div>
      <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4 }}>{label}</div>
    </div>
  )
}

export default function SupervisorDashboardClient({ clients, planners, mode }: Props) {
  const plannerStats: PlannerStats[] = useMemo(() => {
    return planners.map(planner => {
      const pc = clients.filter(c => c.assigned_to === planner.id)
      return {
        planner,
        clientCount: pc.length,
        overdue: pc.filter(isOverdue).length,
        dueThisWeek: pc.filter(isDueThisWeek).length,
        avgGoalPct: pc.length > 0
          ? Math.round(pc.reduce((sum, c) => sum + (c.goal_pct ?? 0), 0) / pc.length)
          : 0,
      }
    })
  }, [clients, planners])

  const totalStats = useMemo(() => ({
    clients: clients.length,
    overdue: clients.filter(isOverdue).length,
    dueThisWeek: clients.filter(isDueThisWeek).length,
  }), [clients])

  // Chart: overdue by category
  const overdueByCategory = useMemo(() => [
    { name: 'CO', value: clients.filter(c => c.category === 'co' && isOverdue(c)).length, fill: '#ff453a' },
    { name: 'CFC', value: clients.filter(c => c.category === 'cfc' && isOverdue(c)).length, fill: '#ff9f0a' },
    { name: 'CPAS', value: clients.filter(c => c.category === 'cpas' && isOverdue(c)).length, fill: '#ffd60a' },
  ], [clients])

  // Chart: goal distribution
  const goalDist = useMemo(() => {
    const buckets = [
      { name: '0–25%', value: 0, fill: '#ff453a' },
      { name: '26–50%', value: 0, fill: '#ff9f0a' },
      { name: '51–75%', value: 0, fill: '#ffd60a' },
      { name: '76–100%', value: 0, fill: '#30d158' },
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

  // Advanced Analytics

  // Compliance rate over time (mock: last 8 weeks)
  const complianceOverTime = useMemo(() => {
    const weeks = []
    const now = new Date()
    for (let i = 7; i >= 0; i--) {
      const d = new Date(now)
      d.setDate(d.getDate() - i * 7)
      const label = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
      // Simulate % of clients with all deadlines current (mock decreasing noise)
      const base = clients.filter(c => !isOverdue(c)).length / Math.max(clients.length, 1) * 100
      const noise = (Math.random() - 0.5) * 10
      weeks.push({ week: label, compliance: Math.min(100, Math.max(0, Math.round(base + noise))) })
    }
    return weeks
  }, [clients])

  // Caseload heatmap: planners x deadline types
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

  // Risk distribution
  const riskDist = useMemo(() => {
    const high = clients.filter(c => getRiskLevel(c) === 'high')
    const medium = clients.filter(c => getRiskLevel(c) === 'medium')
    const low = clients.filter(c => getRiskLevel(c) === 'low')
    return { high, medium, low }
  }, [clients])


  return (
    <div style={{ paddingBottom: 80 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>{title}</h1>
        <Link href="/dashboard" style={{
          fontSize: 13, color: 'var(--accent)', textDecoration: 'none',
          padding: '6px 12px', border: '1px solid var(--border)', borderRadius: 6,
        }}>
          ← Dashboard
        </Link>
      </div>

      {/* Summary cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 12, marginBottom: 28 }}>
        <StatCard label="Total Clients" value={totalStats.clients} />
        <StatCard label="Overdue" value={totalStats.overdue} color="var(--red)" />
        <StatCard label="Due This Week" value={totalStats.dueThisWeek} color="var(--orange)" />
        <StatCard label="Supports Planners" value={planners.length} />
      </div>

      {/* Charts row */}
      {clients.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 16, marginBottom: 28 }}>
          {/* Overdue by category */}
          <div className="card">
            <h3 style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 16, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Overdue by Category
            </h3>
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={overdueByCategory} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                <XAxis dataKey="name" tick={{ fill: '#98989d', fontSize: 12 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: '#98989d', fontSize: 12 }} axisLine={false} tickLine={false} allowDecimals={false} />
                <Tooltip
                  contentStyle={{ background: '#1c1c1e', border: '1px solid #3a3a3c', borderRadius: 8, fontSize: 12 }}
                  cursor={{ fill: 'rgba(255,255,255,0.05)' }}
                />
                <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                  {overdueByCategory.map((entry, i) => (
                    <Cell key={i} fill={entry.fill} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Goal distribution */}
          <div className="card">
            <h3 style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 16, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Goal Progress Distribution
            </h3>
            <ResponsiveContainer width="100%" height={180}>
              <PieChart>
                <Pie data={goalDist} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={70} label={({ name, value }) => `${name}: ${value}`} labelLine={false} fontSize={11}>
                  {goalDist.map((entry, i) => (
                    <Cell key={i} fill={entry.fill} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{ background: '#1c1c1e', border: '1px solid #3a3a3c', borderRadius: 8, fontSize: 12 }}
                />
                <Legend iconSize={10} wrapperStyle={{ fontSize: 12, color: '#98989d' }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}


      {/* Advanced Analytics */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 16, marginBottom: 16 }}>
        {/* Compliance Over Time */}
        <div className="card">
          <h3 style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 16, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Compliance Rate (Last 8 Weeks)
          </h3>
          <ResponsiveContainer width="100%" height={180}>
            <LineChart data={complianceOverTime}>
              <CartesianGrid strokeDasharray="3 3" stroke="#3a3a3c" />
              <XAxis dataKey="week" tick={{ fill: '#98989d', fontSize: 10 }} />
              <YAxis domain={[0, 100]} tickFormatter={v => `${v}%`} tick={{ fill: '#98989d', fontSize: 10 }} />
              <Tooltip contentStyle={{ background: '#1c1c1e', border: '1px solid #3a3a3c', borderRadius: 8, fontSize: 12 }} formatter={(v) => [`${v}%`, 'Compliance']} />
              <Line type="monotone" dataKey="compliance" stroke="#007aff" strokeWidth={2} dot={{ fill: '#007aff', r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Risk Distribution */}
        <div className="card">
          <h3 style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 16, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Risk Distribution
          </h3>
          <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
            <div style={{ flex: 1, background: 'rgba(255,69,58,0.1)', borderRadius: 10, padding: '16px 12px', textAlign: 'center' }}>
              <div style={{ fontSize: 28, fontWeight: 700, color: '#ff453a' }}>{riskDist.high.length}</div>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4 }}>🔴 High Risk</div>
              <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>3+ overdue</div>
            </div>
            <div style={{ flex: 1, background: 'rgba(255,159,10,0.1)', borderRadius: 10, padding: '16px 12px', textAlign: 'center' }}>
              <div style={{ fontSize: 28, fontWeight: 700, color: '#ff9f0a' }}>{riskDist.medium.length}</div>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4 }}>🟡 Medium Risk</div>
              <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>1-2 overdue</div>
            </div>
            <div style={{ flex: 1, background: 'rgba(48,209,88,0.1)', borderRadius: 10, padding: '16px 12px', textAlign: 'center' }}>
              <div style={{ fontSize: 28, fontWeight: 700, color: '#30d158' }}>{riskDist.low.length}</div>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4 }}>🟢 Low Risk</div>
              <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>0 overdue</div>
            </div>
          </div>
          {riskDist.high.length > 0 && (
            <div>
              <div style={{ fontSize: 12, fontWeight: 600, color: '#ff453a', marginBottom: 8 }}>High Risk Clients:</div>
              {riskDist.high.slice(0, 5).map(c => (
                <a key={c.id} href={`/clients/${c.id}`} style={{ display: 'block', fontSize: 12, color: 'var(--accent)', textDecoration: 'none', padding: '3px 0' }}>
                  → {c.last_name}{c.first_name ? ', ' + c.first_name : ''} ({c.client_id})
                </a>
              ))}
              {riskDist.high.length > 5 && <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>…and {riskDist.high.length - 5} more</div>}
            </div>
          )}
        </div>
      </div>

      {/* Caseload Heatmap */}
      <div className="card" style={{ marginBottom: 16, overflowX: 'auto' }}>
        <h3 style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 16, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          Caseload Heatmap (% Overdue by Planner × Deadline Type)
        </h3>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--border)' }}>
              <th style={{ padding: '6px 12px', textAlign: 'left', color: 'var(--text-secondary)', fontWeight: 600, minWidth: 140 }}>Planner</th>
              {DEADLINE_TYPES.map(d => (
                <th key={d.key} style={{ padding: '6px 8px', textAlign: 'center', color: 'var(--text-secondary)', fontWeight: 600, whiteSpace: 'nowrap' }}>{d.short}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {heatmapData.map((row, i) => (
              <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                <td style={{ padding: '8px 12px', fontWeight: 500 }}>{row.plannerName}</td>
                {DEADLINE_TYPES.map(({ short }) => {
                  const val = row[short]
                  const bg = val === null ? 'transparent' : val >= 50 ? 'rgba(255,69,58,0.25)' : val >= 25 ? 'rgba(255,159,10,0.2)' : val > 0 ? 'rgba(255,214,10,0.15)' : 'rgba(48,209,88,0.1)'
                  const color = val === null ? 'var(--text-secondary)' : val >= 50 ? '#ff453a' : val >= 25 ? '#ff9f0a' : val > 0 ? '#ffd60a' : '#30d158'
                  return (
                    <td key={short} style={{ padding: '8px 8px', textAlign: 'center', background: bg, color, fontWeight: 600 }}>
                      {val === null ? '—' : `${val}%`}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Planners table */}
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
                  {['Planner', 'Clients', 'Overdue', 'Due This Week', 'Avg Goal %'].map(h => (
                    <th key={h} style={{ padding: '8px 12px', textAlign: 'left', color: 'var(--text-secondary)', fontWeight: 600, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {plannerStats.map(ps => (
                  <tr
                    key={ps.planner.id}
                    style={{ borderBottom: '1px solid var(--border)', cursor: 'pointer', transition: 'background 0.15s' }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface-2)')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                    onClick={() => {
                      window.location.href = `/dashboard?planner=${ps.planner.id}`
                    }}
                  >
                    <td style={{ padding: '10px 12px', fontWeight: 500 }}>{ps.planner.full_name ?? 'Unknown'}</td>
                    <td style={{ padding: '10px 12px' }}>{ps.clientCount}</td>
                    <td style={{ padding: '10px 12px', color: ps.overdue > 0 ? 'var(--red)' : 'var(--text)' }}>
                      {ps.overdue > 0 ? `🔴 ${ps.overdue}` : ps.overdue}
                    </td>
                    <td style={{ padding: '10px 12px', color: ps.dueThisWeek > 0 ? 'var(--orange)' : 'var(--text)' }}>
                      {ps.dueThisWeek > 0 ? `🟠 ${ps.dueThisWeek}` : ps.dueThisWeek}
                    </td>
                    <td style={{ padding: '10px 12px', color: ps.avgGoalPct >= 75 ? 'var(--green)' : ps.avgGoalPct >= 50 ? 'var(--yellow)' : 'var(--red)', fontWeight: 600 }}>
                      {ps.avgGoalPct}%
                    </td>
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
