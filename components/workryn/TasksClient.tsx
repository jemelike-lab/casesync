'use client'

import { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import {
  Plus, Clock, User, X, Search, MoreHorizontal, MessageSquare,
  Loader2, AlertCircle, ListTodo, CheckCircle2, Flame, Zap,
  ArrowUpRight, Timer, Filter
} from 'lucide-react'
import { getPriorityColor, getInitials } from '@/lib/workryn/utils'

type Task = {
  id: string; title: string; description: string | null
  status: string; priority: string; tags: string | null
  dueDate: string | null; createdAt: string
  assignedTo: { id: string; name: string | null; avatarColor: string } | null
  createdBy: { id: string; name: string | null }
  department: { id: string; name: string; color: string } | null
  _count: { comments: number }
}
type UserType = { id: string; name: string | null; avatarColor: string; jobTitle: string | null }
type Department = { id: string; name: string; color: string }

const COLUMNS = [
  { id: 'TODO',        label: 'To Do',        color: '#64748b', gradient: 'linear-gradient(135deg,#64748b,#94a3b8)', icon: ListTodo },
  { id: 'IN_PROGRESS', label: 'In Progress',  color: '#6366f1', gradient: 'linear-gradient(135deg,#6366f1,#8b5cf6)', icon: Timer },
  { id: 'IN_REVIEW',   label: 'In Review',    color: '#f59e0b', gradient: 'linear-gradient(135deg,#f59e0b,#fbbf24)', icon: Clock },
  { id: 'DONE',        label: 'Done',         color: '#10b981', gradient: 'linear-gradient(135deg,#10b981,#34d399)', icon: CheckCircle2 },
]

const PRIORITIES = ['URGENT','HIGH','MEDIUM','LOW']

interface Props {
  initialTasks: Task[]
  users: UserType[]
  departments: Department[]
  currentUserId: string
}

/* ── Animated Count-Up Hook (matches dashboard) ── */
function useCountUp(target: number, duration = 800, delay = 300): number {
  const [val, setVal] = useState(target)
  const mounted = useRef(false)
  useEffect(() => {
    if (mounted.current) return
    mounted.current = true
    if (target === 0) { setVal(0); return }
    setVal(0)
    const timeout = setTimeout(() => {
      const start = performance.now()
      const step = (now: number) => {
        const elapsed = now - start
        const progress = Math.min(elapsed / duration, 1)
        const eased = 1 - Math.pow(1 - progress, 3)
        setVal(Math.round(eased * target))
        if (progress < 1) requestAnimationFrame(step)
      }
      requestAnimationFrame(step)
    }, delay)
    return () => clearTimeout(timeout)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
  return val
}

/* ── SVG Progress Ring (matches dashboard) ── */
function ProgressRing({ percent, size = 48, stroke = 4.5 }: { percent: number; size?: number; stroke?: number }) {
  const r = (size - stroke) / 2
  const circ = 2 * Math.PI * r
  const offset = circ - (percent / 100) * circ
  return (
    <svg width={size} height={size} className="tk-progress-ring">
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={stroke} />
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="url(#tk-ring-grad)" strokeWidth={stroke}
        strokeDasharray={circ} strokeDashoffset={offset} strokeLinecap="round"
        style={{ transition: 'stroke-dashoffset 1.5s cubic-bezier(0.34,1.56,0.64,1) 0.5s', transform: 'rotate(-90deg)', transformOrigin: '50% 50%' }} />
      <defs>
        <linearGradient id="tk-ring-grad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#10b981" /><stop offset="100%" stopColor="#34d399" />
        </linearGradient>
      </defs>
    </svg>
  )
}

/* ── Floating Particles (matches dashboard) ── */
function Particles() {
  const particles = useMemo(() =>
    Array.from({ length: 14 }, (_, i) => ({
      id: i, left: `${Math.random()*100}%`, top: `${Math.random()*100}%`,
      size: 2 + Math.random()*2.5, duration: 18 + Math.random()*22,
      delay: Math.random()*8, opacity: 0.1 + Math.random()*0.2,
    }))
  , [])
  return (
    <div className="tk-particles" aria-hidden="true">
      {particles.map(p => (
        <div key={p.id} className="tk-particle" style={{
          left:p.left, top:p.top, width:p.size, height:p.size,
          opacity:p.opacity, animationDuration:`${p.duration}s`, animationDelay:`${p.delay}s`,
        }}/>
      ))}
    </div>
  )
}

/* ── 3D Tilt Card (matches dashboard) ── */
function TiltCard({ children, className, style }: { children: React.ReactNode; className?: string; style?: React.CSSProperties }) {
  const ref = useRef<HTMLDivElement>(null)
  const handleMove = useCallback((e: React.MouseEvent) => {
    const el = ref.current; if (!el) return
    const rect = el.getBoundingClientRect()
    const x = (e.clientX - rect.left) / rect.width - 0.5
    const y = (e.clientY - rect.top) / rect.height - 0.5
    el.style.transform = `perspective(600px) rotateY(${x*5}deg) rotateX(${-y*5}deg) translateY(-3px)`
  }, [])
  const handleLeave = useCallback(() => { if (ref.current) ref.current.style.transform = '' }, [])
  return <div ref={ref} className={className} style={style} onMouseMove={handleMove} onMouseLeave={handleLeave}>{children}</div>
}

/* ── Floating context menu ── */
function FloatingMenu({ anchor, columns, onMoveTo, onEdit, onDelete, onClose }: {
  anchor: DOMRect; columns: typeof COLUMNS
  onMoveTo: (s: string) => void; onEdit: () => void; onDelete: () => void; onClose: () => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) onClose() }
    setTimeout(() => document.addEventListener('mousedown', h), 0)
    return () => document.removeEventListener('mousedown', h)
  }, [onClose])

  return (
    <div ref={ref} className="tk-float-menu" style={{
      position:'fixed', top:anchor.bottom+4, left:Math.max(8,anchor.right-180), zIndex:9999,
    }}>
      <div className="tk-float-section-label">Move to</div>
      {columns.map(col => (
        <div key={col.id} className="tk-float-item" onClick={() => { onMoveTo(col.id); onClose() }}>
          <span className="dot" style={{ background:col.color }}/> {col.label}
        </div>
      ))}
      <div className="tk-float-divider"/>
      <div className="tk-float-item" onClick={() => { onEdit(); onClose() }}>Edit</div>
      <div className="tk-float-item tk-float-danger" onClick={() => { onDelete(); onClose() }}>Delete</div>
    </div>
  )
}

