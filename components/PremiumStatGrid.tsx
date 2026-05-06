'use client'

import React, { useState } from 'react'
import { useCountUp } from '@/hooks/useCountUp'
import {
  Users, AlertTriangle, Clock, PhoneOff, UserCheck, UserCog, UserX,
} from 'lucide-react'

/* ─── Types ─────────────────────────────────────────────────────────── */

interface StatCardProps {
  label: string
  value: number
  icon: React.ReactNode
  color: string       // hex accent color
  colorRgb: string    // r,g,b for rgba
  active?: boolean
  onClick?: () => void
  /** Optional breakdown segments for the severity ring */
  segments?: { color: string; value: number; label: string }[]
  /** Optional secondary line under the number */
  subtitle?: string
}

/* ─── Severity Ring (SVG donut) ─────────────────────────────────── */

function SeverityRing({ segments, size = 44 }: {
  segments: { color: string; value: number; label: string }[]
  size?: number
}) {
  const total = segments.reduce((s, seg) => s + seg.value, 0)
  if (total === 0) return null

  const radius = 17
  const circumference = 2 * Math.PI * radius
  let offset = 0

  return (
    <svg width={size} height={size} viewBox="0 0 40 40" style={{ transform: 'rotate(-90deg)' }}>
      <circle cx="20" cy="20" r={radius} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="5" />
      {segments.filter(s => s.value > 0).map((seg, i) => {
        const pct = seg.value / total
        const dashLen = circumference * pct
        const dashOffset = circumference * offset
        offset += pct
        return (
          <circle
            key={i}
            cx="20" cy="20" r={radius}
            fill="none"
            stroke={seg.color}
            strokeWidth="5"
            strokeDasharray={`${dashLen} ${circumference - dashLen}`}
            strokeDashoffset={-dashOffset}
            strokeLinecap="round"
            style={{
              transition: 'stroke-dasharray 0.8s ease, stroke-dashoffset 0.8s ease',
              filter: `drop-shadow(0 0 3px ${seg.color}40)`,
            }}
          />
        )
      })}
    </svg>
  )
}

/* ─── Single Premium Stat Card ──────────────────────────────────── */

function PremiumStatCard({
  label, value, icon, color, colorRgb, active, onClick, segments, subtitle,
}: StatCardProps) {
  const animated = useCountUp(value)
  const [hovered, setHovered] = useState(false)

  return (
    <button
      type="button"
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className="premium-stat-card"
      style={{
        position: 'relative',
        overflow: 'hidden',
        textAlign: 'left',
        padding: '20px 18px 16px',
        borderRadius: 16,
        border: active
          ? `1px solid rgba(${colorRgb}, 0.6)`
          : '1px solid rgba(255,255,255,0.06)',
        background: active
          ? `linear-gradient(135deg, rgba(${colorRgb}, 0.14) 0%, rgba(${colorRgb}, 0.04) 100%)`
          : 'linear-gradient(135deg, rgba(255,255,255,0.04) 0%, rgba(255,255,255,0.01) 100%)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        cursor: onClick ? 'pointer' : 'default',
        transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
        transform: hovered ? 'translateY(-2px)' : 'translateY(0)',
        boxShadow: hovered
          ? `0 8px 32px rgba(${colorRgb}, 0.15), 0 0 0 1px rgba(${colorRgb}, 0.12)`
          : '0 2px 8px rgba(0,0,0,0.15)',
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        minHeight: 110,
      }}
    >
      {/* Glow orb */}
      <div style={{
        position: 'absolute',
        top: -30,
        right: -30,
        width: 80,
        height: 80,
        borderRadius: '50%',
        background: `radial-gradient(circle, rgba(${colorRgb}, ${hovered ? 0.2 : 0.08}) 0%, transparent 70%)`,
        transition: 'all 0.4s ease',
        pointerEvents: 'none',
      }} />

      {/* Top row: icon + severity ring */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div style={{
          width: 36, height: 36, borderRadius: 10,
          background: `rgba(${colorRgb}, 0.12)`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color,
          flexShrink: 0,
        }}>
          {icon}
        </div>
        {segments && segments.length > 0 && (
          <SeverityRing segments={segments} />
        )}
      </div>

      {/* Number */}
      <div style={{
        fontSize: 34,
        fontWeight: 800,
        color,
        lineHeight: 1,
        letterSpacing: '-0.02em',
        fontVariantNumeric: 'tabular-nums',
      }}>
        {animated}
      </div>

      {/* Label + subtitle */}
      <div>
        <div style={{
          fontSize: 12,
          fontWeight: 600,
          color: 'var(--text-secondary)',
          letterSpacing: '0.02em',
          lineHeight: 1.3,
        }}>
          {label}
        </div>
        {subtitle && (
          <div style={{
            fontSize: 10,
            color: `rgba(${colorRgb}, 0.7)`,
            marginTop: 2,
            fontWeight: 500,
          }}>
            {subtitle}
          </div>
        )}
      </div>

      {/* Bottom shimmer line */}
      <div style={{
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        height: 2,
        background: active
          ? `linear-gradient(90deg, transparent, rgba(${colorRgb}, 0.5), transparent)`
          : 'transparent',
        transition: 'background 0.3s ease',
      }} />

      {/* Hover ring tooltip for severity segments */}
      {hovered && segments && segments.some(s => s.value > 0) && (
        <div style={{
          position: 'absolute',
          top: 6,
          right: 52,
          background: 'rgba(15,15,17,0.95)',
          border: '1px solid rgba(255,255,255,0.1)',
          borderRadius: 8,
          padding: '6px 10px',
          fontSize: 10,
          lineHeight: 1.6,
          zIndex: 10,
          whiteSpace: 'nowrap',
          boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
        }}>
          {segments.filter(s => s.value > 0).map((seg, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: seg.color, flexShrink: 0 }} />
              <span style={{ color: 'var(--text-secondary)' }}>{seg.label}:</span>
              <span style={{ color: 'var(--text)', fontWeight: 700 }}>{seg.value}</span>
            </div>
          ))}
        </div>
      )}
    </button>
  )
}

