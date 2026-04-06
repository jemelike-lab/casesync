'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { Profile } from '@/lib/types'
import { updateTeamManagerAssignment } from '@/app/actions/admin'

interface Props {
  planners: Profile[]
  teamManagers: Profile[]
}

function PlannerCard({
  planner,
  isDragging,
  onDragStart,
  onDragEnd,
}: {
  planner: Profile
  isDragging: boolean
  onDragStart: (plannerId: string, e: React.DragEvent<HTMLDivElement>) => void
  onDragEnd: () => void
}) {
  return (
    <div
      draggable
      onDragStart={e => onDragStart(planner.id, e)}
      onDragEnd={onDragEnd}
      style={{
        border: '1px solid var(--border)',
        borderRadius: 10,
        padding: '10px 10px',
        background: 'var(--surface-2)',
        cursor: 'grab',
        boxShadow: isDragging ? '0 8px 20px rgba(0,0,0,0.18)' : 'none',
      }}
    >
      <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', lineHeight: 1.35 }}>
        {planner.full_name ?? 'Unknown Planner'}
      </div>
      <div style={{ fontSize: 10, color: 'var(--text-secondary)', marginTop: 6, lineHeight: 1.35 }}>
        Current TM: {planner.team_manager_id ? 'Assigned' : 'Unassigned'}
      </div>
    </div>
  )
}

