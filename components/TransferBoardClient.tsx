'use client'

import { useEffect, useMemo, useState } from 'react'
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
  const [applyingMoveKey, setApplyingMoveKey] = useState<string | null>(null)
  const [pendingMoveKey, setPendingMoveKey] = useState<string | null>(null)
  const [undoingMove, setUndoingMove] = useState(false)
  const [lastAppliedMove, setLastAppliedMove] = useState<null | {
    clientIds: string[]
    fromPlannerId: string | null
    toPlannerId: string | null
    fromPlannerName: string
    toPlannerName: string
    reason: string
    impact: {
      donorBefore: { pressureScore: number, overdue: number, dueThisWeek: number, clientCount: number }
      donorAfter: { pressureScore: number, overdue: number, dueThisWeek: number, clientCount: number }
      receiverBefore: { pressureScore: number, overdue: number, dueThisWeek: number, clientCount: number }
      receiverAfter: { pressureScore: number, overdue: number, dueThisWeek: number, clientCount: number }
    }
  }>(null)
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null)
  const [activeClientId, setActiveClientId] = useState<string | null>(null)
  const [mobileTab, setMobileTab] = useState<'recommendations' | 'unassigned' | 'planners' | 'recent'>('recommendations')
  const [isMobileLayout, setIsMobileLayout] = useState(false)

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }))

  useEffect(() => {
    if (typeof window === 'undefined') return

    const media = window.matchMedia('(max-width: 820px)')
    const sync = () => setIsMobileLayout(media.matches || window.innerWidth <= 820)
    sync()

    if (typeof media.addEventListener === 'function') {
      media.addEventListener('change', sync)
      window.addEventListener('resize', sync)
      return () => {
        media.removeEventListener('change', sync)
        window.removeEventListener('resize', sync)
      }
    }

    media.addListener(sync)
    window.addEventListener('resize', sync)
    return () => {
      media.removeListener(sync)
      window.removeEventListener('resize', sync)
    }
  }, [])

  async function getCurrentUserId() {
    const { data } = await supabase.auth.getUser()
    return data.user?.id ?? null
  }

  async function logRecommendationMove(params: {
    clientIds: string[]
    fromPlannerId: string | null
    toPlannerId: string | null
    reason: string
    action: string
  }) {
    const userId = await getCurrentUserId()
    if (!userId) return

    await Promise.all(params.clientIds.map(clientId =>
      supabase.from('activity_log').insert({
        client_id: clientId,
        user_id: userId,
        action: params.action,
        field_name: 'assigned_to',
        old_value: params.fromPlannerId,
        new_value: params.toPlannerId,
      })
    )).catch(error => {
      console.error('[TransferBoardClient] activity_log insert failed:', error, params)
    })
  }

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

  function snapshotPlannerLoad(clientPool: Client[], plannerId: string | null) {
    const plannerClients = clientPool.filter(c => c.assigned_to === plannerId)
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
    const clientCount = plannerClients.length
    const pressureScore = overdue * 5 + dueThisWeek * 2 + Math.max(0, clientCount - 35)
    return { pressureScore, overdue, dueThisWeek, clientCount }
  }

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

    function dateCount(client: Client) {
      return getClientDates(client).length
    }

    function documentationFriction(client: Client) {
      let friction = 0
      if (client.signatures_needed) friction += 10
      if (client.provider_forms) friction += 6
      if (client.request_letter) friction += 6
      if (client.schedule_docs) friction += 5
      if (client.reportable_events) friction += 12
      if (client.appeals) friction += 12
      if (client.audit_review) friction += 8
      if (client.qa_review) friction += 8
      return friction
    }

    function programComplexityPenalty(client: Client) {
      let penalty = 0
      const totalDates = dateCount(client)
      penalty += Math.max(0, totalDates - 3) * 8

      const category = String(client.category ?? '').toLowerCase()
      if (category === 'co') penalty += 12
      else if (category === 'cfc') penalty += 9
      else if (category === 'cpas') penalty += 6

      if (!client.spm_completed && client.spm_next_due) penalty += 12
      if (client.pos_status && String(client.pos_status).toLowerCase() !== 'complete') penalty += 6
      if (client.med_tech_status && String(client.med_tech_status).toLowerCase() !== 'complete') penalty += 6

      const goalPct = client.goal_pct ?? 0
      if (goalPct >= 90) penalty += 12
      else if (goalPct >= 75) penalty += 6

      penalty += documentationFriction(client)
      return penalty
    }

    function handoffReadinessBonus(client: Client) {
      let bonus = 0
      const days = daysSinceContact(client)
      if (days !== null) {
        if (days <= 7) bonus += 18
        else if (days <= 14) bonus += 10
        else if (days >= 30) bonus -= 16
      } else {
        bonus -= 8
      }

      const goalPct = client.goal_pct ?? 0
      if (goalPct <= 45) bonus += 10
      else if (goalPct <= 60) bonus += 4

      if (client.spm_completed) bonus += 8
      if (!client.signatures_needed && !client.provider_forms && !client.request_letter) bonus += 6
      if (!client.reportable_events && !client.appeals) bonus += 4

      return bonus
    }

    function urgencyScore(client: Client) {
      let score = 0
      const overdue = isClientOverdue(client)
      const dueSoon = isClientDueSoon(client)
      const days = daysSinceContact(client)

      if (overdue) score += 80
      if (dueSoon) score += 35
      if (!client.spm_completed && client.spm_next_due) score += 14
      if (days !== null && days >= 21 && (overdue || dueSoon)) score += 12
      if (days !== null && days >= 30) score += 6

      score += Math.min(18, donorCategoryPressure(client))
      return score
    }

    function candidateScore(client: Client) {
      return urgencyScore(client) + handoffReadinessBonus(client) - programComplexityPenalty(client)
    }

    function explainCandidate(client: Client) {
      const wins: string[] = []
      const cautions: string[] = []
      const days = daysSinceContact(client)
      const docFriction = documentationFriction(client)
      const complexity = programComplexityPenalty(client)

      if (days !== null && days <= 14) wins.push('recent contact makes handoff safer')
      if (client.spm_completed) wins.push('SPM already complete')
      if (docFriction === 0) wins.push('low documentation friction')
      if (!client.reportable_events && !client.appeals) wins.push('no active escalation flags')
      if (isClientDueSoon(client) && !isClientOverdue(client)) wins.push('due soon but not already overdue')

      if (docFriction >= 12) cautions.push('higher documentation friction')
      if (client.reportable_events) cautions.push('reportable events in play')
      if (client.appeals) cautions.push('appeal activity adds handoff risk')
      if (client.signatures_needed) cautions.push('signatures still needed')
      if (complexity >= 35) cautions.push('heavier deadline/program complexity')
      if (days !== null && days >= 30) cautions.push('stale contact history')

      return {
        whyThisMove: wins.slice(0, 3),
        whyNotIdeal: cautions.slice(0, 3),
      }
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
          score: candidateScore(client),
          complexityPenalty: programComplexityPenalty(client),
          handoffReadiness: handoffReadinessBonus(client),
          documentationFriction: documentationFriction(client),
          spmCompleted: client.spm_completed,
          ...explainCandidate(client),
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

  async function applyRecommendedMove(move: NonNullable<typeof recommendedMoves[number]>, moveKey: string) {
    const candidateIds = move.candidates.slice(0, move.suggestedCount).map(candidate => candidate.id)
    if (candidateIds.length === 0) return

    const receiverPlanner = move.receiver.planner
    const previousClients = clients
    const donorBefore = snapshotPlannerLoad(previousClients, move.donor.planner.id)
    const receiverBefore = snapshotPlannerLoad(previousClients, receiverPlanner.id)
    const nextClients = previousClients.map(client => candidateIds.includes(client.id)
      ? { ...client, assigned_to: receiverPlanner.id, profiles: receiverPlanner }
      : client)
    const donorAfter = snapshotPlannerLoad(nextClients, move.donor.planner.id)
    const receiverAfter = snapshotPlannerLoad(nextClients, receiverPlanner.id)
    setApplyingMoveKey(moveKey)
    setClients(nextClients)

    const { error } = await supabase
      .from('clients')
      .update({ assigned_to: receiverPlanner.id })
      .in('id', candidateIds)

    setApplyingMoveKey(null)

    if (error) {
      setClients(previousClients)
      showToast('error', error.message)
      return
    }

    setPendingMoveKey(null)
    setLastAppliedMove({
      clientIds: candidateIds,
      fromPlannerId: move.donor.planner.id,
      toPlannerId: receiverPlanner.id,
      fromPlannerName: move.donor.planner.full_name ?? 'Unknown',
      toPlannerName: receiverPlanner.full_name ?? 'Support Planner',
      reason: move.reason,
      impact: {
        donorBefore,
        donorAfter,
        receiverBefore,
        receiverAfter,
      },
    })

    await logRecommendationMove({
      clientIds: candidateIds,
      fromPlannerId: move.donor.planner.id,
      toPlannerId: receiverPlanner.id,
      reason: move.reason,
      action: `Recommended rebalance move applied (${move.reason})`,
    })

    showToast('success', `Moved ${candidateIds.length} recommended client${candidateIds.length !== 1 ? 's' : ''} to ${receiverPlanner.full_name ?? 'Support Planner'}.`)
  }

  async function undoLastAppliedMove() {
    if (!lastAppliedMove || undoingMove) return

    const previousClients = clients
    const fromPlanner = planners.find(planner => planner.id === lastAppliedMove.fromPlannerId) ?? null
    setUndoingMove(true)
    setClients(prev => prev.map(client => lastAppliedMove.clientIds.includes(client.id)
      ? { ...client, assigned_to: lastAppliedMove.fromPlannerId, profiles: fromPlanner }
      : client))

    const { error } = await supabase
      .from('clients')
      .update({ assigned_to: lastAppliedMove.fromPlannerId })
      .in('id', lastAppliedMove.clientIds)

    setUndoingMove(false)

    if (error) {
      setClients(previousClients)
      showToast('error', error.message)
      return
    }

    await logRecommendationMove({
      clientIds: lastAppliedMove.clientIds,
      fromPlannerId: lastAppliedMove.toPlannerId,
      toPlannerId: lastAppliedMove.fromPlannerId,
      reason: lastAppliedMove.reason,
      action: `Recommended rebalance move undone (${lastAppliedMove.reason})`,
    })

    showToast('success', `Undid move from ${lastAppliedMove.fromPlannerName} to ${lastAppliedMove.toPlannerName}.`)
    setLastAppliedMove(null)
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
          {lastAppliedMove && (
            <button
              type="button"
              onClick={undoLastAppliedMove}
              disabled={undoingMove}
              style={{
                border: '1px solid var(--border)',
                borderRadius: 8,
                padding: '8px 10px',
                background: 'var(--surface-2)',
                color: 'var(--text)',
                fontSize: 12,
                fontWeight: 700,
                cursor: undoingMove ? 'wait' : 'pointer',
                opacity: undoingMove ? 0.7 : 1,
              }}
            >
              {undoingMove ? 'Undoing…' : 'Undo last applied move'}
            </button>
          )}
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
        {lastAppliedMove?.impact && (
          <div style={{ marginTop: 12, border: '1px solid var(--border)', borderRadius: 10, padding: '10px 12px', background: 'rgba(52,199,89,0.08)' }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)' }}>
              Last move impact
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 6, lineHeight: 1.6 }}>
              Donor <strong style={{ color: 'var(--text)' }}>{lastAppliedMove.fromPlannerName}</strong>: pressure {lastAppliedMove.impact.donorBefore.pressureScore} → {lastAppliedMove.impact.donorAfter.pressureScore}
              {' '}({lastAppliedMove.impact.donorAfter.pressureScore < lastAppliedMove.impact.donorBefore.pressureScore ? 'helped' : lastAppliedMove.impact.donorAfter.pressureScore > lastAppliedMove.impact.donorBefore.pressureScore ? 'worse' : 'neutral'})
              {' '}• overdue {lastAppliedMove.impact.donorBefore.overdue} → {lastAppliedMove.impact.donorAfter.overdue}
              {' '}• due this week {lastAppliedMove.impact.donorBefore.dueThisWeek} → {lastAppliedMove.impact.donorAfter.dueThisWeek}
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 6, lineHeight: 1.6 }}>
              Receiver <strong style={{ color: 'var(--text)' }}>{lastAppliedMove.toPlannerName}</strong>: pressure {lastAppliedMove.impact.receiverBefore.pressureScore} → {lastAppliedMove.impact.receiverAfter.pressureScore}
              {' '}({lastAppliedMove.impact.receiverAfter.pressureScore < lastAppliedMove.impact.receiverBefore.pressureScore ? 'helped' : lastAppliedMove.impact.receiverAfter.pressureScore > lastAppliedMove.impact.receiverBefore.pressureScore ? 'higher load accepted' : 'neutral'})
              {' '}• overdue {lastAppliedMove.impact.receiverBefore.overdue} → {lastAppliedMove.impact.receiverAfter.overdue}
              {' '}• due this week {lastAppliedMove.impact.receiverBefore.dueThisWeek} → {lastAppliedMove.impact.receiverAfter.dueThisWeek}
            </div>
          </div>
        )}
        {recommendedMoves.length > 0 && (
          <div style={{ marginTop: 12, display: 'grid', gap: 8 }}>
            {recommendedMoves.map((move, index) => (
              <div key={`${move.donor.planner.id}-${move.receiver.planner.id}-${index}`} style={{ border: '1px solid var(--border)', borderRadius: 10, padding: '10px 12px', background: 'var(--surface-2)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'start', flexWrap: 'wrap' }}>
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)' }}>
                      Recommended move: {move.suggestedCount} client{move.suggestedCount !== 1 ? 's' : ''} from {move.donor.planner.full_name ?? 'Unknown'} → {move.receiver.planner.full_name ?? 'Unknown'}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 4 }}>
                      Why: {move.reason}. Receiver pressure is {move.receiver.pressureScore} with {move.receiver.clientCount} total clients.
                    </div>
                    {move.candidates[0] && (
                      <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 6, lineHeight: 1.6 }}>
                        <strong style={{ color: 'var(--text)' }}>Why this move:</strong>{' '}
                        {move.candidates[0].whyThisMove?.length
                          ? move.candidates[0].whyThisMove.join(' • ')
                          : 'best available lower-risk handoff option right now'}
                        {move.candidates[0].whyNotIdeal?.length > 0 && (
                          <>
                            {' '}• <strong style={{ color: 'var(--text)' }}>Why not others:</strong>{' '}
                            {move.candidates[0].whyNotIdeal.join(' • ')}
                          </>
                        )}
                      </div>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => setPendingMoveKey(prev => prev === `${move.donor.planner.id}-${move.receiver.planner.id}-${index}` ? null : `${move.donor.planner.id}-${move.receiver.planner.id}-${index}`)}
                    disabled={applyingMoveKey === `${move.donor.planner.id}-${move.receiver.planner.id}-${index}` || move.candidates.length === 0}
                    style={{
                      border: '1px solid var(--border)',
                      borderRadius: 8,
                      padding: '8px 10px',
                      background: pendingMoveKey === `${move.donor.planner.id}-${move.receiver.planner.id}-${index}` ? 'var(--surface-3)' : 'var(--accent)',
                      color: pendingMoveKey === `${move.donor.planner.id}-${move.receiver.planner.id}-${index}` ? 'var(--text)' : 'white',
                      fontSize: 12,
                      fontWeight: 700,
                      cursor: applyingMoveKey === `${move.donor.planner.id}-${move.receiver.planner.id}-${index}` ? 'wait' : 'pointer',
                      opacity: applyingMoveKey === `${move.donor.planner.id}-${move.receiver.planner.id}-${index}` ? 0.7 : 1,
                    }}
                  >
                    {applyingMoveKey === `${move.donor.planner.id}-${move.receiver.planner.id}-${index}`
                      ? 'Applying…'
                      : pendingMoveKey === `${move.donor.planner.id}-${move.receiver.planner.id}-${index}`
                        ? 'Hide preview'
                        : 'Preview move'}
                  </button>
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
                        {candidate.spmCompleted ? ' • SPM complete' : ' • SPM open'}
                        {typeof candidate.documentationFriction === 'number' && candidate.documentationFriction > 0 ? ` • doc friction ${candidate.documentationFriction}` : ''}
                        {typeof candidate.score === 'number' ? ` • score ${candidate.score}` : ''}
                        {candidate.whyThisMove?.length ? ` • why: ${candidate.whyThisMove.join(', ')}` : ''}
                        {candidate.whyNotIdeal?.length ? ` • watch: ${candidate.whyNotIdeal.join(', ')}` : ''}
                      </div>
                    ))}
                  </div>
                )}
                {pendingMoveKey === `${move.donor.planner.id}-${move.receiver.planner.id}-${index}` && (
                  <div
                    style={{
                      marginTop: 10,
                      border: '1px solid rgba(255,255,255,0.12)',
                      borderRadius: 10,
                      padding: '10px 12px',
                      background: 'rgba(255,255,255,0.03)',
                      display: 'grid',
                      gap: 8,
                    }}
                  >
                    <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)' }}>
                      Confirm this move?
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                      Move <strong style={{ color: 'var(--text)' }}>{Math.min(move.suggestedCount, move.candidates.length)} client{Math.min(move.suggestedCount, move.candidates.length) !== 1 ? 's' : ''}</strong>
                      {' '}from <strong style={{ color: 'var(--text)' }}>{move.donor.planner.full_name ?? 'Unknown'}</strong>
                      {' '}to <strong style={{ color: 'var(--text)' }}>{move.receiver.planner.full_name ?? 'Unknown'}</strong>.
                      {' '}Reason: <strong style={{ color: 'var(--text)' }}>{move.reason}</strong>.
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                      Clients that will move:
                    </div>
                    <div style={{ display: 'grid', gap: 6 }}>
                      {move.candidates.slice(0, move.suggestedCount).map(candidate => (
                        <div key={`confirm-${candidate.id}`} style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                          • {candidate.name} ({candidate.clientId})
                          {candidate.overdue ? ' • overdue' : candidate.dueSoon ? ' • due soon' : ' • lower urgency'}
                          {candidate.goalPct > 0 ? ` • ${candidate.goalPct}% goal` : ''}
                          {candidate.daysSinceContact !== null ? ` • ${candidate.daysSinceContact}d since contact` : ''}
                          {candidate.category ? ` • ${String(candidate.category).toUpperCase()}` : ''}
                          {candidate.spmCompleted ? ' • SPM complete' : ' • SPM open'}
                          {typeof candidate.documentationFriction === 'number' && candidate.documentationFriction > 0 ? ` • doc friction ${candidate.documentationFriction}` : ''}
                          {typeof candidate.score === 'number' ? ` • score ${candidate.score}` : ''}
                          {candidate.whyThisMove?.length ? ` • why: ${candidate.whyThisMove.join(', ')}` : ''}
                          {candidate.whyNotIdeal?.length ? ` • watch: ${candidate.whyNotIdeal.join(', ')}` : ''}
                        </div>
                      ))}
                    </div>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      <button
                        type="button"
                        onClick={() => applyRecommendedMove(move, `${move.donor.planner.id}-${move.receiver.planner.id}-${index}`)}
                        disabled={applyingMoveKey === `${move.donor.planner.id}-${move.receiver.planner.id}-${index}`}
                        style={{
                          border: '1px solid var(--border)',
                          borderRadius: 8,
                          padding: '8px 10px',
                          background: 'var(--accent)',
                          color: 'white',
                          fontSize: 12,
                          fontWeight: 700,
                          cursor: applyingMoveKey === `${move.donor.planner.id}-${move.receiver.planner.id}-${index}` ? 'wait' : 'pointer',
                          opacity: applyingMoveKey === `${move.donor.planner.id}-${move.receiver.planner.id}-${index}` ? 0.7 : 1,
                        }}
                      >
                        {applyingMoveKey === `${move.donor.planner.id}-${move.receiver.planner.id}-${index}` ? 'Applying…' : 'Confirm move'}
                      </button>
                      <button
                        type="button"
                        onClick={() => setPendingMoveKey(null)}
                        disabled={applyingMoveKey === `${move.donor.planner.id}-${move.receiver.planner.id}-${index}`}
                        style={{
                          border: '1px solid var(--border)',
                          borderRadius: 8,
                          padding: '8px 10px',
                          background: 'transparent',
                          color: 'var(--text)',
                          fontSize: 12,
                          fontWeight: 700,
                          cursor: applyingMoveKey === `${move.donor.planner.id}-${move.receiver.planner.id}-${index}` ? 'wait' : 'pointer',
                          opacity: applyingMoveKey === `${move.donor.planner.id}-${move.receiver.planner.id}-${index}` ? 0.7 : 1,
                        }}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {isMobileLayout && (
      <div className="transfer-mobile-shell">
        <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 4, marginBottom: 12 }}>
          {[
            ['recommendations', 'Recommendations'],
            ['unassigned', `Unassigned (${unassignedClients.length})`],
            ['planners', 'Planners'],
            ['recent', 'Recent move'],
          ].map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setMobileTab(key as 'recommendations' | 'unassigned' | 'planners' | 'recent')}
              style={{
                border: '1px solid var(--border)',
                borderRadius: 999,
                padding: '8px 12px',
                background: mobileTab === key ? 'var(--accent)' : 'var(--surface-2)',
                color: mobileTab === key ? 'white' : 'var(--text)',
                fontSize: 12,
                fontWeight: 700,
                whiteSpace: 'nowrap',
              }}
            >
              {label}
            </button>
          ))}
        </div>

        {mobileTab === 'recommendations' && (
          <div style={{ display: 'grid', gap: 10 }}>
            {recommendedMoves.length === 0 ? (
              <div className="card" style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                No strong rebalance recommendations right now.
              </div>
            ) : recommendedMoves.map((move, index) => {
              const moveKey = `${move.donor.planner.id}-${move.receiver.planner.id}-${index}`
              return (
                <div key={`mobile-${moveKey}`} className="card" style={{ display: 'grid', gap: 8 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>
                    {move.donor.planner.full_name ?? 'Unknown'} → {move.receiver.planner.full_name ?? 'Unknown'}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                    Move {Math.min(move.suggestedCount, move.candidates.length)} client{Math.min(move.suggestedCount, move.candidates.length) !== 1 ? 's' : ''}
                    {' '}• {move.reason}
                    {' '}• donor pressure {move.donor.pressureScore}
                    {' '}• receiver pressure {move.receiver.pressureScore}
                  </div>
                  <div style={{ display: 'grid', gap: 6 }}>
                    {move.candidates.slice(0, move.suggestedCount).map(candidate => (
                      <div key={`mobile-candidate-${candidate.id}`} style={{ border: '1px solid var(--border)', borderRadius: 10, padding: '10px 10px', background: 'var(--surface-2)' }}>
                        <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)' }}>{candidate.name}</div>
                        <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 4, lineHeight: 1.5 }}>
                          {candidate.overdue ? 'Overdue' : candidate.dueSoon ? 'Due soon' : 'Lower urgency'}
                          {candidate.daysSinceContact !== null ? ` • ${candidate.daysSinceContact}d since contact` : ''}
                          {candidate.category ? ` • ${String(candidate.category).toUpperCase()}` : ''}
                          {candidate.whyThisMove?.length ? ` • ${candidate.whyThisMove.join(' • ')}` : ''}
                        </div>
                      </div>
                    ))}
                  </div>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <button
                      type="button"
                      onClick={() => setPendingMoveKey(prev => prev === moveKey ? null : moveKey)}
                      disabled={applyingMoveKey === moveKey || move.candidates.length === 0}
                      style={{
                        border: '1px solid var(--border)',
                        borderRadius: 8,
                        padding: '10px 12px',
                        background: pendingMoveKey === moveKey ? 'var(--surface-3)' : 'var(--accent)',
                        color: pendingMoveKey === moveKey ? 'var(--text)' : 'white',
                        fontSize: 12,
                        fontWeight: 700,
                        flex: '1 1 180px',
                      }}
                    >
                      {applyingMoveKey === moveKey ? 'Applying…' : pendingMoveKey === moveKey ? 'Hide confirm' : 'Review move'}
                    </button>
                  </div>
                  {pendingMoveKey === moveKey && (
                    <div style={{ border: '1px solid rgba(255,255,255,0.12)', borderRadius: 10, padding: '10px 12px', background: 'rgba(255,255,255,0.03)', display: 'grid', gap: 8 }}>
                      <div style={{ fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                        Confirm moving these clients from <strong style={{ color: 'var(--text)' }}>{move.donor.planner.full_name ?? 'Unknown'}</strong>
                        {' '}to <strong style={{ color: 'var(--text)' }}>{move.receiver.planner.full_name ?? 'Unknown'}</strong>.
                      </div>
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        <button
                          type="button"
                          onClick={() => applyRecommendedMove(move, moveKey)}
                          disabled={applyingMoveKey === moveKey}
                          style={{ border: '1px solid var(--border)', borderRadius: 8, padding: '10px 12px', background: 'var(--accent)', color: 'white', fontSize: 12, fontWeight: 700, flex: '1 1 160px' }}
                        >
                          {applyingMoveKey === moveKey ? 'Applying…' : 'Confirm move'}
                        </button>
                        <button
                          type="button"
                          onClick={() => setPendingMoveKey(null)}
                          disabled={applyingMoveKey === moveKey}
                          style={{ border: '1px solid var(--border)', borderRadius: 8, padding: '10px 12px', background: 'transparent', color: 'var(--text)', fontSize: 12, fontWeight: 700, flex: '1 1 120px' }}
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}

        {mobileTab === 'unassigned' && (
          <div style={{ display: 'grid', gap: 8 }}>
            {unassignedClients.length === 0 ? (
              <div className="card" style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                No unassigned clients match this search.
              </div>
            ) : unassignedClients.map(client => (
              <div key={`mobile-unassigned-${client.id}`} className="card" style={{ padding: 12 }}>
                <ClientCardView client={client} saving={savingClientId === client.id} />
              </div>
            ))}
          </div>
        )}

        {mobileTab === 'planners' && (
          <div style={{ display: 'grid', gap: 8 }}>
            {plannerSignals.map(signal => (
              <div key={`mobile-planner-${signal.planner.id}`} className="card" style={{ display: 'grid', gap: 6 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>{signal.planner.full_name ?? 'Unknown Planner'}</div>
                <div style={{ fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                  {signal.clientCount} clients • {signal.overdue} overdue • {signal.dueThisWeek} due this week • pressure {signal.pressureScore}
                </div>
                <div style={{ fontSize: 11, color: signal.loadStatus === 'rebalance' ? '#ff9f0a' : signal.loadStatus === 'watch' ? '#ffd60a' : '#30d158', fontWeight: 700 }}>
                  {signal.loadStatus === 'rebalance' ? 'Rebalance' : signal.loadStatus === 'watch' ? 'Watch' : 'Balanced'}
                </div>
              </div>
            ))}
          </div>
        )}

        {mobileTab === 'recent' && (
          <div style={{ display: 'grid', gap: 8 }}>
            {lastAppliedMove ? (
              <div className="card" style={{ display: 'grid', gap: 8 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>Last applied move</div>
                <div style={{ fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                  {lastAppliedMove.clientIds.length} client{lastAppliedMove.clientIds.length !== 1 ? 's' : ''}
                  {' '}from {lastAppliedMove.fromPlannerName} to {lastAppliedMove.toPlannerName}
                  {' '}• {lastAppliedMove.reason}
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                  Donor pressure {lastAppliedMove.impact.donorBefore.pressureScore} → {lastAppliedMove.impact.donorAfter.pressureScore}
                  {' '}• receiver {lastAppliedMove.impact.receiverBefore.pressureScore} → {lastAppliedMove.impact.receiverAfter.pressureScore}
                </div>
                <button
                  type="button"
                  onClick={undoLastAppliedMove}
                  disabled={undoingMove}
                  style={{ border: '1px solid var(--border)', borderRadius: 8, padding: '10px 12px', background: 'var(--surface-2)', color: 'var(--text)', fontSize: 12, fontWeight: 700 }}
                >
                  {undoingMove ? 'Undoing…' : 'Undo last applied move'}
                </button>
              </div>
            ) : (
              <div className="card" style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                No recent recommended move applied in this session yet.
              </div>
            )}
          </div>
        )}
      </div>
      )}

      {!isMobileLayout && (
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
        <div className="transfer-desktop-shell" style={{ display: 'grid', gridTemplateColumns: '300px minmax(0, 1fr)', gap: 14, alignItems: 'start' }}>
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
      )}
    </div>
  )
}
