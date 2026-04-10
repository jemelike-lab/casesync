'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { DndContext, DragEndEvent, DragOverlay, DragStartEvent, PointerSensor, closestCenter, useDroppable, useSensor, useSensors } from '@dnd-kit/core'
import { useDraggable } from '@dnd-kit/core'
import { CSS } from '@dnd-kit/utilities'
import { Client, Profile } from '@/lib/types'
import { createClient } from '@/lib/supabase/client'

interface Props {
  clients: Client[]
  planners: Profile[]
}

function ClientCardView({ client, dragging, saving }: { client: Client; dragging?: boolean; saving?: boolean }) {
  return (
    <div
      style={{
        border: '1px solid var(--border)',
        borderRadius: 10,
        padding: '10px 10px',
        background: 'var(--surface-2)',
        cursor: 'grab',
        opacity: saving ? 0.6 : 1,
        boxShadow: dragging ? '0 8px 20px rgba(0,0,0,0.18)' : 'none',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'start' }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', lineHeight: 1.35 }}>
            {client.last_name}{client.first_name ? `, ${client.first_name}` : ''}
          </div>
          <div style={{ fontSize: 10, color: 'var(--text-secondary)', marginTop: 3 }}>
            ID: {client.client_id}
          </div>
          <div style={{ fontSize: 10, color: 'var(--text-secondary)', marginTop: 5, lineHeight: 1.35 }}>
            Current: {client.profiles?.full_name ?? 'Unassigned'}
          </div>
        </div>
        <div style={{ fontSize: 10, color: 'var(--text-secondary)' }}>
          {client.category.toUpperCase()}
        </div>
      </div>
    </div>
  )
}

function DraggableClientCard({ client, saving }: { client: Client; saving?: boolean }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: client.id })
  const style = {
    transform: CSS.Translate.toString(transform),
  }

  return (
    <div ref={setNodeRef} style={style} {...listeners} {...attributes}>
      <ClientCardView client={client} dragging={isDragging} saving={saving} />
    </div>
  )
}

function DropColumn({ id, title, subtitle, children }: { id: string; title: string; subtitle: string; children: React.ReactNode }) {
  const { isOver, setNodeRef } = useDroppable({ id })

  return (
    <div
      ref={setNodeRef}
      className="card"
      style={{
        minHeight: 420,
        background: isOver ? 'rgba(0,122,255,0.08)' : undefined,
        border: isOver ? '1px solid rgba(0,122,255,0.35)' : undefined,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, gap: 12 }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, lineHeight: 1.35 }}>{title}</div>
          <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 4 }}>{subtitle}</div>
        </div>
      </div>

      <div style={{ display: 'grid', gap: 8 }}>
        <div
          style={{
            border: '1px dashed var(--border)',
            borderRadius: 10,
            padding: 10,
            fontSize: 11,
            color: 'var(--text-secondary)',
            background: isOver ? 'rgba(0,122,255,0.06)' : 'transparent',
          }}
        >
          Drop here
        </div>
        {children}
      </div>
    </div>
  )
}

