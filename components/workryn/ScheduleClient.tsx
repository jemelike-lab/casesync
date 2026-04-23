'use client'
import { useState } from 'react'
import { ChevronLeft, ChevronRight, Plus, X, Loader2 } from 'lucide-react'
import { getInitials } from '@/lib/workryn/utils'

type ViewMode = 'month' | 'week' | 'day'

function canManageSchedule(role: string): boolean {
  return ['ADMIN','MANAGER','OWNER','SUPERVISOR','TEAM_MANAGER'].includes(role)
}
function canViewAllStaff(role: string): boolean {
  return ['ADMIN','MANAGER','OWNER','SUPERVISOR','TEAM_MANAGER'].includes(role)
}
function getRoleLabel(role: string): string {
  const map: Record<string,string> = {
    SUPPORT_PLANNER:'Support Planner',TEAM_MANAGER:'Team Manager',
    SUPERVISOR:'Supervisor',STAFF:'Staff',ADMIN:'Admin',MANAGER:'Manager',OWNER:'Owner',
  }
  return map[role] ?? role
}

type Shift = {
  id: string; title: string; notes: string | null
  startTime: string; endTime: string; color: string
  departmentId: string | null
  user: { id: string; name: string | null; avatarColor: string; jobTitle: string | null } | null
}
type StaffUser = { id: string; name: string | null; avatarColor: string; role: string; jobTitle: string | null }
type Department = { id: string; name: string; color: string }

const SHIFT_COLORS = ['#6366f1','#10b981','#f59e0b','#ef4444','#8b5cf6','#06b6d4','#f97316']
const DAYS_SHORT = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']
const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December']

interface Props {
  initialShifts: Shift[]
  users: StaffUser[]
  departments: Department[]
  currentUser: { id: string; role: string }
  weekStart: string
}

/** Full locale time for modals / day view */
function fmt(iso: string) {
  return new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
}
/** Short time label for shift chips: "9a", "12p", "5:30p" */
function fmtShort(iso: string) {
  const d = new Date(iso)
  const h = d.getHours()
  const m = d.getMinutes()
  const ampm = h < 12 ? 'a' : 'p'
  const h12 = h % 12 === 0 ? 12 : h % 12
  return m === 0 ? `${h12}${ampm}` : `${h12}:${String(m).padStart(2,'0')}${ampm}`
}

function sameDay(a: Date, b: Date) {
  return a.getFullYear()===b.getFullYear()&&a.getMonth()===b.getMonth()&&a.getDate()===b.getDate()
}
function startOfMonth(d: Date) { return new Date(d.getFullYear(), d.getMonth(), 1) }
function endOfMonth(d: Date) { return new Date(d.getFullYear(), d.getMonth()+1, 0) }
function startOfWeek(d: Date) {
  const c = new Date(d); c.setHours(0,0,0,0)
  const day = c.getDay(); const diff = day===0?-6:1-day; c.setDate(c.getDate()+diff); return c
}
function addDays(d: Date, n: number) { const c=new Date(d); c.setDate(c.getDate()+n); return c }
function addMonths(d: Date, n: number) { return new Date(d.getFullYear(), d.getMonth()+n, 1) }

// Sticky staff column width
const STAFF_COL_W = 220

