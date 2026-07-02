'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useCountUp } from '@/hooks/useCountUp'
import { useTheme } from '@/hooks/useTheme'

interface CalendarEvent {
  clientId: string
  clientName: string
  client_id: string
  plannerName: string | null
  label: string
  date: string
  urgency: 'overdue' | 'today' | 'this_week' | 'this_month' | 'future'
}

interface Props { assignedTo?: string | null }

function toDateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

const UC: Record<CalendarEvent['urgency'], string> = { overdue: '#ff453a', today: '#ff9f0a', this_week: '#ffd60a', this_month: '#ffd60a', future: '#30d158' }
const UL: Record<CalendarEvent['urgency'], string> = { overdue: 'OVERDUE', today: 'TODAY', this_week: 'This Week', this_month: 'This Month', future: 'Upcoming' }
const UBG: Record<CalendarEvent['urgency'], string> = { overdue: 'rgba(255,69,58,0.12)', today: 'rgba(255,159,10,0.1)', this_week: 'rgba(255,214,10,0.08)', this_month: 'rgba(255,214,10,0.06)', future: 'rgba(48,209,88,0.08)' }

/* ─── Hover Tooltip ────────────────────────────────────────────── */
function CalendarTooltip({ events, position, lt }: { events: CalendarEvent[]; position: 'left' | 'right'; lt: boolean }) {
  // Group events by client
  const byClient = new Map<string, CalendarEvent[]>()
  events.forEach(e => {
    if (!byClient.has(e.clientId)) byClient.set(e.clientId, [])
    byClient.get(e.clientId)!.push(e)
  })

  return (
    <div className="cal-tooltip" style={{
      position: 'absolute',
      top: '50%', transform: 'translateY(-50%)',
      [position === 'right' ? 'left' : 'right']: 'calc(100% + 10px)',
      zIndex: 100,
      width: 280,
      background: lt
        ? 'linear-gradient(160deg, rgba(255,255,255,0.98) 0%, rgba(248,242,232,0.99) 100%)'
        : 'linear-gradient(160deg, rgba(20,26,56,0.98) 0%, rgba(12,16,38,0.99) 100%)',
      border: lt ? '1px solid rgba(15,23,42,0.15)' : '1px solid rgba(100,140,255,0.2)',
      borderRadius: 16,
      padding: '14px 16px',
      boxShadow: lt
        ? '0 12px 48px rgba(0,0,0,0.15), 0 0 0 1px rgba(15,23,42,0.06)'
        : '0 12px 48px rgba(0,0,0,0.5), 0 0 0 1px rgba(100,140,255,0.08)',
      backdropFilter: 'blur(20px)',
      pointerEvents: 'none',
    }}>
      {/* Header */}
      <div style={{ fontSize: 10, fontWeight: 700, color: lt ? 'rgba(100,116,139,0.85)' : 'rgba(160,180,255,0.5)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 10 }}>
        {events.length} deadline{events.length !== 1 ? 's' : ''} · {byClient.size} client{byClient.size !== 1 ? 's' : ''}
      </div>

      {/* Client cards */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 240, overflowY: 'auto' }}>
        {Array.from(byClient.entries()).map(([clientId, clientEvents]) => {
          const first = clientEvents[0]
          const worstUrgency = clientEvents.reduce((worst, e) => {
            const order = { overdue: 0, today: 1, this_week: 2, this_month: 3, future: 4 }
            return order[e.urgency] < order[worst] ? e.urgency : worst
          }, 'future' as CalendarEvent['urgency'])

          return (
            <div key={clientId} style={{
              borderRadius: 12, padding: '10px 12px',
              background: UBG[worstUrgency],
              borderLeft: `3px solid ${UC[worstUrgency]}`,
            }}>
              {/* Client name + urgency badge */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                <span style={{ fontSize: 13, fontWeight: 800, color: lt ? '#0F172A' : '#e0e8ff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {first.clientName}
                </span>
                <span style={{
                  fontSize: 9, fontWeight: 700, padding: '2px 7px', borderRadius: 6, flexShrink: 0,
                  background: `${UC[worstUrgency]}25`, color: UC[worstUrgency],
                  border: `1px solid ${UC[worstUrgency]}40`,
                }}>
                  {UL[worstUrgency]}
                </span>
              </div>

              {/* Deadline types */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                {clientEvents.map((evt, j) => (
                  <div key={j} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11 }}>
                    <div style={{ width: 5, height: 5, borderRadius: '50%', background: UC[evt.urgency], flexShrink: 0, boxShadow: `0 0 4px ${UC[evt.urgency]}60` }} />
                    <span style={{ color: lt ? '#64748B' : '#a0b4e0' }}>{evt.label}</span>
                  </div>
                ))}
              </div>

              {/* Planner + ID */}
              <div style={{ fontSize: 10, color: lt ? '#94A3B8' : '#5a6a8a', marginTop: 6, display: 'flex', gap: 6 }}>
                <span>ID {first.client_id}</span>
                {first.plannerName && (
                  <>
                    <span style={{ opacity: 0.4 }}>·</span>
                    <span>{first.plannerName}</span>
                  </>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
type ViewType = 'day' | 'week' | 'month'

function getMonday(date: Date): Date {
  const d = new Date(date); d.setHours(0,0,0,0)
  const day = d.getDay(); d.setDate(d.getDate() + (day === 0 ? -6 : 1 - day)); return d
}

function StatChip({ label, count, color, rgb }: { label: string; count: number; color: string; rgb: string }) {
  const n = useCountUp(count)
  if (count === 0) return null
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 8, padding: '8px 16px',
      borderRadius: 12, background: `rgba(${rgb}, 0.12)`, border: `1px solid rgba(${rgb}, 0.25)`,
    }}>
      <div style={{ width: 8, height: 8, borderRadius: '50%', background: color, boxShadow: `0 0 8px ${color}80` }} />
      <span style={{ fontSize: 18, fontWeight: 800, color, lineHeight: 1 }}>{n}</span>
      <span style={{ fontSize: 11, color: `rgba(${rgb}, 0.8)`, fontWeight: 600 }}>{label}</span>
    </div>
  )
}

export default function CalendarView({ assignedTo }: Props) {
  const router = useRouter()
  const { theme } = useTheme()
  const lt = theme === 'light'
  const today = new Date(); today.setHours(0,0,0,0)
  const todayKey = toDateKey(today)

  const [view, setView] = useState<ViewType>('month')
  const [currentDate, setCurrentDate] = useState(new Date(today))
  const [year, setYear] = useState(today.getFullYear())
  const [month, setMonth] = useState(today.getMonth())
  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const [hoveredCell, setHoveredCell] = useState<string | null>(null)
  const [events, setEvents] = useState<CalendarEvent[]>([])
  const [loading, setLoading] = useState(false)

  const range = useMemo(() => {
    if (view === 'day') { const k = toDateKey(currentDate); return { start: k, end: k } }
    if (view === 'week') { const ws = getMonday(currentDate); const we = new Date(ws); we.setDate(we.getDate()+6); return { start: toDateKey(ws), end: toDateKey(we) } }
    return { start: toDateKey(new Date(year,month,1)), end: toDateKey(new Date(year,month+1,0)) }
  }, [view, currentDate, year, month])

  useEffect(() => {
    const c = new AbortController(); const p = new URLSearchParams()
    p.set('start', range.start); p.set('end', range.end)
    if (assignedTo) p.set('assignedTo', assignedTo)
    setLoading(true)
    fetch(`/api/calendar?${p}`, { signal: c.signal })
      .then(r => r.ok ? r.json() as Promise<{events:CalendarEvent[]}> : Promise.reject())
      .then(d => setEvents(d.events ?? []))
      .catch(() => { if (!c.signal.aborted) setEvents([]) })
      .finally(() => { if (!c.signal.aborted) setLoading(false) })
    return () => c.abort()
  }, [range.start, range.end, assignedTo])

  const eventsMap = useMemo(() => {
    const m = new Map<string, CalendarEvent[]>()
    for (const e of events) { if (!m.has(e.date)) m.set(e.date, []); m.get(e.date)!.push(e) }
    return m
  }, [events])

  const stats = useMemo(() => {
    let o=0,w=0,u=0
    events.forEach(e => { if (e.urgency==='overdue') o++; else if (e.urgency==='today'||e.urgency==='this_week') w++; else u++ })
    return { overdue:o, thisWeek:w, upcoming:u }
  }, [events])

  const dayEvents = eventsMap.get(toDateKey(currentDate)) ?? []
  const weekStart = getMonday(currentDate)
  const weekDays = Array.from({length:7},(_,i)=>{const d=new Date(weekStart);d.setDate(d.getDate()+i);return d})
  const weekEnd = weekDays[6]
  const firstDay = new Date(year,month,1).getDay()
  const daysInMonth = new Date(year,month+1,0).getDate()
  const cells: (number|null)[] = [...Array(firstDay).fill(null),...Array.from({length:daysInMonth},(_,i)=>i+1)]
  while (cells.length%7!==0) cells.push(null)

  function mdk(day:number) { return `${year}-${String(month+1).padStart(2,'0')}-${String(day).padStart(2,'0')}` }
  function prevMonth() { if(month===0){setYear(y=>y-1);setMonth(11)}else setMonth(m=>m-1); setSelectedDate(null) }
  function nextMonth() { if(month===11){setYear(y=>y+1);setMonth(0)}else setMonth(m=>m+1); setSelectedDate(null) }

  useEffect(() => {
    if (view!=='month') return
    if (selectedDate && eventsMap.has(selectedDate)) return
    const mk = `${year}-${String(month+1).padStart(2,'0')}`
    const ek = Array.from(eventsMap.keys()).filter(k=>k.startsWith(mk)).sort()
    if (!ek.length) { setSelectedDate(null); return }
    setSelectedDate(ek.find(k=>k>=todayKey) ?? ek[0])
  }, [view, year, month, eventsMap, selectedDate, todayKey])

  const selectedEvents = selectedDate ? (eventsMap.get(selectedDate) ?? []) : []

  function DI({ evt, idx }: { evt: CalendarEvent; idx: number }) {
    return (
      <div onClick={()=>router.push(`/clients/${evt.clientId}`)} className="drilldown-row" style={{
        display:'flex', alignItems:'center', gap:14, padding:'14px 16px',
        background: `linear-gradient(90deg, ${UC[evt.urgency]}10 0%, transparent 100%)`,
        borderRadius:14, cursor:'pointer', borderLeft:`3px solid ${UC[evt.urgency]}`,
        transition:'all 0.25s', opacity:0, animation:`slideInRow 0.35s ${idx*0.05}s ease forwards`,
      }}>
        <div style={{ width:10, height:10, borderRadius:'50%', background:UC[evt.urgency], boxShadow:`0 0 8px ${UC[evt.urgency]}60`, flexShrink:0 }} />
        <div style={{ flex:1, minWidth:0 }}>
          <div style={{ fontSize:14, fontWeight:700, color:'var(--text)' }}>{evt.clientName}</div>
          <div style={{ fontSize:11, color:'var(--text-secondary)', marginTop:2 }}>{evt.label} • ID {evt.client_id}{evt.plannerName?` • ${evt.plannerName}`:''}</div>
        </div>
        <span style={{ fontSize:10, padding:'3px 10px', borderRadius:8, fontWeight:700, background:`${UC[evt.urgency]}18`, color:UC[evt.urgency], border:`1px solid ${UC[evt.urgency]}30`, flexShrink:0 }}>{UL[evt.urgency]}</span>
        <span style={{ fontSize:14, color:'var(--text-secondary)', opacity:0.3 }}>→</span>
      </div>
    )
  }

  const navBtn: React.CSSProperties = { background: lt ? 'var(--surface-2)' : 'rgba(255,255,255,0.04)', border: lt ? '1px solid var(--border)' : '1px solid rgba(255,255,255,0.1)', borderRadius:10, padding:'8px 14px', color: lt ? 'var(--text)' : '#fff', cursor:'pointer', fontSize:14, transition:'background 0.2s' }
  const todayBtn: React.CSSProperties = { background: lt ? 'rgba(0,113,227,0.1)' : 'rgba(0,122,255,0.12)', border: lt ? '1px solid rgba(0,113,227,0.3)' : '1px solid rgba(0,122,255,0.25)', borderRadius:10, padding:'8px 16px', color: lt ? '#0071e3' : '#5ac8fa', cursor:'pointer', fontSize:12, fontWeight:700, transition:'all 0.2s' }

  return (
    <div>
      {/* ─── Top Bar ───────────────────────────────────────────────── */}
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:20, flexWrap:'wrap', gap:12 }}>
        <div style={{ display:'flex', gap:4, background: lt ? 'var(--surface-2)' : 'rgba(255,255,255,0.04)', borderRadius:10, padding:3 }}>
          {(['day','week','month'] as ViewType[]).map(v=>(
            <button key={v} onClick={()=>setView(v)} style={{
              padding:'7px 18px', borderRadius:8, border:'none', cursor:'pointer', fontSize:13,
              fontWeight:view===v?700:500, background:view===v ? (lt ? 'rgba(0,113,227,0.15)' : 'rgba(0,122,255,0.2)') : 'transparent',
              color:view===v ? (lt ? '#0071e3' : '#5ac8fa') : 'var(--text-secondary)', transition:'all 0.2s',
            }}>{v[0].toUpperCase()+v.slice(1)}</button>
          ))}
        </div>
        <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
          <StatChip label="overdue" count={stats.overdue} color="#ff453a" rgb="255,69,58" />
          <StatChip label="this week" count={stats.thisWeek} color="#ffd60a" rgb="255,214,10" />
          <StatChip label="upcoming" count={stats.upcoming} color="#30d158" rgb="48,209,88" />
        </div>
        {loading && <div style={{ fontSize:12, color: lt ? 'var(--text-secondary)' : 'rgba(160,180,255,0.4)' }}>Loading…</div>}
      </div>

      {/* ─── Day View ──────────────────────────────────────────────── */}
      {view==='day' && (
        <div>
          <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:20, flexWrap:'wrap' }}>
            <button onClick={()=>{const d=new Date(currentDate);d.setDate(d.getDate()-1);setCurrentDate(d)}} style={navBtn}>←</button>
            <span style={{ fontSize:17, fontWeight:700, flex:1, textAlign:'center', color: lt ? 'var(--text)' : '#fff' }}>{currentDate.toLocaleDateString('en-US',{weekday:'long',year:'numeric',month:'long',day:'numeric'})}</span>
            <button onClick={()=>{const d=new Date(currentDate);d.setDate(d.getDate()+1);setCurrentDate(d)}} style={navBtn}>→</button>
            <button onClick={()=>setCurrentDate(new Date(today))} style={todayBtn}>Today</button>
          </div>
          {dayEvents.length===0 ? <div style={{textAlign:'center',padding:'48px 0',color: lt ? 'var(--text-secondary)' : 'rgba(255,255,255,0.25)',fontSize:15}}>No deadlines ✅</div>
            : <div style={{display:'flex',flexDirection:'column',gap:6}}>{dayEvents.map((e,i)=><DI key={i} evt={e} idx={i}/>)}</div>}
        </div>
      )}

      {/* ─── Week View ─────────────────────────────────────────────── */}
      {view==='week' && (
        <div>
          <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:20, flexWrap:'wrap' }}>
            <button onClick={()=>{const d=new Date(currentDate);d.setDate(d.getDate()-7);setCurrentDate(d)}} style={navBtn}>←</button>
            <span style={{ fontSize:16, fontWeight:700, flex:1, textAlign:'center', color: lt ? 'var(--text)' : '#fff' }}>Week of {MONTH_SHORT[weekStart.getMonth()]} {weekStart.getDate()} – {MONTH_SHORT[weekEnd.getMonth()]} {weekEnd.getDate()}, {weekEnd.getFullYear()}</span>
            <button onClick={()=>{const d=new Date(currentDate);d.setDate(d.getDate()+7);setCurrentDate(d)}} style={navBtn}>→</button>
            <button onClick={()=>setCurrentDate(new Date(today))} style={todayBtn}>Today</button>
          </div>
          <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
            {weekDays.map((dd,i)=>{
              const dk=toDateKey(dd), isT=dk===todayKey, past=dk<todayKey, items=eventsMap.get(dk)??[]
              return (
                <div key={i} style={{ borderLeft:isT ? (lt ? '3px solid #0071e3' : '3px solid #5ac8fa') : (lt ? '3px solid var(--border)' : '3px solid rgba(255,255,255,0.08)'), paddingLeft:16, opacity:past?0.5:1 }}>
                  <div style={{ fontSize:11, fontWeight:700, letterSpacing:'0.08em', textTransform:'uppercase', color:isT ? (lt ? '#0071e3' : '#5ac8fa') : (lt ? 'var(--text-secondary)' : 'rgba(255,255,255,0.4)'), marginBottom:8 }}>
                    {dd.toLocaleDateString('en-US',{weekday:'long',month:'short',day:'numeric'})}
                    {items.length>0 && <span style={{ marginLeft:8, fontSize:10, padding:'2px 8px', borderRadius:8, background:'rgba(255,255,255,0.06)', color:'var(--text-secondary)' }}>{items.length}</span>}
                  </div>
                  {items.length===0 ? <div style={{fontSize:12,color: lt ? 'var(--text-secondary)' : 'rgba(255,255,255,0.15)',fontStyle:'italic'}}>(nothing due)</div>
                    : <div style={{display:'flex',flexDirection:'column',gap:6}}>{items.map((e,j)=><DI key={j} evt={e} idx={j}/>)}</div>}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* ─── Month View ────────────────────────────────────────────── */}
      {view==='month' && (
        <div>
          <div style={{ display:'flex', alignItems:'center', gap:14, marginBottom:20, flexWrap:'wrap' }}>
            <button onClick={prevMonth} style={navBtn}>←</button>
            <span style={{ fontSize:20, fontWeight:800, minWidth:200, textAlign:'center', color: lt ? 'var(--text)' : '#fff' }}>{MONTH_NAMES[month]} {year}</span>
            <button onClick={nextMonth} style={navBtn}>→</button>
            <button onClick={()=>{setYear(today.getFullYear());setMonth(today.getMonth())}} style={todayBtn}>Today</button>
          </div>

          {/* Legend */}
          <div style={{ display:'flex', gap:16, marginBottom:16, flexWrap:'wrap' }}>
            {[{l:'Overdue',c:'#ff453a'},{l:'Today',c:'#ff9f0a'},{l:'This Week',c:'#ffd60a'},{l:'Future',c:'#30d158'}].map(({l,c})=>(
              <div key={l} style={{ display:'flex', alignItems:'center', gap:6, fontSize:11, color: lt ? 'var(--text-secondary)' : 'rgba(255,255,255,0.5)' }}>
                <span style={{ width:8, height:8, borderRadius:'50%', background:c, boxShadow:`0 0 4px ${c}50` }} />{l}
              </div>
            ))}
          </div>

          {/* Calendar Grid */}
          <div className="cal-grid" style={{
            borderRadius:18, overflow:'hidden',
            border: lt ? '2px solid var(--border)' : '2px solid rgba(100,140,255,0.12)',
            background: lt
              ? 'var(--surface)'
              : 'linear-gradient(180deg, rgba(18,22,48,1) 0%, rgba(12,16,38,1) 100%)',
            boxShadow: lt
              ? '0 4px 20px rgba(0,0,0,0.08)'
              : '0 8px 40px rgba(0,0,0,0.4), inset 0 1px 0 rgba(100,140,255,0.08)',
          }}>
            {/* Day headers */}
            <div style={{ display:'grid', gridTemplateColumns:'repeat(7,1fr)' }}>
              {DAYS.map(d=>(
                <div key={d} className="cal-header-cell" style={{
                  padding:'14px 4px', textAlign:'center', fontSize:12, fontWeight:800,
                  color: lt ? '#64748B' : '#a0b4e0', letterSpacing:'0.12em', textTransform:'uppercase',
                  background: lt
                    ? 'linear-gradient(180deg, #f0e4d4 0%, #e8dcc8 100%)'
                    : 'linear-gradient(180deg, rgba(35,45,90,0.9) 0%, rgba(25,32,70,0.9) 100%)',
                  borderBottom: lt ? '2px solid var(--border)' : '2px solid rgba(100,140,255,0.2)',
                }}>
                  {d}
                </div>
              ))}
            </div>

            {/* Day cells */}
            <div style={{ display:'grid', gridTemplateColumns:'repeat(7,1fr)' }}>
              {cells.map((day,i)=>{
                const dk = day ? mdk(day) : null
                const ce = dk ? (eventsMap.get(dk)??[]) : []
                const isT = dk===todayKey, isSel = dk===selectedDate
                const hasOD = ce.some(e=>e.urgency==='overdue')
                const hasTW = ce.some(e=>e.urgency==='this_week'||e.urgency==='today')
                const hasFut = ce.some(e=>e.urgency==='future')
                const hasEv = ce.length>0

                let bg = lt ? 'var(--surface)' : 'rgba(14,18,40,0.6)'
                if (isSel) bg = lt ? 'rgba(0,113,227,0.1)' : 'rgba(0,122,255,0.18)'
                else if (hasOD) bg = lt ? 'rgba(220,38,38,0.06)' : 'rgba(255,69,58,0.08)'
                else if (hasTW) bg = lt ? 'rgba(202,138,4,0.05)' : 'rgba(255,214,10,0.06)'
                else if (hasFut) bg = lt ? 'rgba(22,163,74,0.04)' : 'rgba(48,209,88,0.05)'
                else if (isT) bg = lt ? 'rgba(0,113,227,0.06)' : 'rgba(0,122,255,0.08)'

                const cellClass = `cal-cell${hasOD?' cal-has-overdue':''}${hasTW&&!hasOD?' cal-has-week':''}${hasFut&&!hasOD&&!hasTW?' cal-has-future':''}`
                const isHovered = dk === hoveredCell && hasEv
                const colIdx = i % 7 // 0=Sun through 6=Sat
                const tooltipPos = colIdx >= 4 ? 'left' as const : 'right' as const

                return (
                  <div
                    key={i}
                    className={day ? cellClass : ''}
                    onClick={()=>day&&setSelectedDate(dk===selectedDate?null:dk)}
                    onMouseEnter={()=>day&&hasEv&&setHoveredCell(dk)}
                    onMouseLeave={()=>setHoveredCell(null)}
                    style={{
                      minHeight:95, padding:'7px 7px 5px',
                      borderRight: lt ? '1px solid var(--border)' : '1px solid rgba(100,140,255,0.08)',
                      borderBottom: lt ? '1px solid var(--border)' : '1px solid rgba(100,140,255,0.08)',
                      background:bg, cursor:day?'pointer':'default',
                    }}
                  >
                    {/* Tooltip */}
                    {isHovered && <CalendarTooltip events={ce} position={tooltipPos} lt={lt} />}
                    {day && (<>
                      {/* Day number + event count */}
                      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:5 }}>
                        <div>
                          {hasEv && (
                            <span style={{
                              fontSize:9, fontWeight:700, padding:'1px 6px', borderRadius:10,
                              background: hasOD ? (lt ? 'rgba(220,38,38,0.12)' : 'rgba(255,69,58,0.2)') : hasTW ? (lt ? 'rgba(202,138,4,0.1)' : 'rgba(255,214,10,0.15)') : (lt ? 'rgba(22,163,74,0.1)' : 'rgba(48,209,88,0.15)'),
                              color: hasOD ? (lt ? '#DC2626' : '#ff6b6b') : hasTW ? (lt ? '#CA8A04' : '#ffe066') : (lt ? '#16A34A' : '#4ade80'),
                            }}>
                              {ce.length}
                            </span>
                          )}
                        </div>
                        {isT ? (
                          <span style={{
                            display:'inline-flex', width:30, height:30, alignItems:'center', justifyContent:'center',
                            borderRadius:'50%', background:'linear-gradient(135deg, #007aff, #0055cc)',
                            color:'#fff', fontSize:14, fontWeight:800,
                            boxShadow:'0 0 16px rgba(0,122,255,0.5), 0 2px 8px rgba(0,0,0,0.3)',
                          }}>{day}</span>
                        ) : (
                          <span style={{
                            fontSize:14, fontWeight:hasEv?700:400,
                            color:isSel ? (lt ? '#0071e3' : '#fff') : hasEv ? (lt ? '#0F172A' : '#d0daf0') : (lt ? '#94A3B8' : '#4a5a7a'),
                          }}>{day}</span>
                        )}
                      </div>

                      {/* Event pills */}
                      {hasEv && (
                        <div style={{ display:'flex', flexDirection:'column', gap:3 }}>
                          {ce.slice(0,2).map((evt,j)=>(
                            <div key={j} className="cal-evt-pill" style={{
                              fontSize:10, padding:'3px 7px', borderRadius:7,
                              background:`${UC[evt.urgency]}22`,
                              color:UC[evt.urgency], fontWeight:700,
                              overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap',
                              borderLeft:`3px solid ${UC[evt.urgency]}`,
                              boxShadow:`0 1px 4px ${UC[evt.urgency]}15`,
                            }}>
                              {evt.clientName.split(',')[0]}
                            </div>
                          ))}
                          {ce.length>2 && <div style={{ fontSize:9, color: lt ? '#94A3B8' : '#6a7a9a', paddingLeft:6, fontWeight:600 }}>+{ce.length-2} more</div>}
                        </div>
                      )}

                      {/* Selected indicator */}
                      {isSel && (
                        <div style={{
                          position:'absolute', bottom:3, left:'50%', transform:'translateX(-50%)',
                          width:20, height:3, borderRadius:2, background:'#5ac8fa',
                          boxShadow:'0 0 8px #5ac8fa80',
                        }} />
                      )}
                    </>)}
                  </div>
                )
              })}
            </div>
          </div>

          {/* ─── Detail Panel ──────────────────────────────────────── */}
          <div style={{
            marginTop:20, borderRadius:18, overflow:'hidden',
            border: lt ? '1px solid var(--border)' : '1px solid rgba(255,255,255,0.08)',
            background: lt
              ? 'var(--surface)'
              : 'linear-gradient(160deg, rgba(20,25,50,0.6) 0%, rgba(15,18,35,0.4) 100%)',
          }}>
            <div style={{
              padding:'14px 20px', borderBottom: lt ? '1px solid var(--border)' : '1px solid rgba(100,140,255,0.1)',
              background: lt ? 'var(--surface-2)' : 'rgba(30,40,80,0.5)', display:'flex', alignItems:'center', gap:10,
            }}>
              {selectedDate && selectedEvents.length>0 && (
                <div className="pulse-dot" style={{ width:8, height:8, borderRadius:'50%', background:selectedEvents.some(e=>e.urgency==='overdue')?'#ff453a':'#ffd60a', boxShadow:`0 0 8px ${selectedEvents.some(e=>e.urgency==='overdue')?'rgba(255,69,58,0.6)':'rgba(255,214,10,0.6)'}` }} />
              )}
              <span style={{ fontSize:13, fontWeight:700, color: lt ? 'var(--text)' : '#c8d4f0' }}>
                {selectedDate ? `Deadlines — ${new Date(selectedDate+'T12:00:00').toLocaleDateString('en-US',{weekday:'long',month:'long',day:'numeric',year:'numeric'})}` : 'Deadlines'}
              </span>
              {selectedEvents.length>0 && <span style={{ fontSize:11, padding:'2px 10px', borderRadius:20, background: lt ? 'rgba(0,113,227,0.08)' : 'rgba(100,140,255,0.1)', color: lt ? '#0071e3' : '#8b9cc7', fontWeight:600 }}>{selectedEvents.length}</span>}
            </div>
            <div style={{ padding:'12px 16px 16px' }}>
              {!selectedDate ? <div style={{fontSize:13,color: lt ? 'var(--text-secondary)' : '#5a6a8a',padding:12,textAlign:'center'}}>{loading?'Loading…':'No due clients in this month.'}</div>
                : selectedEvents.length===0 ? <div style={{fontSize:13,color: lt ? 'var(--text-secondary)' : '#5a6a8a',padding:12,textAlign:'center'}}>No deadlines</div>
                : <div style={{display:'flex',flexDirection:'column',gap:6}}>{selectedEvents.map((e,i)=><DI key={i} evt={e} idx={i}/>)}</div>}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
