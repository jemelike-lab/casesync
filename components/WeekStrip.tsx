'use client'

import { useMemo } from 'react'
import { Client, getDateStatus } from '@/lib/types'

interface Props {
  clients: Client[]
  onDayFilter?: (dateStr: string | null) => void
  activeDayFilter?: string | null
}

const DEADLINE_DATE_FIELDS: (keyof Client)[] = [
  'eligibility_end_date',
  'three_month_visit_due',
  'quarterly_waiver_date',
  'med_tech_redet_date',
  'pos_deadline',
  'assessment_due',
  'thirty_day_letter_date',
  'co_financial_redet_date',
  'co_app_date',
  'mfp_consent_date',
  'two57_date',
  'doc_mdh_date',
  'spm_next_due',
]

function toDateKey(date: Date): string {
  return date.toISOString().split('T')[0]
}

export default function WeekStrip({ clients, onDayFilter, activeDayFilter }: Props) {
  const days = useMemo(() => {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(today)
      d.setDate(today.getDate() + i)
      return d
    })
  }, [])

  const countsByDate = useMemo(() => {
    const map: Record<string, number> = {}
    for (const client of clients) {
      for (const field of DEADLINE_DATE_FIELDS) {
        const dateStr = client[field] as string | null
        if (!dateStr) continue
        const key = dateStr.split('T')[0]
        // Only count dates within the 7-day window
        map[key] = (map[key] ?? 0) + 1
      }
    }
    return map
  }, [clients])

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

        // Color based on count
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
