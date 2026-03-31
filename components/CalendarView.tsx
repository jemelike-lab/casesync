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
  { key: 'three_month_visit_due', label: '3-Month Visit Due' },
  { key: 'quarterly_waiver_date', label: 'Quarterly Waiver' },
  { key: 'med_tech_redet_date', label: 'Med-Tech Redet' },
  { key: 'pos_deadline', label: 'POS Deadline' },
  { key: 'assessment_due', label: 'Assessment Due' },
  { key: 'thirty_day_letter_date', label: '30-Day Letter' },
  { key: 'spm_next_due', label: 'SPM Due' },
  { key: 'co_financial_redet_date', label: 'CO Financial Redet' },
  { key: 'mfp_consent_date', label: 'MFP Consent' },
  { key: 'two57_date', label: '257 Date' },
  { key: 'doc_mdh_date', label: 'MDH Documentation' },
]

interface DeadlineEvent {
  clientId: string
  clientName: string
  label: string
  date: string
  urgency: 'overdue' | 'today' | 'this_week' | 'this_month' | 'future'
}

function toDateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function getUrgency(dateStr: string, todayKey: string): DeadlineEvent['urgency'] {
  if (dateStr === todayKey) return 'today'
  const date = new Date(dateStr + 'T12:00:00')
  const now = new Date(todayKey + 'T12:00:00')
  const diff = Math.ceil((date.getTime() - now.getTime()) / 86400000)
  if (diff < 0) return 'overdue'
  if (diff <= 7) return 'this_week'
  if (diff <= 30) return 'this_month'
  return 'future'
}

const URGENCY_COLORS: Record<DeadlineEvent['urgency'], string> = {
  overdue: '#ff453a',
  today: '#ff9f0a',
  this_week: '#ffd60a',
  this_month: '#ffd60a',
  future: '#30d158',
}

const URGENCY_DOT: Record<DeadlineEvent['urgency'], string> = {
  overdue: '🔴',
  today: '🟠',
  this_week: '🟡',
  this_month: '🟡',
  future: '🟢',
}

const URGENCY_LABEL: Record<DeadlineEvent['urgency'], string> = {
  overdue: 'OVERDUE',
  today: 'TODAY',
  this_week: 'This Week',
  this_month: 'This Month',
  future: 'Upcoming',
}

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December']
const MONTH_NAMES_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

function getMonday(date: Date): Date {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  const day = d.getDay()
  const diff = day === 0 ? -6 : 1 - day
  d.setDate(d.getDate() + diff)
  return d
}

function getDeadlinesForDate(clients: Client[], dateKey: string, todayKey: string): DeadlineEvent[] {
  const results: DeadlineEvent[] = []
  clients.forEach(client => {
    const name = `${client.last_name}${client.first_name ? ', ' + client.first_name : ''}`
    DEADLINE_FIELDS.forEach(({ key, label }) => {
      const dateStr = client[key] as string | null
      if (!dateStr) return
      const dk = dateStr.split('T')[0]
      if (dk !== dateKey) return
      results.push({
        clientId: client.id,
        clientName: name,
        label,
        date: dk,
        urgency: getUrgency(dk, todayKey),
      })
    })
  })
  return results
}

type ViewType = 'day' | 'week' | 'month'

