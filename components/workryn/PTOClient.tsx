'use client'

import { useState, useMemo } from 'react'
import {
  Umbrella, Thermometer, User as UserIcon, FileText, Heart, Clock as ClockIcon,
  Plus, Check, X, Clock, CalendarDays, ChevronLeft, ChevronRight,
  Filter, RefreshCw, Link2, AlertTriangle, Send, Search,
  ArrowUpDown, Download
} from 'lucide-react'
import { getInitials, timeAgo } from '@/lib/workryn/utils'

type PtoType = { id: string; name: string; code: string; color: string; icon: string; accrualRate: number; maxAccrual: number; excludeFromPayroll: boolean }
type Balance = { id: string; typeId: string; accrued: number; used: number; pending: number; adjustment: number; available: number; type: PtoType }
type PtoRequest = { id: string; userId: string; typeId: string; startDate: string; endDate: string; totalHours: number; isHalfDay: boolean; halfDayPeriod: string | null; notes: string | null; status: string; reviewedAt: string | null; reviewNote: string | null; intuitSynced: boolean; intuitSyncError: string | null; createdAt: string; user: { id: string; name: string; avatarColor: string; email: string; jobTitle: string | null }; type: { id: string; name: string; code: string; color: string; icon: string; excludeFromPayroll?: boolean }; reviewedBy: { id: string; name: string } | null }
type UserInfo = { id: string; name: string | null; email: string | null; avatarColor: string; jobTitle: string | null; role: string }
type IntuitMap = { id: string; userId: string; intuitEmployeeId: string; intuitDisplayName: string | null; intuitEmail: string | null; syncStatus: string; user: { id: string; name: string | null; email: string | null } }

const ICON_MAP: Record<string, typeof Umbrella> = { umbrella: Umbrella, thermometer: Thermometer, user: UserIcon, 'file-text': FileText, heart: Heart, clock: ClockIcon }
const STATUS_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  PENDING: { bg: 'var(--w-status-pending-bg, #fef3c7)', text: 'var(--w-status-pending, #92400e)', label: 'Pending' },
  APPROVED: { bg: 'var(--w-status-approved-bg, #d1fae5)', text: 'var(--w-status-approved, #065f46)', label: 'Approved' },
  DENIED: { bg: 'var(--w-status-denied-bg, #fecaca)', text: 'var(--w-status-denied, #991b1b)', label: 'Denied' },
  CANCELLED: { bg: 'var(--w-bg-surface-alt, #f3f4f6)', text: 'var(--w-text-muted, #6b7280)', label: 'Cancelled' },
}

interface PTOClientProps { currentUser: { id: string; name: string; role: string; avatarColor: string }; types: PtoType[]; balances: Balance[]; initialRequests: PtoRequest[]; allUsers: UserInfo[]; pendingCount: number; intuitMappings: IntuitMap[]; isElevated: boolean }

