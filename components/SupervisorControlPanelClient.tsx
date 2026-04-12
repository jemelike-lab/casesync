'use client'

import Link from 'next/link'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Profile, Client } from '@/lib/types'
import ClientQuickSearch from '@/components/ClientQuickSearch'
import type { AssigneeSummaryRow } from '@/lib/dashboard-summary'

type ClientFilter = 'all' | 'overdue' | 'due_this_week' | 'no_contact_7'
type RosterFilter = 'all' | 'planners' | 'team_managers' | 'unassigned_planners'

interface Props {
  planners: Profile[]
  teamManagers: Profile[]
  summaryByAssignee?: Record<string, AssigneeSummaryRow>
  globalSummary?: {
    total_clients: number
    overdue_clients: number
    due_this_week_clients: number
    eligibility_ending_soon_clients: number
    no_contact_7_days_clients: number
  }
}

function RoleBadge({ role }: { role: string }) {
  const color = role === 'team_manager' ? '#ff9f0a' : role === 'supports_planner' ? '#30d158' : role === 'it' ? '#bf5af2' : '#98989d'
  const label = role === 'team_manager' ? 'Team Manager' : role === 'supports_planner' ? 'Supports Planner' : role === 'it' ? 'IT' : role
  return (
    <span style={{
      fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 10,
      background: `${color}22`, color, textTransform: 'uppercase', letterSpacing: '0.08em',
    }}>
      {label}
    </span>
  )
}

function ClickableStatCard({
  label,
  value,
  color,
  active,
  onClick,
}: {
  label: string
  value: number | string
  color?: string
  active?: boolean
  onClick?: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        textAlign: 'center',
        padding: '20px 24px',
        borderRadius: 16,
        border: active ? '1px solid var(--accent)' : '1px solid var(--border)',
        background: active ? 'rgba(0,122,255,0.08)' : 'var(--surface)',
        cursor: onClick ? 'pointer' : 'default',
        transition: 'all 0.15s',
      }}
    >
      <div style={{ fontSize: 32, fontWeight: 700, color: color ?? 'var(--text)' }}>{value}</div>
      <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4 }}>{label}</div>
    </button>
  )
}

function FocusCard({
  tone,
  title,
  body,
  active,
  onClick,
}: {
  tone: 'red' | 'orange' | 'yellow'
  title: string
  body: string
  active?: boolean
  onClick?: () => void
}) {
  const palette = {
    red: {
      bg: 'rgba(255,69,58,0.08)',
      border: 'rgba(255,69,58,0.16)',
    },
    orange: {
      bg: 'rgba(255,159,10,0.08)',
      border: 'rgba(255,159,10,0.16)',
    },
    yellow: {
      bg: 'rgba(255,214,10,0.08)',
      border: 'rgba(255,214,10,0.16)',
    },
  }[tone]

  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        background: active ? 'rgba(0,122,255,0.08)' : palette.bg,
        border: active ? '1px solid var(--accent)' : `1px solid ${palette.border}`,
        borderRadius: 10,
        padding: 14,
        textAlign: 'left',
        cursor: 'pointer',
      }}
    >
      <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>{title}</div>
      <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6, marginTop: 4 }}>{body}</div>
    </button>
  )
}

function teamLink(filter: ClientFilter, plannerId?: string) {
  const params = new URLSearchParams()
  params.set('full', '1')
  params.set('filter', filter)
  if (plannerId) params.set('planner', plannerId)
  return `/team?${params.toString()}`
}

