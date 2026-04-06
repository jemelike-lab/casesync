'use client'

import { useMemo } from 'react'

interface Props {
  countsByDate?: Record<string, number>
  onDayFilter?: (dateStr: string | null) => void
  activeDayFilter?: string | null
}

function toDateKey(date: Date): string {
  return date.toISOString().split('T')[0]
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

        let bg: string
        let color: string
        let border: string
        if (count > 3) {
          bg = 'rgba(255,69,58,0.15)'
          color = '#ff453a'
          border = 'rgba(255,69,58,0.4)'
        } else if (count >= 2) {
          bg = 'rgba(255,159,10,0.15)'
          color = '#ff9f0a'
          border = 'rgba(255,159,10,0.4)'
        } else if (count === 1) {
          bg = 'rgba(255,214,10,0.12)'
          color = '#ffd60a'
          border = 'rgba(255,214,10,0.3)'
        } else {
          bg = 'var(--surface-2)'
          color = 'var(--text-secondary)'
          border = 'var(--border)'
        }

        if (isActive) {
          bg = count > 0 ? bg : 'rgba(0,122,255,0.15)'
          border = 'var(--accent)'
        }

        return (
          <button
            key={key}
            onClick={() => onDayFilter?.(isActive ? null : key)}
            style={{
              background: bg,
              border: `1px solid ${border}`,
              borderRadius: 8,
              padding: '8px 4px',
              cursor: onDayFilter ? 'pointer' : 'default',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 4,
              transition: 'all 0.15s',
              outline: isToday ? `2px solid rgba(0,122,255,0.4)` : 'none',
              outlineOffset: 1,
            }}
          >
            <span style={{ fontSize: 10, color: isToday ? 'var(--accent)' : 'var(--text-secondary)', fontWeight: isToday ? 700 : 400, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              {isToday ? 'Today' : dayNames[day.getDay()]}
            </span>
            <span style={{
              fontSize: 16,
              fontWeight: 700,
              color: count > 0 ? color : 'var(--text-secondary)',
            }}>
              {count}
            </span>
            <span style={{ fontSize: 9, color: 'var(--text-secondary)' }}>
              {day.getMonth() + 1}/{day.getDate()}
            </span>
          </button>
        )
      })}
    </div>
  )
}