export default function PlannerAssignmentBoardClient({ planners: initialPlanners, teamManagers }: Props) {
  const [planners, setPlanners] = useState<Profile[]>(initialPlanners)
  const [draggedPlannerId, setDraggedPlannerId] = useState<string | null>(null)
  const [activeManagerId, setActiveManagerId] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [savingPlannerId, setSavingPlannerId] = useState<string | null>(null)
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null)

  function showToast(type: 'success' | 'error', message: string) {
    setToast({ type, message })
    setTimeout(() => setToast(null), 3500)
  }

  const filteredPlanners = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return planners
    return planners.filter(p => (p.full_name ?? '').toLowerCase().includes(q))
  }, [planners, search])

  async function assignPlanner(plannerId: string, teamManagerId: string) {
    const planner = planners.find(p => p.id === plannerId)
    const manager = teamManagers.find(tm => tm.id === teamManagerId)
    if (!planner || !manager || planner.team_manager_id === teamManagerId) return

    const previous = planners
    setSavingPlannerId(plannerId)
    setPlanners(prev => prev.map(p => p.id === plannerId ? { ...p, team_manager_id: teamManagerId } : p))

    const result = await updateTeamManagerAssignment(plannerId, teamManagerId)
    setSavingPlannerId(null)

    if (result.error) {
      setPlanners(previous)
      showToast('error', result.error)
      return
    }

    showToast('success', `${planner.full_name ?? 'Support Planner'} moved to ${manager.full_name ?? 'Team Manager'}.`)
  }

  function handleDragStart(plannerId: string, e: React.DragEvent<HTMLDivElement>) {
    setDraggedPlannerId(plannerId)
    e.dataTransfer.setData('text/plain', plannerId)
    e.dataTransfer.effectAllowed = 'move'
  }

  function handleDragEnd() {
    setDraggedPlannerId(null)
    setActiveManagerId(null)
  }

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
          <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0, color: 'var(--text)' }}>🧭 Team Manager Assignment</h1>
          <p style={{ margin: '8px 0 0', fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
            Drag a Support Planner onto a Team Manager column to reassign them.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <Link href="/team?view=transfer" style={{
            fontSize: 13, color: 'var(--text)', textDecoration: 'none',
            padding: '6px 12px', border: '1px solid var(--border)', borderRadius: 6,
            background: 'var(--surface-2)',
          }}>
            Client Transfer Board →
          </Link>
          <Link href="/team" style={{
            fontSize: 13, color: 'var(--text)', textDecoration: 'none',
            padding: '6px 12px', border: '1px solid var(--border)', borderRadius: 6,
            background: 'var(--surface-2)',
          }}>
            Team View
          </Link>
          <Link href="/dashboard" style={{
            fontSize: 13, color: 'var(--accent)', textDecoration: 'none',
            padding: '6px 12px', border: '1px solid var(--border)', borderRadius: 6,
          }}>
            ← Dashboard
          </Link>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search support planners"
            style={{ flex: '1 1 280px' }}
          />
          <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
            Supervisors only. Drag from the list or between team manager columns.
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '300px minmax(0, 1fr)', gap: 14, alignItems: 'start' }}>
        <div className="card" style={{ position: 'sticky', top: 12 }}>
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 16, fontWeight: 700 }}>Support Planners</div>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4 }}>
              {filteredPlanners.length} visible support planner{filteredPlanners.length !== 1 ? 's' : ''}
            </div>
          </div>

          <div style={{ display: 'grid', gap: 8, maxHeight: '70vh', overflowY: 'auto', paddingRight: 4 }}>
            {filteredPlanners.length === 0 ? (
              <div style={{ border: '1px dashed var(--border)', borderRadius: 10, padding: 14, color: 'var(--text-secondary)', fontSize: 12, lineHeight: 1.6 }}>
                No support planners match this search.
              </div>
            ) : (
              filteredPlanners.map(planner => (
                <PlannerCard
                  key={`pool-${planner.id}`}
                  planner={planner}
                  isDragging={draggedPlannerId === planner.id}
                  onDragStart={handleDragStart}
                  onDragEnd={handleDragEnd}
                />
              ))
            )}
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.max(teamManagers.length, 1)}, minmax(190px, 220px))`, gap: 10, alignItems: 'start', overflowX: 'auto' }}>
          {teamManagers.map(manager => {
            const managerPlanners = filteredPlanners.filter(p => p.team_manager_id === manager.id)
            const isActiveDrop = activeManagerId === manager.id
            return (
              <div
                key={manager.id}
                className="card"
                onDragOver={e => {
                  e.preventDefault()
                  setActiveManagerId(manager.id)
                }}
                onDragLeave={() => setActiveManagerId(prev => prev === manager.id ? null : prev)}
                onDrop={async e => {
                  e.preventDefault()
                  const plannerId = draggedPlannerId || e.dataTransfer.getData('text/plain')
                  setActiveManagerId(null)
                  setDraggedPlannerId(null)
                  if (plannerId) await assignPlanner(plannerId, manager.id)
                }}
                style={{
                  minHeight: 320,
                  background: isActiveDrop ? 'rgba(0,122,255,0.08)' : undefined,
                  border: isActiveDrop ? '1px solid rgba(0,122,255,0.35)' : undefined,
                }}
              >
                <div style={{ marginBottom: 14 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, lineHeight: 1.35 }}>{manager.full_name ?? 'Unknown Team Manager'}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 4 }}>{managerPlanners.length} support planner{managerPlanners.length !== 1 ? 's' : ''}</div>
                </div>

                <div style={{ display: 'grid', gap: 8 }}>
                  {managerPlanners.length === 0 ? (
                    <div style={{ border: '1px dashed var(--border)', borderRadius: 10, padding: 12, color: 'var(--text-secondary)', fontSize: 11, lineHeight: 1.5 }}>
                      Drop a support planner here to assign them to {manager.full_name ?? 'this team manager'}.
                    </div>
                  ) : (
                    managerPlanners.map(planner => (
                      <div key={`manager-${manager.id}-${planner.id}`} style={{ opacity: savingPlannerId === planner.id ? 0.6 : 1 }}>
                        <PlannerCard
                          planner={planner}
                          isDragging={draggedPlannerId === planner.id}
                          onDragStart={handleDragStart}
                          onDragEnd={handleDragEnd}
                        />
                      </div>
                    ))
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