export default function TransferBoardClient({ clients: initialClients, planners }: Props) {
  const supabase = useMemo(() => createClient(), [])
  const [clients, setClients] = useState<Client[]>(initialClients)
  const [search, setSearch] = useState('')
  const [savingClientId, setSavingClientId] = useState<string | null>(null)
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null)
  const [activeClientId, setActiveClientId] = useState<string | null>(null)

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }))

  function showToast(type: 'success' | 'error', message: string) {
    setToast({ type, message })
    setTimeout(() => setToast(null), 3500)
  }

  const filteredClients = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return clients
    return clients.filter(c => {
      const name = `${c.last_name} ${c.first_name ?? ''}`.toLowerCase()
      const planner = c.profiles?.full_name?.toLowerCase() ?? ''
      return name.includes(q) || c.client_id.toLowerCase().includes(q) || planner.includes(q)
    })
  }, [clients, search])

  const unassignedClients = useMemo(() => filteredClients.filter(c => !c.assigned_to), [filteredClients])

  const plannerSignals = useMemo(() => {
    return planners.map(planner => {
      const plannerClients = clients.filter(c => c.assigned_to === planner.id)
      const overdue = plannerClients.filter(c => {
        const dates = [
          c.eligibility_end_date,
          c.three_month_visit_due,
          c.quarterly_waiver_date,
          c.med_tech_redet_date,
          c.pos_deadline,
          c.assessment_due,
          c.thirty_day_letter_date,
          c.spm_next_due,
          c.co_financial_redet_date,
          c.co_app_date,
          c.mfp_consent_date,
          c.two57_date,
          c.doc_mdh_date,
        ].filter(Boolean)
        const today = new Date().toISOString().split('T')[0]
        return dates.some(date => String(date) < today)
      }).length
      const dueThisWeek = plannerClients.filter(c => {
        const today = new Date()
        const start = new Date(today)
        start.setHours(0, 0, 0, 0)
        const end = new Date(start)
        end.setDate(end.getDate() + 7)
        const dates = [
          c.eligibility_end_date,
          c.three_month_visit_due,
          c.quarterly_waiver_date,
          c.med_tech_redet_date,
          c.pos_deadline,
          c.assessment_due,
          c.thirty_day_letter_date,
          c.spm_next_due,
          c.co_financial_redet_date,
          c.co_app_date,
          c.mfp_consent_date,
          c.two57_date,
          c.doc_mdh_date,
        ].filter(Boolean)
        return dates.some(date => {
          const d = new Date(String(date))
          return d >= start && d <= end
        })
      }).length
      const pressureScore = overdue * 5 + dueThisWeek * 2 + Math.max(0, plannerClients.length - 35)
      const loadStatus = pressureScore >= 12 ? 'rebalance' : pressureScore >= 6 ? 'watch' : 'balanced'

      return {
        planner,
        clientCount: plannerClients.length,
        overdue,
        dueThisWeek,
        pressureScore,
        loadStatus,
      }
    })
  }, [clients, planners])

  const rebalanceHints = useMemo(() => {
    const donors = plannerSignals.filter(row => row.loadStatus === 'rebalance').sort((a, b) => b.pressureScore - a.pressureScore).slice(0, 2)
    const receivers = plannerSignals.filter(row => row.loadStatus === 'balanced').sort((a, b) => a.pressureScore - b.pressureScore || a.clientCount - b.clientCount).slice(0, 3)
    return { donors, receivers }
  }, [plannerSignals])

  const recommendedMoves = useMemo(() => {
    if (rebalanceHints.donors.length === 0 || rebalanceHints.receivers.length === 0) return []

    function getClientDates(client: Client) {
      return [
        client.eligibility_end_date,
        client.three_month_visit_due,
        client.quarterly_waiver_date,
        client.med_tech_redet_date,
        client.pos_deadline,
        client.assessment_due,
        client.thirty_day_letter_date,
        client.spm_next_due,
        client.co_financial_redet_date,
        client.co_app_date,
        client.mfp_consent_date,
        client.two57_date,
        client.doc_mdh_date,
      ].filter(Boolean).map(value => String(value))
    }

    function isClientOverdue(client: Client) {
      const today = new Date().toISOString().split('T')[0]
      return getClientDates(client).some(date => date < today)
    }

    function isClientDueSoon(client: Client) {
      const today = new Date()
      const start = new Date(today)
      start.setHours(0, 0, 0, 0)
      const end = new Date(start)
      end.setDate(end.getDate() + 7)
      return getClientDates(client).some(date => {
        const d = new Date(date)
        return d >= start && d <= end
      })
    }

    function daysSinceContact(client: Client) {
      if (!client.last_contact_date) return null
      const last = new Date(client.last_contact_date)
      if (Number.isNaN(last.getTime())) return null
      const today = new Date()
      const diffMs = today.getTime() - last.getTime()
      return Math.floor(diffMs / (1000 * 60 * 60 * 24))
    }

    function donorCategoryPressure(client: Client) {
      return clients.filter(other => other.assigned_to === client.assigned_to && other.category === client.category).length
    }

    function candidateScore(client: Client) {
      let score = 0
      if (isClientOverdue(client)) score += 100
      if (isClientDueSoon(client)) score += 40
      score += Math.max(0, (client.goal_pct ?? 0) - 60)

      const days = daysSinceContact(client)
      if (days !== null) {
        if (days <= 7) score += 15
        else if (days >= 30) score -= 10
      }

      score += Math.min(20, donorCategoryPressure(client))
      return score
    }

    return rebalanceHints.donors.flatMap((donor, donorIndex) => {
      const receiver = rebalanceHints.receivers[donorIndex % rebalanceHints.receivers.length]
      const suggestedCount = Math.min(
        2,
        Math.max(
          1,
          Math.ceil((donor.pressureScore - receiver.pressureScore) / 6)
        )
      )
      const candidateClients = clients
        .filter(client => client.assigned_to === donor.planner.id)
        .sort((a, b) => candidateScore(a) - candidateScore(b))
        .slice(0, suggestedCount + 1)
        .map(client => ({
          id: client.id,
          clientId: client.client_id,
          name: `${client.last_name}${client.first_name ? `, ${client.first_name}` : ''}`,
          overdue: isClientOverdue(client),
          dueSoon: isClientDueSoon(client),
          goalPct: client.goal_pct ?? 0,
          category: client.category,
          daysSinceContact: daysSinceContact(client),
        }))

      return [{
        donor,
        receiver,
        suggestedCount,
        reason: donor.overdue > 0
          ? `${donor.overdue} overdue driving pressure`
          : donor.dueThisWeek > 0
            ? `${donor.dueThisWeek} due this week`
            : `${donor.clientCount} total clients`,
        candidates: candidateClients,
      }]
    })
  }, [clients, rebalanceHints])

  async function reassignClient(clientId: string, plannerId: string | null) {
    const client = clients.find(c => c.id === clientId)
    const planner = planners.find(p => p.id === plannerId)
    if (!client) return
    if ((client.assigned_to ?? null) === plannerId) return

    const previousClients = clients
    setSavingClientId(clientId)
    setClients(prev => prev.map(c => c.id === clientId ? { ...c, assigned_to: plannerId, profiles: planner ?? null } : c))

    const { error } = await supabase
      .from('clients')
      .update({ assigned_to: plannerId })
      .eq('id', clientId)

    setSavingClientId(null)

    if (error) {
      setClients(previousClients)
      showToast('error', error.message)
      return
    }

    if (plannerId) {
      showToast('success', `${client.last_name}${client.first_name ? `, ${client.first_name}` : ''} moved to ${planner?.full_name ?? 'Support Planner'}.`)
    } else {
      showToast('success', `${client.last_name}${client.first_name ? `, ${client.first_name}` : ''} moved back to unassigned.`)
    }
  }

  function handleDragStart(event: DragStartEvent) {
    setActiveClientId(String(event.active.id))
  }

  async function handleDragEnd(event: DragEndEvent) {
    const clientId = String(event.active.id)
    const overId = event.over ? String(event.over.id) : null
    setActiveClientId(null)
    if (!overId) return
    if (overId === 'pool:unassigned-clients') {
      await reassignClient(clientId, null)
      return
    }
    if (overId.startsWith('planner:')) {
      const plannerId = overId.replace('planner:', '')
      await reassignClient(clientId, plannerId)
    }
  }

  const activeClient = activeClientId ? clients.find(c => c.id === activeClientId) ?? null : null

  return (
    <div style={{ paddingBottom: 'calc(180px + env(safe-area-inset-bottom))' }}>
      {toast && (
        <div style={{
          position: 'fixed', top: 20, right: 20, zIndex: 9999,
          background: toast.type === 'success' ? '#1a3a1a' : '#3a1a1a',
          border: `1px solid ${toast.type === 'success' ? '#34c759' : '#ff3b30'}`,
          borderRadius: 10, padding: '12px 18px',
          color: toast.type === 'success' ? '#34c759' : '#ff3b30',
          fontSize: 14, fontWeight: 500, maxWidth: 360,
        }}>
          {toast.type === 'success' ? '✓ ' : '✗ '}{toast.message}
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0, color: 'var(--text)' }}>🔀 Transfer Clients</h1>
          <p style={{ margin: '8px 0 0', fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
            Drag from the client list into a Support Planner column, or drag directly from one planner to another.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <Link href="/team?view=assign-planners" style={{ fontSize: 13, color: 'var(--text)', textDecoration: 'none', padding: '6px 12px', border: '1px solid var(--border)', borderRadius: 6, background: 'var(--surface-2)' }}>
            Team Manager Board →
          </Link>
          <Link href="/team" style={{ fontSize: 13, color: 'var(--text)', textDecoration: 'none', padding: '6px 12px', border: '1px solid var(--border)', borderRadius: 6, background: 'var(--surface-2)' }}>
            Team View
          </Link>
          <Link href="/dashboard" style={{ fontSize: 13, color: 'var(--accent)', textDecoration: 'none', padding: '6px 12px', border: '1px solid var(--border)', borderRadius: 6 }}>
            ← Dashboard
          </Link>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search by client name, ID, or current Support Planner"
            style={{ flex: '1 1 280px' }}
          />
          <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
            Supervisors only. Drag from the list or between Support Planner columns.
          </div>
        </div>
        <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.7, marginTop: 12 }}>
          {rebalanceHints.donors.length > 0
            ? (
              <>
                Suggested donors: <strong style={{ color: 'var(--text)' }}>{rebalanceHints.donors.map(row => row.planner.full_name ?? 'Unknown').join(', ')}</strong>
                {rebalanceHints.receivers.length > 0 && (
                  <>
                    {' '}• Suggested receivers: <strong style={{ color: 'var(--text)' }}>{rebalanceHints.receivers.map(row => row.planner.full_name ?? 'Unknown').join(', ')}</strong>
                  </>
                )}
              </>
            )
            : 'No strong donor/receiver split right now — use the board normally.'}
        </div>
        {recommendedMoves.length > 0 && (
          <div style={{ marginTop: 12, display: 'grid', gap: 8 }}>
            {recommendedMoves.map((move, index) => (
              <div key={`${move.donor.planner.id}-${move.receiver.planner.id}-${index}`} style={{ border: '1px solid var(--border)', borderRadius: 10, padding: '10px 12px', background: 'var(--surface-2)' }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)' }}>
                  Recommended move: {move.suggestedCount} client{move.suggestedCount !== 1 ? 's' : ''} from {move.donor.planner.full_name ?? 'Unknown'} → {move.receiver.planner.full_name ?? 'Unknown'}
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 4 }}>
                  Why: {move.reason}. Receiver pressure is {move.receiver.pressureScore} with {move.receiver.clientCount} total clients.
                </div>
                {move.candidates.length > 0 && (
                  <div style={{ marginTop: 8, display: 'grid', gap: 6 }}>
                    {move.candidates.map(candidate => (
                      <div key={candidate.id} style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                        • {candidate.name} ({candidate.clientId})
                        {candidate.overdue ? ' • overdue' : candidate.dueSoon ? ' • due soon' : ' • lower urgency'}
                        {candidate.goalPct > 0 ? ` • ${candidate.goalPct}% goal` : ''}
                        {candidate.daysSinceContact !== null ? ` • ${candidate.daysSinceContact}d since contact` : ''}
                        {candidate.category ? ` • ${String(candidate.category).toUpperCase()}` : ''}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
        <div style={{ display: 'grid', gridTemplateColumns: '300px minmax(0, 1fr)', gap: 14, alignItems: 'start' }}>
          <DropColumn
            id="pool:unassigned-clients"
            title="Client List"
            subtitle={`${unassignedClients.length} unassigned client${unassignedClients.length !== 1 ? 's' : ''}`}
          >
            <div style={{ display: 'grid', gap: 8, maxHeight: '70vh', overflowY: 'auto', paddingRight: 4 }}>
              {unassignedClients.length === 0 ? (
                <div style={{ border: '1px dashed var(--border)', borderRadius: 10, padding: 14, color: 'var(--text-secondary)', fontSize: 12, lineHeight: 1.6 }}>
                  No unassigned clients match this search.
                </div>
              ) : (
                unassignedClients.map(client => (
                  <DraggableClientCard key={`pool-${client.id}`} client={client} saving={savingClientId === client.id} />
                ))
              )}
            </div>
          </DropColumn>

          <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.max(planners.length, 1)}, minmax(190px, 220px))`, gap: 10, alignItems: 'start', overflowX: 'auto' }}>
            {planners.map(planner => {
              const plannerClients = filteredClients.filter(c => c.assigned_to === planner.id)
              return (
                <DropColumn
                  key={planner.id}
                  id={`planner:${planner.id}`}
                  title={planner.full_name ?? 'Unknown Planner'}
                  subtitle={`${plannerClients.length} client${plannerClients.length !== 1 ? 's' : ''}${(() => {
                    const signal = plannerSignals.find(row => row.planner.id === planner.id)
                    if (!signal) return ''
                    if (signal.loadStatus === 'rebalance') return ` • Rebalance (${signal.pressureScore})`
                    if (signal.loadStatus === 'watch') return ` • Watch (${signal.pressureScore})`
                    return ` • Balanced (${signal.pressureScore})`
                  })()}`}
                >
                  {plannerClients.length === 0 ? (
                    <div style={{ border: '1px dashed var(--border)', borderRadius: 10, padding: 12, color: 'var(--text-secondary)', fontSize: 11, lineHeight: 1.5 }}>
                      No assigned clients yet.
                    </div>
                  ) : (
                    plannerClients.map(client => (
                      <DraggableClientCard
                        key={`planner-${planner.id}-${client.id}`}
                        client={client}
                        saving={savingClientId === client.id}
                      />
                    ))
                  )}
                </DropColumn>
              )
            })}
          </div>
        </div>

        <DragOverlay>
          {activeClient ? <ClientCardView client={activeClient} dragging saving={savingClientId === activeClient.id} /> : null}
        </DragOverlay>
      </DndContext>
    </div>
  )
}
