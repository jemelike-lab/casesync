'use client'

import { useMemo } from 'react'

interface Props {
  countsByDate?: Record<string, number>
  onDayFilter?: (dateStr: string | null) => void
  activeDayFilter?: string | null
}

function toDateKey(date: Date): string {
  // Local-date key (2026-07-12 audit, P3): toISOString() derives the UTC
  // day, which shifts a day for users east of UTC. Format from local
  // getters so the key always matches the day the strip renders.
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

export default function WeekStrip({ countsByDate = {}, onDayFilter, activeDayFilter }: Props) {
  const days = useMemo(() => {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(today)
      d.setDate(today.getDate() + i)
      return d
    })
  }, [])

  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: 'repeat(7, 1fr)',
      gap: 6,
      marginBottom: 20,
    }}>
      {days.map((day, i) => {
        const key = toDateKey(day)
        const count = countsByDate[key] ?? 0
        const isToday = i === 0
        const isActive = activeDayFilter === key

        let gradient: string
        let textColor: string
        let borderColor: string
        let glowShadow = 'none'

        if (count > 3) {
          gradient = 'linear-gradient(160deg, #3d1219 0%, #4a1520 100%)'
          textColor = '#ff6b6b'
          borderColor = 'rgba(255,69,58,0.3)'
          glowShadow = '0 4px 12px rgba(255,69,58,0.15)'
        } else if (count >= 2) {
          gradient = 'linear-gradient(160deg, #2d2210 0%, #352a12 100%)'
          textColor = '#ffb340'
          borderColor = 'rgba(255,159,10,0.25)'
          glowShadow = '0 4px 12px rgba(255,159,10,0.1)'
        } else if (count === 1) {
          gradient = 'linear-gradient(160deg, #2a2a10 0%, #303012 100%)'
          textColor = '#ffe066'
          borderColor = 'rgba(255,214,10,0.2)'
        } else {
          gradient = 'linear-gradient(160deg, rgba(255,255,255,0.02) 0%, rgba(255,255,255,0.005) 100%)'
          textColor = 'var(--text-secondary)'
          borderColor = 'rgba(255,255,255,0.05)'
        }

        if (isActive) {
          borderColor = 'rgba(0,122,255,0.5)'
          glowShadow = '0 0 0 2px rgba(0,122,255,0.2), 0 4px 12px rgba(0,122,255,0.15)'
        }

        return (
          <button
            key={key}
            onClick={() => onDayFilter?.(isActive ? null : key)}
            style={{
              background: gradient,
              border: `1px solid ${borderColor}`,
              borderRadius: 14,
              padding: '10px 4px',
              cursor: onDayFilter ? 'pointer' : 'default',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 4,
              transition: 'all 0.25s ease',
              boxShadow: glowShadow,
              outline: isToday ? '2px solid rgba(0,122,255,0.35)' : 'none',
              outlineOffset: 2,
            }}
          >
            <span style={{
              fontSize: 10, fontWeight: isToday ? 800 : 500,
              color: isToday ? '#5ac8fa' : 'rgba(255,255,255,0.35)',
              textTransform: 'uppercase', letterSpacing: '0.06em',
            }}>
              {isToday ? 'Today' : dayNames[day.getDay()]}
            </span>
            <span style={{
              fontSize: 20,
              fontWeight: 800,
              color: count > 0 ? textColor : 'rgba(255,255,255,0.15)',
              lineHeight: 1,
              textShadow: count > 0 ? `0 1px 6px ${textColor}30` : 'none',
            }}>
              {count}
            </span>
            <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.25)', fontWeight: 500 }}>
              {day.getMonth() + 1}/{day.getDate()}
            </span>
          </button>
        )
      })}
    </div>
  )
}
