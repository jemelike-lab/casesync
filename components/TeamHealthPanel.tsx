'use client'

import { useMemo, useState } from 'react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts'
import { Profile } from '@/lib/types'
import { AssigneeSummaryRow } from '@/lib/dashboard-summary'

interface Props {
  planners: Profile[]
  summaryByAssignee: Record<string, AssigneeSummaryRow>
}

type MetricTab = 'overdue' | 'caseload' | 'quiet'

const TAB_CONFIG: Record<MetricTab, { label: string; color: string; colorRgb: string; key: keyof AssigneeSummaryRow; barLabel: string }> = {
  overdue: { label: 'Overdue Rate', color: '#ff453a', colorRgb: '255,69,58', key: 'overdue_clients', barLabel: 'Overdue' },
  caseload: { label: 'Caseload Size', color: '#007aff', colorRgb: '0,122,255', key: 'total_clients', barLabel: 'Clients' },
  quiet: { label: 'No Contact 15d+', color: '#ffd60a', colorRgb: '255,214,10', key: 'no_contact_7_days_clients', barLabel: 'Quiet' },
}

function getBarColor(metric: MetricTab, value: number): string {
  if (metric === 'overdue') {
    if (value >= 5) return '#ff453a'
    if (value >= 3) return '#ff6b5a'
    if (value >= 1) return '#ff9f0a'
    return '#30d158'
  }
  if (metric === 'caseload') {
    if (value >= 40) return '#ff453a'
    if (value >= 30) return '#ff9f0a'
    return '#007aff'
  }
  // quiet
  if (value >= 5) return '#ff9f0a'
  if (value >= 3) return '#ffd60a'
  return '#30d158'
}

/* eslint-disable @typescript-eslint/no-explicit-any */
function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null
  return (
    <div style={{
      background: 'rgba(15,15,17,0.95)',
      border: '1px solid rgba(255,255,255,0.1)',
      borderRadius: 10,
      padding: '10px 14px',
      boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
      fontSize: 12,
    }}>
      <div style={{ fontWeight: 700, color: 'var(--text)', marginBottom: 4 }}>{label}</div>
      {payload.map((p: any, i: number) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ width: 8, height: 8, borderRadius: 2, background: p.fill || p.color, flexShrink: 0 }} />
          <span style={{ color: 'var(--text-secondary)' }}>{p.name}:</span>
          <span style={{ fontWeight: 700, color: 'var(--text)' }}>{p.value}</span>
        </div>
      ))}
    </div>
  )
}

export default function TeamHealthPanel({ planners, summaryByAssignee }: Props) {
  const [activeTab, setActiveTab] = useState<MetricTab>('overdue')
  const config = TAB_CONFIG[activeTab]

  const chartData = useMemo(() => {
    return planners
      .map(planner => {
        const summary = summaryByAssignee[planner.id]
        const firstName = planner.full_name?.split(' ')[0] ?? '?'
        return {
          name: firstName,
          fullName: planner.full_name ?? 'Unknown',
          value: (summary?.[config.key] as number) ?? 0,
          total: summary?.total_clients ?? 0,
        }
      })
      .sort((a, b) => b.value - a.value)
  }, [planners, summaryByAssignee, config.key])

  const maxVal = Math.max(...chartData.map(d => d.value), 1)

  return (
    <div className="card" style={{
      background: 'linear-gradient(135deg, rgba(255,255,255,0.03) 0%, rgba(255,255,255,0.01) 100%)',
      backdropFilter: 'blur(20px)',
      WebkitBackdropFilter: 'blur(20px)',
      border: '1px solid rgba(255,255,255,0.06)',
      overflow: 'hidden',
    }}>
      {/* Header with tabs */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 10 }}>
        <h2 style={{
          fontSize: 14, fontWeight: 600, margin: 0,
          color: 'var(--text-secondary)',
          textTransform: 'uppercase',
          letterSpacing: '0.06em',
        }}>
          Team Health
        </h2>
        <div style={{ display: 'flex', gap: 4, background: 'rgba(255,255,255,0.04)', borderRadius: 8, padding: 3 }}>
          {(Object.keys(TAB_CONFIG) as MetricTab[]).map(tab => (
            <button
              key={tab}
              type="button"
              onClick={() => setActiveTab(tab)}
              style={{
                fontSize: 11,
                fontWeight: activeTab === tab ? 700 : 500,
                padding: '5px 12px',
                borderRadius: 6,
                border: 'none',
                cursor: 'pointer',
                color: activeTab === tab ? 'var(--text)' : 'var(--text-secondary)',
                background: activeTab === tab
                  ? `rgba(${TAB_CONFIG[tab].colorRgb}, 0.15)`
                  : 'transparent',
                transition: 'all 0.2s ease',
              }}
            >
              {TAB_CONFIG[tab].label}
            </button>
          ))}
        </div>
      </div>

      {/* Chart */}
      {chartData.length > 0 ? (
        <div style={{ width: '100%', height: Math.max(160, chartData.length * 40 + 20) }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={chartData}
              layout="vertical"
              margin={{ top: 0, right: 20, bottom: 0, left: 4 }}
              barCategoryGap="20%"
            >
              <XAxis
                type="number"
                domain={[0, Math.ceil(maxVal * 1.15)]}
                tick={{ fill: 'var(--text-secondary)', fontSize: 10 }}
                axisLine={{ stroke: 'rgba(255,255,255,0.06)' }}
                tickLine={false}
              />
              <YAxis
                type="category"
                dataKey="name"
                width={70}
                tick={{ fill: 'var(--text-secondary)', fontSize: 11, fontWeight: 500 }}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(255,255,255,0.03)' }} />
              <Bar
                dataKey="value"
                name={config.barLabel}
                radius={[0, 6, 6, 0]}
                maxBarSize={28}
              >
                {chartData.map((entry, i) => (
                  <Cell
                    key={i}
                    fill={getBarColor(activeTab, entry.value)}
                    style={{ filter: `drop-shadow(0 0 4px ${getBarColor(activeTab, entry.value)}30)` }}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <div style={{ fontSize: 13, color: 'var(--text-secondary)', padding: 20, textAlign: 'center' }}>
          No planner data available.
        </div>
      )}

      {/* Summary row */}
      <div style={{
        display: 'flex',
        gap: 16,
        marginTop: 16,
        paddingTop: 14,
        borderTop: '1px solid rgba(255,255,255,0.06)',
        flexWrap: 'wrap',
      }}>
        {chartData.filter(d => d.value > 0).slice(0, 3).map((d, i) => (
          <div key={i} style={{
            display: 'flex', alignItems: 'center', gap: 8,
            fontSize: 12, color: 'var(--text-secondary)',
          }}>
            <span style={{
              width: 8, height: 8, borderRadius: 2,
              background: getBarColor(activeTab, d.value),
              flexShrink: 0,
            }} />
            <span>
              <strong style={{ color: 'var(--text)' }}>{d.fullName}</strong>
              {' — '}{d.value} {config.barLabel.toLowerCase()}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
