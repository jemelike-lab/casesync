'use client'

import { useMemo } from 'react'
import Link from 'next/link'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
  PieChart, Pie, Legend
} from 'recharts'
import { Client, Profile, isOverdue, isDueThisWeek } from '@/lib/types'

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
