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
  user: { id: string; name: string | null; avatarColor: string; jobTitle: string | null }
}
type StaffUser = { id: string; name: string | null; avatarColor: string; role: string; jobTitle: string | null }
type Department = { id: string; name: string; color: string }

const SHIFT_COLORS = ['#6366f1','#10b981','#f59e0b','#ef4444','#8b5cf6','#06b6d4','#f97316']
const DAYS_SHORT = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']
const DAYS_FULL  = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday']
const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December']

interface Props {
  initialShifts: Shift[]
  users: StaffUser[]
  departments: Department[]
  currentUser: { id: string; role: string }
  weekStart: string
}

function fmt(iso: string) {
  return new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
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

export default function ScheduleClient({ initialShifts, users, departments, currentUser }: Props) {
  const [shifts, setShifts] = useState<Shift[]>(initialShifts)
  const [view, setView] = useState<ViewMode>('month')
  const [cursor, setCursor] = useState(new Date()) // month or week anchor
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

  // Navigation
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

  // Header label
  function headerLabel() {
    if (view==='month') return `${MONTHS[cursor.getMonth()]} ${cursor.getFullYear()}`
    if (view==='week') {
      const ws = startOfWeek(cursor)
      const we = addDays(ws,6)
      return `${ws.toLocaleDateString([],{month:'short',day:'numeric'})} – ${we.toLocaleDateString([],{month:'short',day:'numeric',year:'numeric'})}`
    }
    return cursor.toLocaleDateString([],{weekday:'long',month:'long',day:'numeric',year:'numeric'})
  }

  // Save / delete
  async function handleSave() {
    setSaving(true)
    const startTime = new Date(`${form.date}T${form.startTime}`).toISOString()
    const endTime   = new Date(`${form.date}T${form.endTime}`).toISOString()
    const body: Record<string,unknown> = { userId:form.userId, title:form.title, startTime, endTime, color:form.color, notes:form.notes||null, departmentId:form.departmentId||null }
    if (editingId) body.id = editingId
    const res = await fetch('/api/workryn/shifts',{ method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(body) })
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
    setForm({userId,title:'Shift',date:date.toISOString().split('T')[0],startTime:'09:00',endTime:'17:00',color:SHIFT_COLORS[Math.floor(Math.random()*SHIFT_COLORS.length)],departmentId:'',notes:''})
    setEditingId(null); setShowModal(true)
  }
  function openEdit(s: Shift) {
    if (!isManager) return
    const d = new Date(s.startTime)
    setForm({userId:s.user.id,title:s.title,date:d.toISOString().split('T')[0],startTime:d.toTimeString().slice(0,5),endTime:new Date(s.endTime).toTimeString().slice(0,5),color:s.color,departmentId:s.departmentId||'',notes:s.notes||''})
    setEditingId(s.id); setShowModal(true)
  }

  // ── MONTH VIEW ──────────────────────────────────────────────
  function MonthView() {
    const monthStart = startOfMonth(cursor)
    const monthEnd   = endOfMonth(cursor)
    // Grid starts on Monday
    const gridStart  = startOfWeek(monthStart)
    const gridEnd    = addDays(startOfWeek(monthEnd), 6)
    const days: Date[] = []
    let d = new Date(gridStart)
    while (d <= gridEnd) { days.push(new Date(d)); d = addDays(d, 1) }

    return (
      <div className="sched-month">
        {/* Day-of-week headers */}
        <div className="sched-month-header">
          {['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map(n=>(
            <div key={n} className="sched-month-dow">{n}</div>
          ))}
        </div>
        {/* Day cells */}
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
                      <span className="sched-month-chip-name">{shift.user.name?.split(' ')[0]}</span>
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

  // ── WEEK VIEW ──────────────────────────────────────────────
  function WeekView() {
    const ws = startOfWeek(cursor)
    const weekDates = Array.from({length:7},(_,i)=>addDays(ws,i))
    return (
      <div className="sched-grid-wrap">
        <div className="sched-grid">
          <div className="sched-grid-header">
            <div className="sched-grid-corner">STAFF</div>
            {weekDates.map((day,i)=>{
              const isToday=sameDay(day,today)
              return (
                <div key={i} className={`sched-col-head${isToday?' sched-col-today':''}`}>
                  <span className="sched-col-day">{DAYS_SHORT[day.getDay()]}</span>
                  <span className={`sched-col-num${isToday?' sched-col-num-today':''}`}>{day.getDate()}</span>
                </div>
              )
            })}
          </div>
          {visibleUsers.map(user=>(
            <div key={user.id} className="sched-grid-row">
              <div className="sched-user-cell">
                <div className="sched-avatar" style={{background:user.avatarColor}}>{getInitials(user.name||'?')}</div>
                <div className="sched-user-info">
                  <span className="sched-user-name">{user.name||'Unnamed'}</span>
                  <span className="sched-user-role">{getRoleLabel(user.role)}</span>
                </div>
              </div>
              {weekDates.map((date,di)=>{
                const dayShifts = shifts.filter(s=>s.user.id===user.id&&sameDay(new Date(s.startTime),date))
                const isToday=sameDay(date,today)
                return (
                  <div key={di} className={`sched-day-cell${isToday?' sched-day-cell-today':''}`}
                    onClick={()=>isManager&&dayShifts.length===0&&openNew(user.id,date)}>
                    {dayShifts.map(shift=>(
                      <div key={shift.id} className="sched-shift-chip"
                        style={{borderLeftColor:shift.color,background:shift.color+'22'}}
                        onClick={e=>{e.stopPropagation();openEdit(shift)}}>
                        <span className="sched-shift-time">{fmt(shift.startTime)}–{fmt(shift.endTime)}</span>
                        <span className="sched-shift-title">{shift.title}</span>
                        {isManager&&<button className="sched-shift-del" onClick={e=>{e.stopPropagation();handleDelete(shift.id)}}><X size={10}/></button>}
                      </div>
                    ))}
                    {dayShifts.length===0&&isManager&&<div className="sched-cell-add"><Plus size={12}/></div>}
                  </div>
                )
              })}
            </div>
          ))}
        </div>
      </div>
    )
  }

  // ── DAY VIEW ──────────────────────────────────────────────
  function DayView() {
    const dayShiftsAll = shifts.filter(s=>sameDay(new Date(s.startTime),cursor))
    return (
      <div className="sched-day-view">
        {visibleUsers.map(user=>{
          const userShifts = dayShiftsAll.filter(s=>s.user.id===user.id)
          return (
            <div key={user.id} className="sched-day-row">
              <div className="sched-user-cell" style={{borderRight:'1px solid var(--w-border-subtle)',minWidth:220}}>
                <div className="sched-avatar" style={{background:user.avatarColor}}>{getInitials(user.name||'?')}</div>
                <div className="sched-user-info">
                  <span className="sched-user-name">{user.name||'Unnamed'}</span>
                  <span className="sched-user-role">{getRoleLabel(user.role)}</span>
                </div>
              </div>
              <div className="sched-day-shifts">
                {userShifts.length===0&&isManager&&(
                  <button className="sched-day-add-btn" onClick={()=>openNew(user.id,cursor)}>
                    <Plus size={14}/> Add shift
                  </button>
                )}
                {userShifts.map(shift=>(
                  <div key={shift.id} className="sched-day-chip"
                    style={{borderLeftColor:shift.color,background:shift.color+'18'}}
                    onClick={()=>openEdit(shift)}>
                    <span className="sched-day-chip-time">{fmt(shift.startTime)}–{fmt(shift.endTime)}</span>
                    <span className="sched-day-chip-title">{shift.title}</span>
                    {isManager&&<button className="sched-shift-del" onClick={e=>{e.stopPropagation();handleDelete(shift.id)}}><X size={10}/></button>}
                  </div>
                ))}
              </div>
            </div>
          )
        })}
        {visibleUsers.length===0&&<div className="sched-empty">No staff to display.</div>}
      </div>
    )
  }

  return (
    <div className="sched-root">
      {/* Header */}
      <div className="sched-header">
        <div className="sched-week-nav">
          <button className="sched-nav-btn" onClick={prev}><ChevronLeft size={16}/></button>
          <span className="sched-week-label">{headerLabel()}</span>
          <button className="sched-nav-btn" onClick={next}><ChevronRight size={16}/></button>
          <button className="sched-today-btn" onClick={goToday}>Today</button>
        </div>
        <div className="sched-toolbar">
          {/* View toggle */}
          <div className="sched-view-toggle">
            {(['month','week','day'] as ViewMode[]).map(v=>(
              <button key={v} className={`sched-view-btn${view===v?' sched-view-btn-active':''}`} onClick={()=>setView(v)}>
                {v.charAt(0).toUpperCase()+v.slice(1)}
              </button>
            ))}
          </div>
          {canSeeAll&&(
            <select className="sched-filter" value={filterUserId} onChange={e=>setFilterUserId(e.target.value)}>
              <option value="">All Staff</option>
              {users.map(u=><option key={u.id} value={u.id}>{u.name||'Unnamed'}</option>)}
            </select>
          )}
          {isManager&&(
            <button className="sched-add-btn" onClick={()=>{
              setEditingId(null)
              setForm({userId:'',title:'Shift',date:cursor.toISOString().split('T')[0],startTime:'09:00',endTime:'17:00',color:SHIFT_COLORS[0],departmentId:'',notes:''})
              setShowModal(true)
            }}><Plus size={14}/> Add Shift</button>
          )}
        </div>
      </div>

      {/* Views */}
      {view==='month' && <MonthView/>}
      {view==='week'  && <WeekView/>}
      {view==='day'   && <DayView/>}

      {/* Modal */}
      {showModal&&(
        <div className="sched-overlay" onClick={()=>setShowModal(false)}>
          <div className="sched-modal" onClick={e=>e.stopPropagation()}>
            <div className="sched-modal-header">
              <h3>{editingId?'Edit Shift':'New Shift'}</h3>
              <button className="sched-modal-close" onClick={()=>setShowModal(false)}><X size={16}/></button>
            </div>
            <div className="sched-modal-body">
              <label className="sched-field"><span>Employee</span>
                <select value={form.userId} onChange={e=>setForm({...form,userId:e.target.value})}>
                  <option value="">Select</option>
                  {users.map(u=><option key={u.id} value={u.id}>{u.name||'Unnamed'}</option>)}
                </select>
              </label>
              <label className="sched-field"><span>Title</span>
                <input value={form.title} onChange={e=>setForm({...form,title:e.target.value})}/>
              </label>
              <label className="sched-field"><span>Date</span>
                <input type="date" value={form.date} onChange={e=>setForm({...form,date:e.target.value})}/>
              </label>
              <div className="sched-field-row">
                <label className="sched-field"><span>Start</span><input type="time" value={form.startTime} onChange={e=>setForm({...form,startTime:e.target.value})}/></label>
                <label className="sched-field"><span>End</span><input type="time" value={form.endTime} onChange={e=>setForm({...form,endTime:e.target.value})}/></label>
              </div>
              {departments.length>0&&(
                <label className="sched-field"><span>Department</span>
                  <select value={form.departmentId} onChange={e=>setForm({...form,departmentId:e.target.value})}>
                    <option value="">None</option>
                    {departments.map(d=><option key={d.id} value={d.id}>{d.name}</option>)}
                  </select>
                </label>
              )}
              <label className="sched-field"><span>Color</span>
                <div className="sched-color-row">
                  {SHIFT_COLORS.map(c=>(
                    <button key={c} className={`sched-color-swatch${form.color===c?' sched-color-active':''}`}
                      style={{background:c}} onClick={()=>setForm({...form,color:c})}/>
                  ))}
                </div>
              </label>
              <label className="sched-field"><span>Notes</span>
                <textarea value={form.notes} rows={2} onChange={e=>setForm({...form,notes:e.target.value})}/>
              </label>
            </div>
            <div className="sched-modal-footer">
              {editingId&&<button className="sched-btn-danger" onClick={()=>{handleDelete(editingId);setShowModal(false)}}>Delete</button>}
              <button className="sched-btn-ghost" onClick={()=>setShowModal(false)}>Cancel</button>
              <button className="sched-btn-primary" onClick={handleSave} disabled={saving||!form.userId}>
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