/* ── Task Card ── */
function TaskCard({ task, onTaskClick, onMenuOpen, onDragStart, onDragEnd }: {
  task: Task; onTaskClick: () => void
  onMenuOpen: (anchor: DOMRect) => void; onDragStart: (taskId: string) => void; onDragEnd: () => void
}) {
  const btnRef = useRef<HTMLButtonElement>(null)
  const isOverdue = task.dueDate && task.status !== 'DONE' && new Date(task.dueDate) < new Date()
  const tags = task.tags ? task.tags.split(',').map(t=>t.trim()).filter(Boolean) : []
  const prioColor = getPriorityColor(task.priority)

  return (
    <div className="tk-card" draggable
      onDragStart={e => {
        e.dataTransfer.effectAllowed = 'move'
        e.dataTransfer.setData('taskId', task.id)
        onDragStart(task.id)
        e.dataTransfer.setDragImage(e.currentTarget as HTMLElement, (e.currentTarget as HTMLElement).offsetWidth/2, 20)
      }}
      onDragEnd={onDragEnd} onClick={onTaskClick}
    >
      {/* Priority accent strip */}
      <div className="tk-card-accent" style={{ background: prioColor }}/>
      {/* Priority glow */}
      <div className="tk-card-prio-glow" style={{ background: prioColor }}/>

      <div className="tk-card-header">
        <div className="flex items-center gap-2" style={{ flex:1, minWidth:0 }}>
          <span className="tk-prio-dot" style={{ background: prioColor, boxShadow:`0 0 8px ${prioColor}55` }}/>
          <span className="tk-card-title">{task.title}</span>
        </div>
        <button ref={btnRef} className="tk-menu-btn"
          onClick={e => { e.stopPropagation(); onMenuOpen(btnRef.current!.getBoundingClientRect()) }}
        ><MoreHorizontal size={14}/></button>
      </div>

      {task.description && <div className="tk-card-desc">{task.description}</div>}

      {tags.length > 0 && (
        <div className="tk-tags">
          {tags.slice(0,3).map(tag=><span key={tag} className="tk-tag">{tag}</span>)}
        </div>
      )}

      {task.department && (
        <div style={{ marginBottom:8 }}>
          <span className="tk-dept" style={{ background:task.department.color+'15', color:task.department.color, borderColor:task.department.color+'30' }}>
            {task.department.name}
          </span>
        </div>
      )}

      <div className="tk-card-footer">
        <div className="flex items-center gap-2">
          {task.assignedTo ? (
            <div className="tk-avatar" style={{ background:task.assignedTo.avatarColor }}>
              {getInitials(task.assignedTo.name ?? 'U')}
            </div>
          ) : <User size={14} color="var(--text-muted)"/>}
          {task._count.comments > 0 && (
            <span className="tk-comment-count"><MessageSquare size={11}/>{task._count.comments}</span>
          )}
        </div>
        {task.dueDate && (
          <span className={`tk-due ${isOverdue?'tk-due-overdue':''}`}>
            {isOverdue && <AlertCircle size={11}/>}<Clock size={11}/>
            {new Date(task.dueDate).toLocaleDateString('en-US',{ month:'short', day:'numeric' })}
          </span>
        )}
      </div>
    </div>
  )
}

