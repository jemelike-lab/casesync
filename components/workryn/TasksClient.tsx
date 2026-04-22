'use client'
import { useState, useRef, useEffect, useCallback } from 'react'
import { Plus, Clock, User, X, Search, MoreHorizontal, MessageSquare, Loader2, AlertCircle } from 'lucide-react'
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
type User = { id: string; name: string | null; avatarColor: string; jobTitle: string | null }
type Department = { id: string; name: string; color: string }

const COLUMNS = [
  { id: 'TODO',        label: 'To Do',       color: '#64748b', gradient: 'linear-gradient(135deg,#64748b,#94a3b8)' },
  { id: 'IN_PROGRESS', label: 'In Progress',  color: '#6366f1', gradient: 'linear-gradient(135deg,#6366f1,#8b5cf6)' },
  { id: 'IN_REVIEW',   label: 'In Review',    color: '#f59e0b', gradient: 'linear-gradient(135deg,#f59e0b,#fbbf24)' },
  { id: 'DONE',        label: 'Done',         color: '#10b981', gradient: 'linear-gradient(135deg,#10b981,#34d399)' },
]
const PRIORITIES = ['URGENT','HIGH','MEDIUM','LOW']

interface Props {
  initialTasks: Task[]
  users: User[]
  departments: Department[]
  currentUserId: string
}

// ── Floating context menu ──────────────────────────────────
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
    <div ref={ref} style={{ position:'fixed', top:anchor.bottom+4, left:Math.max(8,anchor.right-180), zIndex:9999,
      background:'var(--glass-bg)', backdropFilter:'var(--glass-blur)', WebkitBackdropFilter:'var(--glass-blur)',
      border:'1px solid var(--glass-border)', borderRadius:'var(--radius-md)',
      boxShadow:'var(--shadow-lg),var(--shadow-glow)', minWidth:180, overflow:'hidden', animation:'scaleIn 0.15s ease both' }}>
      <div className="dropdown-item" style={{ fontWeight:700, fontSize:'0.6875rem', color:'var(--text-muted)', pointerEvents:'none', textTransform:'uppercase', letterSpacing:'0.06em' }}>Move to</div>
      {columns.map(col => (
        <div key={col.id} className="dropdown-item" onClick={() => { onMoveTo(col.id); onClose() }}>
          <span className="dot" style={{ background:col.color }}/> {col.label}
        </div>
      ))}
      <div style={{ height:1, background:'var(--border-subtle)', margin:'4px 0' }}/>
      <div className="dropdown-item" onClick={() => { onEdit(); onClose() }}>Edit</div>
      <div className="dropdown-item" onClick={() => { onDelete(); onClose() }} style={{ color:'var(--danger)' }}>Delete</div>
    </div>
  )
}

// ── Task card with drag ────────────────────────────────────
function TaskCard({ task, onTaskClick, onMenuOpen, onDragStart, onDragEnd }: {
  task: Task; onTaskClick: () => void
  onMenuOpen: (anchor: DOMRect) => void
  onDragStart: (taskId: string) => void
  onDragEnd: () => void
}) {
  const btnRef = useRef<HTMLButtonElement>(null)
  const isOverdue = task.dueDate && task.status !== 'DONE' && new Date(task.dueDate) < new Date()
  const tags = task.tags ? task.tags.split(',').map(t=>t.trim()).filter(Boolean) : []

  return (
    <div
      className="task-card"
      draggable
      onDragStart={e => {
        e.dataTransfer.effectAllowed = 'move'
        e.dataTransfer.setData('taskId', task.id)
        onDragStart(task.id)
        // Ghost image — use the card itself slightly faded
        const el = e.currentTarget as HTMLElement
        e.dataTransfer.setDragImage(el, el.offsetWidth / 2, 20)
      }}
      onDragEnd={onDragEnd}
      onClick={onTaskClick}
    >
      <div style={{ position:'absolute', top:0, left:0, width:3, height:'100%', background:getPriorityColor(task.priority), borderRadius:'10px 0 0 10px', opacity:0.8 }}/>
      <div className="task-card-header">
        <div className="flex items-center gap-2">
          <span className="dot" style={{ background:getPriorityColor(task.priority), width:9, height:9, flexShrink:0, boxShadow:`0 0 6px ${getPriorityColor(task.priority)}44` }}/>
          <span className="task-card-title">{task.title}</span>
        </div>
        <button ref={btnRef} className="btn btn-icon btn-ghost focus-ring"
          style={{ width:26, height:26, padding:4, flexShrink:0, opacity:0.6, transition:'opacity var(--transition-smooth)' }}
          onClick={e => { e.stopPropagation(); onMenuOpen(btnRef.current!.getBoundingClientRect()) }}
          onMouseEnter={e=>(e.currentTarget.style.opacity='1')} onMouseLeave={e=>(e.currentTarget.style.opacity='0.6')}>
          <MoreHorizontal size={14}/>
        </button>
      </div>
      {task.description && <div className="task-card-desc">{task.description}</div>}
      {tags.length > 0 && (
        <div className="flex gap-1" style={{ marginBottom:8, flexWrap:'wrap' }}>
          {tags.slice(0,3).map(tag=><span key={tag} className="task-tag">{tag}</span>)}
        </div>
      )}
      {task.department && (
        <div style={{ marginBottom:8 }}>
          <span className="badge" style={{ background:task.department.color+'18', color:task.department.color, fontSize:'0.6875rem', padding:'2px 8px', border:`1px solid ${task.department.color}30` }}>
            {task.department.name}
          </span>
        </div>
      )}
      <div className="task-card-footer">
        <div className="flex items-center gap-2">
          {task.assignedTo ? (
            <div className="avatar avatar-sm" style={{ background:task.assignedTo.avatarColor, width:22, height:22, fontSize:'0.625rem', boxShadow:'0 0 0 2px var(--bg-elevated)' }}>
              {getInitials(task.assignedTo.name ?? 'U')}
            </div>
          ) : <User size={14} color="var(--text-muted)"/>}
          {task._count.comments > 0 && (
            <span style={{ display:'flex', alignItems:'center', gap:4, fontSize:'0.75rem', color:'var(--text-muted)' }}>
              <MessageSquare size={12}/>{task._count.comments}
            </span>
          )}
        </div>
        {task.dueDate && (
          <span className={`task-due-date ${isOverdue?'overdue':''}`}>
            {isOverdue && <AlertCircle size={11}/>}<Clock size={11}/>
            {new Date(task.dueDate).toLocaleDateString('en-US',{ month:'short', day:'numeric' })}
          </span>
        )}
      </div>
    </div>
  )
}

