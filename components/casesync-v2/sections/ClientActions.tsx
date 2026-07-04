'use client'

import { useState, type CSSProperties } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { Edit3, MoreVertical, RefreshCw, UserX, Printer, X, Search } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { isSupervisorLike } from '@/lib/roles'
import { sendAssignmentEmail } from '@/app/actions/notifications'
import type { Client, Profile } from '@/lib/types'

// ---------------------------------------------------------------------------
// ClientActions — Phase A Batch 3c (Option A: kebab on hero)
//
// Edit elevated to a primary hero button; the lower-frequency / destructive
// actions live behind a kebab menu. Reassign and Mark-as-Deceased reuse the
// EXACT contracts the legacy ClientEditForm used so the audited reassign
// endpoint and the bot's is_active filter stay correct:
//   - Reassign  -> POST /api/clients/[id]/reassign { new_planner_id, reason }
//                  then append an activity_log row + assignment email.
//   - Deceased  -> soft-deactivate write (is_active=false + reason/at/by)
//                  + activity_log row, then redirect to /dashboard.
// Edit deep-links to ?edit=1; the wrapper swaps in the full legacy edit form.
// ---------------------------------------------------------------------------

interface Props {
  client: Client
  currentUserId: string
  currentProfile: Profile
  planners: Profile[]
}

