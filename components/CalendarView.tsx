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

interface Props { assignedTo?: string | null }

function toDateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

const UC: Record<CalendarEvent['urgency'], string> = { overdue: '#ff453a', today: '#ff9f0a', this_week: '#ffd60a', this_month: '#ffd60a', future: '#30d158' }
const UL: Record<CalendarEvent['urgency'], string> = { overdue: 'OVERDUE', today: 'TODAY', this_week: 'This Week', this_month: 'This Month', future: 'Upcoming' }

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
  const today = new Date(); today.setHours(0,0,0,0)
  const todayKey = toDateKey(today)

  const [view, setView] = useState<ViewType>('month')
  const [currentDate, setCurrentDate] = useState(new Date(today))
  const [year, setYear] = useState(today.getFullYear())
  const [month, setMonth] = useState(today.getMonth())
  const [selectedDate, setSelectedDate] = useState<string | null>(null)
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

  const navBtn: React.CSSProperties = { background:'rgba(255,255,255,0.04)', border:'1px solid rgba(255,255,255,0.1)', borderRadius:10, padding:'8px 14px', color:'#fff', cursor:'pointer', fontSize:14, transition:'background 0.2s' }
  const todayBtn: React.CSSProperties = { background:'rgba(0,122,255,0.12)', border:'1px solid rgba(0,122,255,0.25)', borderRadius:10, padding:'8px 16px', color:'#5ac8fa', cursor:'pointer', fontSize:12, fontWeight:700, transition:'all 0.2s' }

  return (
    <div>
      {/* ─── Top Bar ───────────────────────────────────────────────── */}
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:20, flexWrap:'wrap', gap:12 }}>
        <div style={{ display:'flex', gap:4, background:'rgba(255,255,255,0.04)', borderRadius:10, padding:3 }}>
          {(['day','week','month'] as ViewType[]).map(v=>(
            <button key={v} onClick={()=>setView(v)} style={{
              padding:'7px 18px', borderRadius:8, border:'none', cursor:'pointer', fontSize:13,
              fontWeight:view===v?700:500, background:view===v?'rgba(0,122,255,0.2)':'transparent',
              color:view===v?'#5ac8fa':'var(--text-secondary)', transition:'all 0.2s',
            }}>{v[0].toUpperCase()+v.slice(1)}</button>
          ))}
        </div>
        <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
          <StatChip label="overdue" count={stats.overdue} color="#ff453a" rgb="255,69,58" />
          <StatChip label="this week" count={stats.thisWeek} color="#ffd60a" rgb="255,214,10" />
          <StatChip label="upcoming" count={stats.upcoming} color="#30d158" rgb="48,209,88" />
        </div>
        {loading && <div style={{ fontSize:12, color:'rgba(160,180,255,0.4)' }}>Loading…</div>}
      </div>

      {/* ─── Day View ──────────────────────────────────────────────── */}
      {view==='day' && (
        <div>
          <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:20, flexWrap:'wrap' }}>
            <button onClick={()=>{const d=new Date(currentDate);d.setDate(d.getDate()-1);setCurrentDate(d)}} style={navBtn}>←</button>
            <span style={{ fontSize:17, fontWeight:700, flex:1, textAlign:'center', color:'#fff' }}>{currentDate.toLocaleDateString('en-US',{weekday:'long',year:'numeric',month:'long',day:'numeric'})}</span>
            <button onClick={()=>{const d=new Date(currentDate);d.setDate(d.getDate()+1);setCurrentDate(d)}} style={navBtn}>→</button>
            <button onClick={()=>setCurrentDate(new Date(today))} style={todayBtn}>Today</button>
          </div>
          {dayEvents.length===0 ? <div style={{textAlign:'center',padding:'48px 0',color:'rgba(255,255,255,0.25)',fontSize:15}}>No deadlines ✅</div>
            : <div style={{display:'flex',flexDirection:'column',gap:6}}>{dayEvents.map((e,i)=><DI key={i} evt={e} idx={i}/>)}</div>}
        </div>
      )}

      {/* ─── Week View ─────────────────────────────────────────────── */}
      {view==='week' && (
        <div>
          <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:20, flexWrap:'wrap' }}>
            <button onClick={()=>{const d=new Date(currentDate);d.setDate(d.getDate()-7);setCurrentDate(d)}} style={navBtn}>←</button>
            <span style={{ fontSize:16, fontWeight:700, flex:1, textAlign:'center', color:'#fff' }}>Week of {MONTH_SHORT[weekStart.getMonth()]} {weekStart.getDate()} – {MONTH_SHORT[weekEnd.getMonth()]} {weekEnd.getDate()}, {weekEnd.getFullYear()}</span>
            <button onClick={()=>{const d=new Date(currentDate);d.setDate(d.getDate()+7);setCurrentDate(d)}} style={navBtn}>→</button>
            <button onClick={()=>setCurrentDate(new Date(today))} style={todayBtn}>Today</button>
          </div>
          <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
            {weekDays.map((dd,i)=>{
              const dk=toDateKey(dd), isT=dk===todayKey, past=dk<todayKey, items=eventsMap.get(dk)??[]
              return (
                <div key={i} style={{ borderLeft:isT?'3px solid #5ac8fa':'3px solid rgba(255,255,255,0.08)', paddingLeft:16, opacity:past?0.5:1 }}>
                  <div style={{ fontSize:11, fontWeight:700, letterSpacing:'0.08em', textTransform:'uppercase', color:isT?'#5ac8fa':'rgba(255,255,255,0.4)', marginBottom:8 }}>
                    {dd.toLocaleDateString('en-US',{weekday:'long',month:'short',day:'numeric'})}
                    {items.length>0 && <span style={{ marginLeft:8, fontSize:10, padding:'2px 8px', borderRadius:8, background:'rgba(255,255,255,0.06)', color:'var(--text-secondary)' }}>{items.length}</span>}
                  </div>
                  {items.length===0 ? <div style={{fontSize:12,color:'rgba(255,255,255,0.15)',fontStyle:'italic'}}>(nothing due)</div>
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
            <span style={{ fontSize:20, fontWeight:800, minWidth:200, textAlign:'center', color:'#fff' }}>{MONTH_NAMES[month]} {year}</span>
            <button onClick={nextMonth} style={navBtn}>→</button>
            <button onClick={()=>{setYear(today.getFullYear());setMonth(today.getMonth())}} style={todayBtn}>Today</button>
          </div>

          {/* Legend */}
          <div style={{ display:'flex', gap:16, marginBottom:16, flexWrap:'wrap' }}>
            {[{l:'Overdue',c:'#ff453a'},{l:'Today',c:'#ff9f0a'},{l:'This Week',c:'#ffd60a'},{l:'Future',c:'#30d158'}].map(({l,c})=>(
              <div key={l} style={{ display:'flex', alignItems:'center', gap:6, fontSize:11, color:'rgba(255,255,255,0.5)' }}>
                <span style={{ width:8, height:8, borderRadius:'50%', background:c, boxShadow:`0 0 4px ${c}50` }} />{l}
              </div>
            ))}
          </div>

          {/* Calendar Grid */}
          <div className="cal-grid" style={{
            borderRadius:18, overflow:'hidden',
            border:'2px solid rgba(100,140,255,0.12)',
            background:'linear-gradient(180deg, rgba(18,22,48,1) 0%, rgba(12,16,38,1) 100%)',
            boxShadow:'0 8px 40px rgba(0,0,0,0.4), inset 0 1px 0 rgba(100,140,255,0.08)',
          }}>
            {/* Day headers */}
            <div style={{ display:'grid', gridTemplateColumns:'repeat(7,1fr)' }}>
              {DAYS.map(d=>(
                <div key={d} className="cal-header-cell" style={{
                  padding:'14px 4px', textAlign:'center', fontSize:12, fontWeight:800,
                  color:'#a0b4e0', letterSpacing:'0.12em', textTransform:'uppercase',
                  background:'linear-gradient(180deg, rgba(35,45,90,0.9) 0%, rgba(25,32,70,0.9) 100%)',
                  borderBottom:'2px solid rgba(100,140,255,0.2)',
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

                let bg = 'rgba(14,18,40,0.6)'
                if (isSel) bg = 'rgba(0,122,255,0.18)'
                else if (hasOD) bg = 'rgba(255,69,58,0.08)'
                else if (hasTW) bg = 'rgba(255,214,10,0.06)'
                else if (hasFut) bg = 'rgba(48,209,88,0.05)'
                else if (isT) bg = 'rgba(0,122,255,0.08)'

                const cellClass = `cal-cell${hasOD?' cal-has-overdue':''}${hasTW&&!hasOD?' cal-has-week':''}${hasFut&&!hasOD&&!hasTW?' cal-has-future':''}`

                return (
                  <div key={i} className={day ? cellClass : ''} onClick={()=>day&&setSelectedDate(dk===selectedDate?null:dk)} style={{
                    minHeight:95, padding:'7px 7px 5px',
                    borderRight:'1px solid rgba(100,140,255,0.08)',
                    borderBottom:'1px solid rgba(100,140,255,0.08)',
                    background:bg, cursor:day?'pointer':'default',
                  }}>
                    {day && (<>
                      {/* Day number + event count */}
                      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:5 }}>
                        <div>
                          {hasEv && (
                            <span style={{
                              fontSize:9, fontWeight:700, padding:'1px 6px', borderRadius:10,
                              background: hasOD ? 'rgba(255,69,58,0.2)' : hasTW ? 'rgba(255,214,10,0.15)' : 'rgba(48,209,88,0.15)',
                              color: hasOD ? '#ff6b6b' : hasTW ? '#ffe066' : '#4ade80',
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
                            color:isSel ? '#fff' : hasEv ? '#d0daf0' : '#4a5a7a',
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
                          {ce.length>2 && <div style={{ fontSize:9, color:'#6a7a9a', paddingLeft:6, fontWeight:600 }}>+{ce.length-2} more</div>}
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
            border:'1px solid rgba(255,255,255,0.08)',
            background:'linear-gradient(160deg, rgba(20,25,50,0.6) 0%, rgba(15,18,35,0.4) 100%)',
          }}>
            <div style={{
              padding:'14px 20px', borderBottom:'1px solid rgba(100,140,255,0.1)',
              background:'rgba(30,40,80,0.5)', display:'flex', alignItems:'center', gap:10,
            }}>
              {selectedDate && selectedEvents.length>0 && (
                <div className="pulse-dot" style={{ width:8, height:8, borderRadius:'50%', background:selectedEvents.some(e=>e.urgency==='overdue')?'#ff453a':'#ffd60a', boxShadow:`0 0 8px ${selectedEvents.some(e=>e.urgency==='overdue')?'rgba(255,69,58,0.6)':'rgba(255,214,10,0.6)'}` }} />
              )}
              <span style={{ fontSize:13, fontWeight:700, color:'#c8d4f0' }}>
                {selectedDate ? `Deadlines — ${new Date(selectedDate+'T12:00:00').toLocaleDateString('en-US',{weekday:'long',month:'long',day:'numeric',year:'numeric'})}` : 'Deadlines'}
              </span>
              {selectedEvents.length>0 && <span style={{ fontSize:11, padding:'2px 10px', borderRadius:20, background:'rgba(100,140,255,0.1)', color:'#8b9cc7', fontWeight:600 }}>{selectedEvents.length}</span>}
            </div>
            <div style={{ padding:'12px 16px 16px' }}>
              {!selectedDate ? <div style={{fontSize:13,color:'#5a6a8a',padding:12,textAlign:'center'}}>{loading?'Loading…':'No due clients in this month.'}</div>
                : selectedEvents.length===0 ? <div style={{fontSize:13,color:'#5a6a8a',padding:12,textAlign:'center'}}>No deadlines</div>
                : <div style={{display:'flex',flexDirection:'column',gap:6}}>{selectedEvents.map((e,i)=><DI key={i} evt={e} idx={i}/>)}</div>}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