export default function SupervisorControlPanelClient({ planners, teamManagers, summaryByAssignee, globalSummary }: Props) {
  const [clientFilter, setClientFilter] = useState<ClientFilter>('all')
  const [rosterFilter, setRosterFilter] = useState<RosterFilter>('all')
  const [clients, setClients] = useState<Client[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [clientPage, setClientPage] = useState(0)

  const clientResultsRef = useRef<HTMLDivElement | null>(null)
  const rosterRef = useRef<HTMLDivElement | null>(null)

  const unassignedPlanners = planners.filter(p => !p.team_manager_id).length

  const plannerRows = planners.map(planner => {
    const teamManager = teamManagers.find(manager => manager.id === planner.team_manager_id)
    const summary = summaryByAssignee?.[planner.id]
    return {
      planner,
      teamManager,
      clientCount: summary?.total_clients ?? 0,
      overdue: summary?.overdue_clients ?? 0,
      dueThisWeek: summary?.due_this_week_clients ?? 0,
      quiet: summary?.no_contact_7_days_clients ?? 0,
    }
  }).sort((a, b) => {
    if (b.overdue !== a.overdue) return b.overdue - a.overdue
    return b.clientCount - a.clientCount
  })

  const filteredPlanners = useMemo(() => {
    if (rosterFilter === 'unassigned_planners') return planners.filter(p => !p.team_manager_id)
    return planners
  }, [planners, rosterFilter])

  const filteredTeamManagers = useMemo(() => {
    if (rosterFilter === 'planners' || rosterFilter === 'unassigned_planners') return []
    if (rosterFilter === 'team_managers') return teamManagers
    return teamManagers
  }, [teamManagers, rosterFilter])

  const scopedSummary = useMemo(() => {
    const rows = Object.values(summaryByAssignee ?? {})

    if (rows.length === 0) {
      return globalSummary ?? {
        total_clients: 0,
        overdue_clients: 0,
        due_this_week_clients: 0,
        eligibility_ending_soon_clients: 0,
        no_contact_7_days_clients: 0,
      }
    }

    return rows.reduce(
      (acc, row) => ({
        total_clients: acc.total_clients + (row.total_clients ?? 0),
        overdue_clients: acc.overdue_clients + (row.overdue_clients ?? 0),
        due_this_week_clients: acc.due_this_week_clients + (row.due_this_week_clients ?? 0),
        eligibility_ending_soon_clients: acc.eligibility_ending_soon_clients + (row.eligibility_ending_soon_clients ?? 0),
        no_contact_7_days_clients: acc.no_contact_7_days_clients + (row.no_contact_7_days_clients ?? 0),
      }),
      {
        total_clients: 0,
        overdue_clients: 0,
        due_this_week_clients: 0,
        eligibility_ending_soon_clients: 0,
        no_contact_7_days_clients: 0,
      }
    )
  }, [summaryByAssignee, globalSummary])

  useEffect(() => {
    const controller = new AbortController()
    const params = new URLSearchParams()
    params.set('page', String(clientPage))
    params.set('limit', '25')
    params.set('filter', clientFilter)
    params.set('sortField', 'name')
    params.set('sortDir', 'asc')

    setLoading(true)

    fetch(`/api/clients?${params.toString()}`, { signal: controller.signal })
      .then(async (res) => {
        if (!res.ok) throw new Error(`Failed to load clients (${res.status})`)
        return res.json() as Promise<{ clients: Client[]; total: number }>
      })
      .then((payload) => {
        setClients(payload.clients ?? [])
        setTotal(payload.total ?? 0)
      })
      .catch((error) => {
        if (controller.signal.aborted) return
        console.error('Supervisor drill-down load failed:', error)
        setClients([])
        setTotal(0)
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })

    return () => controller.abort()
  }, [clientFilter, clientPage])

  function openClientFilter(next: ClientFilter) {
    setClientFilter(next)
    setClientPage(0)
    window.setTimeout(() => clientResultsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 30)
  }

  function openRosterFilter(next: RosterFilter) {
    setRosterFilter(next)
    window.setTimeout(() => rosterRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 30)
  }

  const fullResultsHref = teamLink(clientFilter)

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', paddingBottom: 80 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24, gap: 12, flexWrap: 'wrap' }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>🧭 Supervisor Control Panel</h1>
        <Link href="/dashboard" style={{
          fontSize: 13, color: 'var(--accent)', textDecoration: 'none',
          padding: '6px 12px', border: '1px solid var(--border)', borderRadius: 6,
        }}>
          ← Dashboard
        </Link>
      </div>

      <ClientQuickSearch
        helperText="Supervisor search across active clients."
        maxResults={8}
      />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12, marginBottom: 24 }}>
        <ClickableStatCard label="Active Clients" value={scopedSummary.total_clients} active={clientFilter === 'all'} onClick={() => openClientFilter('all')} />
        <ClickableStatCard label="Overdue" value={scopedSummary.overdue_clients} color="var(--red)" active={clientFilter === 'overdue'} onClick={() => openClientFilter('overdue')} />
        <ClickableStatCard label="Due This Week" value={scopedSummary.due_this_week_clients} color="var(--orange)" active={clientFilter === 'due_this_week'} onClick={() => openClientFilter('due_this_week')} />
        <ClickableStatCard label="No Contact 7+ Days" value={scopedSummary.no_contact_7_days_clients} color="var(--yellow)" active={clientFilter === 'no_contact_7'} onClick={() => openClientFilter('no_contact_7')} />
        <ClickableStatCard label="Support Planners" value={planners.length} active={rosterFilter === 'planners'} onClick={() => openRosterFilter('planners')} />
        <ClickableStatCard label="Team Managers" value={teamManagers.length} active={rosterFilter === 'team_managers'} onClick={() => openRosterFilter('team_managers')} />
        <ClickableStatCard label="Unassigned Planners" value={unassignedPlanners} color={unassignedPlanners > 0 ? 'var(--orange)' : 'var(--green)'} active={rosterFilter === 'unassigned_planners'} onClick={() => openRosterFilter('unassigned_planners')} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1.15fr 1fr', gap: 16, marginBottom: 24 }}>
        <div className="card">
          <h2 style={{ fontSize: 14, fontWeight: 600, marginBottom: 16, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Team Health Summary
          </h2>
          <div style={{ display: 'grid', gap: 12 }}>
            <FocusCard tone="red" title={`${scopedSummary.overdue_clients} overdue client${scopedSummary.overdue_clients !== 1 ? 's' : ''}`} body="Priority one: clear overdue work before the rest of the week piles up." active={clientFilter === 'overdue'} onClick={() => openClientFilter('overdue')} />
            <FocusCard tone="orange" title={`${scopedSummary.due_this_week_clients} due this week`} body="Good place to rebalance planners if one caseload is getting too heavy." active={clientFilter === 'due_this_week'} onClick={() => openClientFilter('due_this_week')} />
            <FocusCard tone="yellow" title={`${scopedSummary.no_contact_7_days_clients} no-contact client${scopedSummary.no_contact_7_days_clients !== 1 ? 's' : ''} (7+ days)`} body="Worth checking for silent drift before those cases become urgent." active={clientFilter === 'no_contact_7'} onClick={() => openClientFilter('no_contact_7')} />
          </div>
        </div>

        <div className="card">
          <h2 style={{ fontSize: 14, fontWeight: 600, marginBottom: 16, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Team Tools
          </h2>
          <div style={{ display: 'grid', gap: 12 }}>
            <Link href="/team?view=transfer" style={{ textDecoration: 'none', color: 'inherit' }}>
              <div className="card" style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
                <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 6 }}>🔀 Client Transfer Board</div>
                <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                  Drag clients between Support Planners and rebalance caseloads quickly.
                </div>
              </div>
            </Link>
            <Link href="/team?view=assign-planners" style={{ textDecoration: 'none', color: 'inherit' }}>
              <div className="card" style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
                <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 6 }}>🧭 Team Manager Board</div>
                <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                  Drag Support Planners between Team Managers and update reporting assignments.
                </div>
              </div>
            </Link>
            <Link href="/team" style={{ textDecoration: 'none', color: 'inherit' }}>
              <div className="card" style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
                <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 6 }}>👥 Team View</div>
                <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                  Review Support Planner performance, current assignments, and team coverage in one place.
                </div>
              </div>
            </Link>
            <Link href="/team?view=history" style={{ textDecoration: 'none', color: 'inherit' }}>
              <div className="card" style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
                <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 6 }}>📈 Rebalance History</div>
                <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                  Review recent rebalance moves, outcomes, and planner impact without going into the audit log.
                </div>
              </div>
            </Link>
            <Link href="/team?view=queues" style={{ textDecoration: 'none', color: 'inherit' }}>
              <div className="card" style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
                <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 6 }}>🧭 Queue Command Center</div>
                <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                  Open overdue, today, week, next-14-day, and quiet-case queues from one manager-focused ops surface.
                </div>
              </div>
            </Link>
          </div>
        </div>
      </div>

      <div ref={clientResultsRef} className="card" style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
          <h2 style={{ fontSize: 14, fontWeight: 600, margin: 0, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Client Drill-Down
          </h2>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
              {loading ? 'Loading…' : `${clients.length} shown • ${total} total in this filter`}
            </div>
            <button
              type="button"
              onClick={() => { window.location.href = fullResultsHref }}
              style={{
                fontSize: 12,
                color: 'var(--accent)',
                fontWeight: 600,
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                padding: 0,
              }}
            >
              Open full filtered view →
            </button>
          </div>
        </div>
        <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 12 }}>
          Current filter: <strong style={{ color: 'var(--text)' }}>{clientFilter === 'all' ? 'Active Clients' : clientFilter === 'overdue' ? 'Overdue' : clientFilter === 'due_this_week' ? 'Due This Week' : 'No Contact 7+ Days'}</strong>
        </div>
        <div style={{ display: 'grid', gap: 10, maxHeight: 520, overflowY: 'auto', paddingRight: 4 }}>
          {clients.map(client => (
            <Link key={client.id} href={`/clients/${client.id}`} style={{ textDecoration: 'none', color: 'inherit' }}>
              <div style={{ border: '1px solid var(--border)', borderRadius: 10, padding: 12, background: 'var(--surface-2)' }}>
                <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 4 }}>
                  {client.last_name}{client.first_name ? `, ${client.first_name}` : ''}
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                  ID {client.client_id} • Planner: {client.profiles?.full_name ?? 'Unassigned'}
                </div>
              </div>
            </Link>
          ))}
          {!loading && clients.length === 0 && (
            <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>No clients in this filter.</div>
          )}
        </div>
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 10, marginTop: 14, flexWrap: 'wrap' }}>
          <button
            type="button"
            className="btn-secondary"
            style={{ fontSize: 12, minHeight: 34 }}
            onClick={() => setClientPage(p => Math.max(0, p - 1))}
            disabled={clientPage === 0 || loading}
          >
            ← Previous
          </button>
          <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
            Page {clientPage + 1} of {Math.max(1, Math.ceil(total / 25))}
          </span>
          <button
            type="button"
            className="btn-secondary"
            style={{ fontSize: 12, minHeight: 34 }}
            onClick={() => setClientPage(p => p + 1)}
            disabled={loading || (clientPage + 1) * 25 >= total}
          >
            Next →
          </button>
        </div>
      </div>

      <div ref={rosterRef} style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 16, marginBottom: 24 }}>
        <div className="card">
          <h2 style={{ fontSize: 14, fontWeight: 600, marginBottom: 16, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Planner Workload
          </h2>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)' }}>
                  {['Support Planner', 'Team Manager', 'Clients', 'Overdue', 'Due This Week', 'No Contact 7+'].map(h => (
                    <th key={h} style={{ padding: '8px 12px', textAlign: 'left', color: 'var(--text-secondary)', fontWeight: 600, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {plannerRows.filter(row => rosterFilter !== 'unassigned_planners' || !row.planner.team_manager_id).map(row => (
                  <tr key={row.planner.id} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '10px 12px', fontWeight: 500 }}>{row.planner.full_name ?? 'Unknown'}</td>
                    <td style={{ padding: '10px 12px' }}>{row.teamManager?.full_name ?? 'Unassigned'}</td>
                    <td style={{ padding: '10px 12px' }}><Link href={teamLink('all', row.planner.id)} style={{ color: 'inherit' }}>{row.clientCount}</Link></td>
                    <td style={{ padding: '10px 12px', color: row.overdue > 0 ? 'var(--red)' : 'var(--text)' }}><Link href={teamLink('overdue', row.planner.id)} style={{ color: 'inherit' }}>{row.overdue}</Link></td>
                    <td style={{ padding: '10px 12px', color: row.dueThisWeek > 0 ? 'var(--orange)' : 'var(--text)' }}><Link href={teamLink('due_this_week', row.planner.id)} style={{ color: 'inherit' }}>{row.dueThisWeek}</Link></td>
                    <td style={{ padding: '10px 12px', color: row.quiet > 0 ? 'var(--yellow)' : 'var(--text)' }}><Link href={teamLink('no_contact_7', row.planner.id)} style={{ color: 'inherit' }}>{row.quiet}</Link></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 24 }}>
        <h2 style={{ fontSize: 14, fontWeight: 600, marginBottom: 16, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          Team Roster
        </h2>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)' }}>
                {['Name', 'Role', 'Assigned Team Manager', 'Clients / Support Planners'].map(h => (
                  <th key={h} style={{ padding: '8px 12px', textAlign: 'left', color: 'var(--text-secondary)', fontWeight: 600, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filteredPlanners.map(planner => {
                const tm = teamManagers.find(manager => manager.id === planner.team_manager_id)
                const clientCount = summaryByAssignee?.[planner.id]?.total_clients ?? 0
                return (
                  <tr key={planner.id} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '10px 12px', fontWeight: 500 }}>{planner.full_name ?? 'Unknown'}</td>
                    <td style={{ padding: '10px 12px' }}><RoleBadge role={planner.role} /></td>
                    <td style={{ padding: '10px 12px' }}>{tm?.full_name ?? 'Unassigned'}</td>
                    <td style={{ padding: '10px 12px' }}><Link href={teamLink('all', planner.id)} style={{ color: 'inherit' }}>{clientCount} clients</Link></td>
                  </tr>
                )
              })}
              {filteredTeamManagers.map(manager => (
                <tr key={manager.id} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td style={{ padding: '10px 12px', fontWeight: 500 }}>{manager.full_name ?? 'Unknown'}</td>
                  <td style={{ padding: '10px 12px' }}><RoleBadge role={manager.role} /></td>
                  <td style={{ padding: '10px 12px', color: 'var(--text-secondary)' }}>—</td>
                  <td style={{ padding: '10px 12px' }}>{planners.filter(p => p.team_manager_id === manager.id).length} planners</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card">
        <h2 style={{ fontSize: 14, fontWeight: 600, marginBottom: 16, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          Supervisor Scope
        </h2>
        <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.7 }}>
          This panel uses the same visual language as Admin, but only includes supervisor-safe actions. User invites, account removal, and audit controls remain in Admin.
        </div>
      </div>
    </div>
  )
}
