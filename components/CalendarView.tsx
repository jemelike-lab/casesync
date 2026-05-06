'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useCountUp } from '@/hooks/useCountUp'

interface CalendarEvent {
  clientId: string
  clientName: string
  client_id: string
  plannerName: string | null
  label: string
  date: string
  urgency: 'overdue' | 'today' | 'this_week' | 'this_month' | 'future'
}

interface Props {
  assignedTo?: string | null
}

function toDateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

const URGENCY_COLORS: Record<CalendarEvent['urgency'], string> = {
  overdue: '#ff453a',
  today: '#ff9f0a',
  this_week: '#ffd60a',
  this_month: '#ffd60a',
  future: '#30d158',
}

const URGENCY_LABEL: Record<CalendarEvent['urgency'], string> = {
  overdue: 'OVERDUE',
  today: 'TODAY',
  this_week: 'This Week',
  this_month: 'This Month',
  future: 'Upcoming',
}

const URGENCY_GRADIENT: Record<CalendarEvent['urgency'], string> = {
  overdue: 'linear-gradient(135deg, rgba(255,69,58,0.15) 0%, rgba(255,69,58,0.05) 100%)',
  today: 'linear-gradient(135deg, rgba(255,159,10,0.15) 0%, rgba(255,159,10,0.05) 100%)',
  this_week: 'linear-gradient(135deg, rgba(255,214,10,0.12) 0%, rgba(255,214,10,0.04) 100%)',
  this_month: 'linear-gradient(135deg, rgba(255,214,10,0.08) 0%, rgba(255,214,10,0.02) 100%)',
  future: 'linear-gradient(135deg, rgba(48,209,88,0.12) 0%, rgba(48,209,88,0.04) 100%)',
}

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December']
const MONTH_NAMES_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

type ViewType = 'day' | 'week' | 'month'

function getMonday(date: Date): Date {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  const day = d.getDay()
  const diff = day === 0 ? -6 : 1 - day
  d.setDate(d.getDate() + diff)
  return d
}

/* ─── Stat Chip ────────────────────────────────────────────────── */
function StatChip({ label, count, color, colorRgb }: { label: string; count: number; color: string; colorRgb: string }) {
  const animated = useCountUp(count)
  if (count === 0) return null
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 8, padding: '8px 16px',
      borderRadius: 12, background: `rgba(${colorRgb}, 0.1)`,
      border: `1px solid rgba(${colorRgb}, 0.2)`,
    }}>
      <div style={{ width: 8, height: 8, borderRadius: '50%', background: color, boxShadow: `0 0 6px ${color}60` }} />
      <span style={{ fontSize: 18, fontWeight: 800, color, lineHeight: 1 }}>{animated}</span>
      <span style={{ fontSize: 11, color: `rgba(${colorRgb}, 0.7)`, fontWeight: 600 }}>{label}</span>
    </div>
  )
}

