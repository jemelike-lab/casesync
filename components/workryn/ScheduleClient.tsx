'use client'
import { useState } from 'react'
import { ChevronLeft, ChevronRight, Plus, X, Loader2, Clock, Bell } from 'lucide-react'
import { getInitials } from '@/lib/workryn/utils'

// Role helpers — supports both old and new role names
function canManageSchedule(role: string): boolean {
  return ['ADMIN','MANAGER','OWNER','SUPERVISOR','TEAM_MANAGER'].includes(role)
}
function canViewAllStaff(role: string): boolean {
  return ['ADMIN','MANAGER','OWNER','SUPERVISOR','TEAM_MANAGER'].includes(role)
}
function getRoleLabel(role: string): string {
  const map: Record<string,string> = {
    SUPPORT_PLANNER: 'Support Planner',
    TEAM_MANAGER: 'Team Manager',
    SUPERVISOR: 'Supervisor',
    STAFF: 'Staff',
    ADMIN: 'Admin',
    MANAGER: 'Manager',
    OWNER: 'Owner',
  }
  return map[role] ?? role
}

// Types
type Shift = {
  id: string; title: string; notes: string | null
  startTime: string; endTime: string; color: string
  departmentId: string | null
  user: { id: string; name: string | null; avatarColor: string; jobTitle: string | null }
}
type StaffUser = { id: string; name: string | null; avatarColor: string; role: string; jobTitle: string | null }
type Department = { id: string; name: string; color: string }

const DAYS = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']
const SHIFT_COLORS = ['#6366f1','#10b981','#f59e0b','#ef4444','#8b5cf6','#06b6d4','#f97316']

interface Props {
  initialShifts: Shift[]
  users: StaffUser[]
  departments: Department[]
  currentUser: { id: string; role: string }
  weekStart: string
}

function formatShiftTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
}
function getWeekDates(offset: number): Date[] {
  const now = new Date(); now.setHours(0,0,0,0)
  const day = now.getDay()
  const diff = day === 0 ? -6 : 1 - day
  const monday = new Date(now)
  monday.setDate(now.getDate() + diff + offset * 7)
  return Array.from({length: 7}, (_, i) => {
    const d = new Date(monday); d.setDate(monday.getDate() + i); return d
  })
}
function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear()===b.getFullYear() && a.getMonth()===b.getMonth() && a.getDate()===b.getDate()
}

