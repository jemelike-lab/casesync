'use client'
import { useState } from 'react'
import { ChevronLeft, ChevronRight, Plus, X, Loader2, Clock, Bell } from 'lucide-react'
import { getInitials } from '@/lib/workryn/utils'

type Shift = {
  id: string; title: string; notes: string | null
  startTime: string; endTime: string; color: string
  departmentId: string | null
  user: { id: string; name: string | null; avatarColor: string; jobTitle: string | null }
}
type StaffUser = { id: string; name: string | null; avatarColor: string; role: string; jobTitle: string | null }
type Department = { id: string; name: string; color: string }

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const SHIFT_COLORS = ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#f97316']

interface Props {
  initialShifts: Shift[]
  users: StaffUser[]
  departments: Department[]
  currentUser: { id: string; role: string }
  weekStart: string
}

export default function ScheduleClient({ initialShifts, users, departments, currentUser, weekStart }: Props) {
  const [shifts, setShifts] = useState<Shift[]>(initialShifts)
  const [weekOffset, setWeekOffset] = useState(0)
  const [showShiftModal, setShowShiftModal] = useState(false)
  const [showReminderModal, setShowReminderModal] = useState(false)
  const [saving, setSaving] = useState(false)
  const [filterUserId, setFilterUserId] = useState('')
  const [shiftForm, setShiftForm] = useState({
    title: 'Morning Shift', userId: currentUser.id, departmentId: '', color: '#6366f1',
    startTime: '', endTime: '', notes: '',
  })
  const [reminderForm, setReminderForm] = useState({
    userId: '', title: '', note: '', dueAt: '',
  })
  const [reminderSent, setReminderSent] = useState(false)

  const canManage = currentUser.role === 'ADMIN' || currentUser.role === 'MANAGER'

  const baseDate = new Date(weekStart)
  baseDate.setDate(baseDate.getDate() + weekOffset * 7)
  const week = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(baseDate); d.setDate(d.getDate() + i); return d
  })

  const today = new Date(); today.setHours(0, 0, 0, 0)

  function isToday(d: Date) { return d.toDateString() === today.toDateString() }

  function shiftsForDay(d: Date) {
    const s = new Date(d); s.setHours(0, 0, 0, 0)
    const e = new Date(d); e.setHours(23, 59, 59, 999)
    return shifts.filter(sh => {
      const st = new Date(sh.startTime)
      if (filterUserId && sh.user.id !== filterUserId) return false
      return st >= s && st <= e
    })
  }

  function openAddShift(date: Date) {
    if (!canManage) return
    const dateStr = date.toISOString().slice(0, 10)
    setShiftForm(f => ({
      ...f, title: 'Morning Shift',
      startTime: `${dateStr}T09:00`,
      endTime: `${dateStr}T17:00`,
    }))
    setShowShiftModal(true)
  }

  async function handleSaveShift() {
    setSaving(true)
    try {
      const res = await fetch('/api/workryn/shifts', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(shiftForm),
      })
      const created = await res.json()
      setShifts(s => [...s, created])
      setShowShiftModal(false)
    } finally { setSaving(false) }
  }

  async function handleDeleteShift(shiftId: string) {
    await fetch(`/api/workryn/shifts/${shiftId}`, { method: 'DELETE' })
    setShifts(s => s.filter(x => x.id !== shiftId))
  }

  async function handleSendReminder() {
    setSaving(true)
    try {
      await fetch('/api/workryn/reminders', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(reminderForm),
      })
      setReminderSent(true)
      setTimeout(() => {
        setShowReminderModal(false)
        setReminderSent(false)
        setReminderForm({ userId: '', title: '', note: '', dueAt: '' })
      }, 1500)
    } finally { setSaving(false) }
  }

  function formatTime(s: Shift) {
    const start = new Date(s.startTime)
    const end = new Date(s.endTime)
    return `${start.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })} – ${end.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })}`
  }

  function weekLabel() {
    const s = week[0], e = week[6]
    return `${s.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${e.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`
  }

  const thisWeekShifts = shifts.filter(s => {
    const st = new Date(s.startTime)
    return st >= week[0] && st <= week[6]
  })

  return (
    <>
      <div className="page-header" style={{ padding: '24px 32px 16px' }}>
        <div className="flex items-center justify-between" style={{ marginBottom: 16 }}>
          <div>
            <h1 className="gradient-text" style={{ marginBottom: 4 }}>Schedule</h1>
            <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>{thisWeekShifts.length} shifts this week</p>
          </div>
          <div className="flex gap-2 items-center">
            <select className="input focus-ring" style={{ width: 'auto', height: 36, fontSize: '0.875rem' }} value={filterUserId} onChange={e => setFilterUserId(e.target.value)}>
              <option value="">All staff</option>
              {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
            {canManage && (
              <>
                <button className="btn btn-ghost focus-ring" style={{ height: 36 }} onClick={() => setShowReminderModal(true)} id="btn-send-reminder">
                  <Bell size={16} /> Set Reminder
                </button>
                <button className="btn btn-primary focus-ring" style={{ height: 36 }} onClick={() => openAddShift(new Date())} id="btn-add-shift">
                  <Plus size={16} /> Add Shift
                </button>
              </>
            )}
          </div>
        </div>

        <div className="sched-nav">
          <button className="sched-nav-btn focus-ring" onClick={() => setWeekOffset(w => w - 1)}>
            <ChevronLeft size={18} />
          </button>
          <span className="sched-nav-label">{weekLabel()}</span>
          <button className="sched-nav-btn focus-ring" onClick={() => setWeekOffset(w => w + 1)}>
            <ChevronRight size={18} />
          </button>
          {weekOffset !== 0 && (
            <button className="sched-today-btn focus-ring" onClick={() => setWeekOffset(0)}>Today</button>
          )}
        </div>
      </div>

      <div className="page-body" style={{ paddingTop: 16 }}>
        <div className="schedule-grid">
          {week.map((day, i) => {
            const dayShifts = shiftsForDay(day)
            const isWe = i === 0 || i === 6
            return (
              <div
                key={i}
                className={`schedule-day ${isToday(day) ? 'today' : ''} ${isWe ? 'weekend' : ''}`}
                onClick={() => { if (canManage) openAddShift(day) }}
              >
                <div className="schedule-day-header">
                  <span className="schedule-day-label">{DAYS[i]}</span>
                  <span className={`schedule-day-num ${isToday(day) ? 'today-num' : ''}`}>{day.getDate()}</span>
                </div>
                <div className="schedule-shifts" onClick={e => e.stopPropagation()}>
                  {dayShifts.length === 0 && (
                    <div className="schedule-empty">{canManage ? '+ Add shift' : 'No shifts'}</div>
                  )}
                  {dayShifts.map(shift => (
                    <div
                      key={shift.id}
                      className="schedule-shift"
                      style={{ '--shift-color': shift.color } as React.CSSProperties}
                      title={formatTime(shift)}
                    >
                      <div className="schedule-shift-title">{shift.title}</div>
                      <div className="schedule-shift-meta">
                        <div className="avatar" style={{ background: shift.user.avatarColor, width: 16, height: 16, fontSize: '0.45rem', flexShrink:0 }}>
                          {getInitials(shift.user.name ?? 'U')}
                        </div>
                        <span>{shift.user.name?.split(' ')[0]}</span>
                      </div>
                      <div className="schedule-shift-time">
                        <Clock size={9} />
                        {new Date(shift.startTime).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })}
                      </div>
                      {canManage && (
                        <button
                          className="schedule-shift-del"
                          onClick={e => { e.stopPropagation(); handleDeleteShift(shift.id) }}
                        ><X size={10} /></button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )
          })}
        </div>

        {/* Legend */}
        <div className="schedule-legend">
          {users.map(u => (
            <div key={u.id} className="schedule-legend-item">
              <div className="avatar avatar-sm" style={{ background: u.avatarColor }}>{getInitials(u.name ?? 'U')}</div>
              <span>{u.name}</span>
              <span className="badge badge-muted" style={{ fontSize: '0.6875rem' }}>{u.role}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Add Shift Modal */}
      {showShiftModal && (
        <div className="modal-overlay" onClick={() => setShowShiftModal(false)}>
          <div className="modal animate-scale-in" onClick={e => e.stopPropagation()} style={{ maxWidth: 480, background: 'var(--glass-bg)', backdropFilter: 'var(--glass-blur)', WebkitBackdropFilter: 'var(--glass-blur)', borderColor: 'var(--glass-border)' }}>
            <div className="modal-header" style={{ borderBottom: '1px solid var(--glass-border)', paddingBottom: 16 }}>
              <h3 className="gradient-text">Add Shift</h3>
              <button className="btn btn-icon btn-ghost focus-ring" onClick={() => setShowShiftModal(false)}><X size={18} /></button>
            </div>
            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div className="form-group">
                <label className="label">Shift Title</label>
                <input className="input focus-ring" value={shiftForm.title} onChange={e => setShiftForm(f => ({ ...f, title: e.target.value }))} />
              </div>
              <div className="form-group">
                <label className="label">Staff Member</label>
                <select className="input focus-ring" value={shiftForm.userId} onChange={e => setShiftForm(f => ({ ...f, userId: e.target.value }))}>
                  {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                </select>
              </div>
              <div className="flex gap-3">
                <div className="form-group flex-1">
                  <label className="label">Start</label>
                  <input type="datetime-local" className="input focus-ring" value={shiftForm.startTime} onChange={e => setShiftForm(f => ({ ...f, startTime: e.target.value }))} />
                </div>
                <div className="form-group flex-1">
                  <label className="label">End</label>
                  <input type="datetime-local" className="input focus-ring" value={shiftForm.endTime} onChange={e => setShiftForm(f => ({ ...f, endTime: e.target.value }))} />
                </div>
              </div>
              <div className="flex items-center gap-12">
                <div className="form-group flex-1">
                  <label className="label">Department</label>
                  <select className="input focus-ring" value={shiftForm.departmentId} onChange={e => setShiftForm(f => ({ ...f, departmentId: e.target.value }))}>
                    <option value="">None</option>
                    {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label className="label">Color</label>
                  <div className="sched-color-picker">
                    {SHIFT_COLORS.map(c => (
                      <button
                        key={c}
                        className={`sched-color-swatch ${shiftForm.color === c ? 'active' : ''}`}
                        style={{ '--swatch-color': c } as React.CSSProperties}
                        onClick={() => setShiftForm(f => ({ ...f, color: c }))}
                      />
                    ))}
                  </div>
                </div>
              </div>
              <div className="form-group">
                <label className="label">Notes</label>
                <input className="input focus-ring" value={shiftForm.notes} onChange={e => setShiftForm(f => ({ ...f, notes: e.target.value }))} placeholder="Optional notes..." />
              </div>
            </div>
            <div className="modal-footer" style={{ borderTop: '1px solid var(--glass-border)', padding: '16px 24px 20px' }}>
              <button className="btn btn-ghost focus-ring" onClick={() => setShowShiftModal(false)}>Cancel</button>
              <button className="btn btn-primary focus-ring" onClick={handleSaveShift} disabled={saving || !shiftForm.title.trim()} id="btn-save-shift">
                {saving ? <Loader2 size={16} className="spin" /> : 'Add Shift'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Set Reminder Modal */}
      {showReminderModal && (
        <div className="modal-overlay" onClick={() => setShowReminderModal(false)}>
          <div className="modal animate-scale-in" onClick={e => e.stopPropagation()} style={{ maxWidth: 460, background: 'var(--glass-bg)', backdropFilter: 'var(--glass-blur)', WebkitBackdropFilter: 'var(--glass-blur)', borderColor: 'var(--glass-border)' }}>
            <div className="modal-header" style={{ borderBottom: '1px solid var(--glass-border)', paddingBottom: 16 }}>
              <h3 style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Bell size={18} style={{ color: 'var(--brand-light)' }} />
                <span className="gradient-text">Set Reminder for Staff</span>
              </h3>
              <button className="btn btn-icon btn-ghost focus-ring" onClick={() => setShowReminderModal(false)}><X size={18} /></button>
            </div>
            {reminderSent ? (
              <div style={{ padding: '40px 24px', textAlign: 'center' }}>
                <div style={{ width: 52, height: 52, borderRadius: '50%', background: 'rgba(16,185,129,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px', border: '1px solid rgba(16,185,129,0.2)' }}>
                  <span style={{ fontSize: '1.5rem' }}>&#10003;</span>
                </div>
                <div style={{ fontWeight: 700, color: 'var(--success)', fontSize: '1rem' }}>Reminder sent!</div>
                <div style={{ color: 'var(--text-muted)', fontSize: '0.875rem', marginTop: 4 }}>The staff member will receive a notification</div>
              </div>
            ) : (
              <>
                <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  <div className="form-group">
                    <label className="label">Staff Member *</label>
                    <select className="input focus-ring" value={reminderForm.userId} onChange={e => setReminderForm(f => ({ ...f, userId: e.target.value }))}>
                      <option value="">Select staff...</option>
                      {users.filter(u => u.role === 'STAFF' || u.role === 'MANAGER').map(u => (
                        <option key={u.id} value={u.id}>{u.name} ({u.role})</option>
                      ))}
                    </select>
                  </div>
                  <div className="form-group">
                    <label className="label">Reminder Title *</label>
                    <input className="input focus-ring" value={reminderForm.title} onChange={e => setReminderForm(f => ({ ...f, title: e.target.value }))} placeholder="e.g. Submit timesheet, Team meeting..." autoFocus />
                  </div>
                  <div className="form-group">
                    <label className="label">Due Date & Time *</label>
                    <input type="datetime-local" className="input focus-ring" value={reminderForm.dueAt} onChange={e => setReminderForm(f => ({ ...f, dueAt: e.target.value }))} />
                  </div>
                  <div className="form-group">
                    <label className="label">Note (optional)</label>
                    <textarea className="input focus-ring" style={{ minHeight: 70, resize: 'vertical' }} value={reminderForm.note} onChange={e => setReminderForm(f => ({ ...f, note: e.target.value }))} placeholder="Additional context..." />
                  </div>
                  <div className="sched-reminder-info">
                    <Bell size={14} />
                    The staff member will receive an instant notification and see this reminder in their schedule.
                  </div>
                </div>
                <div className="modal-footer" style={{ borderTop: '1px solid var(--glass-border)', padding: '16px 24px 20px' }}>
                  <button className="btn btn-ghost focus-ring" onClick={() => setShowReminderModal(false)}>Cancel</button>
                  <button
                    className="btn btn-primary focus-ring"
                    onClick={handleSendReminder}
                    id="btn-save-reminder"
                    disabled={saving || !reminderForm.userId || !reminderForm.title.trim() || !reminderForm.dueAt}
                  >
                    {saving ? <Loader2 size={16} className="spin" /> : <><Bell size={14} /> Send Reminder</>}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      <style>{`
        /* ── Week Navigation ── */
        .sched-nav {
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .sched-nav-btn {
          width: 36px;
          height: 36px;
          border-radius: var(--radius-md);
          border: 1px solid var(--border-default);
          background: var(--bg-overlay);
          color: var(--text-secondary);
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          transition: all var(--transition-smooth);
        }
        .sched-nav-btn:hover {
          background: var(--bg-hover);
          color: var(--text-primary);
          border-color: var(--border-strong);
          transform: translateY(-1px);
          box-shadow: var(--shadow-sm);
        }
        .sched-nav-label {
          font-size: 0.9375rem;
          font-weight: 600;
          min-width: 240px;
          text-align: center;
          color: var(--text-primary);
        }
        .sched-today-btn {
          padding: 6px 14px;
          font-size: 0.8125rem;
          font-weight: 500;
          border-radius: 99px;
          border: 1px solid var(--brand);
          background: rgba(99,102,241,0.1);
          color: var(--brand-light);
          cursor: pointer;
          transition: all var(--transition-smooth);
          margin-left: 4px;
        }
        .sched-today-btn:hover {
          background: rgba(99,102,241,0.2);
          box-shadow: 0 0 12px rgba(99,102,241,0.2);
        }

        /* ── Calendar Grid ── */
        .schedule-grid {
          display: grid;
          grid-template-columns: repeat(7, 1fr);
          gap: 6px;
          margin-bottom: 20px;
        }
        .schedule-day {
          background: var(--glass-bg);
          backdrop-filter: var(--glass-blur);
          -webkit-backdrop-filter: var(--glass-blur);
          border: 1px solid var(--glass-border);
          border-radius: var(--radius-lg);
          min-height: 210px;
          display: flex;
          flex-direction: column;
          cursor: pointer;
          transition: all var(--transition-smooth);
          overflow: hidden;
          position: relative;
        }
        .schedule-day:hover {
          border-color: rgba(255,255,255,0.12);
          box-shadow: var(--shadow-sm);
        }
        .schedule-day.today {
          border-color: var(--brand);
          box-shadow: 0 0 0 1px var(--brand), var(--shadow-glow);
        }
        .schedule-day.today::before {
          content: '';
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          height: 2px;
          background: var(--brand-gradient);
        }
        .schedule-day.weekend {
          background: rgba(15, 17, 23, 0.5);
        }
        .schedule-day-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 10px 12px 8px;
          border-bottom: 1px solid var(--glass-border);
        }
        .schedule-day-label {
          font-size: 0.6875rem;
          font-weight: 700;
          color: var(--text-muted);
          text-transform: uppercase;
          letter-spacing: 0.06em;
        }
        .schedule-day-num {
          font-size: 1.125rem;
          font-weight: 700;
          color: var(--text-secondary);
          width: 32px;
          height: 32px;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 50%;
          transition: all var(--transition-smooth);
        }
        .schedule-day-num.today-num {
          background: var(--brand-gradient);
          color: white;
          box-shadow: 0 0 12px rgba(99,102,241,0.3);
        }
        .schedule-shifts {
          flex: 1;
          padding: 6px;
          display: flex;
          flex-direction: column;
          gap: 4px;
        }
        .schedule-empty {
          font-size: 0.75rem;
          color: var(--text-muted);
          text-align: center;
          padding: 16px 8px;
          opacity: 0.5;
        }

        /* ── Shift Blocks ── */
        .schedule-shift {
          position: relative;
          border-left: 3px solid var(--shift-color);
          border-radius: 0 var(--radius-sm) var(--radius-sm) 0;
          padding: 5px 24px 5px 8px;
          background: color-mix(in srgb, var(--shift-color) 10%, transparent);
          transition: all var(--transition-smooth);
        }
        .schedule-shift:hover {
          background: color-mix(in srgb, var(--shift-color) 18%, transparent);
          transform: translateX(2px);
          box-shadow: 0 2px 8px color-mix(in srgb, var(--shift-color) 20%, transparent);
        }
        .schedule-shift-title {
          font-size: 0.75rem;
          font-weight: 600;
          color: var(--text-primary);
          margin-bottom: 3px;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .schedule-shift-meta {
          display: flex;
          align-items: center;
          gap: 3px;
        }
        .schedule-shift-meta span {
          font-size: 0.6875rem;
          color: var(--text-muted);
        }
        .schedule-shift-time {
          display: flex;
          align-items: center;
          gap: 3px;
          font-size: 0.6875rem;
          color: var(--text-muted);
          margin-top: 2px;
        }
        .schedule-shift-del {
          position: absolute;
          top: 4px;
          right: 4px;
          width: 18px;
          height: 18px;
          border-radius: 50%;
          background: var(--bg-overlay);
          border: 1px solid var(--border-subtle);
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          color: var(--text-muted);
          opacity: 0;
          transition: all var(--transition-smooth);
        }
        .schedule-shift:hover .schedule-shift-del { opacity: 1; }
        .schedule-shift-del:hover { background: var(--danger); color: white; border-color: var(--danger); }

        /* ── Legend ── */
        .schedule-legend {
          display: flex;
          gap: 16px;
          flex-wrap: wrap;
          padding: 14px 18px;
          background: var(--glass-bg);
          backdrop-filter: var(--glass-blur);
          -webkit-backdrop-filter: var(--glass-blur);
          border: 1px solid var(--glass-border);
          border-radius: var(--radius-lg);
        }
        .schedule-legend-item {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 0.875rem;
          color: var(--text-secondary);
        }

        /* ── Color Picker ── */
        .sched-color-picker {
          display: flex;
          gap: 6px;
          margin-top: 4px;
        }
        .sched-color-swatch {
          width: 24px;
          height: 24px;
          border-radius: 50%;
          background: var(--swatch-color);
          border: 3px solid transparent;
          cursor: pointer;
          outline: none;
          transition: all var(--transition-smooth);
          position: relative;
        }
        .sched-color-swatch.active {
          border-color: white;
          outline: 2px solid var(--swatch-color);
          transform: scale(1.1);
          box-shadow: 0 0 10px color-mix(in srgb, var(--swatch-color) 50%, transparent);
        }
        .sched-color-swatch:hover:not(.active) {
          transform: scale(1.12);
          box-shadow: 0 0 8px color-mix(in srgb, var(--swatch-color) 40%, transparent);
        }

        /* ── Reminder Info Box ── */
        .sched-reminder-info {
          padding: 12px 14px;
          background: var(--brand-gradient-subtle);
          border-radius: var(--radius-md);
          border: 1px solid rgba(99,102,241,0.12);
          font-size: 0.8125rem;
          color: var(--brand-light);
          display: flex;
          align-items: center;
          gap: 8px;
          line-height: 1.5;
        }

        .spin { animation: spin 0.7s linear infinite; }
      `}</style>
    </>
  )
}
