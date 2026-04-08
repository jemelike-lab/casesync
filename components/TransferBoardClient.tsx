'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { Client, Profile } from '@/lib/types'
import { createClient } from '@/lib/supabase/client'

interface Props {
  clients: Client[]
  planners: Profile[]
}

function ClientCard({
  client,
  isDragging,
  isSaving,
  onDragStart,
  onDragEnd,
}: {
  client: Client
  isDragging: boolean
  isSaving: boolean
  onDragStart: (clientId: string, e: React.DragEvent<HTMLDivElement>) => void
  onDragEnd: () => void
}) {
  return (
    <div
      draggable
      onDragStart={e => onDragStart(client.id, e)}
      onDragEnd={onDragEnd}
      onDragOver={e => e.stopPropagation()}
      onDrop={e => e.stopPropagation()}
      style={{
        border: '1px solid var(--border)',
        borderRadius: 10,
        padding: '10px 10px',
        background: 'var(--surface-2)',
        cursor: 'grab',
        opacity: isSaving ? 0.6 : 1,
        boxShadow: isDragging ? '0 8px 20px rgba(0,0,0,0.18)' : 'none',
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

export default function TransferBoardClient({ clients: initialClients, planners }: Props) {
  const supabase = useMemo(() => createClient(), [])
  const [clients, setClients] = useState<Client[]>(initialClients)
  const [draggedClientId, setDraggedClientId] = useState<string | null>(null)
  const [activePlannerId, setActivePlannerId] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [savingClientId, setSavingClientId] = useState<string | null>(null)
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null)

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

  const unassignedClients = useMemo(
    () => filteredClients.filter(c => !c.assigned_to),
    [filteredClients]
  )

  async function reassignClient(clientId: string, plannerId: string) {
    const client = clients.find(c => c.id === clientId)
    const planner = planners.find(p => p.id === plannerId)
    if (!client || !planner || client.assigned_to === plannerId) return

    const previousClients = clients
    setSavingClientId(clientId)
    setClients(prev => prev.map(c => c.id === clientId ? { ...c, assigned_to: plannerId, profiles: planner } : c))

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

    showToast('success', `${client.last_name}${client.first_name ? `, ${client.first_name}` : ''} moved to ${planner.full_name ?? 'Support Planner'}.`)
  }

  function handleDragStart(clientId: string, e: React.DragEvent<HTMLDivElement>) {
    setDraggedClientId(clientId)
    e.dataTransfer.setData('text/plain', clientId)
    e.dataTransfer.effectAllowed = 'move'
  }

  function handleDragEnd() {
    setDraggedClientId(null)
    setActivePlannerId(null)
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
          <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0, color: 'var(--text)' }}>🔀 Transfer Clients</h1>
          <p style={{ margin: '8px 0 0', fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
            Drag from the client list into a Support Planner column, or drag directly from one planner to another.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <Link href="/team?view=assign-planners" style={{
            fontSize: 13, color: 'var(--text)', textDecoration: 'none',
            padding: '6px 12px', border: '1px solid var(--border)', borderRadius: 6,
            background: 'var(--surface-2)',
          }}>
            Team Manager Board →
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
            placeholder="Search by client name, ID, or current Support Planner"
            style={{ flex: '1 1 280px' }}
          />
          <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
            Supervisors only. Drag from the list or between Support Planner columns.
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '300px minmax(0, 1fr)', gap: 14, alignItems: 'start' }}>
        <div className="card" style={{ position: 'sticky', top: 12 }}>
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 16, fontWeight: 700 }}>Client List</div>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4 }}>
              {unassignedClients.length} unassigned client{unassignedClients.length !== 1 ? 's' : ''}
            </div>
          </div>

          <div style={{ display: 'grid', gap: 8, maxHeight: '70vh', overflowY: 'auto', paddingRight: 4 }}>
            {unassignedClients.length === 0 ? (
              <div style={{ border: '1px dashed var(--border)', borderRadius: 10, padding: 14, color: 'var(--text-secondary)', fontSize: 12, lineHeight: 1.6 }}>
                No unassigned clients match this search.
              </div>
            ) : (
              unassignedClients.map(client => (
                <ClientCard
                  key={`pool-${client.id}`}
                  client={client}
                  isDragging={draggedClientId === client.id}
                  isSaving={savingClientId === client.id}
                  onDragStart={handleDragStart}
                  onDragEnd={handleDragEnd}
                />
              ))
            )}
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.max(planners.length, 1)}, minmax(190px, 220px))`, gap: 10, alignItems: 'start', overflowX: 'auto' }}>
          {planners.map(planner => {
            const plannerClients = filteredClients.filter(c => c.assigned_to === planner.id)
            const isActiveDrop = activePlannerId === planner.id
            return (
              <div
                key={planner.id}
                className="card"
                onDragOver={e => {
                  e.preventDefault()
                  setActivePlannerId(planner.id)
                }}
                onDragLeave={() => setActivePlannerId(prev => prev === planner.id ? null : prev)}
                onDrop={async e => {
                  e.preventDefault()
                  const clientId = draggedClientId || e.dataTransfer.getData('text/plain')
                  setActivePlannerId(null)
                  setDraggedClientId(null)
                  if (clientId) await reassignClient(clientId, planner.id)
                }}
                style={{
                  minHeight: 420,
                  background: isActiveDrop ? 'rgba(0,122,255,0.08)' : undefined,
                  border: isActiveDrop ? '1px solid rgba(0,122,255,0.35)' : undefined,
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, gap: 12 }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 700, lineHeight: 1.35 }}>{planner.full_name ?? 'Unknown Planner'}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 4 }}>{plannerClients.length} client{plannerClients.length !== 1 ? 's' : ''}</div>
                  </div>
                </div>

                <div style={{ display: 'grid', gap: 8 }}>
                  <div
                    onDragOver={e => {
                      e.preventDefault()
                      e.stopPropagation()
                      setActivePlannerId(planner.id)
                    }}
                    onDrop={async e => {
                      e.preventDefault()
                      e.stopPropagation()
                      const clientId = draggedClientId || e.dataTransfer.getData('text/plain')
                      setActivePlannerId(null)
                      setDraggedClientId(null)
                      if (clientId) await reassignClient(clientId, planner.id)
                    }}
                    style={{
                      border: '1px dashed var(--border)',
                      borderRadius: 10,
                      padding: 10,
                      fontSize: 11,
                      color: 'var(--text-secondary)',
                      background: isActiveDrop ? 'rgba(0,122,255,0.06)' : 'transparent',
                    }}
                  >
                    Drop here to assign to {planner.full_name ?? 'this Support Planner'}.
                  </div>

                  {plannerClients.length === 0 ? (
                    <div style={{ border: '1px dashed var(--border)', borderRadius: 10, padding: 12, color: 'var(--text-secondary)', fontSize: 11, lineHeight: 1.5 }}>
                      No assigned clients yet.
                    </div>
                  ) : (
                    plannerClients.map(client => (
                      <ClientCard
                        key={`planner-${planner.id}-${client.id}`}
                        client={client}
                        isDragging={draggedClientId === client.id}
                        isSaving={savingClientId === client.id}
                        onDragStart={handleDragStart}
                        onDragEnd={handleDragEnd}
                      />
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
