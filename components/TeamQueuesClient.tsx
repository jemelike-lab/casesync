'use client'

import Link from 'next/link'
import { useMemo } from 'react'
import { Client, Profile, isOverdue, isDueToday, isDueThisWeek, isDueNext14Days, getDaysSinceContact } from '@/lib/types'

interface Props {
  clients: Client[]
  planners: Profile[]
  mode: 'supervisor' | 'team_manager'
}

type QueueKey = 'overdue' | 'due_today' | 'due_this_week' | 'due_next_14_days' | 'no_contact_7'

function queueLabel(key: QueueKey) {
  switch (key) {
    case 'overdue': return 'Overdue'
    case 'due_today': return 'Due Today'
    case 'due_this_week': return 'Due This Week'
    case 'due_next_14_days': return 'Next 14 Days'
    case 'no_contact_7': return 'No Contact 7+ Days'
  }
}

function queueIcon(key: QueueKey) {
  switch (key) {
    case 'overdue': return '🔴'
    case 'due_today': return '📍'
    case 'due_this_week': return '🟠'
    case 'due_next_14_days': return '🗓️'
    case 'no_contact_7': return '📵'
  }
}

function queueColor(key: QueueKey) {
  switch (key) {
    case 'overdue': return '#ff453a'
    case 'due_today': return '#ff7a00'
    case 'due_this_week': return '#ff9f0a'
    case 'due_next_14_days': return '#0a84ff'
    case 'no_contact_7': return '#ffd60a'
  }
}

function inQueue(client: Client, key: QueueKey) {
  switch (key) {
    case 'overdue': return isOverdue(client)
    case 'due_today': return isDueToday(client)
    case 'due_this_week': return isDueThisWeek(client)
    case 'due_next_14_days': return isDueNext14Days(client) && !isOverdue(client) && !isDueToday(client) && !isDueThisWeek(client)
    case 'no_contact_7': {
      const days = getDaysSinceContact(client.last_contact_date)
      return days !== null && days >= 7
    }
  }
}