export default function CalendarView({ assignedTo }: Props) {
  const router = useRouter()
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const todayKey = toDateKey(today)

  const [view, setView] = useState<ViewType>('month')
  const [currentDate, setCurrentDate] = useState(new Date(today))
  const [year, setYear] = useState(today.getFullYear())
  const [month, setMonth] = useState(today.getMonth())
  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const [events, setEvents] = useState<CalendarEvent[]>([])
  const [loading, setLoading] = useState(false)

  const range = useMemo(() => {
    if (view === 'day') {
      const key = toDateKey(currentDate)
      return { start: key, end: key }
    }
    if (view === 'week') {
      const weekStart = getMonday(currentDate)
      const weekEnd = new Date(weekStart)
      weekEnd.setDate(weekEnd.getDate() + 6)
      return { start: toDateKey(weekStart), end: toDateKey(weekEnd) }
    }
    const monthStart = new Date(year, month, 1)
    const monthEnd = new Date(year, month + 1, 0)
    return { start: toDateKey(monthStart), end: toDateKey(monthEnd) }
  }, [view, currentDate, year, month])

  useEffect(() => {
    const controller = new AbortController()
    const params = new URLSearchParams()
    params.set('start', range.start)
    params.set('end', range.end)
    if (assignedTo) params.set('assignedTo', assignedTo)
    setLoading(true)
    fetch(`/api/calendar?${params.toString()}`, { signal: controller.signal })
      .then(async (res) => {
        if (!res.ok) throw new Error(`Failed (${res.status})`)
        return res.json() as Promise<{ events: CalendarEvent[] }>
      })
      .then((payload) => setEvents(payload.events ?? []))
      .catch((error) => { if (!controller.signal.aborted) { console.error(error); setEvents([]) } })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [range.start, range.end, assignedTo])

  const eventsMap = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>()
    for (const evt of events) {
      if (!map.has(evt.date)) map.set(evt.date, [])
      map.get(evt.date)!.push(evt)
    }
    return map
  }, [events])

  // Stats
  const stats = useMemo(() => {
    let overdue = 0, thisWeek = 0, upcoming = 0
    events.forEach(e => {
      if (e.urgency === 'overdue') overdue++
      else if (e.urgency === 'today' || e.urgency === 'this_week') thisWeek++
      else upcoming++
    })
    return { overdue, thisWeek, upcoming, total: events.length }
  }, [events])

  const dayEvents = eventsMap.get(toDateKey(currentDate)) ?? []
  const weekStart = getMonday(currentDate)
  const weekDays: Date[] = Array.from({ length: 7 }, (_, i) => { const d = new Date(weekStart); d.setDate(d.getDate() + i); return d })
  const weekEnd = weekDays[6]

  const firstDay = new Date(year, month, 1).getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const cells: (number | null)[] = [...Array(firstDay).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)]
  while (cells.length % 7 !== 0) cells.push(null)

  function monthDateKey(day: number) {
    return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
  }
  function prevMonth() { if (month === 0) { setYear(y => y - 1); setMonth(11) } else setMonth(m => m - 1); setSelectedDate(null) }
  function nextMonth() { if (month === 11) { setYear(y => y + 1); setMonth(0) } else setMonth(m => m + 1); setSelectedDate(null) }

  useEffect(() => {
    if (view !== 'month') return
    if (selectedDate && eventsMap.has(selectedDate)) return
    const todayMonthKey = `${year}-${String(month + 1).padStart(2, '0')}`
    const eventKeysInMonth = Array.from(eventsMap.keys()).filter(k => k.startsWith(todayMonthKey)).sort()
    if (!eventKeysInMonth.length) { setSelectedDate(null); return }
    setSelectedDate(eventKeysInMonth.find(k => k >= todayKey) ?? eventKeysInMonth[0])
  }, [view, year, month, eventsMap, selectedDate, todayKey])

  const selectedEvents = selectedDate ? (eventsMap.get(selectedDate) ?? []) : []

  /* ─── DeadlineItem ─────────────────────────────────────────────── */
  function DeadlineItem({ evt, idx }: { evt: CalendarEvent; idx: number }) {
    return (
      <div
        onClick={() => router.push(`/clients/${evt.clientId}`)}
        className="drilldown-row"
        style={{
          display: 'flex', alignItems: 'center', gap: 14, padding: '14px 16px',
          background: URGENCY_GRADIENT[evt.urgency],
          borderRadius: 14, cursor: 'pointer',
          borderLeft: `3px solid ${URGENCY_COLORS[evt.urgency]}`,
          transition: 'all 0.25s ease',
          opacity: 0, animation: `slideInRow 0.35s ${idx * 0.05}s ease forwards`,
        }}
      >
        <div style={{
          width: 10, height: 10, borderRadius: '50%', flexShrink: 0,
          background: URGENCY_COLORS[evt.urgency],
          boxShadow: `0 0 6px ${URGENCY_COLORS[evt.urgency]}60`,
        }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>{evt.clientName}</div>
          <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 2 }}>
            {evt.label} • ID {evt.client_id}{evt.plannerName ? ` • ${evt.plannerName}` : ''}
          </div>
        </div>
        <span style={{
          fontSize: 10, padding: '3px 10px', borderRadius: 8, fontWeight: 700,
          background: `${URGENCY_COLORS[evt.urgency]}18`,
          color: URGENCY_COLORS[evt.urgency],
          border: `1px solid ${URGENCY_COLORS[evt.urgency]}30`,
          flexShrink: 0,
        }}>
          {URGENCY_LABEL[evt.urgency]}
        </span>
        <span style={{ fontSize: 14, color: 'var(--text-secondary)', opacity: 0.3 }}>→</span>
      </div>
    )
  }

  return (
    <div>
      {/* ─── Top Controls ──────────────────────────────────────────── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        {/* View toggle */}
        <div style={{ display: 'flex', gap: 4, background: 'rgba(255,255,255,0.03)', borderRadius: 10, padding: 3 }}>
          {(['day', 'week', 'month'] as ViewType[]).map(v => (
            <button key={v} onClick={() => setView(v)} style={{
              padding: '7px 18px', borderRadius: 8, border: 'none', cursor: 'pointer',
              fontSize: 13, fontWeight: view === v ? 700 : 500,
              background: view === v ? 'rgba(0,122,255,0.2)' : 'transparent',
              color: view === v ? '#5ac8fa' : 'var(--text-secondary)',
              transition: 'all 0.2s',
            }}>
              {v.charAt(0).toUpperCase() + v.slice(1)}
            </button>
          ))}
        </div>

        {/* Stat chips */}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <StatChip label="overdue" count={stats.overdue} color="#ff453a" colorRgb="255,69,58" />
          <StatChip label="this week" count={stats.thisWeek} color="#ffd60a" colorRgb="255,214,10" />
          <StatChip label="upcoming" count={stats.upcoming} color="#30d158" colorRgb="48,209,88" />
        </div>

        {loading && <div style={{ fontSize: 12, color: 'rgba(160,180,255,0.4)' }}>Loading…</div>}
      </div>

      {/* ─── Day View ──────────────────────────────────────────────── */}
      {view === 'day' && (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
            <button onClick={() => { const d = new Date(currentDate); d.setDate(d.getDate() - 1); setCurrentDate(d) }} style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10, padding: '8px 14px', color: '#fff', cursor: 'pointer', fontSize: 14 }}>←</button>
            <span style={{ fontSize: 17, fontWeight: 700, flex: 1, textAlign: 'center', color: '#fff' }}>
              {currentDate.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
            </span>
            <button onClick={() => { const d = new Date(currentDate); d.setDate(d.getDate() + 1); setCurrentDate(d) }} style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10, padding: '8px 14px', color: '#fff', cursor: 'pointer', fontSize: 14 }}>→</button>
            <button onClick={() => setCurrentDate(new Date(today))} style={{ background: 'rgba(0,122,255,0.1)', border: '1px solid rgba(0,122,255,0.2)', borderRadius: 10, padding: '8px 14px', color: '#5ac8fa', cursor: 'pointer', fontSize: 12, fontWeight: 700 }}>Today</button>
          </div>
          {dayEvents.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '48px 0', color: 'rgba(255,255,255,0.25)', fontSize: 15 }}>No deadlines on this day ✅</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>{dayEvents.map((evt, i) => <DeadlineItem key={i} evt={evt} idx={i} />)}</div>
          )}
        </div>
      )}

      {/* ─── Week View ─────────────────────────────────────────────── */}
      {view === 'week' && (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
            <button onClick={() => { const d = new Date(currentDate); d.setDate(d.getDate() - 7); setCurrentDate(d) }} style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10, padding: '8px 14px', color: '#fff', cursor: 'pointer', fontSize: 14 }}>←</button>
            <span style={{ fontSize: 16, fontWeight: 700, flex: 1, textAlign: 'center', color: '#fff' }}>
              Week of {MONTH_NAMES_SHORT[weekStart.getMonth()]} {weekStart.getDate()} – {MONTH_NAMES_SHORT[weekEnd.getMonth()]} {weekEnd.getDate()}, {weekEnd.getFullYear()}
            </span>
            <button onClick={() => { const d = new Date(currentDate); d.setDate(d.getDate() + 7); setCurrentDate(d) }} style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10, padding: '8px 14px', color: '#fff', cursor: 'pointer', fontSize: 14 }}>→</button>
            <button onClick={() => setCurrentDate(new Date(today))} style={{ background: 'rgba(0,122,255,0.1)', border: '1px solid rgba(0,122,255,0.2)', borderRadius: 10, padding: '8px 14px', color: '#5ac8fa', cursor: 'pointer', fontSize: 12, fontWeight: 700 }}>Today</button>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {weekDays.map((dayDate, i) => {
              const dk = toDateKey(dayDate)
              const isToday = dk === todayKey
              const isPast = dk < todayKey
              const items = eventsMap.get(dk) ?? []
              return (
                <div key={i} style={{
                  borderLeft: isToday ? '3px solid #5ac8fa' : '3px solid rgba(255,255,255,0.06)',
                  paddingLeft: 16, opacity: isPast ? 0.5 : 1, transition: 'opacity 0.3s',
                }}>
                  <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: isToday ? '#5ac8fa' : 'rgba(255,255,255,0.35)', marginBottom: 8 }}>
                    {dayDate.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}
                    {items.length > 0 && <span style={{ marginLeft: 8, fontSize: 10, padding: '2px 8px', borderRadius: 8, background: 'rgba(255,255,255,0.06)', color: 'var(--text-secondary)' }}>{items.length}</span>}
                  </div>
                  {items.length === 0 ? (
                    <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.15)', fontStyle: 'italic', paddingLeft: 4 }}>(nothing due)</div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>{items.map((evt, j) => <DeadlineItem key={j} evt={evt} idx={j} />)}</div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* ─── Month View ────────────────────────────────────────────── */}
      {view === 'month' && (
        <div>
          {/* Nav */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 20, flexWrap: 'wrap' }}>
            <button onClick={prevMonth} style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10, padding: '8px 14px', color: '#fff', cursor: 'pointer', fontSize: 14 }}>←</button>
            <span style={{ fontSize: 20, fontWeight: 800, minWidth: 200, textAlign: 'center', color: '#fff' }}>{MONTH_NAMES[month]} {year}</span>
            <button onClick={nextMonth} style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10, padding: '8px 14px', color: '#fff', cursor: 'pointer', fontSize: 14 }}>→</button>
            <button onClick={() => { setYear(today.getFullYear()); setMonth(today.getMonth()) }} style={{ background: 'rgba(0,122,255,0.1)', border: '1px solid rgba(0,122,255,0.2)', borderRadius: 10, padding: '8px 14px', color: '#5ac8fa', cursor: 'pointer', fontSize: 12, fontWeight: 700 }}>Today</button>
          </div>

          {/* Legend */}
          <div style={{ display: 'flex', gap: 16, marginBottom: 16, flexWrap: 'wrap' }}>
            {[{ label: 'Overdue', color: '#ff453a' }, { label: 'Today', color: '#ff9f0a' }, { label: 'This Week', color: '#ffd60a' }, { label: 'Future', color: '#30d158' }].map(({ label, color }) => (
              <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: color, display: 'inline-block', boxShadow: `0 0 4px ${color}40` }} />
                {label}
              </div>
            ))}
          </div>

          {/* Grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', borderRadius: 16, overflow: 'hidden', border: '1px solid rgba(255,255,255,0.06)' }}>
            {/* Day headers */}
            {DAYS.map(d => (
              <div key={d} style={{
                padding: '10px 4px', textAlign: 'center', fontSize: 11, fontWeight: 700,
                color: 'rgba(255,255,255,0.35)', letterSpacing: '0.06em',
                background: 'rgba(255,255,255,0.02)', borderBottom: '1px solid rgba(255,255,255,0.05)',
              }}>
                {d}
              </div>
            ))}

            {/* Day cells */}
            {cells.map((day, i) => {
              const dk = day ? monthDateKey(day) : null
              const cellEvents = dk ? (eventsMap.get(dk) ?? []) : []
              const isToday = dk === todayKey
              const isSelected = dk === selectedDate
              const hasOverdue = cellEvents.some(e => e.urgency === 'overdue')
              const hasThisWeek = cellEvents.some(e => e.urgency === 'this_week' || e.urgency === 'today')
              const hasEvents = cellEvents.length > 0

              let cellBg = 'transparent'
              if (isSelected) cellBg = 'rgba(0,122,255,0.12)'
              else if (hasOverdue) cellBg = 'rgba(255,69,58,0.06)'
              else if (hasThisWeek) cellBg = 'rgba(255,214,10,0.04)'
              else if (isToday) cellBg = 'rgba(0,122,255,0.04)'

              return (
                <div
                  key={i}
                  onClick={() => day && setSelectedDate(dk === selectedDate ? null : dk)}
                  style={{
                    minHeight: 85, padding: '6px 6px 4px',
                    borderRight: '1px solid rgba(255,255,255,0.03)',
                    borderBottom: '1px solid rgba(255,255,255,0.03)',
                    background: cellBg,
                    cursor: day ? 'pointer' : 'default',
                    transition: 'background 0.2s',
                    position: 'relative',
                  }}
                >
                  {day && (
                    <>
                      <div style={{
                        fontSize: 13, fontWeight: isToday ? 800 : 400, textAlign: 'right', paddingRight: 4,
                        color: isToday ? '#5ac8fa' : hasEvents ? '#fff' : 'rgba(255,255,255,0.25)',
                      }}>
                        {isToday && <span style={{
                          display: 'inline-block', width: 24, height: 24, lineHeight: '24px', textAlign: 'center',
                          borderRadius: '50%', background: 'rgba(0,122,255,0.25)', marginRight: 2,
                        }}>{day}</span>}
                        {!isToday && day}
                      </div>
                      {hasEvents && (
                        <div style={{ marginTop: 4, display: 'flex', flexDirection: 'column', gap: 2 }}>
                          {cellEvents.slice(0, 2).map((evt, j) => (
                            <div key={j} style={{
                              fontSize: 10, padding: '2px 5px', borderRadius: 6,
                              background: `${URGENCY_COLORS[evt.urgency]}15`,
                              color: URGENCY_COLORS[evt.urgency],
                              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                              borderLeft: `2px solid ${URGENCY_COLORS[evt.urgency]}`,
                              fontWeight: 600,
                            }}>
                              {evt.clientName.split(',')[0]}
                            </div>
                          ))}
                          {cellEvents.length > 2 && (
                            <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.3)', paddingLeft: 4 }}>+{cellEvents.length - 2} more</div>
                          )}
                        </div>
                      )}
                      {/* Dot indicator for selected */}
                      {isSelected && (
                        <div style={{ position: 'absolute', bottom: 4, left: '50%', transform: 'translateX(-50%)', width: 4, height: 4, borderRadius: '50%', background: '#5ac8fa' }} />
                      )}
                    </>
                  )}
                </div>
              )
            })}
          </div>

          {/* ─── Selected Day Detail Panel ──────────────────────────── */}
          <div style={{
            marginTop: 20, borderRadius: 18, overflow: 'hidden',
            border: '1px solid rgba(255,255,255,0.05)',
            background: 'linear-gradient(160deg, rgba(255,255,255,0.02) 0%, rgba(255,255,255,0.005) 100%)',
          }}>
            <div style={{
              padding: '14px 20px',
              borderBottom: '1px solid rgba(255,255,255,0.05)',
              background: 'rgba(255,255,255,0.015)',
              display: 'flex', alignItems: 'center', gap: 10,
            }}>
              {selectedDate && selectedEvents.length > 0 && (
                <div className="pulse-dot" style={{ width: 8, height: 8, borderRadius: '50%', background: selectedEvents.some(e => e.urgency === 'overdue') ? '#ff453a' : '#ffd60a', boxShadow: `0 0 6px ${selectedEvents.some(e => e.urgency === 'overdue') ? 'rgba(255,69,58,0.5)' : 'rgba(255,214,10,0.5)'}` }} />
              )}
              <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>
                {selectedDate
                  ? `Deadlines — ${new Date(selectedDate + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}`
                  : 'Deadlines'}
              </span>
              {selectedEvents.length > 0 && (
                <span style={{ fontSize: 11, padding: '2px 10px', borderRadius: 20, background: 'rgba(255,255,255,0.06)', color: 'var(--text-secondary)', fontWeight: 600 }}>
                  {selectedEvents.length}
                </span>
              )}
            </div>
            <div style={{ padding: '12px 16px 16px' }}>
              {selectedDate == null ? (
                <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.25)', padding: 12, textAlign: 'center' }}>
                  {loading ? 'Loading deadlines…' : 'No due clients found in this month.'}
                </div>
              ) : selectedEvents.length === 0 ? (
                <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.25)', padding: 12, textAlign: 'center' }}>No deadlines on this day</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {selectedEvents.map((evt, i) => <DeadlineItem key={i} evt={evt} idx={i} />)}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