export default function ScheduleClient({ initialShifts, users, departments, currentUser }: Props) {
  const [shifts, setShifts] = useState<Shift[]>(initialShifts)
  const [view, setView] = useState<ViewMode>('week')          // ← default week
  const [cursor, setCursor] = useState(new Date())
  const [saving, setSaving] = useState(false)
  const [filterUserId, setFilterUserId] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [editingId, setEditingId] = useState<string|null>(null)
  const [form, setForm] = useState({
    userId:'', title:'Shift', date:'', startTime:'09:00', endTime:'17:00',
    color: SHIFT_COLORS[0], departmentId:'', notes:''
  })

  const isManager = canManageSchedule(currentUser.role)
  const canSeeAll = canViewAllStaff(currentUser.role)
  const today = new Date()

  const visibleUsers = canSeeAll
    ? (filterUserId ? users.filter(u=>u.id===filterUserId) : users)
    : users.filter(u=>u.id===currentUser.id)

  // ── Navigation ────────────────────────────────────────────
  function prev() {
    if (view==='month') setCursor(c=>addMonths(c,-1))
    else if (view==='week') setCursor(c=>addDays(startOfWeek(c),-7))
    else setCursor(c=>addDays(c,-1))
  }
  function next() {
    if (view==='month') setCursor(c=>addMonths(c,1))
    else if (view==='week') setCursor(c=>addDays(startOfWeek(c),7))
    else setCursor(c=>addDays(c,1))
  }
  function goToday() { setCursor(new Date()) }

  function headerLabel() {
    if (view==='month') return `${MONTHS[cursor.getMonth()]} ${cursor.getFullYear()}`
    if (view==='week') {
      const ws = startOfWeek(cursor)
      const we = addDays(ws,6)
      return `${ws.toLocaleDateString([],{month:'short',day:'numeric'})} – ${we.toLocaleDateString([],{month:'short',day:'numeric',year:'numeric'})}`
    }
    return cursor.toLocaleDateString([],{weekday:'long',month:'long',day:'numeric',year:'numeric'})
  }

  // ── Save / Delete ────────────────────────────────────────
  async function handleSave() {
    setSaving(true)
    const startTime = new Date(`${form.date}T${form.startTime}`).toISOString()
    const endTime   = new Date(`${form.date}T${form.endTime}`).toISOString()
    const body: Record<string,unknown> = {
      userId: form.userId || null,
      title: form.title, startTime, endTime,
      color: form.color, notes: form.notes||null,
      departmentId: form.departmentId||null
    }
    if (editingId) body.id = editingId
    const res = await fetch('/api/workryn/shifts',{
      method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(body)
    })
    if (res.ok) {
      const saved = await res.json()
      setShifts(p=>editingId ? p.map(s=>s.id===editingId?saved:s) : [...p,saved])
      setShowModal(false); setEditingId(null)
      setForm({userId:'',title:'Shift',date:'',startTime:'09:00',endTime:'17:00',color:SHIFT_COLORS[0],departmentId:'',notes:''})
    }
    setSaving(false)
  }

  async function handleDelete(id: string) {
    await fetch(`/api/workryn/shifts/${id}`,{method:'DELETE'})
    setShifts(p=>p.filter(s=>s.id!==id))
  }

  function openNew(userId: string, date: Date) {
    if (!isManager) return
    setForm({
      userId, title:'Shift',
      date: date.toISOString().split('T')[0],
      startTime:'09:00', endTime:'17:00',
      color: SHIFT_COLORS[Math.floor(Math.random()*SHIFT_COLORS.length)],
      departmentId:'', notes:''
    })
    setEditingId(null); setShowModal(true)
  }

  function openEdit(s: Shift) {
    if (!isManager) return
    const d = new Date(s.startTime)
    setForm({
      userId: s.user?.id ?? '',
      title: s.title,
      date: d.toISOString().split('T')[0],
      startTime: d.toTimeString().slice(0,5),
      endTime: new Date(s.endTime).toTimeString().slice(0,5),
      color: s.color,
      departmentId: s.departmentId||'',
      notes: s.notes||''
    })
    setEditingId(s.id); setShowModal(true)
  }

  // ── MONTH VIEW ───────────────────────────────────────────
  function MonthView() {
    const monthStart = startOfMonth(cursor)
    const monthEnd   = endOfMonth(cursor)
    const gridStart  = startOfWeek(monthStart)
    const gridEnd    = addDays(startOfWeek(monthEnd), 6)
    const days: Date[] = []
    let d = new Date(gridStart)
    while (d <= gridEnd) { days.push(new Date(d)); d = addDays(d, 1) }

    return (
      <div className="sched-month">
        <div className="sched-month-header">
          {['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map(n=>(
            <div key={n} className="sched-month-dow">{n}</div>
          ))}
        </div>
        <div className="sched-month-grid">
          {days.map((day, i) => {
            const isToday = sameDay(day, today)
            const isOtherMonth = day.getMonth() !== cursor.getMonth()
            const dayShifts = shifts.filter(s => sameDay(new Date(s.startTime), day))
            return (
              <div key={i}
                className={`sched-month-cell${isToday?' sched-month-today':''}${isOtherMonth?' sched-month-other':''}`}
                onClick={() => isManager && openNew(form.userId||visibleUsers[0]?.id||'', day)}
              >
                <span className={`sched-month-date${isToday?' sched-month-date-today':''}`}>{day.getDate()}</span>
                <div className="sched-month-chips">
                  {dayShifts.slice(0,3).map(shift=>(
                    <div key={shift.id} className="sched-month-chip"
                      style={{ background: shift.color+'22', borderLeft: `3px solid ${shift.color}` }}
                      onClick={e=>{ e.stopPropagation(); openEdit(shift) }}
                    >
                      <span className="sched-month-chip-time">{fmt(shift.startTime)}</span>
                      <span className="sched-month-chip-name">{shift.user?.name?.split(' ')[0] ?? 'Unassigned'}</span>
                      <span className="sched-month-chip-title">{shift.title}</span>
                    </div>
                  ))}
                  {dayShifts.length>3 && (
                    <div className="sched-month-more">+{dayShifts.length-3} more</div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  // ── WEEK VIEW ────────────────────────────────────────────
  function WeekView() {
    const ws = startOfWeek(cursor)
    const weekDates = Array.from({length:7},(_,i)=>addDays(ws,i))

    // Unassigned shifts this week (user is null)
    const unassignedThisWeek = shifts.filter(s =>
      !s.user && weekDates.some(day => sameDay(new Date(s.startTime), day))
    )

    return (
      <div className="sched-grid-wrap" style={{overflowX:'auto'}}>
        <div className="sched-grid" style={{minWidth: STAFF_COL_W + 7*110}}>

          {/* Column headers */}
          <div className="sched-grid-header" style={{display:'flex'}}>
            {/* Sticky corner */}
            <div className="sched-grid-corner" style={{
              width: STAFF_COL_W, minWidth: STAFF_COL_W, flexShrink: 0,
              position:'sticky', left:0, zIndex:3,
              background:'var(--w-bg-card, #fff)',
              borderRight:'1px solid var(--w-border-subtle, #e5e7eb)',
              borderBottom:'1px solid var(--w-border-subtle, #e5e7eb)',
              display:'flex', alignItems:'center', paddingLeft:16,
              fontWeight:600, fontSize:11, letterSpacing:'0.08em',
              color:'var(--w-text-muted, #6b7280)',
            }}>
              STAFF
            </div>
            {weekDates.map((day,i)=>{
              const isToday=sameDay(day,today)
              return (
                <div key={i}
                  className={`sched-col-head${isToday?' sched-col-today':''}`}
                  style={{
                    flex:1, minWidth:110,
                    display:'flex', flexDirection:'column', alignItems:'center',
                    justifyContent:'center', padding:'8px 0',
                    borderRight:'1px solid var(--w-border-subtle, #e5e7eb)',
                    borderBottom:'1px solid var(--w-border-subtle, #e5e7eb)',
                    background: isToday
                      ? 'var(--w-accent-bg, #eff6ff)'
                      : 'var(--w-bg-card, #fff)',
                  }}
                >
                  <span className="sched-col-day" style={{
                    fontSize:11, fontWeight:600, letterSpacing:'0.06em',
                    color: isToday
                      ? 'var(--w-accent, #2563eb)'
                      : 'var(--w-text-muted, #6b7280)',
                    textTransform:'uppercase',
                  }}>
                    {DAYS_SHORT[day.getDay()]}
                  </span>
                  <span className={`sched-col-num${isToday?' sched-col-num-today':''}`} style={{
                    fontSize:18, fontWeight:700, lineHeight:1.2,
                    color: isToday
                      ? 'var(--w-accent, #2563eb)'
                      : 'var(--w-text-primary, #111827)',
                  }}>
                    {day.getDate()}
                  </span>
                </div>
              )
            })}
          </div>

          {/* Unassigned row */}
          {unassignedThisWeek.length > 0 && (
            <div className="sched-grid-row sched-unassigned-row" style={{display:'flex',borderBottom:'1px solid var(--w-border-subtle, #e5e7eb)'}}>
              {/* Staff cell */}
              <div className="sched-user-cell" style={{
                width: STAFF_COL_W, minWidth: STAFF_COL_W, flexShrink: 0,
                position:'sticky', left:0, zIndex:2,
                background:'var(--w-bg-card, #fff)',
                borderRight:'1px solid var(--w-border-subtle, #e5e7eb)',
                display:'flex', alignItems:'center', gap:10, padding:'8px 12px',
              }}>
                <div className="sched-avatar" style={{
                  width:32, height:32, borderRadius:'50%', flexShrink:0,
                  background:'var(--w-border-subtle, #e5e7eb)',
                  display:'flex', alignItems:'center', justifyContent:'center',
                  fontSize:12, fontWeight:700, color:'var(--w-text-muted, #6b7280)',
                }}>?</div>
                <div className="sched-user-info" style={{display:'flex',flexDirection:'column',minWidth:0}}>
                  <span className="sched-user-name" style={{
                    fontSize:13, fontWeight:600,
                    color:'var(--w-text-primary, #111827)',
                    whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis',
                  }}>Unassigned</span>
                  <span className="sched-user-role" style={{
                    fontSize:11, color:'var(--w-text-muted, #6b7280)',
                  }}>Open Shifts</span>
                </div>
              </div>
              {weekDates.map((date,di)=>{
                const dayShifts = unassignedThisWeek.filter(s=>sameDay(new Date(s.startTime),date))
                const isToday=sameDay(date,today)
                return (
                  <div key={di} className="sched-day-cell" style={{
                    flex:1, minWidth:110, padding:'4px 6px',
                    borderRight:'1px solid var(--w-border-subtle, #e5e7eb)',
                    background: isToday ? 'var(--w-accent-bg, #eff6ff)' : 'transparent',
                    display:'flex', flexDirection:'column', gap:3, minHeight:56,
                    cursor: isManager ? 'pointer' : 'default',
                  }}
                    onClick={()=>isManager&&openNew('',date)}
                  >
                    {dayShifts.map(shift=>(
                      <ShiftChip key={shift.id} shift={shift} isManager={isManager} onEdit={openEdit} onDelete={handleDelete}/>
                    ))}
                    {dayShifts.length===0&&isManager&&(
                      <div className="sched-cell-add" style={{
                        display:'flex',alignItems:'center',justifyContent:'center',
                        height:'100%', opacity:0, transition:'opacity 0.15s',
                        color:'var(--w-text-muted, #9ca3af)',
                      }}>
                        <Plus size={14}/>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}

          {/* Staff rows */}
          {visibleUsers.map(user=>(
            <div key={user.id} className="sched-grid-row" style={{
              display:'flex',
              borderBottom:'1px solid var(--w-border-subtle, #e5e7eb)',
            }}>
              {/* Sticky staff column */}
              <div className="sched-user-cell" style={{
                width: STAFF_COL_W, minWidth: STAFF_COL_W, flexShrink: 0,
                position:'sticky', left:0, zIndex:2,
                background:'var(--w-bg-card, #fff)',
                borderRight:'1px solid var(--w-border-subtle, #e5e7eb)',
                display:'flex', alignItems:'center', gap:10, padding:'8px 12px',
              }}>
                <div className="sched-avatar" style={{
                  width:32, height:32, borderRadius:'50%', flexShrink:0,
                  background: user.avatarColor,
                  display:'flex', alignItems:'center', justifyContent:'center',
                  fontSize:12, fontWeight:700, color:'#fff',
                }}>
                  {getInitials(user.name||'?')}
                </div>
                <div className="sched-user-info" style={{display:'flex',flexDirection:'column',minWidth:0}}>
                  <span className="sched-user-name" style={{
                    fontSize:13, fontWeight:600,
                    color:'var(--w-text-primary, #111827)',
                    whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis',
                  }}>{user.name||'Unnamed'}</span>
                  <span className="sched-user-role" style={{
                    fontSize:11, color:'var(--w-text-muted, #6b7280)',
                  }}>{user.jobTitle || getRoleLabel(user.role)}</span>
                </div>
              </div>

              {/* Day cells */}
              {weekDates.map((date,di)=>{
                const dayShifts = shifts.filter(s=>s.user?.id===user.id&&sameDay(new Date(s.startTime),date))
                const isToday=sameDay(date,today)
                return (
                  <div key={di} className="sched-day-cell" style={{
                    flex:1, minWidth:110, padding:'4px 6px',
                    borderRight:'1px solid var(--w-border-subtle, #e5e7eb)',
                    background: isToday ? 'var(--w-accent-bg, #eff6ff)' : 'transparent',
                    display:'flex', flexDirection:'column', gap:3, minHeight:56,
                    cursor: isManager ? 'pointer' : 'default',
                    position:'relative',
                  }}
                    onClick={()=>isManager&&dayShifts.length===0&&openNew(user.id,date)}
                  >
                    {dayShifts.map(shift=>(
                      <ShiftChip key={shift.id} shift={shift} isManager={isManager} onEdit={openEdit} onDelete={handleDelete}/>
                    ))}
                    {dayShifts.length===0&&isManager&&(
                      <div className="sched-cell-add" style={{
                        display:'flex',alignItems:'center',justifyContent:'center',
                        height:'100%', opacity:0, transition:'opacity 0.15s',
                        color:'var(--w-text-muted, #9ca3af)',
                      }}>
                        <Plus size={14}/>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          ))}

          {visibleUsers.length===0&&(
            <div className="sched-empty" style={{padding:'40px 24px',textAlign:'center',color:'var(--w-text-muted, #6b7280)'}}>
              No staff to display.
            </div>
          )}
        </div>

        {/* Hover styles for rows and cells */}
        <style>{`
          .sched-grid-row:hover > .sched-user-cell {
            background: var(--w-bg-hover, #f9fafb) !important;
          }
          .sched-grid-row:hover > .sched-day-cell {
            background: var(--w-bg-hover, #f9fafb) !important;
          }
          .sched-grid-row:hover > .sched-day-cell[style*="eff6ff"] {
            background: var(--w-accent-bg-hover, #dbeafe) !important;
          }
          .sched-day-cell:hover .sched-cell-add {
            opacity: 1 !important;
          }
          .sched-shift-chip:hover {
            filter: brightness(0.97);
          }
        `}</style>
      </div>
    )
  }

  // ── DAY VIEW ─────────────────────────────────────────────
  function DayView() {
    const dayShiftsAll = shifts.filter(s=>sameDay(new Date(s.startTime),cursor))
    const unassigned = dayShiftsAll.filter(s=>!s.user)
    return (
      <div className="sched-day-view">
        {/* Unassigned row */}
        {unassigned.length > 0 && (
          <div className="sched-day-row" style={{display:'flex',borderBottom:'1px solid var(--w-border-subtle, #e5e7eb)',alignItems:'stretch'}}>
            <div className="sched-user-cell" style={{borderRight:'1px solid var(--w-border-subtle)',minWidth:220,display:'flex',alignItems:'center',gap:10,padding:'10px 16px'}}>
              <div className="sched-avatar" style={{width:32,height:32,borderRadius:'50%',background:'var(--w-border-subtle,#e5e7eb)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:12,fontWeight:700,color:'var(--w-text-muted,#6b7280)'}}>?</div>
              <div className="sched-user-info" style={{display:'flex',flexDirection:'column'}}>
                <span className="sched-user-name" style={{fontSize:13,fontWeight:600,color:'var(--w-text-primary,#111827)'}}>Unassigned</span>
                <span className="sched-user-role" style={{fontSize:11,color:'var(--w-text-muted,#6b7280)'}}>Open Shifts</span>
              </div>
            </div>
            <div className="sched-day-shifts" style={{flex:1,display:'flex',flexWrap:'wrap',gap:6,padding:'8px 12px',alignItems:'flex-start'}}>
              {unassigned.map(shift=>(
                <div key={shift.id} className="sched-day-chip"
                  style={{borderLeft:`3px solid ${shift.color}`,background:shift.color+'18',borderRadius:4,padding:'4px 8px',display:'flex',alignItems:'center',gap:6,cursor:'pointer',minWidth:120}}
                  onClick={()=>openEdit(shift)}>
                  <span className="sched-day-chip-time" style={{fontSize:11,fontWeight:600,color:'var(--w-text-muted,#6b7280)'}}>{fmt(shift.startTime)}–{fmt(shift.endTime)}</span>
                  <span className="sched-day-chip-title" style={{fontSize:12,fontWeight:500,color:'var(--w-text-primary,#111827)'}}>{shift.title}</span>
                  {isManager&&<button className="sched-shift-del" style={{marginLeft:'auto',background:'none',border:'none',cursor:'pointer',padding:2,color:'var(--w-text-muted,#9ca3af)'}} onClick={e=>{e.stopPropagation();handleDelete(shift.id)}}><X size={10}/></button>}
                </div>
              ))}
            </div>
          </div>
        )}

        {visibleUsers.map(user=>{
          const userShifts = dayShiftsAll.filter(s=>s.user?.id===user.id)
          return (
            <div key={user.id} className="sched-day-row" style={{display:'flex',borderBottom:'1px solid var(--w-border-subtle, #e5e7eb)',alignItems:'stretch'}}>
              <div className="sched-user-cell" style={{borderRight:'1px solid var(--w-border-subtle)',minWidth:220,display:'flex',alignItems:'center',gap:10,padding:'10px 16px'}}>
                <div className="sched-avatar" style={{width:32,height:32,borderRadius:'50%',background:user.avatarColor,display:'flex',alignItems:'center',justifyContent:'center',fontSize:12,fontWeight:700,color:'#fff'}}>{getInitials(user.name||'?')}</div>
                <div className="sched-user-info" style={{display:'flex',flexDirection:'column'}}>
                  <span className="sched-user-name" style={{fontSize:13,fontWeight:600,color:'var(--w-text-primary,#111827)'}}>{user.name||'Unnamed'}</span>
                  <span className="sched-user-role" style={{fontSize:11,color:'var(--w-text-muted,#6b7280)'}}>{user.jobTitle || getRoleLabel(user.role)}</span>
                </div>
              </div>
              <div className="sched-day-shifts" style={{flex:1,display:'flex',flexWrap:'wrap',gap:6,padding:'8px 12px',alignItems:'flex-start'}}>
                {userShifts.length===0&&isManager&&(
                  <button className="sched-day-add-btn" style={{display:'flex',alignItems:'center',gap:4,padding:'4px 10px',border:'1px dashed var(--w-border-subtle,#e5e7eb)',borderRadius:4,background:'transparent',cursor:'pointer',fontSize:12,color:'var(--w-text-muted,#6b7280)'}} onClick={()=>openNew(user.id,cursor)}>
                    <Plus size={14}/> Add shift
                  </button>
                )}
                {userShifts.map(shift=>(
                  <div key={shift.id} className="sched-day-chip"
                    style={{borderLeft:`3px solid ${shift.color}`,background:shift.color+'18',borderRadius:4,padding:'4px 8px',display:'flex',alignItems:'center',gap:6,cursor:'pointer',minWidth:120}}
                    onClick={()=>openEdit(shift)}>
                    <span className="sched-day-chip-time" style={{fontSize:11,fontWeight:600,color:'var(--w-text-muted,#6b7280)'}}>{fmt(shift.startTime)}–{fmt(shift.endTime)}</span>
                    <span className="sched-day-chip-title" style={{fontSize:12,fontWeight:500,color:'var(--w-text-primary,#111827)'}}>{shift.title}</span>
                    {isManager&&<button className="sched-shift-del" style={{marginLeft:'auto',background:'none',border:'none',cursor:'pointer',padding:2,color:'var(--w-text-muted,#9ca3af)'}} onClick={e=>{e.stopPropagation();handleDelete(shift.id)}}><X size={10}/></button>}
                  </div>
                ))}
              </div>
            </div>
          )
        })}
        {visibleUsers.length===0&&<div className="sched-empty" style={{padding:'40px 24px',textAlign:'center',color:'var(--w-text-muted,#6b7280)'}}>No staff to display.</div>}
      </div>
    )
  }

  return (
    <div className="sched-root">
      {/* Header */}
      <div className="sched-header" style={{
        display:'flex', alignItems:'center', justifyContent:'space-between',
        flexWrap:'wrap', gap:12,
        padding:'12px 16px',
        borderBottom:'1px solid var(--w-border-subtle, #e5e7eb)',
      }}>
        {/* Left: nav */}
        <div className="sched-week-nav" style={{display:'flex',alignItems:'center',gap:4}}>
          <button className="sched-nav-btn" onClick={prev} style={{padding:6,border:'1px solid var(--w-border-subtle,#e5e7eb)',borderRadius:6,background:'transparent',cursor:'pointer',display:'flex',alignItems:'center'}}>
            <ChevronLeft size={16}/>
          </button>
          <span className="sched-week-label" style={{minWidth:160,textAlign:'center',fontWeight:600,fontSize:14,color:'var(--w-text-primary,#111827)'}}>
            {headerLabel()}
          </span>
          <button className="sched-nav-btn" onClick={next} style={{padding:6,border:'1px solid var(--w-border-subtle,#e5e7eb)',borderRadius:6,background:'transparent',cursor:'pointer',display:'flex',alignItems:'center'}}>
            <ChevronRight size={16}/>
          </button>
          <button className="sched-today-btn" onClick={goToday} style={{marginLeft:4,padding:'5px 10px',border:'1px solid var(--w-border-subtle,#e5e7eb)',borderRadius:6,background:'transparent',cursor:'pointer',fontSize:12,fontWeight:500,color:'var(--w-text-muted,#6b7280)'}}>
            Today
          </button>
        </div>

        {/* Right: toolbar */}
        <div className="sched-toolbar" style={{display:'flex',alignItems:'center',gap:8,flexWrap:'wrap'}}>
          {/* View toggle */}
          <div className="sched-view-toggle" style={{display:'flex',border:'1px solid var(--w-border-subtle,#e5e7eb)',borderRadius:6,overflow:'hidden'}}>
            {(['day','week','month'] as ViewMode[]).map(v=>(
              <button key={v}
                className={`sched-view-btn${view===v?' sched-view-btn-active':''}`}
                onClick={()=>setView(v)}
                style={{
                  padding:'5px 12px', border:'none', cursor:'pointer', fontSize:12, fontWeight:500,
                  background: view===v ? 'var(--w-accent,#2563eb)' : 'transparent',
                  color: view===v ? '#fff' : 'var(--w-text-muted,#6b7280)',
                  transition:'background 0.15s, color 0.15s',
                }}
              >
                {v.charAt(0).toUpperCase()+v.slice(1)}
              </button>
            ))}
          </div>

          {canSeeAll&&(
            <select className="sched-filter" value={filterUserId} onChange={e=>setFilterUserId(e.target.value)}
              style={{padding:'5px 8px',border:'1px solid var(--w-border-subtle,#e5e7eb)',borderRadius:6,fontSize:12,color:'var(--w-text-primary,#111827)',background:'var(--w-bg-card,#fff)',cursor:'pointer'}}>
              <option value="">All Staff</option>
              {users.map(u=><option key={u.id} value={u.id}>{u.name||'Unnamed'}</option>)}
            </select>
          )}

          {isManager&&(
            <button className="sched-add-btn" onClick={()=>{
              setEditingId(null)
              setForm({userId:'',title:'Shift',date:cursor.toISOString().split('T')[0],startTime:'09:00',endTime:'17:00',color:SHIFT_COLORS[0],departmentId:'',notes:''})
              setShowModal(true)
            }} style={{display:'flex',alignItems:'center',gap:4,padding:'5px 12px',background:'var(--w-accent,#2563eb)',color:'#fff',border:'none',borderRadius:6,cursor:'pointer',fontSize:12,fontWeight:600}}>
              <Plus size={14}/> Add Shift
            </button>
          )}
        </div>
      </div>

      {/* Views */}
      {view==='month' && <MonthView/>}
      {view==='week'  && <WeekView/>}
      {view==='day'   && <DayView/>}

      {/* Modal */}
      {showModal&&(
        <div className="sched-overlay" onClick={()=>setShowModal(false)} style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.4)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:50}}>
          <div className="sched-modal" onClick={e=>e.stopPropagation()} style={{background:'var(--w-bg-card,#fff)',borderRadius:12,width:'100%',maxWidth:440,boxShadow:'0 20px 60px rgba(0,0,0,0.15)',overflow:'hidden'}}>
            <div className="sched-modal-header" style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'16px 20px',borderBottom:'1px solid var(--w-border-subtle,#e5e7eb)'}}>
              <h3 style={{margin:0,fontSize:15,fontWeight:700,color:'var(--w-text-primary,#111827)'}}>{editingId?'Edit Shift':'New Shift'}</h3>
              <button className="sched-modal-close" onClick={()=>setShowModal(false)} style={{background:'none',border:'none',cursor:'pointer',color:'var(--w-text-muted,#6b7280)',display:'flex',alignItems:'center'}}><X size={16}/></button>
            </div>
            <div className="sched-modal-body" style={{padding:'16px 20px',display:'flex',flexDirection:'column',gap:12}}>
              <label className="sched-field" style={{display:'flex',flexDirection:'column',gap:4}}>
                <span style={{fontSize:12,fontWeight:500,color:'var(--w-text-muted,#6b7280)'}}>Employee</span>
                <select value={form.userId} onChange={e=>setForm({...form,userId:e.target.value})} style={{padding:'6px 8px',border:'1px solid var(--w-border-subtle,#e5e7eb)',borderRadius:6,fontSize:13}}>
                  <option value="">Unassigned</option>
                  {users.map(u=><option key={u.id} value={u.id}>{u.name||'Unnamed'}</option>)}
                </select>
              </label>
              <label className="sched-field" style={{display:'flex',flexDirection:'column',gap:4}}>
                <span style={{fontSize:12,fontWeight:500,color:'var(--w-text-muted,#6b7280)'}}>Title</span>
                <input value={form.title} onChange={e=>setForm({...form,title:e.target.value})} style={{padding:'6px 8px',border:'1px solid var(--w-border-subtle,#e5e7eb)',borderRadius:6,fontSize:13}}/>
              </label>
              <label className="sched-field" style={{display:'flex',flexDirection:'column',gap:4}}>
                <span style={{fontSize:12,fontWeight:500,color:'var(--w-text-muted,#6b7280)'}}>Date</span>
                <input type="date" value={form.date} onChange={e=>setForm({...form,date:e.target.value})} style={{padding:'6px 8px',border:'1px solid var(--w-border-subtle,#e5e7eb)',borderRadius:6,fontSize:13}}/>
              </label>
              <div className="sched-field-row" style={{display:'flex',gap:8}}>
                <label className="sched-field" style={{flex:1,display:'flex',flexDirection:'column',gap:4}}>
                  <span style={{fontSize:12,fontWeight:500,color:'var(--w-text-muted,#6b7280)'}}>Start</span>
                  <input type="time" value={form.startTime} onChange={e=>setForm({...form,startTime:e.target.value})} style={{padding:'6px 8px',border:'1px solid var(--w-border-subtle,#e5e7eb)',borderRadius:6,fontSize:13}}/>
                </label>
                <label className="sched-field" style={{flex:1,display:'flex',flexDirection:'column',gap:4}}>
                  <span style={{fontSize:12,fontWeight:500,color:'var(--w-text-muted,#6b7280)'}}>End</span>
                  <input type="time" value={form.endTime} onChange={e=>setForm({...form,endTime:e.target.value})} style={{padding:'6px 8px',border:'1px solid var(--w-border-subtle,#e5e7eb)',borderRadius:6,fontSize:13}}/>
                </label>
              </div>
              {departments.length>0&&(
                <label className="sched-field" style={{display:'flex',flexDirection:'column',gap:4}}>
                  <span style={{fontSize:12,fontWeight:500,color:'var(--w-text-muted,#6b7280)'}}>Department</span>
                  <select value={form.departmentId} onChange={e=>setForm({...form,departmentId:e.target.value})} style={{padding:'6px 8px',border:'1px solid var(--w-border-subtle,#e5e7eb)',borderRadius:6,fontSize:13}}>
                    <option value="">None</option>
                    {departments.map(d=><option key={d.id} value={d.id}>{d.name}</option>)}
                  </select>
                </label>
              )}
              <label className="sched-field" style={{display:'flex',flexDirection:'column',gap:4}}>
                <span style={{fontSize:12,fontWeight:500,color:'var(--w-text-muted,#6b7280)'}}>Color</span>
                <div className="sched-color-row" style={{display:'flex',gap:6}}>
                  {SHIFT_COLORS.map(c=>(
                    <button key={c}
                      className={`sched-color-swatch${form.color===c?' sched-color-active':''}`}
                      style={{
                        width:24, height:24, borderRadius:'50%', background:c, border:'none',
                        cursor:'pointer', outline: form.color===c ? `2px solid ${c}` : 'none',
                        outlineOffset:2,
                      }}
                      onClick={()=>setForm({...form,color:c})}/>
                  ))}
                </div>
              </label>
              <label className="sched-field" style={{display:'flex',flexDirection:'column',gap:4}}>
                <span style={{fontSize:12,fontWeight:500,color:'var(--w-text-muted,#6b7280)'}}>Notes</span>
                <textarea value={form.notes} rows={2} onChange={e=>setForm({...form,notes:e.target.value})} style={{padding:'6px 8px',border:'1px solid var(--w-border-subtle,#e5e7eb)',borderRadius:6,fontSize:13,resize:'vertical'}}/>
              </label>
            </div>
            <div className="sched-modal-footer" style={{display:'flex',alignItems:'center',gap:8,padding:'12px 20px',borderTop:'1px solid var(--w-border-subtle,#e5e7eb)'}}>
              {editingId&&<button className="sched-btn-danger" onClick={()=>{handleDelete(editingId);setShowModal(false)}} style={{padding:'6px 12px',background:'#fee2e2',color:'#dc2626',border:'none',borderRadius:6,cursor:'pointer',fontSize:12,fontWeight:600}}>Delete</button>}
              <div style={{flex:1}}/>
              <button className="sched-btn-ghost" onClick={()=>setShowModal(false)} style={{padding:'6px 12px',background:'transparent',border:'1px solid var(--w-border-subtle,#e5e7eb)',borderRadius:6,cursor:'pointer',fontSize:12,fontWeight:500,color:'var(--w-text-muted,#6b7280)'}}>Cancel</button>
              <button className="sched-btn-primary" onClick={handleSave} disabled={saving} style={{padding:'6px 14px',background:'var(--w-accent,#2563eb)',color:'#fff',border:'none',borderRadius:6,cursor:'pointer',fontSize:12,fontWeight:600,display:'flex',alignItems:'center',gap:4,opacity:saving?0.7:1}}>
                {saving?<Loader2 size={14} className="sched-spin"/>:null}
                {editingId?'Update':'Create'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Shift Chip (shared between rows) ──────────────────────
function ShiftChip({
  shift, isManager, onEdit, onDelete,
}: {
  shift: Shift
  isManager: boolean
  onEdit: (s: Shift) => void
  onDelete: (id: string) => void
}) {
  return (
    <div
      className="sched-shift-chip"
      style={{
        display:'flex', alignItems:'center', gap:4,
        borderLeft:`3px solid ${shift.color}`,
        background: shift.color+'22',
        borderRadius:4, padding:'3px 6px',
        cursor: isManager ? 'pointer' : 'default',
        width:'100%', boxSizing:'border-box',
        minWidth:0, overflow:'hidden',
      }}
      onClick={e=>{ e.stopPropagation(); onEdit(shift) }}
    >
      <span className="sched-shift-time" style={{
        fontSize:10, fontWeight:700,
        color:'var(--w-text-muted, #6b7280)',
        whiteSpace:'nowrap', flexShrink:0,
      }}>
        {fmtShort(shift.startTime)}–{fmtShort(shift.endTime)}
      </span>
      <span className="sched-shift-title" style={{
        fontSize:11, fontWeight:500,
        color:'var(--w-text-primary, #111827)',
        whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis',
        flex:1, minWidth:0,
      }}>
        {shift.title}
      </span>
      {isManager&&(
        <button
          className="sched-shift-del"
          style={{
            marginLeft:'auto', flexShrink:0,
            background:'none', border:'none', cursor:'pointer', padding:2,
            color:'var(--w-text-muted,#9ca3af)', display:'flex', alignItems:'center',
            opacity:0.6,
          }}
          onClick={e=>{ e.stopPropagation(); onDelete(shift.id) }}
        >
          <X size={10}/>
        </button>
      )}
    </div>
  )
}
