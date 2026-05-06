'use client'

import React, { useState, useEffect } from 'react'
import { useCountUp } from '@/hooks/useCountUp'
import {
  Users, AlertTriangle, Clock, PhoneOff, UserCheck, UserCog, UserX,
} from 'lucide-react'

/* ─── Animated Arc (SVG progress ring) ───────────────────────────── */

function ProgressArc({ pct, color, size = 56 }: { pct: number; color: string; size?: number }) {
  const [animPct, setAnimPct] = useState(0)
  useEffect(() => {
    const timer = setTimeout(() => setAnimPct(Math.min(pct, 100)), 100)
    return () => clearTimeout(timer)
  }, [pct])

  const r = (size - 6) / 2
  const circ = 2 * Math.PI * r
  const dashLen = circ * (animPct / 100)

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ transform: 'rotate(-90deg)' }}>
      <circle
        cx={size / 2} cy={size / 2} r={r}
        fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="5"
      />
      <circle
        cx={size / 2} cy={size / 2} r={r}
        fill="none" stroke={color} strokeWidth="5"
        strokeDasharray={`${dashLen} ${circ - dashLen}`}
        strokeLinecap="round"
        style={{
          transition: 'stroke-dasharray 1.2s cubic-bezier(0.4, 0, 0.2, 1)',
          filter: `drop-shadow(0 0 6px ${color}80)`,
        }}
      />
    </svg>
  )
}

/* ─── Hero Stat Card ─────────────────────────────────────────────── */

interface HeroCardProps {
  label: string
  value: number
  total?: number
  icon: React.ReactNode
  gradient: string
  glowColor: string
  active?: boolean
  onClick?: () => void
  subtitle?: string
  delay?: number
}

function HeroStatCard({ label, value, total, icon, gradient, glowColor, active, onClick, subtitle, delay = 0 }: HeroCardProps) {
  const animated = useCountUp(value, 1000)
  const [hovered, setHovered] = useState(false)
  const [entered, setEntered] = useState(false)

  useEffect(() => {
    const timer = setTimeout(() => setEntered(true), delay)
    return () => clearTimeout(timer)
  }, [delay])

  const pct = total && total > 0 ? Math.round((value / total) * 100) : 0

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
        padding: 0,
        borderRadius: 20,
        border: active ? '2px solid rgba(255,255,255,0.3)' : '1px solid rgba(255,255,255,0.06)',
        background: gradient,
        cursor: onClick ? 'pointer' : 'default',
        opacity: entered ? 1 : 0,
        transform: entered
          ? hovered ? 'translateY(-4px) scale(1.02)' : 'translateY(0) scale(1)'
          : 'translateY(20px) scale(0.95)',
        transition: 'all 0.5s cubic-bezier(0.4, 0, 0.2, 1)',
        boxShadow: hovered
          ? `0 20px 60px ${glowColor}40, 0 0 0 1px rgba(255,255,255,0.1), inset 0 1px 0 rgba(255,255,255,0.1)`
          : `0 4px 20px ${glowColor}20, inset 0 1px 0 rgba(255,255,255,0.06)`,
        minHeight: 140,
      }}
    >
      {/* Noise texture overlay */}
      <div style={{
        position: 'absolute', inset: 0, borderRadius: 20,
        background: 'url("data:image/svg+xml,%3Csvg viewBox=\'0 0 256 256\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cfilter id=\'noise\'%3E%3CfeTurbulence type=\'fractalNoise\' baseFrequency=\'0.9\' numOctaves=\'4\' stitchTiles=\'stitch\'/%3E%3C/filter%3E%3Crect width=\'100%25\' height=\'100%25\' filter=\'url(%23noise)\' opacity=\'0.03\'/%3E%3C/svg%3E")',
        pointerEvents: 'none', opacity: 0.5,
      }} />

      {/* Animated shimmer sweep */}
      <div className={hovered ? 'shimmer-sweep' : ''} style={{
        position: 'absolute', inset: 0,
        background: 'linear-gradient(105deg, transparent 40%, rgba(255,255,255,0.08) 50%, transparent 60%)',
        backgroundSize: '200% 100%',
        pointerEvents: 'none',
      }} />

      {/* Content */}
      <div style={{ position: 'relative', zIndex: 1, padding: '20px 20px 18px' }}>
        {/* Top row: icon + arc */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
          <div style={{
            width: 42, height: 42, borderRadius: 12,
            background: 'rgba(255,255,255,0.15)',
            backdropFilter: 'blur(8px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#fff',
            boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.2), 0 2px 8px rgba(0,0,0,0.2)',
          }}>
            {icon}
          </div>
          {total && total > 0 && pct > 0 && (
            <div style={{ position: 'relative' }}>
              <ProgressArc pct={pct} color="rgba(255,255,255,0.9)" size={48} />
              <div style={{
                position: 'absolute', inset: 0,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 11, fontWeight: 800, color: 'rgba(255,255,255,0.9)',
              }}>
                {pct}%
              </div>
            </div>
          )}
        </div>

        {/* Number */}
        <div style={{
          fontSize: 44,
          fontWeight: 900,
          color: '#fff',
          lineHeight: 1,
          letterSpacing: '-0.03em',
          fontVariantNumeric: 'tabular-nums',
          textShadow: '0 2px 12px rgba(0,0,0,0.3)',
        }}>
          {animated}
        </div>

        {/* Label */}
        <div style={{
          fontSize: 13,
          fontWeight: 600,
          color: 'rgba(255,255,255,0.75)',
          marginTop: 6,
          letterSpacing: '0.01em',
        }}>
          {label}
        </div>
        {subtitle && (
          <div style={{
            fontSize: 11,
            color: 'rgba(255,255,255,0.5)',
            marginTop: 2,
            fontWeight: 500,
          }}>
            {subtitle}
          </div>
        )}
      </div>

      {/* Active indicator bar */}
      {active && (
        <div style={{
          position: 'absolute', bottom: 0, left: 0, right: 0, height: 3,
          background: 'rgba(255,255,255,0.6)',
          borderRadius: '0 0 20px 20px',
          boxShadow: '0 0 12px rgba(255,255,255,0.4)',
        }} />
      )}
    </button>
  )
}