export default function ClientActions({ client, currentUserId, currentProfile, planners }: Props) {
  const router = useRouter()
  const pathname = usePathname()
  const [menuOpen, setMenuOpen] = useState(false)
  const [reassignOpen, setReassignOpen] = useState(false)
  const [assignedTo, setAssignedTo] = useState('')
  const [plannerSearch, setPlannerSearch] = useState('')
  const [reassignReason, setReassignReason] = useState('')
  const [assignSaving, setAssignSaving] = useState(false)
  const [deactivating, setDeactivating] = useState(false)
  const [deceasedOpen, setDeceasedOpen] = useState(false)
  const [deceasedTyped, setDeceasedTyped] = useState('')
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null)

  const canManage = isSupervisorLike(currentProfile.role) || currentProfile.role === 'team_manager'
  const isActive = client.is_active ?? true
  const filteredPlanners = planners.filter(p => {
    const q = plannerSearch.trim().toLowerCase()
    return !q || (p.full_name ?? '').toLowerCase().includes(q)
  })

  const showToast = (type: 'success' | 'error', message: string) => {
    setToast({ type, message })
    setTimeout(() => setToast(null), 3500)
  }

  const goEdit = () => {
    setMenuOpen(false)
    router.push(`${pathname}?edit=1`)
  }

  const handlePrint = () => {
    setMenuOpen(false)
    window.print()
  }

  const handleReassign = async () => {
    if (!assignedTo) return
    setAssignSaving(true)
    try {
      const res = await fetch(`/api/clients/${client.id}/reassign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ new_planner_id: assignedTo, reason: reassignReason.trim() || null }),
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        throw new Error(j.error ?? `Reassign failed (${res.status})`)
      }
      await fetch(`/api/clients/${client.id}/activity`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'Reassigned client', field_name: 'assigned_to', old_value: client.assigned_to, new_value: assignedTo }),
      }).catch(() => {})
      sendAssignmentEmail(client.id, assignedTo).catch(() => {})
      setReassignOpen(false)
      setReassignReason('')
      setAssignedTo('')
      setPlannerSearch('')
      showToast('success', 'Reassigned.')
      router.refresh()
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'Reassign failed')
    } finally {
      setAssignSaving(false)
    }
  }

  const deceasedMatch =
    deceasedTyped.trim().toLowerCase() === (client.last_name ?? '').trim().toLowerCase() &&
    (client.last_name ?? '').trim().length > 0

  const handleMarkDeceased = async () => {
    if (!canManage || !deceasedMatch || deactivating) return
    setDeactivating(true)
    try {
      const res = await fetch(`/api/clients/${client.id}/deactivate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: 'deceased' }),
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        throw new Error(j.error ?? `Failed to mark deceased (${res.status})`)
      }
      await fetch(`/api/clients/${client.id}/activity`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'Deactivated client', field_name: 'deactivation_reason', old_value: null, new_value: 'deceased' }),
      }).catch(() => {})
      window.location.href = '/dashboard'
      return
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'Failed to mark deceased')
      setDeactivating(false)
    }
  }

  const editBtn: CSSProperties = {
    background: '#fff', color: '#1f4fc4', border: 'none', borderRadius: 10,
    padding: '7px 14px', fontSize: 12, fontWeight: 700, cursor: 'pointer',
    display: 'inline-flex', alignItems: 'center', gap: 5,
  }
  const kebabBtn: CSSProperties = {
    background: 'rgba(255,255,255,0.08)', color: '#fff', border: '1px solid rgba(255,255,255,0.18)',
    borderRadius: 10, width: 32, height: 32, cursor: 'pointer',
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
  }
  const menuItem: CSSProperties = {
    display: 'flex', alignItems: 'center', gap: 8, width: '100%',
    background: 'transparent', border: 'none', textAlign: 'left',
    padding: '9px 12px', fontSize: 13, color: 'var(--text)', cursor: 'pointer', borderRadius: 8,
  }

  return (
    <div style={{ position: 'relative' }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <button onClick={goEdit} style={editBtn}><Edit3 size={13} /> Edit</button>
        <button aria-label="More actions" onClick={() => setMenuOpen(o => !o)} style={kebabBtn}><MoreVertical size={16} /></button>
      </div>

      {menuOpen && (
        <>
          <div onClick={() => setMenuOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 40 }} />
          <div style={{
            position: 'absolute', right: 0, top: 40, zIndex: 41, minWidth: 196,
            background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12,
            boxShadow: '0 10px 30px rgba(0,0,0,0.25)', padding: 6,
          }}>
            {canManage && (
              <button style={menuItem} onClick={() => { setMenuOpen(false); setReassignOpen(true) }}>
                <RefreshCw size={15} /> Reassign
              </button>
            )}
            {canManage && isActive && (
              <button style={{ ...menuItem, color: '#d83a32' }} onClick={() => { setMenuOpen(false); setDeceasedTyped(''); setDeceasedOpen(true) }}>
                <UserX size={15} /> Mark as deceased
              </button>
            )}
            <button style={menuItem} onClick={handlePrint}>
              <Printer size={15} /> Print
            </button>
          </div>
        </>
      )}

      {reassignOpen && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 60, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, width: 420, maxWidth: '100%', maxHeight: '85vh', overflow: 'auto', padding: 20 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)' }}>Reassign client</div>
              <button aria-label="Close" onClick={() => setReassignOpen(false)} style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer' }}><X size={18} /></button>
            </div>
            <div style={{ position: 'relative', marginBottom: 10 }}>
              <Search size={14} style={{ position: 'absolute', left: 10, top: 10, color: 'var(--text-secondary)' }} />
              <input
                value={plannerSearch}
                onChange={e => setPlannerSearch(e.target.value)}
                placeholder="Search planners…"
                style={{ width: '100%', background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)', padding: '8px 10px 8px 30px', fontSize: 13 }}
              />
            </div>
            <div style={{ maxHeight: 220, overflow: 'auto', border: '1px solid var(--border)', borderRadius: 8, marginBottom: 12 }}>
              {filteredPlanners.length === 0 ? (
                <div style={{ padding: 12, fontSize: 13, color: 'var(--text-secondary)' }}>No planners found.</div>
              ) : filteredPlanners.map(p => (
                <button
                  key={p.id}
                  onClick={() => setAssignedTo(p.id)}
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%',
                    background: assignedTo === p.id ? 'var(--surface-2)' : 'transparent',
                    border: 'none', borderBottom: '1px solid var(--border)', cursor: 'pointer',
                    padding: '9px 12px', fontSize: 13, color: 'var(--text)', textAlign: 'left',
                  }}
                >
                  <span>{p.full_name ?? 'Unnamed'}</span>
                  {assignedTo === p.id && <span style={{ color: '#1f4fc4', fontSize: 12, fontWeight: 700 }}>Selected</span>}
                </button>
              ))}
            </div>
            <textarea
              value={reassignReason}
              onChange={e => setReassignReason(e.target.value)}
              placeholder="Reason (optional)"
              rows={2}
              style={{ width: '100%', background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)', padding: '8px 10px', fontSize: 13, marginBottom: 14, resize: 'vertical' }}
            />
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button onClick={() => setReassignOpen(false)} style={{ background: 'transparent', color: 'var(--text-secondary)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 14px', fontSize: 13, cursor: 'pointer' }}>Cancel</button>
              <button onClick={handleReassign} disabled={!assignedTo || assignSaving || assignedTo === client.assigned_to} style={{ background: (!assignedTo || assignedTo === client.assigned_to) ? 'rgba(37,99,235,0.5)' : '#2563eb', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 16px', fontSize: 13, fontWeight: 700, cursor: (!assignedTo || assignSaving || assignedTo === client.assigned_to) ? 'not-allowed' : 'pointer' }}>{assignSaving ? 'Reassigning…' : 'Reassign'}</button>
            </div>
          </div>
        </div>
      )}

      {deceasedOpen && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 60, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div role="dialog" aria-modal="true" aria-label="Mark client as deceased" style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, width: 440, maxWidth: '100%', padding: 20 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: '#d83a32' }}>Mark as deceased</div>
              <button aria-label="Close" onClick={() => { if (!deactivating) setDeceasedOpen(false) }} style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer' }}><X size={18} /></button>
            </div>
            <div style={{ fontSize: 13, color: 'var(--text)', lineHeight: 1.5, marginBottom: 12 }}>
              This deactivates <strong>{client.first_name} {client.last_name}</strong> across CaseSync. The record is preserved and audited, but the client leaves active caseloads immediately.
            </div>
            <label style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'block', marginBottom: 6 }}>
              Type the client&apos;s last name (<strong>{client.last_name}</strong>) to confirm
            </label>
            <input
              value={deceasedTyped}
              onChange={e => setDeceasedTyped(e.target.value)}
              placeholder={client.last_name ?? ''}
              autoFocus
              disabled={deactivating}
              className="cs-deceased-confirm-input"
              style={{ width: '100%', background: 'var(--surface-2)', border: `1px solid ${deceasedMatch ? '#1D9E75' : 'var(--border)'}`, borderRadius: 8, color: 'var(--text)', padding: '8px 10px', fontSize: 13, marginBottom: 14 }}
            />
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button onClick={() => setDeceasedOpen(false)} disabled={deactivating} style={{ background: 'transparent', color: 'var(--text-secondary)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 14px', fontSize: 13, cursor: 'pointer' }}>Cancel</button>
              <button
                onClick={handleMarkDeceased}
                disabled={!deceasedMatch || deactivating}
                className="cs-deceased-confirm-btn"
                style={{ background: (!deceasedMatch || deactivating) ? 'rgba(216,58,50,0.45)' : '#d83a32', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 16px', fontSize: 13, fontWeight: 700, cursor: (!deceasedMatch || deactivating) ? 'not-allowed' : 'pointer' }}
              >
                {deactivating ? 'Saving…' : 'Mark as deceased'}
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div className="cs-action-toast" style={{ position: 'fixed', bottom: 20, right: 20, zIndex: 80, background: toast.type === 'success' ? '#0f5132' : '#842029', color: '#fff', padding: '10px 16px', borderRadius: 10, fontSize: 13, boxShadow: '0 8px 24px rgba(0,0,0,0.3)' }}>
          {toast.message}
        </div>
      )}
    </div>
  )
}