/* ═══ MAIN COMPONENT ═══ */
export default function TasksClient({ initialTasks, users, departments, currentUserId }: Props) {
  const [tasks, setTasks] = useState<Task[]>(initialTasks)
  const [showModal, setShowModal] = useState(false)
  const [editTask, setEditTask] = useState<Task | null>(null)
  const [search, setSearch] = useState('')
  const [filterPriority, setFilterPriority] = useState('')
  const [filterAssignee, setFilterAssignee] = useState('')
  const [saving, setSaving] = useState(false)
  const [menuState, setMenuState] = useState<{ taskId:string; anchor:DOMRect }|null>(null)

  // Drag state
  const [draggingId, setDraggingId] = useState<string|null>(null)
  const [dragOverCol, setDragOverCol] = useState<string|null>(null)
  const [dragOverIndex, setDragOverIndex] = useState<number|null>(null)

  const [form, setForm] = useState({ title:'', description:'', priority:'MEDIUM', assignedToId:'', departmentId:'', dueDate:'', tags:'' })

  const filtered = tasks.filter(t => {
    const q = search.toLowerCase()
    if (search && !t.title.toLowerCase().includes(q)) return false
    if (filterPriority && t.priority !== filterPriority) return false
    if (filterAssignee && t.assignedTo?.id !== filterAssignee) return false
    return true
  })

  const byStatus = (status: string) => filtered.filter(t => t.status === status)

  // Stats
  const totalDone = tasks.filter(t => t.status === 'DONE').length
  const totalInProgress = tasks.filter(t => t.status === 'IN_PROGRESS').length
  const totalTodo = tasks.filter(t => t.status === 'TODO').length
  const totalReview = tasks.filter(t => t.status === 'IN_REVIEW').length
  const pct = tasks.length > 0 ? Math.round((totalDone / tasks.length) * 100) : 0
  const urgentCount = tasks.filter(t => t.priority === 'URGENT' || t.priority === 'HIGH').length

  // Count-up animations
  const animTotal = useCountUp(tasks.length, 800, 300)
  const animDone = useCountUp(totalDone, 800, 400)
  const animActive = useCountUp(totalInProgress, 800, 500)
  const animPct = useCountUp(pct, 1000, 600)

  function openCreate() {
    setEditTask(null)
    setForm({ title:'', description:'', priority:'MEDIUM', assignedToId:'', departmentId:'', dueDate:'', tags:'' })
    setShowModal(true)
  }
  function openEdit(task: Task) {
    setEditTask(task)
    setForm({ title:task.title, description:task.description??'', priority:task.priority,
      assignedToId:task.assignedTo?.id??'', departmentId:task.department?.id??'',
      dueDate:task.dueDate?task.dueDate.slice(0,10):'', tags:task.tags??'' })
    setShowModal(true); setMenuState(null)
  }
  async function handleSave() {
    if (!form.title.trim()) return
    setSaving(true)
    try {
      if (editTask) {
        const res = await fetch(`/api/workryn/tasks/${editTask.id}`,{ method:'PUT', headers:{'Content-Type':'application/json'}, body:JSON.stringify(form) })
        const updated = await res.json()
        setTasks(t => t.map(x => x.id === editTask.id ? { ...x, ...updated } : x))
      } else {
        const res = await fetch('/api/workryn/tasks',{ method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(form) })
        const created = await res.json()
        setTasks(t => [created, ...t])
      }
      setShowModal(false)
    } finally { setSaving(false) }
  }
  async function handleStatusChange(taskId: string, newStatus: string) {
    const res = await fetch(`/api/workryn/tasks/${taskId}`,{ method:'PUT', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ status: newStatus }) })
    const updated = await res.json()
    setTasks(t => t.map(x => x.id === taskId ? { ...x, ...updated } : x))
  }
  async function handleDelete(taskId: string) {
    await fetch(`/api/workryn/tasks/${taskId}`,{ method:'DELETE' })
    setTasks(t => t.filter(x => x.id !== taskId))
    setMenuState(null)
  }

  function handleDragOver(e: React.DragEvent, colId: string, idx: number) {
    e.preventDefault(); e.dataTransfer.dropEffect = 'move'
    setDragOverCol(colId); setDragOverIndex(idx)
  }
  function handleDrop(e: React.DragEvent, colId: string) {
    e.preventDefault()
    const taskId = e.dataTransfer.getData('taskId')
    if (!taskId) return
    setDraggingId(null); setDragOverCol(null); setDragOverIndex(null)
    setTasks(prev => prev.map(t => t.id === taskId ? { ...t, status: colId } : t))
    handleStatusChange(taskId, colId)
  }
  function handleDragLeave(e: React.DragEvent) {
    const rel = e.relatedTarget as Node | null
    if (!rel || !(e.currentTarget as HTMLElement).contains(rel)) {
      setDragOverCol(null); setDragOverIndex(null)
    }
  }

  return (
    <>
      {/* ═══ AMBIENT BACKGROUND ═══ */}
      <div className="tk-ambient" aria-hidden="true"/>
      <Particles/>

      {/* ═══ HERO HEADER ═══ */}
      <div className="tk-hero">
        <div className="tk-hero-left">
          <h1 className="gradient-text tk-hero-title">Tasks</h1>
          <p className="tk-hero-sub">{tasks.length} total · {totalDone} done · {pct}% complete</p>
        </div>
        <button className="btn btn-gradient focus-ring tk-create-btn" onClick={openCreate} id="btn-create-task">
          <Plus size={18}/> New Task
        </button>
      </div>

      {/* ═══ STAT CARDS (3D tilt + count-up) ═══ */}
      <div className="tk-stats">
        <TiltCard className="tk-stat-card tk-shimmer" style={{ '--tk-accent':'linear-gradient(90deg,#64748b,#94a3b8)' } as React.CSSProperties}>
          <div className="tk-stat-icon" style={{ background:'rgba(100,116,139,0.15)', color:'#94a3b8' }}><ListTodo size={24}/></div>
          <div className="tk-stat-body">
            <span className="tk-stat-value">{animTotal}</span>
            <span className="tk-stat-label">Total Tasks</span>
          </div>
        </TiltCard>
        <TiltCard className="tk-stat-card tk-shimmer" style={{ '--tk-accent':'linear-gradient(90deg,#6366f1,#8b5cf6)' } as React.CSSProperties}>
          <div className="tk-stat-icon" style={{ background:'rgba(99,102,241,0.15)', color:'#818cf8' }}><Zap size={24}/></div>
          <div className="tk-stat-body">
            <span className="tk-stat-value">{animActive}</span>
            <span className="tk-stat-label">In Progress</span>
          </div>
        </TiltCard>
        <TiltCard className="tk-stat-card tk-shimmer" style={{ '--tk-accent':'linear-gradient(90deg,#10b981,#34d399)' } as React.CSSProperties}>
          <div className="tk-stat-icon" style={{ background:'rgba(16,185,129,0.15)', color:'#34d399' }}><CheckCircle2 size={24}/></div>
          <div className="tk-stat-body">
            <span className="tk-stat-value">{animDone}</span>
            <span className="tk-stat-label">Completed</span>
          </div>
        </TiltCard>
        <TiltCard className="tk-stat-card tk-stat-ring tk-shimmer" style={{ '--tk-accent':'linear-gradient(90deg,#3b82f6,#2563eb)' } as React.CSSProperties}>
          <ProgressRing percent={pct}/>
          <div className="tk-stat-body">
            <span className="tk-stat-value">{animPct}<span className="tk-stat-unit">%</span></span>
            <span className="tk-stat-label">Done Rate</span>
          </div>
        </TiltCard>
      </div>

      {/* ═══ PROGRESS BAR ═══ */}
      <div className="tk-progress-wrap">
        <div className="tk-progress-bar">
          <div className="tk-progress-fill" style={{ width:`${pct}%` }}/>
        </div>
        {urgentCount > 0 && (
          <div className="tk-urgent-badge">
            <Flame size={13}/> {urgentCount} high priority
          </div>
        )}
      </div>

      {/* ═══ FILTER BAR ═══ */}
      <div className="tk-filter-bar">
        <div className="tk-search-wrap">
          <Search size={15} className="tk-search-icon"/>
          <input className="input focus-ring tk-search-input" placeholder="Search tasks..." value={search} onChange={e=>setSearch(e.target.value)}/>
        </div>
        <div className="tk-filter-group">
          <Filter size={14} style={{ color:'var(--text-muted)', flexShrink:0 }}/>
          <select className="input focus-ring tk-select" value={filterPriority} onChange={e=>setFilterPriority(e.target.value)}>
            <option value="">All priorities</option>
            {PRIORITIES.map(p=><option key={p} value={p}>{p}</option>)}
          </select>
          <select className="input focus-ring tk-select" value={filterAssignee} onChange={e=>setFilterAssignee(e.target.value)}>
            <option value="">All assignees</option>
            {users.map(u=><option key={u.id} value={u.id}>{u.name}</option>)}
          </select>
        </div>
      </div>

      {/* ═══ FLOATING MENU ═══ */}
      {menuState && (
        <FloatingMenu anchor={menuState.anchor} columns={COLUMNS}
          onMoveTo={s=>handleStatusChange(menuState.taskId,s)}
          onEdit={() => { const t=tasks.find(x=>x.id===menuState.taskId); if(t)openEdit(t) }}
          onDelete={() => handleDelete(menuState.taskId)}
          onClose={() => setMenuState(null)}/>
      )}

      {/* ═══ KANBAN BOARD ═══ */}
      <div className="tk-board">
        {COLUMNS.map((col, colIdx) => {
          const colTasks = byStatus(col.id)
          const isDragTarget = dragOverCol === col.id
          const ColIcon = col.icon
          return (
            <div key={col.id}
              className={`tk-col tk-stagger${isDragTarget?' tk-col-drop':''}`}
              style={{ '--tk-stagger': colIdx } as React.CSSProperties}
              onDragOver={e => handleDragOver(e, col.id, colTasks.length)}
              onDragLeave={handleDragLeave}
              onDrop={e => handleDrop(e, col.id)}
            >
              {/* Gradient top accent */}
              <div className="tk-col-accent" style={{ background:col.gradient }}/>

              <div className="tk-col-header">
                <div className="flex items-center gap-2">
                  <div className="tk-col-icon" style={{ background:`${col.color}20`, color:col.color }}>
                    <ColIcon size={14}/>
                  </div>
                  <span className="tk-col-title">{col.label}</span>
                  <span className="tk-col-count">{colTasks.length}</span>
                </div>
                <button className="btn btn-icon btn-ghost focus-ring" style={{ width:28, height:28 }} onClick={openCreate}><Plus size={14}/></button>
              </div>

              <div className="tk-col-cards">
                {colTasks.length === 0 && (
                  <div className={`tk-empty${isDragTarget?' tk-empty-active':''}`}>
                    {isDragTarget ? 'Drop here' : 'No tasks'}
                  </div>
                )}
                {colTasks.map((task, i) => (
                  <div key={task.id} className={`tk-card-wrap${draggingId===task.id?' tk-dragging':''}`}
                    onDragOver={e => { e.preventDefault(); setDragOverCol(col.id); setDragOverIndex(i) }}
                  >
                    {isDragTarget && dragOverIndex === i && draggingId !== task.id && <div className="tk-drop-line"/>}
                    <TaskCard task={task} onTaskClick={() => openEdit(task)}
                      onMenuOpen={anchor => setMenuState(menuState?.taskId===task.id ? null : { taskId:task.id, anchor })}
                      onDragStart={id => setDraggingId(id)}
                      onDragEnd={() => { setDraggingId(null); setDragOverCol(null); setDragOverIndex(null) }}
                    />
                  </div>
                ))}
                {isDragTarget && colTasks.length > 0 && dragOverIndex === colTasks.length && <div className="tk-drop-line"/>}
              </div>
            </div>
          )
        })}
      </div>

      {/* ═══ CREATE/EDIT MODAL ═══ */}
      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal tk-modal" onClick={e=>e.stopPropagation()} style={{ maxWidth:560 }}>
            <div className="tk-modal-accent"/>
            <div className="modal-header" style={{ padding:'20px 24px 16px', borderBottom:'1px solid var(--border-subtle)' }}>
              <h3>{editTask ? 'Edit Task' : 'New Task'}</h3>
              <button className="btn btn-icon btn-ghost focus-ring" onClick={()=>setShowModal(false)}><X size={18}/></button>
            </div>
            <div className="modal-body" style={{ padding:'20px 24px', display:'flex', flexDirection:'column', gap:16 }}>
              <div className="form-group">
                <label className="label">Title *</label>
                <input className="input focus-ring" placeholder="What needs to be done?" value={form.title} onChange={e=>setForm(f=>({...f,title:e.target.value}))} autoFocus/>
              </div>
              <div className="form-group">
                <label className="label">Description</label>
                <textarea className="input focus-ring" style={{ minHeight:80, resize:'vertical' }} value={form.description} onChange={e=>setForm(f=>({...f,description:e.target.value}))}/>
              </div>
              <div className="flex gap-3">
                <div className="form-group flex-1">
                  <label className="label">Priority</label>
                  <select className="input focus-ring" value={form.priority} onChange={e=>setForm(f=>({...f,priority:e.target.value}))}>
                    {PRIORITIES.map(p=><option key={p} value={p}>{p}</option>)}
                  </select>
                </div>
                <div className="form-group flex-1">
                  <label className="label">Due Date</label>
                  <input type="date" className="input focus-ring" value={form.dueDate} onChange={e=>setForm(f=>({...f,dueDate:e.target.value}))}/>
                </div>
              </div>
              <div className="flex gap-3">
                <div className="form-group flex-1">
                  <label className="label">Assign to</label>
                  <select className="input focus-ring" value={form.assignedToId} onChange={e=>setForm(f=>({...f,assignedToId:e.target.value}))}>
                    <option value="">Unassigned</option>
                    {users.map(u=><option key={u.id} value={u.id}>{u.name}</option>)}
                  </select>
                </div>
                <div className="form-group flex-1">
                  <label className="label">Department</label>
                  <select className="input focus-ring" value={form.departmentId} onChange={e=>setForm(f=>({...f,departmentId:e.target.value}))}>
                    <option value="">None</option>
                    {departments.map(d=><option key={d.id} value={d.id}>{d.name}</option>)}
                  </select>
                </div>
              </div>
              <div className="form-group">
                <label className="label">Tags (comma separated)</label>
                <input className="input focus-ring" value={form.tags} onChange={e=>setForm(f=>({...f,tags:e.target.value}))}/>
              </div>
            </div>
            <div className="modal-footer" style={{ padding:'16px 24px 20px', borderTop:'1px solid var(--border-subtle)' }}>
              <button className="btn btn-ghost focus-ring" onClick={()=>setShowModal(false)}>Cancel</button>
              <button className="btn btn-gradient focus-ring" onClick={handleSave} disabled={saving||!form.title.trim()} id="btn-save-task">
                {saving?<Loader2 size={16} className="spin"/>:editTask?'Save Changes':'Create Task'}
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`
/* ═══ AMBIENT + PARTICLES ═══ */
.tk-ambient {
  position:fixed; top:0; left:0; right:0; bottom:0; pointer-events:none; z-index:0;
  background:
    radial-gradient(ellipse 60% 50% at 20% 20%, rgba(99,102,241,0.06) 0%, transparent 70%),
    radial-gradient(ellipse 50% 40% at 80% 80%, rgba(16,185,129,0.04) 0%, transparent 70%);
}
.tk-particles { position:fixed; top:0; left:0; right:0; bottom:0; pointer-events:none; z-index:0; overflow:hidden; }
.tk-particle {
  position:absolute; border-radius:50%; background:rgba(99,102,241,0.5);
  animation: tk-float linear infinite;
}
@keyframes tk-float {
  0% { transform:translate(0,0) scale(1); opacity:0; }
  10% { opacity:1; }
  90% { opacity:1; }
  100% { transform:translate(${Math.random()>0.5?'':'-'}60px, -120px) scale(0.5); opacity:0; }
}

/* ═══ HERO ═══ */
.tk-hero {
  display:flex; align-items:center; justify-content:space-between; gap:16px;
  padding:28px 32px 0; position:relative; z-index:1; flex-wrap:wrap;
}
.tk-hero-title { font-size:1.75rem; font-weight:800; letter-spacing:-0.03em; margin-bottom:2px; }
.tk-hero-sub { font-size:0.9rem; color:var(--text-muted); }
.tk-create-btn {
  display:inline-flex; align-items:center; gap:8px; font-weight:600;
  box-shadow:0 2px 16px rgba(99,102,241,0.25);
}
.tk-create-btn:hover { box-shadow:0 4px 24px rgba(99,102,241,0.35); transform:translateY(-1px); }

/* ═══ STAT CARDS ═══ */
.tk-stats {
  display:grid; grid-template-columns:repeat(4,1fr); gap:14px;
  padding:20px 32px 0; position:relative; z-index:1;
}
@media(max-width:900px){ .tk-stats { grid-template-columns:repeat(2,1fr); } }
@media(max-width:500px){ .tk-stats { grid-template-columns:1fr; } }

.tk-stat-card {
  position:relative; overflow:hidden;
  background:var(--bg-surface, rgba(255,255,255,0.07));
  border:1px solid var(--border-subtle, rgba(255,255,255,0.08));
  border-radius:var(--radius-lg, 16px);
  padding:18px 20px;
  display:flex; align-items:center; gap:14px;
  transition:all 0.3s cubic-bezier(0.4,0,0.2,1);
  cursor:default;
}
.tk-stat-card::before {
  content:''; position:absolute; top:0; left:0; right:0; height:2.5px;
  background:var(--tk-accent); opacity:0.7; transition:opacity 0.3s ease;
}
.tk-stat-card:hover { border-color:rgba(99,102,241,0.25); box-shadow:0 4px 24px rgba(0,0,0,0.15), 0 0 30px rgba(99,102,241,0.06); }
.tk-stat-card:hover::before { opacity:1; }

.tk-stat-icon {
  width:48px; height:48px; border-radius:14px;
  display:flex; align-items:center; justify-content:center; flex-shrink:0;
}
.tk-stat-body { display:flex; flex-direction:column; }
.tk-stat-value { font-size:2rem; font-weight:800; color:var(--text-primary, #f1f5f9); letter-spacing:-0.03em; line-height:1.1; font-variant-numeric:tabular-nums; }
.tk-stat-unit { font-size:1.25rem; font-weight:600; opacity:0.6; }
.tk-stat-label { font-size:0.8125rem; color:var(--text-muted, #64748b); margin-top:2px; }
.tk-stat-ring { gap:12px; }

/* Shimmer sweep */
.tk-shimmer { position:relative; overflow:hidden; }
.tk-shimmer::after {
  content:''; position:absolute; top:0; left:-100%; width:60%; height:100%;
  background:linear-gradient(90deg, transparent, rgba(255,255,255,0.04), transparent);
  animation: tk-shimmer-sweep 4s ease-in-out infinite;
}
@keyframes tk-shimmer-sweep { 0%{left:-100%} 100%{left:200%} }

/* ═══ PROGRESS BAR ═══ */
.tk-progress-wrap {
  display:flex; align-items:center; gap:12px;
  padding:16px 32px 0; position:relative; z-index:1;
}
.tk-progress-bar {
  flex:1; background:var(--bg-overlay, rgba(255,255,255,0.06));
  border-radius:99px; height:6px; overflow:hidden;
}
.tk-progress-fill {
  height:100%; border-radius:99px;
  background:var(--brand-gradient, linear-gradient(90deg,#6366f1,#3b82f6));
  transition:width 0.6s cubic-bezier(0.4,0,0.2,1);
  box-shadow:0 0 14px rgba(99,102,241,0.35);
}
.tk-urgent-badge {
  display:flex; align-items:center; gap:5px;
  font-size:0.75rem; font-weight:600; color:#f59e0b;
  padding:4px 10px; border-radius:99px;
  background:rgba(245,158,11,0.1); border:1px solid rgba(245,158,11,0.2);
  white-space:nowrap; flex-shrink:0;
  animation: tk-badge-pulse 2s ease infinite;
}
@keyframes tk-badge-pulse { 0%,100%{opacity:1} 50%{opacity:0.7} }

/* ═══ FILTER BAR ═══ */
.tk-filter-bar {
  display:flex; align-items:center; gap:12px;
  padding:16px 32px 0; position:relative; z-index:1; flex-wrap:wrap;
}
.tk-search-wrap { position:relative; flex:1; min-width:200px; max-width:360px; }
.tk-search-icon { position:absolute; left:12px; top:50%; transform:translateY(-50%); color:var(--text-muted); pointer-events:none; }
.tk-search-input { padding-left:36px !important; height:38px; font-size:0.875rem; }
.tk-filter-group { display:flex; align-items:center; gap:8px; }
.tk-select { width:auto; height:38px; font-size:0.8125rem; min-width:130px; }

/* ═══ KANBAN BOARD ═══ */
.tk-board {
  display:grid; grid-template-columns:repeat(4,1fr); gap:16px;
  padding:20px 32px 32px; position:relative; z-index:1;
  height:calc(100vh - 380px); min-height:420px;
}
@media(max-width:1200px){ .tk-board { grid-template-columns:repeat(2,1fr); height:auto; } }
@media(max-width:640px){ .tk-board { grid-template-columns:1fr; padding:16px; } }

/* Column stagger entrance */
.tk-stagger {
  animation: tk-slide-up 0.5s cubic-bezier(0.16,1,0.3,1) both;
  animation-delay: calc(var(--tk-stagger, 0) * 80ms);
}
@keyframes tk-slide-up { from { opacity:0; transform:translateY(20px); } to { opacity:1; transform:none; } }

.tk-col {
  background:var(--bg-surface, rgba(255,255,255,0.05));
  border:1px solid var(--border-subtle, rgba(255,255,255,0.07));
  border-radius:var(--radius-lg, 16px);
  display:flex; flex-direction:column; overflow:hidden;
  transition:border-color 0.25s ease, box-shadow 0.25s ease;
}
.tk-col:hover { border-color:var(--border-default, rgba(255,255,255,0.12)); box-shadow:0 0 30px rgba(99,102,241,0.04); }
.tk-col-drop {
  border-color:rgba(99,102,241,0.45) !important;
  box-shadow:0 0 0 2px rgba(99,102,241,0.15), 0 0 30px rgba(99,102,241,0.08) !important;
  background:rgba(99,102,241,0.02) !important;
}

.tk-col-accent { height:3px; flex-shrink:0; }

.tk-col-header {
  display:flex; align-items:center; justify-content:space-between;
  padding:14px 14px 10px; border-bottom:1px solid var(--border-subtle, rgba(255,255,255,0.06));
  flex-shrink:0;
}
.tk-col-icon {
  width:28px; height:28px; border-radius:8px;
  display:flex; align-items:center; justify-content:center; flex-shrink:0;
}
.tk-col-title { font-size:0.8125rem; font-weight:600; color:var(--text-secondary, #cbd5e1); }
.tk-col-count {
  font-size:0.6875rem; font-weight:700; padding:2px 8px; border-radius:99px;
  background:var(--bg-overlay, rgba(255,255,255,0.08)); color:var(--text-muted, #64748b);
}

.tk-col-cards { flex:1; overflow-y:auto; padding:10px; display:flex; flex-direction:column; gap:8px; }

.tk-empty {
  display:flex; align-items:center; justify-content:center;
  height:80px; font-size:0.8125rem; color:var(--text-muted);
  border:1px dashed var(--border-subtle, rgba(255,255,255,0.08));
  border-radius:var(--radius-md, 12px);
  transition:all 0.25s ease;
}
.tk-empty-active {
  border-color:rgba(99,102,241,0.5); background:rgba(99,102,241,0.04);
  color:rgba(99,102,241,0.7);
}

.tk-card-wrap { position:relative; }
.tk-dragging { opacity:0.3; }

.tk-drop-line {
  height:3px; background:rgba(99,102,241,0.7); border-radius:99px;
  margin:2px 0; box-shadow:0 0 10px rgba(99,102,241,0.4);
  animation: tk-pulse-line 1s ease infinite;
}
@keyframes tk-pulse-line { 0%,100%{opacity:0.6} 50%{opacity:1} }

/* ═══ TASK CARD ═══ */
.tk-card {
  position:relative; overflow:hidden;
  background:var(--bg-elevated, rgba(255,255,255,0.07));
  border:1px solid var(--border-subtle, rgba(255,255,255,0.07));
  border-radius:var(--radius-md, 12px);
  padding:12px 12px 12px 16px;
  cursor:grab; user-select:none;
  transition:all 0.25s cubic-bezier(0.4,0,0.2,1);
}
.tk-card:active { cursor:grabbing; }
.tk-card:hover {
  border-color:rgba(99,102,241,0.2);
  transform:translateY(-3px);
  box-shadow:0 8px 24px rgba(0,0,0,0.2), 0 0 20px rgba(99,102,241,0.06);
  background:var(--glass-bg, rgba(255,255,255,0.09));
}

.tk-card-accent {
  position:absolute; top:0; left:0; width:3px; height:100%;
  border-radius:10px 0 0 10px; opacity:0.75;
}
.tk-card-prio-glow {
  position:absolute; top:50%; left:-4px; width:8px; height:40%;
  border-radius:50%; filter:blur(10px); opacity:0.2; transform:translateY(-50%);
  transition:opacity 0.25s ease;
}
.tk-card:hover .tk-card-prio-glow { opacity:0.35; }

.tk-card-header { display:flex; align-items:flex-start; justify-content:space-between; gap:8px; margin-bottom:6px; }
.tk-prio-dot { width:9px; height:9px; border-radius:50%; flex-shrink:0; }
.tk-card-title { font-size:0.875rem; font-weight:500; color:var(--text-primary, #f1f5f9); line-height:1.4; flex:1; min-width:0; }
.tk-menu-btn {
  width:26px; height:26px; padding:4px; flex-shrink:0; opacity:0.5;
  background:none; border:none; cursor:pointer; border-radius:6px; color:inherit;
  transition:all 0.15s ease; display:flex; align-items:center; justify-content:center;
}
.tk-menu-btn:hover { opacity:1; background:var(--bg-overlay, rgba(255,255,255,0.08)); }

.tk-card-desc {
  font-size:0.8125rem; color:var(--text-muted, #64748b); margin-bottom:8px;
  line-height:1.4; display:-webkit-box; -webkit-line-clamp:2;
  -webkit-box-orient:vertical; overflow:hidden;
}
.tk-tags { display:flex; gap:4px; margin-bottom:8px; flex-wrap:wrap; }
.tk-tag {
  font-size:0.6875rem; padding:2px 8px; border-radius:99px;
  background:var(--bg-overlay, rgba(255,255,255,0.06));
  border:1px solid var(--border-subtle, rgba(255,255,255,0.06));
  color:var(--text-muted, #64748b);
}
.tk-dept {
  display:inline-block; font-size:0.6875rem; padding:2px 8px;
  border-radius:6px; font-weight:500; border:1px solid;
}
.tk-card-footer {
  display:flex; align-items:center; justify-content:space-between;
  margin-top:8px; padding-top:8px; border-top:1px solid var(--border-subtle, rgba(255,255,255,0.05));
}
.tk-avatar {
  width:22px; height:22px; border-radius:50%; display:flex; align-items:center; justify-content:center;
  font-size:0.625rem; font-weight:600; color:#fff; box-shadow:0 0 0 2px var(--bg-elevated, #1a1a2e);
}
.tk-comment-count { display:flex; align-items:center; gap:3px; font-size:0.75rem; color:var(--text-muted, #64748b); }
.tk-due { display:flex; align-items:center; gap:4px; font-size:0.75rem; color:var(--text-muted, #64748b); }
.tk-due-overdue { color:var(--danger, #ef4444); font-weight:600; }

/* ═══ FLOATING MENU ═══ */
.tk-float-menu {
  background:var(--glass-bg, rgba(15,20,35,0.92));
  backdrop-filter:blur(20px); -webkit-backdrop-filter:blur(20px);
  border:1px solid var(--glass-border, rgba(255,255,255,0.1));
  border-radius:var(--radius-md, 12px);
  box-shadow:0 12px 40px rgba(0,0,0,0.4), 0 0 20px rgba(99,102,241,0.08);
  min-width:180px; overflow:hidden; animation:tk-scale-in 0.15s ease both;
}
@keyframes tk-scale-in { from{opacity:0;transform:scale(0.95) translateY(-4px)} to{opacity:1;transform:none} }
.tk-float-section-label {
  font-weight:700; font-size:0.6875rem; color:var(--text-muted, #64748b);
  padding:10px 14px 6px; text-transform:uppercase; letter-spacing:0.06em;
}
.tk-float-item {
  display:flex; align-items:center; gap:8px; padding:8px 14px;
  font-size:0.8125rem; color:var(--text-secondary, #cbd5e1);
  cursor:pointer; transition:background 0.15s ease;
}
.tk-float-item:hover { background:rgba(255,255,255,0.06); }
.tk-float-danger { color:var(--danger, #ef4444); }
.tk-float-divider { height:1px; background:var(--border-subtle, rgba(255,255,255,0.06)); margin:4px 0; }

/* ═══ MODAL ═══ */
.tk-modal { animation:tk-scale-in 0.2s ease both; }
.tk-modal-accent { height:3px; background:var(--brand-gradient, linear-gradient(90deg,#6366f1,#3b82f6)); border-radius:24px 24px 0 0; }

/* ═══ PROGRESS RING ═══ */
.tk-progress-ring { display:block; flex-shrink:0; }

/* ═══ UTILITY ═══ */
.spin { animation:spin 0.7s linear infinite; }
@keyframes spin { to{transform:rotate(360deg)} }
      `}</style>
    </>
  )
}