/* ─── Compact Stat Pill (for secondary stats) ────────────────────── */

function StatPill({ label, value, icon, active, onClick, color }: {
  label: string; value: number; icon: React.ReactNode; active?: boolean; onClick?: () => void; color?: string
}) {
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
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '10px 16px',
        borderRadius: 14,
        border: active ? '1px solid rgba(255,255,255,0.2)' : '1px solid rgba(255,255,255,0.06)',
        background: active
          ? 'rgba(255,255,255,0.08)'
          : 'linear-gradient(135deg, rgba(255,255,255,0.03) 0%, rgba(255,255,255,0.01) 100%)',
        cursor: onClick ? 'pointer' : 'default',
        transition: 'all 0.25s ease',
        transform: hovered ? 'translateY(-1px)' : 'none',
        boxShadow: hovered ? '0 4px 16px rgba(0,0,0,0.2)' : 'none',
        textAlign: 'left',
      }}
    >
      <div style={{
        width: 32, height: 32, borderRadius: 8,
        background: 'rgba(255,255,255,0.06)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: color ?? 'var(--text-secondary)',
        flexShrink: 0,
      }}>
        {icon}
      </div>
      <div>
        <div style={{ fontSize: 20, fontWeight: 800, color: color ?? 'var(--text)', lineHeight: 1 }}>{animated}</div>
        <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 2, fontWeight: 500 }}>{label}</div>
      </div>
    </button>
  )
}

/* ─── Exported Grid ──────────────────────────────────────────────── */

interface StatGridProps {
  totalClients: number
  overdue: number
  dueThisWeek: number
  noContact: number
  plannerCount: number
  tmCount: number
  unassignedPlanners: number
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
  activeFilter, onFilterClick, onRosterClick, activeRosterFilter,
}: StatGridProps) {
  return (
    <div style={{ marginBottom: 28 }}>
      {/* Hero row — 4 big cards with staggered entrance */}
      <div className="stat-hero-grid" style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(4, 1fr)',
        gap: 14,
        marginBottom: 14,
      }}>
        <HeroStatCard
          label="Active Clients"
          value={totalClients}
          icon={<Users size={20} strokeWidth={2.5} />}
          gradient="linear-gradient(135deg, #1a1c2e 0%, #2a2d4a 50%, #1e2040 100%)"
          glowColor="#4a5080"
          active={activeFilter === 'all'}
          onClick={() => onFilterClick?.('all')}
          delay={0}
        />
        <HeroStatCard
          label="Overdue"
          value={overdue}
          total={totalClients}
          icon={<AlertTriangle size={20} strokeWidth={2.5} />}
          gradient="linear-gradient(135deg, #3d1219 0%, #6b1d2a 50%, #4a1520 100%)"
          glowColor="#ff453a"
          active={activeFilter === 'overdue'}
          onClick={() => onFilterClick?.('overdue')}
          subtitle={overdue > 0 ? `${Math.round((overdue / Math.max(totalClients, 1)) * 100)}% of caseload` : undefined}
          delay={60}
        />
        <HeroStatCard
          label="Due This Week"
          value={dueThisWeek}
          total={totalClients}
          icon={<Clock size={20} strokeWidth={2.5} />}
          gradient="linear-gradient(135deg, #2d2210 0%, #4a3818 50%, #352a12 100%)"
          glowColor="#ff9f0a"
          active={activeFilter === 'due_this_week'}
          onClick={() => onFilterClick?.('due_this_week')}
          delay={120}
        />
        <HeroStatCard
          label="No Contact 7+ Days"
          value={noContact}
          total={totalClients}
          icon={<PhoneOff size={20} strokeWidth={2.5} />}
          gradient="linear-gradient(135deg, #2a2a10 0%, #484818 50%, #363612 100%)"
          glowColor="#ffd60a"
          active={activeFilter === 'no_contact_7'}
          onClick={() => onFilterClick?.('no_contact_7')}
          delay={180}
        />
      </div>

      {/* Secondary row — compact pills */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <StatPill
          label="Support Planners"
          value={plannerCount}
          icon={<UserCheck size={16} />}
          active={activeRosterFilter === 'planners'}
          onClick={() => onRosterClick?.('planners')}
        />
        <StatPill
          label="Team Managers"
          value={tmCount}
          icon={<UserCog size={16} />}
          active={activeRosterFilter === 'team_managers'}
          onClick={() => onRosterClick?.('team_managers')}
        />
        {unassignedPlanners > 0 && (
          <StatPill
            label="Unassigned Planners"
            value={unassignedPlanners}
            icon={<UserX size={16} />}
            color="#ff9f0a"
            active={activeRosterFilter === 'unassigned_planners'}
            onClick={() => onRosterClick?.('unassigned_planners')}
          />
        )}
      </div>
    </div>
  )
}
