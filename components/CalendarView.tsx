'use client'

import { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { Client } from '@/lib/types'

interface Props {
  clients: Client[]
  showAll: boolean
  onToggleShowAll?: () => void
  canToggle: boolean
}

const DEADLINE_FIELDS: { key: keyof Client; label: string }[] = [
  { key: 'eligibility_end_date', label: 'Eligibility End' },
  { key: 'three_month_visit_due', label: '3-Month Visit' },
  { key: 'pos_deadline', label: 'POS Deadline' },
  { key: 'assessment_due', label: 'Assessment Due' },
  { key: 'thirty_day_letter_date', label: '30-Day Letter' },
  { key: 'spm_next_due', label: 'SPM Due' },
  { key: 'co_financial_redet_date', label: 'CO Financial Redet' },
]

interface DeadlineEvent {
  clientId: string
  clientName: string
  label: string
  date: string
  urgency: 'overdue' | 'this_week' | 'this_month' | 'future'
}

function getUrgency(dateStr: string): DeadlineEvent['urgency'] {
  const date = new Date(dateStr)
  const now = new Date()
  now.setHours(0, 0, 0, 0)
  const diff = Math.ceil((date.getTime() - now.getTime()) / 86400000)
  if (diff < 0) return 'overdue'
  if (diff <= 7) return 'this_week'
  if (diff <= 30) return 'this_month'
  return 'future'
}

const URGENCY_COLORS: Record<DeadlineEvent['urgency'], string> = {
  overdue: '#ff453a',
  this_week: '#ff9f0a',
  this_month: '#ffd60a',
  future: '#30d158',
}

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

export default function CalendarView({ clients, showAll, onToggleShowAll, canToggle }: Props) {
  const router = useRouter()
  const today = new Date()
  const [year, setYear] = useState(today.getFullYear())
  const [month, setMonth] = useState(today.getMonth())
  const [selectedDate, setSelectedDate] = useState<string | null>(null)

  const events: Map<string, DeadlineEvent[]> = useMemo(() => {
    const map = new Map<string, DeadlineEvent[]>()
    clients.forEach(client => {
      const name = `${client.last_name}${client.first_name ? ', ' + client.first_name : ''}`
      DEADLINE_FIELDS.forEach(({ key, label }) => {
        const dateStr = client[key] as string | null
        if (!dateStr) return
        const dateKey = dateStr.split('T')[0]
        const evt: DeadlineEvent = {
          clientId: client.id,
          clientName: name,
          label,
          date: dateKey,
          urgency: getUrgency(dateKey),
        }
        if (!map.has(dateKey)) map.set(dateKey, [])
        map.get(dateKey)!.push(evt)
      })
    })
    return map
  }, [clients])

  const firstDay = new Date(year, month, 1).getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const cells: (number | null)[] = [
    ...Array(firstDay).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ]
  // Pad to 6 rows
  while (cells.length % 7 !== 0) cells.push(null)

  function prevMonth() {
    if (month === 0) { setYear(y => y - 1); setMonth(11) }
    else setMonth(m => m - 1)
    setSelectedDate(null)
  }
  function nextMonth() {
    if (month === 11) { setYear(y => y + 1); setMonth(0) }
    else setMonth(m => m + 1)
    setSelectedDate(null)
  }

  function dateKey(day: number) {
    return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
  }

  const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December']

  const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`

  const selectedEvents = selectedDate ? (events.get(selectedDate) ?? []) : []

  return (
    <div>
      {/* Controls */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button onClick={prevMonth} style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 8, padding: '6px 12px', color: 'var(--text)', cursor: 'pointer', fontSize: 16 }}>←</button>
          <span style={{ fontSize: 18, fontWeight: 700, minWidth: 180, textAlign: 'center' }}>{monthNames[month]} {year}</span>
          <button onClick={nextMonth} style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 8, padding: '6px 12px', color: 'var(--text)', cursor: 'pointer', fontSize: 16 }}>→</button>
          <button onClick={() => { setYear(today.getFullYear()); setMonth(today.getMonth()) }} style={{ background: 'none', border: '1px solid var(--border)', borderRadius: 8, padding: '6px 12px', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: 12 }}>Today</button>
        </div>
        {canToggle && onToggleShowAll && (
          <button onClick={onToggleShowAll} className="btn-secondary" style={{ fontSize: 12 }}>
            {showAll ? '👤 My Clients' : '👥 All Clients'}
          </button>
        )}
      </div>

      {/* Legend */}
      <div style={{ display: 'flex', gap: 16, marginBottom: 16, flexWrap: 'wrap' }}>
        {[
          { label: 'Overdue', color: '#ff453a' },
          { label: 'This Week', color: '#ff9f0a' },
          { label: 'This Month', color: '#ffd60a' },
          { label: 'Future', color: '#30d158' },
        ].map(({ label, color }) => (
          <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-secondary)' }}>
            <span style={{ width: 10, height: 10, borderRadius: 2, background: color, display: 'inline-block' }} />
            {label}
          </div>
        ))}
      </div>

      {/* Calendar Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
        {DAYS.map(d => (
          <div key={d} style={{ padding: '8px 4px', textAlign: 'center', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', background: 'var(--surface-2)', borderBottom: '1px solid var(--border)' }}>
            {d}
          </div>
        ))}
        {cells.map((day, i) => {
          const dk = day ? dateKey(day) : null
          const dayEvents = dk ? (events.get(dk) ?? []) : []
          const isToday = dk === todayKey
          const isSelected = dk === selectedDate
          const topUrgency = dayEvents.reduce<DeadlineEvent['urgency'] | null>((best, e) => {
            const order: DeadlineEvent['urgency'][] = ['overdue', 'this_week', 'this_month', 'future']
            if (!best) return e.urgency
            return order.indexOf(e.urgency) < order.indexOf(best) ? e.urgency : best
          }, null)

          return (
            <div
              key={i}
              onClick={() => day && setSelectedDate(dk === selectedDate ? null : dk)}
              style={{
                minHeight: 80, padding: '6px 4px', borderRight: '1px solid var(--border)', borderBottom: '1px solid var(--border)',
                background: isSelected ? 'rgba(0,122,255,0.12)' : isToday ? 'rgba(0,122,255,0.06)' : 'var(--surface)',
                cursor: day ? 'pointer' : 'default',
                position: 'relative',
                transition: 'background 0.15s',
              }}
              onMouseEnter={e => { if (day && !isSelected) e.currentTarget.style.background = 'var(--surface-2)' }}
              onMouseLeave={e => { if (day) e.currentTarget.style.background = isSelected ? 'rgba(0,122,255,0.12)' : isToday ? 'rgba(0,122,255,0.06)' : 'var(--surface)' }}
            >
              {day && (
                <>
                  <div style={{ fontSize: 13, fontWeight: isToday ? 700 : 400, color: isToday ? 'var(--accent)' : 'var(--text)', textAlign: 'right', paddingRight: 4 }}>
                    {day}
                  </div>
                  {dayEvents.length > 0 && (
                    <div style={{ marginTop: 4, display: 'flex', flexDirection: 'column', gap: 2 }}>
                      {dayEvents.slice(0, 2).map((evt, j) => (
                        <div key={j} style={{
                          fontSize: 10, padding: '1px 4px', borderRadius: 3,
                          background: `${URGENCY_COLORS[evt.urgency]}22`,
                          color: URGENCY_COLORS[evt.urgency],
                          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                          borderLeft: `2px solid ${URGENCY_COLORS[evt.urgency]}`,
                        }}>
                          {evt.clientName.split(',')[0]}
                        </div>
                      ))}
                      {dayEvents.length > 2 && (
                        <div style={{ fontSize: 10, color: 'var(--text-secondary)', paddingLeft: 4 }}>+{dayEvents.length - 2} more</div>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>
          )
        })}
      </div>

      {/* Selected day panel */}
      {selectedDate && (
        <div style={{ marginTop: 20, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 16 }}>
          <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 12 }}>
            Deadlines on {new Date(selectedDate + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
          </h3>
          {selectedEvents.length === 0 ? (
            <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>No deadlines</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {selectedEvents.map((evt, i) => (
                <div
                  key={i}
                  onClick={() => router.push(`/clients/${evt.clientId}`)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px',
                    background: 'var(--surface-2)', borderRadius: 8, cursor: 'pointer',
                    borderLeft: `3px solid ${URGENCY_COLORS[evt.urgency]}`,
                  }}
                >
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 14, fontWeight: 500 }}>{evt.clientName}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>{evt.label}</div>
                  </div>
                  <span style={{
                    fontSize: 11, padding: '2px 8px', borderRadius: 12,
                    background: `${URGENCY_COLORS[evt.urgency]}22`,
                    color: URGENCY_COLORS[evt.urgency], fontWeight: 600,
                  }}>
                    {evt.urgency === 'overdue' ? 'Overdue' : evt.urgency === 'this_week' ? 'This Week' : evt.urgency === 'this_month' ? 'This Month' : 'Upcoming'}
                  </span>
                  <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>→</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