export default function PTOClient({ currentUser, types, balances, initialRequests, allUsers, pendingCount: initialPendingCount, intuitMappings: initialMappings, isElevated }: PTOClientProps) {
  const [tab, setTab] = useState<'my'|'queue'|'calendar'|'admin'|'intuit'>('my')
  const [requests, setRequests] = useState<PtoRequest[]>(initialRequests)
  const [showNewRequest, setShowNewRequest] = useState(false)
  const [pendingCount, setPendingCount] = useState(initialPendingCount)
  const [intuitMappings, setIntuitMappings] = useState(initialMappings)
  const [syncing, setSyncing] = useState(false)
  const [syncResults, setSyncResults] = useState<any>(null)
  const [statusFilter, setStatusFilter] = useState<string>('ALL')
  const [searchQuery, setSearchQuery] = useState('')
  const [formTypeId, setFormTypeId] = useState(types[0]?.id || '')
  const [formStart, setFormStart] = useState('')
  const [formEnd, setFormEnd] = useState('')
  const [formHours, setFormHours] = useState('')
  const [formHalfDay, setFormHalfDay] = useState(false)
  const [formHalfPeriod, setFormHalfPeriod] = useState('AM')
  const [formNotes, setFormNotes] = useState('')
  const [formError, setFormError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [reviewingId, setReviewingId] = useState<string|null>(null)
  const [reviewNote, setReviewNote] = useState('')
  const [calMonth, setCalMonth] = useState(() => { const d = new Date(); return { year: d.getFullYear(), month: d.getMonth() } })

  const tabs = [{ key: 'my' as const, label: 'My PTO', icon: Umbrella }, ...(isElevated ? [{ key: 'queue' as const, label: 'Approval Queue', icon: Clock, badge: pendingCount }, { key: 'calendar' as const, label: 'Team Calendar', icon: CalendarDays }, { key: 'admin' as const, label: 'HR Admin', icon: ArrowUpDown }, { key: 'intuit' as const, label: 'Intuit Sync', icon: Link2 }] : [{ key: 'calendar' as const, label: 'Calendar', icon: CalendarDays }])]

  const filteredRequests = useMemo(() => {
    let f = requests
    if (tab === 'my') f = f.filter(r => r.userId === currentUser.id)
    if (tab === 'queue') f = f.filter(r => r.status === 'PENDING')
    if (statusFilter !== 'ALL') f = f.filter(r => r.status === statusFilter)
    if (searchQuery.trim()) { const q = searchQuery.toLowerCase(); f = f.filter(r => r.user.name.toLowerCase().includes(q) || r.type.name.toLowerCase().includes(q) || r.notes?.toLowerCase().includes(q)) }
    return f
  }, [requests, tab, statusFilter, searchQuery, currentUser.id])

  async function submitRequest() {
    setFormError('')
    if (!formTypeId || !formStart || !formEnd || !formHours) { setFormError('All fields are required'); return }
    if (Number(formHours) <= 0) { setFormError('Hours must be positive'); return }
    if (new Date(formStart) > new Date(formEnd)) { setFormError('Start date must be before end date'); return }
    setSubmitting(true)
    try {
      const res = await fetch('/api/workryn/pto/requests', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ typeId: formTypeId, startDate: formStart, endDate: formEnd, totalHours: Number(formHours), isHalfDay: formHalfDay, halfDayPeriod: formHalfDay ? formHalfPeriod : null, notes: formNotes || null }) })
      const data = await res.json()
      if (!res.ok) { setFormError(data.error || 'Failed'); return }
      setRequests(prev => [data, ...prev]); setShowNewRequest(false); resetForm()
    } catch { setFormError('Network error') } finally { setSubmitting(false) }
  }
  function resetForm() { setFormTypeId(types[0]?.id || ''); setFormStart(''); setFormEnd(''); setFormHours(''); setFormHalfDay(false); setFormHalfPeriod('AM'); setFormNotes(''); setFormError('') }

  async function reviewRequest(id: string, action: 'APPROVED'|'DENIED') {
    setReviewingId(id)
    try { const res = await fetch(`/api/workryn/pto/requests/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, reviewNote }) }); const data = await res.json(); if (res.ok) { setRequests(prev => prev.map(r => r.id === id ? data : r)); setPendingCount(prev => Math.max(0, prev - 1)); setReviewNote('') } } catch {} finally { setReviewingId(null) }
  }
  async function syncIntuitEmployees() {
    setSyncing(true); setSyncResults(null)
    try { const res = await fetch('/api/workryn/pto/intuit/sync', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'sync-employees' }) }); setSyncResults(await res.json()); const mr = await fetch('/api/workryn/pto/intuit/sync'); if (mr.ok) setIntuitMappings(await mr.json()) } catch { setSyncResults({ error: 'Network error' }) } finally { setSyncing(false) }
  }
  async function pushToIntuit(rid: string) { try { const res = await fetch('/api/workryn/pto/intuit/sync', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'push-pto', requestId: rid }) }); if ((await res.json()) && res.ok) setRequests(prev => prev.map(r => r.id === rid ? { ...r, intuitSynced: true, intuitSyncError: null } : r)) } catch {} }

  const calDays = useMemo(() => { const { year, month } = calMonth; const fd = new Date(year, month, 1).getDay(); const dm = new Date(year, month+1, 0).getDate(); const d: (number|null)[] = []; for (let i=0;i<fd;i++) d.push(null); for (let i=1;i<=dm;i++) d.push(i); return d }, [calMonth])
  const calEvents = useMemo(() => { const { year, month } = calMonth; const ms = new Date(year, month, 1); const me = new Date(year, month+1, 0); return requests.filter(r => { if (r.status !== 'APPROVED' && r.status !== 'PENDING') return false; const s = new Date(r.startDate); const e = new Date(r.endDate); return s <= me && e >= ms }) }, [requests, calMonth])
  function getDayEvents(day: number) { const { year, month } = calMonth; const d = new Date(year, month, day); return calEvents.filter(r => { const s = new Date(r.startDate); const e = new Date(r.endDate); s.setHours(0,0,0,0); e.setHours(23,59,59,999); return d >= s && d <= e }) }
  const monthNames = ['January','February','March','April','May','June','July','August','September','October','November','December']

  return (
    <div className="w-pto-page">
      <div className="w-pto-header">
        <div className="w-pto-header-left"><Umbrella size={24} /><h1>Paid Time Off</h1></div>
        {tab === 'my' && <button className="w-btn w-btn-primary w-focus-ring" onClick={() => setShowNewRequest(true)}><Plus size={16} /> New Request</button>}
      </div>
      <div className="w-pto-balance-grid">
        {balances.map(b => { const IC = ICON_MAP[b.type.icon] || Umbrella; const pct = b.type.maxAccrual > 0 ? Math.min(100, ((b.used+b.pending)/b.type.maxAccrual)*100) : 0; return (
          <div key={b.id} className="w-pto-balance-card" style={{'--pto-accent': b.type.color} as any}>
            <div className="w-pto-balance-icon"><IC size={18} /></div>
            <div className="w-pto-balance-info"><span className="w-pto-balance-label">{b.type.name}</span><span className="w-pto-balance-available">{b.available.toFixed(1)} hrs</span><span className="w-pto-balance-detail">{b.accrued.toFixed(1)} accrued  {b.used.toFixed(1)} used  {b.pending.toFixed(1)} pending</span></div>
            {b.type.maxAccrual > 0 && <div className="w-pto-balance-bar"><div className="w-pto-balance-bar-fill" style={{width:`${pct}%`}} /></div>}
          </div>) })}
      </div>
      <div className="w-pto-tabs">{tabs.map(t => { const I = t.icon; return (<button key={t.key} className={`w-pto-tab w-focus-ring ${tab===t.key?'active':''}`} onClick={() => setTab(t.key)}><I size={16} /><span>{t.label}</span>{'badge' in t && t.badge ? <span className="w-pto-tab-badge">{t.badge}</span> : null}</button>) })}</div>
      {(tab==='my'||tab==='queue'||tab==='admin') && <div className="w-pto-filters"><div className="w-pto-search"><Search size={14} /><input type="text" placeholder={isElevated?'Search by name or type...':'Search...'} value={searchQuery} onChange={e=>setSearchQuery(e.target.value)} className="w-focus-ring" /></div>{tab!=='queue' && <div className="w-pto-status-filter"><Filter size={14} /><select value={statusFilter} onChange={e=>setStatusFilter(e.target.value)} className="w-focus-ring"><option value="ALL">All Statuses</option><option value="PENDING">Pending</option><option value="APPROVED">Approved</option><option value="DENIED">Denied</option><option value="CANCELLED">Cancelled</option></select></div>}</div>}
      {(tab==='my'||tab==='queue'||tab==='admin') && <div className="w-pto-request-list">{filteredRequests.length===0 ? <div className="w-pto-empty"><Umbrella size={32} /><p>{tab==='queue'?'No pending requests':'No requests found'}</p></div> : filteredRequests.map(r => { const s = STATUS_STYLES[r.status]||STATUS_STYLES.PENDING; const I = ICON_MAP[r.type.icon]||Umbrella; const own = r.userId===currentUser.id; return (
        <div key={r.id} className="w-pto-request-card">
          <div className="w-pto-request-left"><div className="w-pto-request-type-icon" style={{background:r.type.color+'20',color:r.type.color}}><I size={18} /></div><div className="w-pto-request-details"><div className="w-pto-request-top">{!own && <div className="w-pto-request-user"><div className="w-avatar w-avatar-xs" style={{background:r.user.avatarColor}}>{getInitials(r.user.name)}</div><span className="w-pto-request-name">{r.user.name}</span></div>}<span className="w-pto-request-type-label">{r.type.name}</span><span className="w-pto-request-hours">{r.totalHours}hrs</span>{r.isHalfDay && <span className="w-pto-request-half">{r.halfDayPeriod} half-day</span>}</div><div className="w-pto-request-dates">{new Date(r.startDate).toLocaleDateString('en-US',{month:'short',day:'numeric'})}{r.startDate!==r.endDate && `  ${new Date(r.endDate).toLocaleDateString('en-US',{month:'short',day:'numeric'})}`}</div>{r.notes && <div className="w-pto-request-notes">{r.notes}</div>}{r.reviewedBy && <div className="w-pto-request-review">{r.status==='APPROVED'?<Check size={12}/>:<X size={12}/>}{r.reviewedBy.name}  {timeAgo(r.reviewedAt!)}{r.reviewNote && <span>  {r.reviewNote}</span>}</div>}</div></div>
          <div className="w-pto-request-right"><span className="w-pto-status-badge" style={{background:s.bg,color:s.text}}>{s.label}</span>{r.status==='APPROVED'&&isElevated&&(r.type.excludeFromPayroll?<span className="w-pto-intuit-badge local" title="This type is tracked in Workryn only  not sent to payroll"><ClockIcon size={12}/> Workryn Only</span>:r.intuitSynced?<span className="w-pto-intuit-badge synced"><Check size={12}/> Synced</span>:r.intuitSyncError?<button className="w-pto-intuit-badge error" onClick={()=>pushToIntuit(r.id)} title={r.intuitSyncError}><AlertTriangle size={12}/> Retry</button>:<button className="w-pto-intuit-badge pending" onClick={()=>pushToIntuit(r.id)}><Send size={12}/> Push to QBO</button>)}{r.status==='PENDING'&&isElevated&&!own&&<div className="w-pto-review-actions"><input className="w-pto-review-note w-focus-ring" placeholder="Note (optional)" value={reviewingId===r.id?reviewNote:''} onChange={e=>{setReviewingId(r.id);setReviewNote(e.target.value)}} /><button className="w-btn w-btn-sm w-btn-approve w-focus-ring" onClick={()=>reviewRequest(r.id,'APPROVED')} disabled={reviewingId===r.id}><Check size={14}/> Approve</button><button className="w-btn w-btn-sm w-btn-deny w-focus-ring" onClick={()=>reviewRequest(r.id,'DENIED')} disabled={reviewingId===r.id}><X size={14}/> Deny</button></div>}</div>
        </div>) })}</div>}
      {tab==='calendar' && <div className="w-pto-calendar"><div className="w-pto-cal-header"><button className="w-btn w-btn-icon w-btn-ghost w-focus-ring" onClick={()=>setCalMonth(p=>{const m=p.month-1;return m<0?{year:p.year-1,month:11}:{...p,month:m}})}><ChevronLeft size={18}/></button><h3>{monthNames[calMonth.month]} {calMonth.year}</h3><button className="w-btn w-btn-icon w-btn-ghost w-focus-ring" onClick={()=>setCalMonth(p=>{const m=p.month+1;return m>11?{year:p.year+1,month:0}:{...p,month:m}})}><ChevronRight size={18}/></button></div><div className="w-pto-cal-grid">{['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map(d=><div key={d} className="w-pto-cal-day-header">{d}</div>)}{calDays.map((day,i)=>{if(day===null)return<div key={`e-${i}`} className="w-pto-cal-cell empty"/>;const ev=getDayEvents(day);const it=(()=>{const t=new Date();return t.getFullYear()===calMonth.year&&t.getMonth()===calMonth.month&&t.getDate()===day})();return(<div key={day} className={`w-pto-cal-cell${it?' today':''}${ev.length>0?' has-events':''}`}><span className="w-pto-cal-day-num">{day}</span><div className="w-pto-cal-events">{ev.slice(0,3).map(e=><div key={e.id} className={`w-pto-cal-event ${e.status.toLowerCase()}`} style={{background:e.type.color+'25',borderLeftColor:e.type.color}} title={`${e.user.name}: ${e.type.name} (${e.totalHours}hrs)  ${e.status}`}><span>{e.user.name.split(' ')[0]}</span></div>)}{ev.length>3&&<span className="w-pto-cal-more">+{ev.length-3}</span>}</div></div>)})}</div></div>}
      {tab==='intuit'&&isElevated&&<div className="w-pto-intuit"><div className="w-pto-intuit-header"><div><h3>Intuit QuickBooks Employee Mapping</h3><p className="w-pto-intuit-desc">Map Workryn users to QuickBooks employees for automatic PTO payroll sync. Auto-matching uses email first, then name.</p></div><button className="w-btn w-btn-primary w-focus-ring" onClick={syncIntuitEmployees} disabled={syncing}><RefreshCw size={16} className={syncing?'w-spin':''}/>{syncing?'Syncing...':'Sync Employees'}</button></div>{syncResults&&<div className="w-pto-sync-results">{syncResults.error?<div className="w-pto-sync-error"><AlertTriangle size={16}/> {syncResults.error}{syncResults.detail&&<pre>{syncResults.detail}</pre>}</div>:<><div className="w-pto-sync-stat-grid"><div className="w-pto-sync-stat matched"><span className="w-pto-sync-stat-num">{syncResults.matched?.length||0}</span><span>Newly Matched</span></div><div className="w-pto-sync-stat existing"><span className="w-pto-sync-stat-num">{syncResults.already_mapped||0}</span><span>Already Mapped</span></div><div className="w-pto-sync-stat unmatched"><span className="w-pto-sync-stat-num">{syncResults.unmatched_qbo?.length||0}</span><span>Unmatched (QBO)</span></div><div className="w-pto-sync-stat unmatched"><span className="w-pto-sync-stat-num">{syncResults.unmatched_workryn?.length||0}</span><span>Unmatched (Workryn)</span></div></div>{syncResults.matched?.length>0&&<div className="w-pto-sync-match-list"><h4>Auto-Matched Employees</h4>{syncResults.matched.map((m:any,i:number)=><div key={i} className="w-pto-sync-match-row"><span>{m.workrynUser}</span><span className="w-pto-sync-arrow"></span><span>{m.qboEmployee}</span><span className="w-pto-sync-method">via {m.matchedBy}</span></div>)}</div>}{syncResults.unmatched_qbo?.length>0&&<div className="w-pto-sync-unmatched"><h4>Unmatched QuickBooks Employees (need manual mapping)</h4>{syncResults.unmatched_qbo.map((u:any)=><div key={u.id} className="w-pto-sync-unmatched-row"><span>{u.name}</span>{u.email&&<span className="w-pto-sync-email">{u.email}</span>}<span className="w-pto-sync-id">QBO #{u.id}</span></div>)}</div>}</>}</div>}<div className="w-pto-intuit-mappings"><h4>Current Employee Mappings ({intuitMappings.length})</h4>{intuitMappings.length===0?<div className="w-pto-empty"><Link2 size={24}/><p>No employee mappings yet. Click "Sync Employees" to auto-match.</p></div>:<div className="w-pto-mapping-table"><div className="w-pto-mapping-header"><span>Workryn User</span><span>QBO Employee</span><span>QBO Email</span><span>Status</span></div>{intuitMappings.map(m=><div key={m.id} className="w-pto-mapping-row"><span className="w-pto-mapping-user">{m.user.name||m.user.email||'Unknown'}</span><span>{m.intuitDisplayName||`#${m.intuitEmployeeId}`}</span><span className="w-pto-mapping-email">{m.intuitEmail||''}</span><span className={`w-pto-mapping-status ${m.syncStatus.toLowerCase()}`}>{m.syncStatus}</span></div>)}</div>}</div></div>}
      {showNewRequest&&<div className="w-pto-modal-backdrop" onClick={()=>{setShowNewRequest(false);resetForm()}}><div className="w-pto-modal" onClick={e=>e.stopPropagation()}><div className="w-pto-modal-header"><h3>New PTO Request</h3><button className="w-btn w-btn-icon w-btn-ghost w-focus-ring" onClick={()=>{setShowNewRequest(false);resetForm()}}><X size={18}/></button></div><div className="w-pto-modal-body"><label className="w-pto-field"><span>PTO Type</span><select value={formTypeId} onChange={e=>setFormTypeId(e.target.value)} className="w-focus-ring">{types.map(t=><option key={t.id} value={t.id}>{t.name}</option>)}</select></label><div className="w-pto-field-row"><label className="w-pto-field"><span>Start Date</span><input type="date" value={formStart} onChange={e=>setFormStart(e.target.value)} className="w-focus-ring"/></label><label className="w-pto-field"><span>End Date</span><input type="date" value={formEnd} onChange={e=>setFormEnd(e.target.value)} className="w-focus-ring"/></label></div><label className="w-pto-field"><span>Total Hours</span><input type="number" step="0.5" min="0.5" max="480" value={formHours} onChange={e=>setFormHours(e.target.value)} placeholder="e.g. 8" className="w-focus-ring"/></label><div className="w-pto-field-check"><input type="checkbox" id="halfDay" checked={formHalfDay} onChange={e=>setFormHalfDay(e.target.checked)}/><label htmlFor="halfDay">Half Day</label>{formHalfDay&&<select value={formHalfPeriod} onChange={e=>setFormHalfPeriod(e.target.value)} className="w-focus-ring"><option value="AM">Morning (AM)</option><option value="PM">Afternoon (PM)</option></select>}</div><label className="w-pto-field"><span>Notes (optional)</span><textarea value={formNotes} onChange={e=>setFormNotes(e.target.value)} rows={3} placeholder="Reason or additional context..." className="w-focus-ring"/></label>{formTypeId&&(()=>{const bal=balances.find(b=>b.typeId===formTypeId);return bal?<div className="w-pto-form-balance">Available: <strong>{bal.available.toFixed(1)} hrs</strong> of {bal.type.name}</div>:null})()}{formError&&<div className="w-pto-form-error"><AlertTriangle size={14}/> {formError}</div>}</div><div className="w-pto-modal-footer"><button className="w-btn w-btn-ghost w-focus-ring" onClick={()=>{setShowNewRequest(false);resetForm()}}>Cancel</button><button className="w-btn w-btn-primary w-focus-ring" onClick={submitRequest} disabled={submitting}>{submitting?'Submitting...':'Submit Request'}</button></div></div></div>}
    </div>
  )
}