/* ─── Stat Card Grid (exported) ─────────────────────────────────── */

interface StatGridProps {
  totalClients: number
  overdue: number
  dueThisWeek: number
  noContact: number
  plannerCount: number
  tmCount: number
  unassignedPlanners: number
  /** Overdue breakdown by severity */
  criticalCount?: number
  redCount?: number
  activeFilter?: string | null
  onFilterClick?: (filter: string) => void
  onRosterClick?: (filter: string) => void
  activeRosterFilter?: string | null
}

export default function PremiumStatGrid({
  totalClients, overdue, dueThisWeek, noContact,
  plannerCount, tmCount, unassignedPlanners,
  criticalCount = 0, redCount = 0,
  activeFilter, onFilterClick, onRosterClick, activeRosterFilter,
}: StatGridProps) {
  const overdueSegments = [
    { color: '#ff453a', value: criticalCount, label: 'Critical (14d+)' },
    { color: '#ff6b5a', value: redCount, label: 'Overdue (1-14d)' },
  ]

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))',
      gap: 12,
      marginBottom: 24,
    }}>
      <PremiumStatCard
        label="Active Clients"
        value={totalClients}
        icon={<Users size={18} />}
        color="var(--text)"
        colorRgb="255,255,255"
        active={activeFilter === 'all'}
        onClick={() => onFilterClick?.('all')}
      />
      <PremiumStatCard
        label="Overdue"
        value={overdue}
        icon={<AlertTriangle size={18} />}
        color="#ff453a"
        colorRgb="255,69,58"
        active={activeFilter === 'overdue'}
        onClick={() => onFilterClick?.('overdue')}
        segments={overdueSegments}
        subtitle={criticalCount > 0 ? `${criticalCount} critical` : undefined}
      />
      <PremiumStatCard
        label="Due This Week"
        value={dueThisWeek}
        icon={<Clock size={18} />}
        color="#ff9f0a"
        colorRgb="255,159,10"
        active={activeFilter === 'due_this_week'}
        onClick={() => onFilterClick?.('due_this_week')}
      />
      <PremiumStatCard
        label="No Contact 7+ Days"
        value={noContact}
        icon={<PhoneOff size={18} />}
        color="#ffd60a"
        colorRgb="255,214,10"
        active={activeFilter === 'no_contact_7'}
        onClick={() => onFilterClick?.('no_contact_7')}
      />
      <PremiumStatCard
        label="Support Planners"
        value={plannerCount}
        icon={<UserCheck size={18} />}
        color="var(--text)"
        colorRgb="255,255,255"
        active={activeRosterFilter === 'planners'}
        onClick={() => onRosterClick?.('planners')}
      />
      <PremiumStatCard
        label="Team Managers"
        value={tmCount}
        icon={<UserCog size={18} />}
        color="var(--text)"
        colorRgb="255,255,255"
        active={activeRosterFilter === 'team_managers'}
        onClick={() => onRosterClick?.('team_managers')}
      />
      {unassignedPlanners > 0 && (
        <PremiumStatCard
          label="Unassigned Planners"
          value={unassignedPlanners}
          icon={<UserX size={18} />}
          color={unassignedPlanners > 0 ? '#ff9f0a' : '#30d158'}
          colorRgb={unassignedPlanners > 0 ? '255,159,10' : '48,209,88'}
          active={activeRosterFilter === 'unassigned_planners'}
          onClick={() => onRosterClick?.('unassigned_planners')}
        />
      )}
    </div>
  )
}
