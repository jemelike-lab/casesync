'use client'

import Link from 'next/link'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Profile, Client } from '@/lib/types'
import ClientQuickSearch from '@/components/ClientQuickSearch'
import PremiumStatGrid from '@/components/PremiumStatGrid'
import TeamHealthPanel from '@/components/TeamHealthPanel'
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
  profile?: Profile | null
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
        padding: '16px 12px',
        borderRadius: 16,
        border: active ? '1px solid var(--accent)' : '1px solid var(--border)',
        background: active ? 'rgba(0,122,255,0.08)' : 'var(--surface)',
        cursor: onClick ? 'pointer' : 'default',
        transition: 'all 0.15s',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: 90,
        gap: 6,
      }}
    >
      <div style={{ fontSize: 30, fontWeight: 800, color: color ?? 'var(--text)', lineHeight: 1 }}>{value}</div>
      <div style={{ fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.3, fontWeight: 500 }}>{label}</div>
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

export default function SupervisorControlPanelClient({ planners, teamManagers, summaryByAssignee, globalSummary, profile }: Props) {
  const [clientFilter, setClientFilter] = useState<ClientFilter>('all')
  const [rosterFilter, setRosterFilter] = useState<RosterFilter>('all')
  const [clients, setClients] = useState<Client[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [clientPage, setClientPage] = useState(0)
  const [urgentClients, setUrgentClients] = useState<Client[]>([])

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

  // Fetch urgent (overdue) clients on mount for welcome section
  useEffect(() => {
    const controller = new AbortController()
    const params = new URLSearchParams()
    params.set('page', '0')
    params.set('limit', '5')
    params.set('filter', 'overdue')
    params.set('sortField', 'priority')
    params.set('sortDir', 'desc')

    fetch(`/api/clients?${params.toString()}`, { signal: controller.signal })
      .then(async (res) => {
        if (!res.ok) return
        return res.json() as Promise<{ clients: Client[]; total: number }>
      })
      .then((payload) => {
        if (payload) setUrgentClients(payload.clients ?? [])
      })
      .catch(() => {})

    return () => controller.abort()
  }, [])

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
        <Link href="/dashboard?full=1" style={{
          fontSize: 13, color: 'var(--accent)', textDecoration: 'none',
          padding: '6px 12px', border: '1px solid var(--border)', borderRadius: 6,
        }}>
          ← Dashboard
        </Link>
      </div>

      {/* ─── Premium Welcome Hero ─────────────────────────────────────── */}
      {(() => {
        const hour = new Date().getHours()
        const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening'
        const firstName = profile?.full_name?.split(' ')[0] ?? 'there'
        const hasUrgent = urgentClients.length > 0
        const overdueRate = scopedSummary.total_clients > 0
          ? Math.round((scopedSummary.overdue_clients / scopedSummary.total_clients) * 100)
          : 0
        const orgHealth = overdueRate <= 10 ? 'Excellent' : overdueRate <= 25 ? 'Good' : overdueRate <= 50 ? 'Needs Attention' : 'Critical'
        const orgColor = overdueRate <= 10 ? '#30d158' : overdueRate <= 25 ? '#ffd60a' : overdueRate <= 50 ? '#ff9f0a' : '#ff453a'

        return (
          <div style={{ marginBottom: 24, display: 'flex', gap: 16 }}>
            {/* Left: Greeting + org health meter */}
            <div style={{
              flex: '0 0 280px',
              borderRadius: 22,
              padding: '28px 24px',
              background: 'linear-gradient(160deg, #0c1a3a 0%, #142244 40%, #0e1630 100%)',
              border: '1px solid rgba(100,140,255,0.12)',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
              position: 'relative',
              overflow: 'hidden',
            }}>
              {/* Decorative circles */}
              <div style={{ position: 'absolute', top: -40, right: -40, width: 120, height: 120, borderRadius: '50%', background: 'radial-gradient(circle, rgba(100,140,255,0.08) 0%, transparent 70%)', pointerEvents: 'none' }} />
              <div style={{ position: 'absolute', bottom: -30, left: -30, width: 80, height: 80, borderRadius: '50%', background: `radial-gradient(circle, ${orgColor}10 0%, transparent 70%)`, pointerEvents: 'none' }} />

              <div style={{ position: 'relative', zIndex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 500, color: 'rgba(160,180,255,0.6)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 6 }}>
                  {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
                </div>
                <div style={{ fontSize: 26, fontWeight: 800, color: '#fff', lineHeight: 1.2 }}>
                  {greeting},
                </div>
                <div style={{ fontSize: 26, fontWeight: 800, color: '#fff', lineHeight: 1.2 }}>
                  {firstName} 👋
                </div>
              </div>

              {/* Org Health Meter */}
              <div style={{ position: 'relative', zIndex: 1, marginTop: 24 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
                  <span style={{ fontSize: 11, fontWeight: 600, color: 'rgba(160,180,255,0.5)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Org Health</span>
                  <span style={{ fontSize: 13, fontWeight: 800, color: orgColor }}>{orgHealth}</span>
                </div>
                {/* Meter bar */}
                <div style={{ height: 6, borderRadius: 3, background: 'rgba(255,255,255,0.06)', overflow: 'hidden' }}>
                  <div className="meter-fill" style={{
                    height: '100%',
                    width: `${100 - overdueRate}%`,
                    borderRadius: 3,
                    background: `linear-gradient(90deg, ${orgColor}, ${orgColor}aa)`,
                    boxShadow: `0 0 10px ${orgColor}40`,
                    transition: 'width 1.5s cubic-bezier(0.4, 0, 0.2, 1)',
                  }} />
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6 }}>
                  <span style={{ fontSize: 10, color: 'rgba(160,180,255,0.35)' }}>{scopedSummary.overdue_clients} overdue of {scopedSummary.total_clients}</span>
                  <span style={{ fontSize: 10, color: 'rgba(160,180,255,0.35)' }}>{100 - overdueRate}% on track</span>
                </div>
              </div>
            </div>

            {/* Right: Urgent clients list */}
            <div style={{
              flex: 1,
              borderRadius: 22,
              background: 'linear-gradient(160deg, rgba(255,255,255,0.02) 0%, rgba(255,255,255,0.005) 100%)',
              border: '1px solid rgba(255,255,255,0.05)',
              padding: hasUrgent ? '20px 20px 16px' : '28px 24px',
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
            }}>
              {hasUrgent ? (
                <>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
                    <div className="pulse-dot" style={{
                      width: 10, height: 10, borderRadius: '50%', background: '#ff453a',
                      boxShadow: '0 0 8px rgba(255,69,58,0.6)',
                    }} />
                    <span style={{ fontSize: 13, fontWeight: 700, color: '#ff6b6b', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                      {urgentClients.length} Urgent — Needs Attention
                    </span>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flex: 1, overflowY: 'auto' }}>
                    {urgentClients.slice(0, 5).map((client, idx) => {
                      const assignedPlanner = planners.find(p => p.id === client.assigned_to)
                      const isUnassigned = !client.assigned_to
                      return (
                        <Link
                          key={client.id}
                          href={`/clients/${client.id}`}
                          className="urgent-row"
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 14,
                            padding: '12px 16px',
                            background: isUnassigned
                              ? 'linear-gradient(90deg, rgba(255,69,58,0.08) 0%, rgba(255,69,58,0.02) 100%)'
                              : 'linear-gradient(90deg, rgba(255,159,10,0.06) 0%, rgba(255,159,10,0.01) 100%)',
                            borderRadius: 14,
                            textDecoration: 'none',
                            borderLeft: isUnassigned ? '3px solid #ff453a' : '3px solid #ff9f0a',
                            transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                            opacity: 0,
                            transform: 'translateX(-12px)',
                            animation: `slideInRow 0.4s ${idx * 0.08}s cubic-bezier(0.4, 0, 0.2, 1) forwards`,
                          }}
                        >
                          {/* Number badge */}
                          <div style={{
                            width: 30, height: 30, borderRadius: 10,
                            background: isUnassigned ? 'rgba(255,69,58,0.15)' : 'rgba(255,159,10,0.12)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontSize: 13, fontWeight: 800,
                            color: isUnassigned ? '#ff453a' : '#ff9f0a',
                            flexShrink: 0,
                          }}>
                            {idx + 1}
                          </div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>
                              {client.first_name} {client.last_name}
                            </div>
                            <div style={{ fontSize: 11, fontWeight: 500, marginTop: 1 }}>
                              {isUnassigned ? (
                                <span style={{ color: '#ff453a' }}>Unassigned — needs planner</span>
                              ) : (
                                <span style={{ color: 'var(--text-secondary)' }}>Assigned to {assignedPlanner?.full_name ?? 'Unknown'}</span>
                              )}
                            </div>
                          </div>
                          <div style={{
                            fontSize: 18, color: 'var(--text-secondary)', opacity: 0.4,
                            transition: 'opacity 0.2s, transform 0.2s',
                          }}>
                            →
                          </div>
                        </Link>
                      )
                    })}
                  </div>
                </>
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 1, gap: 12 }}>
                  <div style={{
                    width: 48, height: 48, borderRadius: '50%',
                    background: 'rgba(48,209,88,0.1)', border: '2px solid rgba(48,209,88,0.2)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22,
                  }}>
                    ✓
                  </div>
                  <div>
                    <div style={{ fontSize: 16, fontWeight: 700, color: '#30d158' }}>All clear</div>
                    <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>No urgent clients across the org right now.</div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )
      })()}

      <ClientQuickSearch
        helperText="Supervisor search across active clients."
        maxResults={8}
      />

      <PremiumStatGrid
        totalClients={scopedSummary.total_clients}
        overdue={scopedSummary.overdue_clients}
        dueThisWeek={scopedSummary.due_this_week_clients}
        noContact={scopedSummary.no_contact_7_days_clients}
        plannerCount={planners.length}
        tmCount={teamManagers.length}
        unassignedPlanners={unassignedPlanners}
        activeFilter={clientFilter === 'all' ? undefined : clientFilter}
        onFilterClick={(f) => openClientFilter(f as ClientFilter)}
        activeRosterFilter={rosterFilter === 'all' ? undefined : rosterFilter}
        onRosterClick={(f) => openRosterFilter(f as RosterFilter)}
      />

      <div style={{ display: 'grid', gridTemplateColumns: '1.15fr 1fr', gap: 16, marginBottom: 24 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <TeamHealthPanel
            planners={planners}
            summaryByAssignee={summaryByAssignee ?? {}}
          />
          {/* Action-oriented focus cards */}
          <div style={{ display: 'grid', gap: 10 }}>
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
            <Link href="/clients/import" style={{ textDecoration: 'none', color: 'inherit' }}>
              <div className="card" style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
                <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 6 }}>⬆ Batch Import</div>
                <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                  Upload client batches and review recent import runs from one place.
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