export default function CalendarView({ clients, showAll, onToggleShowAll, canToggle }: Props) {
  const router = useRouter()
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const todayKey = toDateKey(today)

  const [view, setView] = useState<ViewType>('month')
  const [currentDate, setCurrentDate] = useState(new Date(today))
  const [year, setYear] = useState(today.getFullYear())
  const [month, setMonth] = useState(today.getMonth())
  const [selectedDate, setSelectedDate] = useState<string | null>(null)

  // All events map (for month view)
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
          urgency: getUrgency(dateKey, todayKey),
        }
        if (!map.has(dateKey)) map.set(dateKey, [])
        map.get(dateKey)!.push(evt)
      })
    })
    return map
  }, [clients, todayKey])

  // Month view helpers
  const firstDay = new Date(year, month, 1).getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const cells: (number | null)[] = [
    ...Array(firstDay).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ]
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
  function monthDateKey(day: number) {
    return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
  }
  const selectedEvents = selectedDate ? (events.get(selectedDate) ?? []) : []

  // Day view
  const currentDayKey = toDateKey(currentDate)
  const dayDeadlines = useMemo(
    () => getDeadlinesForDate(clients, currentDayKey, todayKey),
    [clients, currentDayKey, todayKey]
  )

  // Week view
  const weekStart = getMonday(currentDate)
  const weekDays: Date[] = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart)
    d.setDate(d.getDate() + i)
    return d
  })
  const weekEnd = weekDays[6]

  const navButtonStyle: React.CSSProperties = {
    background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 8,
    padding: '6px 12px', color: 'var(--text)', cursor: 'pointer', fontSize: 16,
  }
  const todayButtonStyle: React.CSSProperties = {
    background: 'none', border: '1px solid var(--border)', borderRadius: 8,
    padding: '6px 12px', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: 12,
  }

  function DeadlineItem({ evt }: { evt: DeadlineEvent }) {
    return (
      <div
        onClick={() => router.push(`/clients/${evt.clientId}`)}
        style={{
          display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px',
          background: 'var(--surface-2)', borderRadius: 8, cursor: 'pointer',
          borderLeft: `3px solid ${URGENCY_COLORS[evt.urgency]}`,
          marginBottom: 6,
        }}
      >
        <span style={{ fontSize: 14, flexShrink: 0 }}>{URGENCY_DOT[evt.urgency]}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {evt.clientName}
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>{evt.label}</div>
        </div>
        <span style={{
          fontSize: 11, padding: '2px 8px', borderRadius: 12,
          background: `${URGENCY_COLORS[evt.urgency]}22`,
          color: URGENCY_COLORS[evt.urgency], fontWeight: 600, flexShrink: 0,
        }}>
          {URGENCY_LABEL[evt.urgency]}
        </span>
        <span style={{ fontSize: 12, color: 'var(--text-secondary)', flexShrink: 0 }}>→</span>
      </div>
    )
  }

  return (
    <div>
      {/* Top bar: view toggle + client filter */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div style={{ display: 'flex', gap: 4, background: 'var(--surface-2)', borderRadius: 10, padding: 4 }}>
          {(['day', 'week', 'month'] as ViewType[]).map(v => (
            <button
              key={v}
              onClick={() => setView(v)}
              style={{
                padding: '6px 16px', borderRadius: 8, border: 'none', cursor: 'pointer',
                fontSize: 13, fontWeight: 600,
                background: view === v ? '#007aff' : 'transparent',
                color: view === v ? '#fff' : 'var(--text-secondary)',
                transition: 'all 0.15s',
              }}
            >
              {v.charAt(0).toUpperCase() + v.slice(1)}
            </button>
          ))}
        </div>
        {canToggle && onToggleShowAll && (
          <button onClick={onToggleShowAll} className="btn-secondary" style={{ fontSize: 12 }}>
            {showAll ? '👤 My Clients' : '👥 All Clients'}
          </button>
        )}
      </div>

      {/* ── DAY VIEW ── */}
      {view === 'day' && (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20, flexWrap: 'wrap' }}>
            <button onClick={() => { const d = new Date(currentDate); d.setDate(d.getDate() - 1); setCurrentDate(d) }} style={navButtonStyle}>◀</button>
            <span style={{ fontSize: 16, fontWeight: 700, flex: 1, textAlign: 'center', minWidth: 220 }}>
              {currentDate.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
            </span>
            <button onClick={() => { const d = new Date(currentDate); d.setDate(d.getDate() + 1); setCurrentDate(d) }} style={navButtonStyle}>▶</button>
            <button onClick={() => setCurrentDate(new Date(today))} style={todayButtonStyle}>Today</button>
          </div>
          {dayDeadlines.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '48px 0', color: 'var(--text-secondary)', fontSize: 15 }}>
              No deadlines today ✅
            </div>
          ) : (
            <div>
              {dayDeadlines.map((evt, i) => <DeadlineItem key={i} evt={evt} />)}
            </div>
          )}
        </div>
      )}

      {/* ── WEEK VIEW ── */}
      {view === 'week' && (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20, flexWrap: 'wrap' }}>
            <button onClick={() => { const d = new Date(currentDate); d.setDate(d.getDate() - 7); setCurrentDate(d) }} style={navButtonStyle}>◀</button>
            <span style={{ fontSize: 15, fontWeight: 700, flex: 1, textAlign: 'center', minWidth: 220 }}>
              Week of {MONTH_NAMES_SHORT[weekStart.getMonth()]} {weekStart.getDate()} – {MONTH_NAMES_SHORT[weekEnd.getMonth()]} {weekEnd.getDate()}, {weekEnd.getFullYear()}
            </span>
            <button onClick={() => { const d = new Date(currentDate); d.setDate(d.getDate() + 7); setCurrentDate(d) }} style={navButtonStyle}>▶</button>
            <button onClick={() => setCurrentDate(new Date(today))} style={todayButtonStyle}>Today</button>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {weekDays.map((dayDate, i) => {
              const dk = toDateKey(dayDate)
              const isToday = dk === todayKey
              const isPast = dk < todayKey
              const dayEvts = getDeadlinesForDate(clients, dk, todayKey)
              return (
                <div
                  key={i}
                  style={{
                    borderLeft: isToday ? '3px solid #007aff' : '3px solid var(--border)',
                    paddingLeft: 14,
                    opacity: isPast ? 0.6 : 1,
                  }}
                >
                  <div style={{
                    fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase',
                    color: isToday ? '#007aff' : 'var(--text-secondary)',
                    marginBottom: 8,
                  }}>
                    {dayDate.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}
                  </div>
                  {dayEvts.length === 0 ? (
                    <div style={{ fontSize: 13, color: 'var(--text-secondary)', fontStyle: 'italic', paddingLeft: 4 }}>(nothing due)</div>
                  ) : (
                    dayEvts.map((evt, j) => <DeadlineItem key={j} evt={evt} />)
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* ── MONTH VIEW ── */}
      {view === 'month' && (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
            <button onClick={prevMonth} style={navButtonStyle}>←</button>
            <span style={{ fontSize: 18, fontWeight: 700, minWidth: 180, textAlign: 'center' }}>{MONTH_NAMES[month]} {year}</span>
            <button onClick={nextMonth} style={navButtonStyle}>→</button>
            <button onClick={() => { setYear(today.getFullYear()); setMonth(today.getMonth()) }} style={todayButtonStyle}>Today</button>
          </div>

          {/* Legend */}
          <div style={{ display: 'flex', gap: 16, marginBottom: 16, flexWrap: 'wrap' }}>
            {[
              { label: 'Overdue', color: '#ff453a' },
              { label: 'Today', color: '#ff9f0a' },
              { label: 'This Week', color: '#ffd60a' },
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
              const dk = day ? monthDateKey(day) : null
              const dayEvents = dk ? (events.get(dk) ?? []) : []
              const isToday = dk === todayKey
              const isSelected = dk === selectedDate

              return (
                <div
                  key={i}
                  onClick={() => day && setSelectedDate(dk === selectedDate ? null : dk)}
                  style={{
                    minHeight: 80, padding: '6px 4px',
                    borderRight: '1px solid var(--border)', borderBottom: '1px solid var(--border)',
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
                  {selectedEvents.map((evt, i) => <DeadlineItem key={i} evt={evt} />)}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