export default function TeamQueuesClient({ clients, planners, mode }: Props) {
  const queues = useMemo(() => {
    const keys: QueueKey[] = ['overdue', 'due_today', 'due_this_week', 'due_next_14_days', 'no_contact_7']
    return keys.map((key) => {
      const queueClients = clients.filter(client => inQueue(client, key))
      const plannerPressure = planners.map((planner) => {
        const scoped = queueClients.filter(client => client.assigned_to === planner.id)
        return {
          planner,
          count: scoped.length,
          sample: scoped.slice(0, 3),
        }
      }).filter(row => row.count > 0).sort((a, b) => b.count - a.count)

      return {
        key,
        clients: queueClients,
        count: queueClients.length,
        plannerPressure,
        unassignedCount: queueClients.filter(client => !client.assigned_to).length,
      }
    })
  }, [clients, planners])

  const hottestPlanners = useMemo(() => {
    return planners.map((planner) => {
      const assigned = clients.filter(client => client.assigned_to === planner.id)
      const overdue = assigned.filter(isOverdue).length
      const dueThisWeek = assigned.filter(isDueThisWeek).length
      const dueToday = assigned.filter(isDueToday).length
      const pressure = overdue * 5 + dueToday * 3 + dueThisWeek * 2 + Math.max(0, assigned.length - 35)
      return { planner, pressure, overdue, dueToday, dueThisWeek, total: assigned.length }
    }).filter(row => row.pressure > 0).sort((a, b) => b.pressure - a.pressure).slice(0, 6)
  }, [clients, planners])

  const title = mode === 'supervisor' ? 'Queue Command Center' : 'Team Queue Command Center'

  return (
    <main style={{ maxWidth: 1200, margin: '0 auto', padding: '24px 16px 100px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap', marginBottom: 20 }}>
        <div>
          <div style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-secondary)', marginBottom: 6 }}>
            Team Ops
          </div>
          <h1 style={{ margin: 0, fontSize: 28, lineHeight: 1.1 }}>{title}</h1>
          <div style={{ marginTop: 8, fontSize: 14, color: 'var(--text-secondary)' }}>
            Fast queue entry points for deadline pressure, quiet cases, and planner hotspots.
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Link href="/team" style={{ fontSize: 13, color: 'var(--text)', textDecoration: 'none', padding: '8px 12px', border: '1px solid var(--border)', borderRadius: 8, background: 'var(--surface-2)' }}>
            ← Back to Team
          </Link>
          <Link href="/team?view=history" style={{ fontSize: 13, color: 'var(--text)', textDecoration: 'none', padding: '8px 12px', border: '1px solid var(--border)', borderRadius: 8, background: 'var(--surface-2)' }}>
            Rebalance History →
          </Link>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14, marginBottom: 18 }}>
        {queues.map(queue => (
          <div key={queue.key} className="card" style={{ border: `1px solid ${queueColor(queue.key)}22`, background: `${queueColor(queue.key)}12` }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'flex-start', marginBottom: 10 }}>
              <div>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                  {queueIcon(queue.key)} {queueLabel(queue.key)}
                </div>
                <div style={{ fontSize: 30, fontWeight: 800, marginTop: 4, color: queueColor(queue.key) }}>{queue.count}</div>
              </div>
              <Link href={`/team?full=1&filter=${queue.key}`} style={{ fontSize: 12, color: 'var(--text)', textDecoration: 'none', padding: '7px 10px', border: '1px solid var(--border)', borderRadius: 8, background: 'var(--surface)' }}>
                Open queue →
              </Link>
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
              {queue.plannerPressure.length > 0 ? (
                <>
                  Hottest planner: <strong style={{ color: 'var(--text)' }}>{queue.plannerPressure[0].planner.full_name ?? 'Unknown'}</strong>
                  {' '}({queue.plannerPressure[0].count})
                </>
              ) : 'No planner pressure in this queue right now.'}
            </div>
            {queue.unassignedCount > 0 && (
              <div style={{ marginTop: 8, fontSize: 12, color: 'var(--text-secondary)' }}>
                Unassigned in queue: <strong style={{ color: 'var(--text)' }}>{queue.unassignedCount}</strong>
              </div>
            )}
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 0.8fr', gap: 16, marginBottom: 18 }}>
        <div className="card">
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>Planner hotspots</div>
          {hottestPlanners.length === 0 ? (
            <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>No planner hotspots right now.</div>
          ) : (
            <div style={{ display: 'grid', gap: 10 }}>
              {hottestPlanners.map(row => (
                <div key={row.planner.id} style={{ border: '1px solid var(--border)', borderRadius: 10, background: 'var(--surface-2)', padding: 12 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 700 }}>{row.planner.full_name ?? 'Unknown planner'}</div>
                      <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4 }}>
                        {row.overdue} overdue • {row.dueToday} due today • {row.dueThisWeek} due this week • {row.total} total
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                      <span style={{ fontSize: 11, fontWeight: 700, color: row.pressure >= 12 ? '#ff453a' : row.pressure >= 6 ? '#ff9f0a' : '#30d158', background: row.pressure >= 12 ? 'rgba(255,69,58,0.12)' : row.pressure >= 6 ? 'rgba(255,159,10,0.12)' : 'rgba(48,209,88,0.12)', borderRadius: 999, padding: '4px 10px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                        Pressure {row.pressure}
                      </span>
                      <Link href={`/team?full=1&filter=overdue&planner=${encodeURIComponent(row.planner.id)}`} style={{ fontSize: 12, color: 'var(--text)', textDecoration: 'none', padding: '6px 10px', border: '1px solid var(--border)', borderRadius: 8, background: 'var(--surface)' }}>
                        Overdue →
                      </Link>
                      <Link href={`/team?full=1&filter=due_this_week&planner=${encodeURIComponent(row.planner.id)}`} style={{ fontSize: 12, color: 'var(--text)', textDecoration: 'none', padding: '6px 10px', border: '1px solid var(--border)', borderRadius: 8, background: 'var(--surface)' }}>
                        This week →
                      </Link>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="card">
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>Fast actions</div>
          <div style={{ display: 'grid', gap: 10 }}>
            <Link href="/team?full=1&filter=overdue" style={{ textDecoration: 'none', color: 'inherit' }}>
              <div style={{ border: '1px solid var(--border)', borderRadius: 10, background: 'var(--surface-2)', padding: 12 }}>
                <div style={{ fontSize: 13, fontWeight: 700 }}>🔴 Work overdue first</div>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4 }}>Open the highest-pressure queue immediately.</div>
              </div>
            </Link>
            <Link href="/team?full=1&filter=due_today" style={{ textDecoration: 'none', color: 'inherit' }}>
              <div style={{ border: '1px solid var(--border)', borderRadius: 10, background: 'var(--surface-2)', padding: 12 }}>
                <div style={{ fontSize: 13, fontWeight: 700 }}>📍 Clear today’s deadlines</div>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4 }}>Catch same-day work before it rolls into overdue.</div>
              </div>
            </Link>
            <Link href="/team?view=transfer" style={{ textDecoration: 'none', color: 'inherit' }}>
              <div style={{ border: '1px solid var(--border)', borderRadius: 10, background: 'var(--surface-2)', padding: 12 }}>
                <div style={{ fontSize: 13, fontWeight: 700 }}>↔️ Rebalance load</div>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4 }}>Jump into the transfer board when planner pressure needs relief.</div>
              </div>
            </Link>
            <Link href="/team?view=history" style={{ textDecoration: 'none', color: 'inherit' }}>
              <div style={{ border: '1px solid var(--border)', borderRadius: 10, background: 'var(--surface-2)', padding: 12 }}>
                <div style={{ fontSize: 13, fontWeight: 700 }}>📈 Review move outcomes</div>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4 }}>See whether the last rebalance actions actually helped.</div>
              </div>
            </Link>
          </div>
        </div>
      </div>

      <div className="card">
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>Queue breakdown</div>
        <div style={{ display: 'grid', gap: 12 }}>
          {queues.map(queue => (
            <div key={queue.key} style={{ border: '1px solid var(--border)', borderRadius: 12, background: 'var(--surface-2)', padding: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'center', marginBottom: 10 }}>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 700 }}>{queueIcon(queue.key)} {queueLabel(queue.key)}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4 }}>{queue.count} client{queue.count !== 1 ? 's' : ''}</div>
                </div>
                <Link href={`/team?full=1&filter=${queue.key}`} style={{ fontSize: 12, color: 'var(--text)', textDecoration: 'none', padding: '6px 10px', border: '1px solid var(--border)', borderRadius: 8, background: 'var(--surface)' }}>
                  Open full queue →
                </Link>
              </div>
              {queue.plannerPressure.length === 0 ? (
                <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Nothing active here.</div>
              ) : (
                <div style={{ display: 'grid', gap: 8 }}>
                  {queue.plannerPressure.slice(0, 5).map(row => (
                    <div key={row.planner.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
                      <div>
                        <div style={{ fontSize: 12, fontWeight: 600 }}>{row.planner.full_name ?? 'Unknown planner'}</div>
                        <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 2 }}>{row.count} in queue</div>
                      </div>
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                        {row.sample.length > 0 && (
                          <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                            {row.sample.map((client, index) => (
                              <span key={client.id}>
                                <Link href={`/clients/${client.id}`} style={{ color: 'var(--accent)', textDecoration: 'none' }}>
                                  {client.last_name}{client.first_name ? `, ${client.first_name}` : ''}
                                </Link>
                                {index < row.sample.length - 1 ? ', ' : ''}
                              </span>
                            ))}
                          </div>
                        )}
                        <Link href={`/team?full=1&filter=${queue.key}&planner=${encodeURIComponent(row.planner.id)}`} style={{ fontSize: 11, color: 'var(--text)', textDecoration: 'none', padding: '5px 8px', border: '1px solid var(--border)', borderRadius: 8, background: 'var(--surface)' }}>
                          Drill in →
                        </Link>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </main>
  )
}