export default function ScheduleClient({ initialShifts, users, departments, currentUser, weekStart }: Props) {
  const [shifts, setShifts] = useState<Shift[]>(initialShifts)
  const [weekOffset, setWeekOffset] = useState(0)
  const [showShiftModal, setShowShiftModal] = useState(false)
  const [saving, setSaving] = useState(false)
  const [filterUserId, setFilterUserId] = useState('')
  const [shiftForm, setShiftForm] = useState({
    userId: '', title: '', date: '', startTime: '09:00', endTime: '17:00',
    color: SHIFT_COLORS[0], departmentId: '', notes: ''
  })
  const [editingShiftId, setEditingShiftId] = useState<string | null>(null)

  const isManager = canManageSchedule(currentUser.role)
  const canSeeAll = canViewAllStaff(currentUser.role)
  const weekDates = getWeekDates(weekOffset)

  // Only show own row if Support Planner
  const visibleUsers = canSeeAll
    ? (filterUserId ? users.filter(u => u.id === filterUserId) : users)
    : users.filter(u => u.id === currentUser.id)

  async function handleSaveShift() {
    setSaving(true)
    const startTime = new Date(`${shiftForm.date}T${shiftForm.startTime}`).toISOString()
    const endTime = new Date(`${shiftForm.date}T${shiftForm.endTime}`).toISOString()
    const body: Record<string, unknown> = {
      userId: shiftForm.userId, title: shiftForm.title, startTime, endTime,
      color: shiftForm.color, notes: shiftForm.notes || null,
      departmentId: shiftForm.departmentId || null
    }
    if (editingShiftId) body.id = editingShiftId
    const res = await fetch('/api/workryn/shifts', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    })
    if (res.ok) {
      const saved = await res.json()
      if (editingShiftId) {
        setShifts(prev => prev.map(s => s.id === editingShiftId ? saved : s))
      } else {
        setShifts(prev => [...prev, saved])
      }
      setShowShiftModal(false); setEditingShiftId(null)
      setShiftForm({ userId:'', title:'', date:'', startTime:'09:00', endTime:'17:00', color:SHIFT_COLORS[0], departmentId:'', notes:'' })
    }
    setSaving(false)
  }

  async function handleDeleteShift(shiftId: string) {
    await fetch(`/api/workryn/shifts/${shiftId}`, { method: 'DELETE' })
    setShifts(prev => prev.filter(s => s.id !== shiftId))
  }

  function openEditShift(shift: Shift) {
    const d = new Date(shift.startTime)
    setShiftForm({
      userId: shift.user.id, title: shift.title,
      date: d.toISOString().split('T')[0],
      startTime: d.toTimeString().slice(0,5),
      endTime: new Date(shift.endTime).toTimeString().slice(0,5),
      color: shift.color, departmentId: shift.departmentId || '', notes: shift.notes || ''
    })
    setEditingShiftId(shift.id)
    setShowShiftModal(true)
  }

  function openNewShift(userId: string, date: Date) {
    if (!isManager) return
    setShiftForm({
      userId, title: 'Shift',
      date: date.toISOString().split('T')[0],
      startTime: '09:00', endTime: '17:00',
      color: SHIFT_COLORS[Math.floor(Math.random()*SHIFT_COLORS.length)],
      departmentId: '', notes: ''
    })
    setEditingShiftId(null)
    setShowShiftModal(true)
  }

  const today = new Date()

  return (
    <div className="sched-root">
      {/* Header */}
      <div className="sched-header">
        <div className="sched-week-nav">
          <button className="sched-nav-btn" onClick={() => setWeekOffset(w => w - 1)}>
            <ChevronLeft size={16} />
          </button>
          <span className="sched-week-label">
            {weekDates[0].toLocaleDateString([], { month: 'short', day: 'numeric' })}–
            {weekDates[6].toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })}
          </span>
          <button className="sched-nav-btn" onClick={() => setWeekOffset(w => w + 1)}>
            <ChevronRight size={16} />
          </button>
          {weekOffset !== 0 && (
            <button className="sched-today-btn" onClick={() => setWeekOffset(0)}>Today</button>
          )}
        </div>
        <div className="sched-toolbar">
          {canSeeAll && (
            <select className="sched-filter" value={filterUserId} onChange={e => setFilterUserId(e.target.value)}>
              <option value="">All Staff</option>
              {users.map(u => <option key={u.id} value={u.id}>{u.name || 'Unnamed'}</option>)}
            </select>
          )}
          {isManager && (
            <button className="sched-add-btn" onClick={() => {
              setEditingShiftId(null)
              setShiftForm({ userId:'', title:'Shift', date:weekDates[0].toISOString().split('T')[0], startTime:'09:00', endTime:'17:00', color:SHIFT_COLORS[0], departmentId:'', notes:'' })
              setShowShiftModal(true)
            }}>
              <Plus size={14} /> Add Shift
            </button>
          )}
        </div>
      </div>

      {/* Grid */}
      <div className="sched-grid-wrap">
        <div className="sched-grid">
          {/* Day header row */}
          <div className="sched-grid-header">
            <div className="sched-grid-corner">STAFF</div>
            {weekDates.map((d, i) => {
              const isToday = isSameDay(d, today)
              return (
                <div key={i} className={`sched-col-head${isToday ? ' sched-col-today' : ''}`}>
                  <span className="sched-col-day">{DAYS[d.getDay()]}</span>
                  <span className={`sched-col-num${isToday ? ' sched-col-num-today' : ''}`}>{d.getDate()}</span>
                </div>
              )
            })}
          </div>

          {/* User rows */}
          {visibleUsers.map(user => (
            <div key={user.id} className="sched-grid-row">
              <div className="sched-user-cell">
                <div className="sched-avatar" style={{ background: user.avatarColor }}>
                  {getInitials(user.name || '?')}
                </div>
                <div className="sched-user-info">
                  <span className="sched-user-name">{user.name || 'Unnamed'}</span>
                  <span className="sched-user-role">{getRoleLabel(user.role)}</span>
                </div>
              </div>
              {weekDates.map((date, di) => {
                const dayShifts = shifts.filter(s =>
                  s.user.id === user.id && isSameDay(new Date(s.startTime), date)
                )
                const isToday = isSameDay(date, today)
                return (
                  <div
                    key={di}
                    className={`sched-day-cell${isToday ? ' sched-day-cell-today' : ''}`}
                    onClick={() => isManager && dayShifts.length === 0 && openNewShift(user.id, date)}
                  >
                    {dayShifts.map(shift => (
                      <div
                        key={shift.id}
                        className="sched-shift-chip"
                        style={{ borderLeftColor: shift.color, background: `${shift.color}22` }}
                        onClick={e => { e.stopPropagation(); isManager && openEditShift(shift) }}
                      >
                        <span className="sched-shift-time">
                          {formatShiftTime(shift.startTime)}–{formatShiftTime(shift.endTime)}
                        </span>
                        <span className="sched-shift-title">{shift.title}</span>
                        {isManager && (
                          <button className="sched-shift-del" onClick={e => { e.stopPropagation(); handleDeleteShift(shift.id) }}>
                            <X size={10} />
                          </button>
                        )}
                      </div>
                    ))}
                    {dayShifts.length === 0 && isManager && (
                      <div className="sched-cell-add">
                        <Plus size={12} />
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          ))}
        </div>
      </div>

      {/* Shift Modal */}
      {showShiftModal && (
        <div className="sched-overlay" onClick={() => setShowShiftModal(false)}>
          <div className="sched-modal" onClick={e => e.stopPropagation()}>
            <div className="sched-modal-header">
              <h3>{editingShiftId ? 'Edit Shift' : 'New Shift'}</h3>
              <button className="sched-modal-close" onClick={() => setShowShiftModal(false)}><X size={16} /></button>
            </div>
            <div className="sched-modal-body">
              <label className="sched-field">
                <span>Employee</span>
                <select value={shiftForm.userId} onChange={e => setShiftForm({...shiftForm, userId: e.target.value})}>
                  <option value="">Select</option>
                  {users.map(u => <option key={u.id} value={u.id}>{u.name || 'Unnamed'}</option>)}
                </select>
              </label>
              <label className="sched-field">
                <span>Title</span>
                <input value={shiftForm.title} onChange={e => setShiftForm({...shiftForm, title: e.target.value})} />
              </label>
              <label className="sched-field">
                <span>Date</span>
                <input type="date" value={shiftForm.date} onChange={e => setShiftForm({...shiftForm, date: e.target.value})} />
              </label>
              <div className="sched-field-row">
                <label className="sched-field">
                  <span>Start</span>
                  <input type="time" value={shiftForm.startTime} onChange={e => setShiftForm({...shiftForm, startTime: e.target.value})} />
                </label>
                <label className="sched-field">
                  <span>End</span>
                  <input type="time" value={shiftForm.endTime} onChange={e => setShiftForm({...shiftForm, endTime: e.target.value})} />
                </label>
              </div>
              {departments.length > 0 && (
                <label className="sched-field">
                  <span>Department</span>
                  <select value={shiftForm.departmentId} onChange={e => setShiftForm({...shiftForm, departmentId: e.target.value})}>
                    <option value="">None</option>
                    {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                  </select>
                </label>
              )}
              <label className="sched-field">
                <span>Color</span>
                <div className="sched-color-row">
                  {SHIFT_COLORS.map(c => (
                    <button key={c} className={`sched-color-swatch${shiftForm.color === c ? ' sched-color-active' : ''}`}
                      style={{ background: c }} onClick={() => setShiftForm({...shiftForm, color: c})} />
                  ))}
                </div>
              </label>
              <label className="sched-field">
                <span>Notes</span>
                <textarea value={shiftForm.notes} rows={2} onChange={e => setShiftForm({...shiftForm, notes: e.target.value})} />
              </label>
            </div>
            <div className="sched-modal-footer">
              {editingShiftId && (
                <button className="sched-btn-danger" onClick={() => { handleDeleteShift(editingShiftId); setShowShiftModal(false) }}>Delete</button>
              )}
              <button className="sched-btn-ghost" onClick={() => setShowShiftModal(false)}>Cancel</button>
              <button className="sched-btn-primary" onClick={handleSaveShift} disabled={saving || !shiftForm.userId}>
                {saving ? <Loader2 size={14} className="sched-spin" /> : null}
                {editingShiftId ? 'Update' : 'Create'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