// ── Main component ─────────────────────────────────────────
export default function TasksClient({ initialTasks, users, departments, currentUserId }: Props) {
  const [tasks, setTasks] = useState<Task[]>(initialTasks)
  const [showModal, setShowModal] = useState(false)
  const [editTask, setEditTask] = useState<Task | null>(null)
  const [search, setSearch] = useState('')
  const [filterPriority, setFilterPriority] = useState('')
  const [filterAssignee, setFilterAssignee] = useState('')
  const [saving, setSaving] = useState(false)
  const [menuState, setMenuState] = useState<{ taskId: string; anchor: DOMRect } | null>(null)

  // Drag state
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [dragOverCol, setDragOverCol] = useState<string | null>(null)
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null)

  const [form, setForm] = useState({ title:'', description:'', priority:'MEDIUM', assignedToId:'', departmentId:'', dueDate:'', tags:'' })

  const filtered = tasks.filter(t => {
    const q = search.toLowerCase()
    if (search && !t.title.toLowerCase().includes(q)) return false
    if (filterPriority && t.priority !== filterPriority) return false
    if (filterAssignee && t.assignedTo?.id !== filterAssignee) return false
    return true
  })
  const byStatus = (status: string) => filtered.filter(t => t.status === status)
  const totalDone = tasks.filter(t => t.status === 'DONE').length
  const pct = tasks.length > 0 ? Math.round((totalDone / tasks.length) * 100) : 0

  function openCreate() {
    setEditTask(null)
    setForm({ title:'', description:'', priority:'MEDIUM', assignedToId:'', departmentId:'', dueDate:'', tags:'' })
    setShowModal(true)
  }
  function openEdit(task: Task) {
    setEditTask(task)
    setForm({ title:task.title, description:task.description??'', priority:task.priority, assignedToId:task.assignedTo?.id??'', departmentId:task.department?.id??'', dueDate:task.dueDate?task.dueDate.slice(0,10):'', tags:task.tags??'' })
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

  // ── Drag handlers ─────────────────────────────────────────
  function handleDragOver(e: React.DragEvent, colId: string, idx: number) {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    setDragOverCol(colId)
    setDragOverIndex(idx)
  }

  function handleDrop(e: React.DragEvent, colId: string) {
    e.preventDefault()
    const taskId = e.dataTransfer.getData('taskId')
    if (!taskId) return
    setDraggingId(null); setDragOverCol(null); setDragOverIndex(null)
    // Optimistic update
    setTasks(prev => prev.map(t => t.id === taskId ? { ...t, status: colId } : t))
    // Persist
    handleStatusChange(taskId, colId)
  }

  function handleDragLeave(e: React.DragEvent, colId: string) {
    // Only clear if actually leaving the column (not entering a child)
    const rel = e.relatedTarget as Node | null
    if (!rel || !(e.currentTarget as HTMLElement).contains(rel)) {
      setDragOverCol(null); setDragOverIndex(null)
    }
  }

  return (
    <>
      <div className="page-header" style={{ padding:'24px 32px 20px' }}>
        <div className="flex items-center justify-between" style={{ marginBottom:16 }}>
          <div>
            <h1 className="gradient-text" style={{ marginBottom:4 }}>Tasks</h1>
            <p style={{ fontSize:'0.875rem', color:'var(--text-muted)' }}>{tasks.length} total · {totalDone} done · {pct}% complete</p>
          </div>
          <button className="btn btn-gradient focus-ring" onClick={openCreate} id="btn-create-task"><Plus size={18}/> New Task</button>
        </div>
        {/* Progress bar */}
        <div style={{ background:'var(--bg-overlay)', borderRadius:99, height:5, marginBottom:16, overflow:'hidden' }}>
          <div style={{ width:`${pct}%`, height:'100%', background:'var(--brand-gradient)', borderRadius:99, transition:'width 0.5s cubic-bezier(0.4,0,0.2,1)', boxShadow:pct>0?'0 0 12px rgba(99,102,241,0.4)':'none' }}/>
        </div>
        {/* Filter bar */}
        <div className="glass-card" style={{ padding:'10px 14px', borderRadius:'var(--radius-md)' }}>
          <div className="flex gap-2 items-center">
            <div style={{ position:'relative', flex:1, maxWidth:320 }}>
              <Search size={15} style={{ position:'absolute', left:10, top:'50%', transform:'translateY(-50%)', color:'var(--text-muted)' }}/>
              <input className="input focus-ring" style={{ paddingLeft:34, height:36, fontSize:'0.875rem' }} placeholder="Search tasks..." value={search} onChange={e=>setSearch(e.target.value)}/>
            </div>
            <select className="input focus-ring" style={{ width:'auto', height:36, fontSize:'0.875rem' }} value={filterPriority} onChange={e=>setFilterPriority(e.target.value)}>
              <option value="">All priorities</option>
              {PRIORITIES.map(p=><option key={p} value={p}>{p}</option>)}
            </select>
            <select className="input focus-ring" style={{ width:'auto', height:36, fontSize:'0.875rem' }} value={filterAssignee} onChange={e=>setFilterAssignee(e.target.value)}>
              <option value="">All assignees</option>
              {users.map(u=><option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
          </div>
        </div>
      </div>

      {menuState && (
        <FloatingMenu anchor={menuState.anchor} columns={COLUMNS}
          onMoveTo={s=>handleStatusChange(menuState.taskId,s)}
          onEdit={() => { const t=tasks.find(x=>x.id===menuState.taskId); if(t)openEdit(t) }}
          onDelete={() => handleDelete(menuState.taskId)}
          onClose={() => setMenuState(null)}/>
      )}

      <div className="page-body" style={{ paddingTop:20 }}>
        <div className="kanban-board">
          {COLUMNS.map((col, colIdx) => {
            const colTasks = byStatus(col.id)
            const isDragTarget = dragOverCol === col.id
            return (
              <div key={col.id}
                className={`kanban-col animate-slide-up${isDragTarget?' kanban-col-drag-over':''}`}
                style={{ animationDelay:`${colIdx*60}ms` }}
                onDragOver={e => handleDragOver(e, col.id, colTasks.length)}
                onDragLeave={e => handleDragLeave(e, col.id)}
                onDrop={e => handleDrop(e, col.id)}
              >
                <div style={{ height:3, background:col.gradient, borderRadius:'16px 16px 0 0', flexShrink:0 }}/>
                <div className="kanban-col-header">
                  <div className="flex items-center gap-2">
                    <span style={{ width:10, height:10, borderRadius:'50%', flexShrink:0, background:col.color, boxShadow:`0 0 8px ${col.color}55` }}/>
                    <span className="kanban-col-title">{col.label}</span>
                    <span className="badge badge-muted" style={{ fontSize:'0.6875rem', padding:'2px 8px', fontWeight:700 }}>{colTasks.length}</span>
                  </div>
                  <button className="btn btn-icon btn-ghost focus-ring" style={{ width:28, height:28 }} onClick={openCreate}><Plus size={14}/></button>
                </div>
                <div className="kanban-cards">
                  {colTasks.length === 0 && (
                    <div className={`kanban-empty${isDragTarget?' kanban-empty-over':''}`}>
                      {isDragTarget ? 'Drop here' : 'Drop tasks here'}
                    </div>
                  )}
                  {colTasks.map((task, i) => (
                    <div key={task.id}
                      className={`kanban-card-wrap${draggingId===task.id?' kanban-dragging':''}`}
                      onDragOver={e => { e.preventDefault(); setDragOverCol(col.id); setDragOverIndex(i) }}
                    >
                      {isDragTarget && dragOverIndex === i && draggingId !== task.id && (
                        <div className="kanban-drop-indicator"/>
                      )}
                      <TaskCard
                        task={task}
                        onTaskClick={() => openEdit(task)}
                        onMenuOpen={anchor => setMenuState(menuState?.taskId===task.id ? null : { taskId:task.id, anchor })}
                        onDragStart={id => setDraggingId(id)}
                        onDragEnd={() => { setDraggingId(null); setDragOverCol(null); setDragOverIndex(null) }}
                      />
                    </div>
                  ))}
                  {isDragTarget && colTasks.length > 0 && dragOverIndex === colTasks.length && (
                    <div className="kanban-drop-indicator"/>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal animate-scale-in" onClick={e=>e.stopPropagation()} style={{ maxWidth:560 }}>
            <div style={{ height:3, background:'var(--brand-gradient)', borderRadius:'24px 24px 0 0' }}/>
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
        .kanban-board { display:grid; grid-template-columns:repeat(4,1fr); gap:16px; height:calc(100vh - 260px); min-height:500px; }
        @media(max-width:1200px){.kanban-board{grid-template-columns:repeat(2,1fr);height:auto;}}
        @media(max-width:640px){.kanban-board{grid-template-columns:1fr;}}
        .kanban-col { background:var(--bg-surface); border:1px solid var(--border-subtle); border-radius:var(--radius-lg); display:flex; flex-direction:column; overflow:hidden; transition:border-color var(--transition-smooth),box-shadow var(--transition-smooth); }
        .kanban-col:hover { border-color:var(--border-default); box-shadow:var(--shadow-glow); }
        .kanban-col-drag-over { border-color:rgba(99,102,241,0.5) !important; box-shadow:0 0 0 2px rgba(99,102,241,0.2),var(--shadow-glow) !important; background:rgba(99,102,241,0.025) !important; }
        .kanban-col-header { display:flex; align-items:center; justify-content:space-between; padding:14px 14px 10px; border-bottom:1px solid var(--border-subtle); flex-shrink:0; }
        .kanban-col-title { font-size:0.8125rem; font-weight:600; color:var(--text-secondary); }
        .kanban-cards { flex:1; overflow-y:auto; padding:10px; display:flex; flex-direction:column; gap:8px; }
        .kanban-empty { display:flex; align-items:center; justify-content:center; height:80px; font-size:0.8125rem; color:var(--text-muted); border:1px dashed var(--border-subtle); border-radius:var(--radius-md); transition:all var(--transition-smooth); }
        .kanban-empty:hover,.kanban-empty-over { border-color:rgba(99,102,241,0.5); background:rgba(99,102,241,0.04); color:rgba(99,102,241,0.7); }
        .kanban-card-wrap { position:relative; }
        .kanban-dragging { opacity:0.35; }
        .kanban-drop-indicator { height:3px; background:rgba(99,102,241,0.7); border-radius:99px; margin:2px 0; box-shadow:0 0 8px rgba(99,102,241,0.4); animation:pulse-bar 1s ease infinite; }
        @keyframes pulse-bar { 0%,100%{opacity:0.7} 50%{opacity:1} }
        .task-card { background:var(--bg-elevated); border:1px solid var(--border-subtle); border-radius:var(--radius-md); padding:12px; cursor:grab; transition:all var(--transition-smooth); position:relative; user-select:none; }
        .task-card:active { cursor:grabbing; }
        .task-card:hover { border-color:var(--glass-border); transform:translateY(-2px); box-shadow:var(--shadow-md),0 0 20px rgba(99,102,241,0.08); background:var(--glass-bg); }
        .task-card-header { display:flex; align-items:flex-start; justify-content:space-between; gap:8px; margin-bottom:8px; }
        .task-card-title { font-size:0.875rem; font-weight:500; color:var(--text-primary); line-height:1.4; flex:1; }
        .task-card-desc { font-size:0.8125rem; color:var(--text-muted); margin-bottom:10px; line-height:1.4; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden; }
        .task-card-footer { display:flex; align-items:center; justify-content:space-between; margin-top:10px; padding-top:8px; border-top:1px solid var(--border-subtle); }
        .task-due-date { display:flex; align-items:center; gap:4px; font-size:0.75rem; color:var(--text-muted); }
        .task-due-date.overdue { color:var(--danger); font-weight:600; }
        .task-tag { font-size:0.6875rem; padding:2px 8px; background:var(--bg-overlay); border:1px solid var(--border-subtle); border-radius:99px; color:var(--text-muted); }
        .spin { animation:spin 0.7s linear infinite; }
      `}</style>
    </>
  )
}
