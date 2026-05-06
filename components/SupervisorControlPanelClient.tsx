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
          <div className="scp-hero-row" style={{ marginBottom: 24, display: 'flex', gap: 16 }}>
            {/* Left: Greeting + org health meter */}
            <div className="scp-hero-welcome" style={{
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

      <div className="scp-two-col" style={{ display: 'grid', gridTemplateColumns: '1.15fr 1fr', gap: 16, marginBottom: 24 }}>
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

      {/* ─── Premium Client Drill-Down ────────────────────────────────── */}
      <div ref={clientResultsRef} style={{
        marginBottom: 24, borderRadius: 22, overflow: 'hidden',
        border: '1px solid rgba(255,255,255,0.05)',
        background: 'linear-gradient(160deg, rgba(255,255,255,0.02) 0%, rgba(255,255,255,0.005) 100%)',
      }}>
        {/* Header bar */}
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          padding: '16px 22px', gap: 12, flexWrap: 'wrap',
          borderBottom: '1px solid rgba(255,255,255,0.05)',
          background: 'rgba(255,255,255,0.015)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 8, height: 8, borderRadius: 2,
              background: clientFilter === 'overdue' ? '#ff453a' : clientFilter === 'due_this_week' ? '#ff9f0a' : clientFilter === 'no_contact_7' ? '#ffd60a' : 'var(--accent)',
            }} />
            <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Client Drill-Down
            </span>
            <span style={{
              fontSize: 11, padding: '2px 10px', borderRadius: 20,
              background: 'rgba(255,255,255,0.06)', color: 'var(--text-secondary)',
              fontWeight: 600,
            }}>
              {loading ? '…' : `${total} total`}
            </span>
          </div>
          <button
            type="button"
            onClick={() => { window.location.href = fullResultsHref }}
            style={{
              fontSize: 12, color: 'var(--accent)', fontWeight: 700,
              background: 'rgba(0,122,255,0.08)', border: '1px solid rgba(0,122,255,0.2)',
              borderRadius: 8, padding: '6px 14px', cursor: 'pointer',
              transition: 'all 0.2s',
            }}
          >
            Open full view →
          </button>
        </div>

        {/* Filter pill */}
        <div style={{ padding: '12px 22px 8px', fontSize: 12, color: 'var(--text-secondary)' }}>
          Showing: <span style={{
            display: 'inline-block', padding: '2px 10px', borderRadius: 6,
            background: clientFilter === 'overdue' ? 'rgba(255,69,58,0.12)' : clientFilter === 'due_this_week' ? 'rgba(255,159,10,0.1)' : clientFilter === 'no_contact_7' ? 'rgba(255,214,10,0.1)' : 'rgba(0,122,255,0.1)',
            color: clientFilter === 'overdue' ? '#ff6b6b' : clientFilter === 'due_this_week' ? '#ffb340' : clientFilter === 'no_contact_7' ? '#ffe066' : 'var(--accent)',
            fontWeight: 700, fontSize: 11,
          }}>
            {clientFilter === 'all' ? 'Active Clients' : clientFilter === 'overdue' ? 'Overdue' : clientFilter === 'due_this_week' ? 'Due This Week' : 'No Contact 7+ Days'}
          </span>
        </div>

        {/* Client cards */}
        <div style={{ display: 'grid', gap: 6, maxHeight: 480, overflowY: 'auto', padding: '8px 16px 16px' }}>
          {clients.map((client, idx) => {
            const isUnassigned = !client.assigned_to
            return (
              <Link key={client.id} href={`/clients/${client.id}`} className="drilldown-row" style={{
                display: 'flex', alignItems: 'center', gap: 14, padding: '14px 16px',
                borderRadius: 14, textDecoration: 'none',
                background: 'linear-gradient(90deg, rgba(255,255,255,0.025) 0%, transparent 100%)',
                borderLeft: isUnassigned ? '3px solid rgba(255,69,58,0.5)' : '3px solid rgba(255,255,255,0.06)',
                transition: 'all 0.25s ease',
                opacity: 0, animation: `slideInRow 0.35s ${idx * 0.04}s ease forwards`,
              }}>
                {/* Avatar circle */}
                <div style={{
                  width: 38, height: 38, borderRadius: '50%',
                  background: `linear-gradient(135deg, hsl(${(client.last_name?.charCodeAt(0) ?? 0) * 7 % 360}, 50%, 35%) 0%, hsl(${(client.last_name?.charCodeAt(0) ?? 0) * 7 % 360}, 40%, 25%) 100%)`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 14, fontWeight: 800, color: 'rgba(255,255,255,0.85)',
                  flexShrink: 0,
                  boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.15)',
                }}>
                  {(client.first_name?.[0] ?? '')}{(client.last_name?.[0] ?? '')}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>
                    {client.last_name}{client.first_name ? `, ${client.first_name}` : ''}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 2, display: 'flex', gap: 8, alignItems: 'center' }}>
                    <span style={{ opacity: 0.6 }}>ID {client.client_id}</span>
                    <span style={{ width: 3, height: 3, borderRadius: '50%', background: 'var(--text-secondary)', opacity: 0.3 }} />
                    <span style={{ color: isUnassigned ? '#ff6b6b' : 'var(--text-secondary)' }}>
                      {client.profiles?.full_name ?? (isUnassigned ? 'Unassigned' : 'Unknown')}
                    </span>
                  </div>
                </div>
                <div style={{ fontSize: 16, color: 'var(--text-secondary)', opacity: 0.3, transition: 'all 0.2s' }}>→</div>
              </Link>
            )
          })}
          {!loading && clients.length === 0 && (
            <div style={{ fontSize: 13, color: 'var(--text-secondary)', padding: 20, textAlign: 'center' }}>No clients in this filter.</div>
          )}
        </div>

        {/* Pagination */}
        <div style={{
          display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 12,
          padding: '14px 22px', borderTop: '1px solid rgba(255,255,255,0.04)',
        }}>
          <button type="button" className="btn-secondary" style={{ fontSize: 12, minHeight: 32, borderRadius: 8 }}
            onClick={() => setClientPage(p => Math.max(0, p - 1))} disabled={clientPage === 0 || loading}>
            ← Previous
          </button>
          <span style={{ fontSize: 12, color: 'var(--text-secondary)', fontWeight: 600 }}>
            {clientPage + 1} / {Math.max(1, Math.ceil(total / 25))}
          </span>
          <button type="button" className="btn-secondary" style={{ fontSize: 12, minHeight: 32, borderRadius: 8 }}
            onClick={() => setClientPage(p => p + 1)} disabled={loading || (clientPage + 1) * 25 >= total}>
            Next →
          </button>
        </div>
      </div>

      {/* ─── Premium Planner Workload ─────────────────────────────────── */}
      <div ref={rosterRef} style={{ marginBottom: 24 }}>
        <div style={{
          borderRadius: 22, overflow: 'hidden',
          border: '1px solid rgba(255,255,255,0.05)',
          background: 'linear-gradient(160deg, rgba(255,255,255,0.02) 0%, rgba(255,255,255,0.005) 100%)',
        }}>
          <div style={{
            padding: '16px 22px',
            borderBottom: '1px solid rgba(255,255,255,0.05)',
            background: 'rgba(255,255,255,0.015)',
          }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Planner Workload
            </span>
          </div>
          <div style={{ padding: '12px 16px 16px', display: 'grid', gap: 8 }}>
            {plannerRows.filter(row => rosterFilter !== 'unassigned_planners' || !row.planner.team_manager_id).map((row, idx) => {
              const maxClients = Math.max(...plannerRows.map(r => r.clientCount), 1)
              const loadPct = Math.round((row.clientCount / maxClients) * 100)
              const hasIssues = row.overdue > 0 || row.quiet > 0
              return (
                <div key={row.planner.id} style={{
                  display: 'flex', alignItems: 'center', gap: 14, padding: '14px 16px',
                  borderRadius: 14,
                  background: hasIssues ? 'linear-gradient(90deg, rgba(255,69,58,0.04) 0%, transparent 100%)' : 'rgba(255,255,255,0.015)',
                  borderLeft: `3px solid ${row.overdue >= 3 ? '#ff453a' : row.overdue >= 1 ? '#ff9f0a' : '#30d158'}`,
                  opacity: 0, animation: `slideInRow 0.35s ${idx * 0.06}s ease forwards`,
                  transition: 'background 0.2s',
                }}>
                  {/* Avatar */}
                  <div style={{
                    width: 38, height: 38, borderRadius: '50%',
                    background: `linear-gradient(135deg, hsl(${(row.planner.full_name?.charCodeAt(0) ?? 0) * 11 % 360}, 45%, 35%), hsl(${(row.planner.full_name?.charCodeAt(0) ?? 0) * 11 % 360}, 35%, 25%))`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 13, fontWeight: 800, color: 'rgba(255,255,255,0.85)', flexShrink: 0,
                    boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.15)',
                  }}>
                    {(row.planner.full_name ?? '?').split(' ').map(n => n[0]).join('').slice(0, 2)}
                  </div>

                  {/* Name + manager */}
                  <div style={{ flex: '0 0 140px', minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>
                      {row.planner.full_name ?? 'Unknown'}
                    </div>
                    <div style={{ fontSize: 10, color: 'var(--text-secondary)', marginTop: 1 }}>
                      TM: {row.teamManager?.full_name ?? 'Unassigned'}
                    </div>
                  </div>

                  {/* Load bar */}
                  <div style={{ flex: 1, minWidth: 60 }}>
                    <div style={{ height: 6, borderRadius: 3, background: 'rgba(255,255,255,0.06)', overflow: 'hidden' }}>
                      <div style={{
                        height: '100%', borderRadius: 3,
                        width: `${loadPct}%`,
                        background: row.overdue >= 3 ? 'linear-gradient(90deg, #ff453a, #ff6b5a)' : row.overdue >= 1 ? 'linear-gradient(90deg, #ff9f0a, #ffb340)' : 'linear-gradient(90deg, #30d158, #4ade80)',
                        transition: 'width 1s ease',
                        boxShadow: `0 0 6px ${row.overdue >= 3 ? '#ff453a30' : row.overdue >= 1 ? '#ff9f0a30' : '#30d15830'}`,
                      }} />
                    </div>
                    <div style={{ fontSize: 10, color: 'var(--text-secondary)', marginTop: 3 }}>
                      {row.clientCount} client{row.clientCount !== 1 ? 's' : ''}
                    </div>
                  </div>

                  {/* Metric chips with hover tooltips */}
                  <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                    <div className="metric-chip-wrap" style={{ position: 'relative' }}>
                      <Link href={teamLink('overdue', row.planner.id)} className="metric-chip" style={{
                        textDecoration: 'none', display: 'block',
                        fontSize: 12, fontWeight: 800, padding: '4px 10px', borderRadius: 8, minWidth: 32, textAlign: 'center',
                        background: row.overdue > 0 ? 'rgba(255,69,58,0.15)' : 'rgba(255,255,255,0.04)',
                        color: row.overdue > 0 ? '#ff6b6b' : 'var(--text-secondary)',
                        border: `1px solid ${row.overdue > 0 ? 'rgba(255,69,58,0.2)' : 'transparent'}`,
                        transition: 'all 0.2s',
                      }}>
                        {row.overdue}
                      </Link>
                      <div className="metric-chip-tooltip" style={{
                        position: 'absolute', bottom: 'calc(100% + 8px)', left: '50%', transform: 'translateX(-50%)',
                        padding: '6px 12px', borderRadius: 10, whiteSpace: 'nowrap', pointerEvents: 'none',
                        background: 'linear-gradient(160deg, rgba(60,20,25,0.98), rgba(40,12,18,0.98))',
                        border: '1px solid rgba(255,69,58,0.3)', boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
                        fontSize: 11, fontWeight: 600, color: '#ff9090', zIndex: 50,
                      }}>
                        <span style={{ color: '#fff', fontWeight: 800 }}>{row.overdue}</span> overdue deadline{row.overdue !== 1 ? 's' : ''}
                        <div style={{ position: 'absolute', bottom: -5, left: '50%', transform: 'translateX(-50%) rotate(45deg)', width: 8, height: 8, background: 'rgba(40,12,18,0.98)', borderRight: '1px solid rgba(255,69,58,0.3)', borderBottom: '1px solid rgba(255,69,58,0.3)' }} />
                      </div>
                    </div>
                    <div className="metric-chip-wrap" style={{ position: 'relative' }}>
                      <Link href={teamLink('due_this_week', row.planner.id)} className="metric-chip" style={{
                        textDecoration: 'none', display: 'block',
                        fontSize: 12, fontWeight: 800, padding: '4px 10px', borderRadius: 8, minWidth: 32, textAlign: 'center',
                        background: row.dueThisWeek > 0 ? 'rgba(255,159,10,0.12)' : 'rgba(255,255,255,0.04)',
                        color: row.dueThisWeek > 0 ? '#ffb340' : 'var(--text-secondary)',
                        border: `1px solid ${row.dueThisWeek > 0 ? 'rgba(255,159,10,0.2)' : 'transparent'}`,
                        transition: 'all 0.2s',
                      }}>
                        {row.dueThisWeek}
                      </Link>
                      <div className="metric-chip-tooltip" style={{
                        position: 'absolute', bottom: 'calc(100% + 8px)', left: '50%', transform: 'translateX(-50%)',
                        padding: '6px 12px', borderRadius: 10, whiteSpace: 'nowrap', pointerEvents: 'none',
                        background: 'linear-gradient(160deg, rgba(50,40,15,0.98), rgba(35,28,10,0.98))',
                        border: '1px solid rgba(255,159,10,0.3)', boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
                        fontSize: 11, fontWeight: 600, color: '#ffc870', zIndex: 50,
                      }}>
                        <span style={{ color: '#fff', fontWeight: 800 }}>{row.dueThisWeek}</span> due this week
                        <div style={{ position: 'absolute', bottom: -5, left: '50%', transform: 'translateX(-50%) rotate(45deg)', width: 8, height: 8, background: 'rgba(35,28,10,0.98)', borderRight: '1px solid rgba(255,159,10,0.3)', borderBottom: '1px solid rgba(255,159,10,0.3)' }} />
                      </div>
                    </div>
                    <div className="metric-chip-wrap" style={{ position: 'relative' }}>
                      <Link href={teamLink('no_contact_7', row.planner.id)} className="metric-chip" style={{
                        textDecoration: 'none', display: 'block',
                        fontSize: 12, fontWeight: 800, padding: '4px 10px', borderRadius: 8, minWidth: 32, textAlign: 'center',
                        background: row.quiet > 0 ? 'rgba(255,214,10,0.1)' : 'rgba(255,255,255,0.04)',
                        color: row.quiet > 0 ? '#ffe066' : 'var(--text-secondary)',
                        border: `1px solid ${row.quiet > 0 ? 'rgba(255,214,10,0.15)' : 'transparent'}`,
                        transition: 'all 0.2s',
                      }}>
                        {row.quiet}
                      </Link>
                      <div className="metric-chip-tooltip" style={{
                        position: 'absolute', bottom: 'calc(100% + 8px)', left: '50%', transform: 'translateX(-50%)',
                        padding: '6px 12px', borderRadius: 10, whiteSpace: 'nowrap', pointerEvents: 'none',
                        background: 'linear-gradient(160deg, rgba(50,50,15,0.98), rgba(35,35,10,0.98))',
                        border: '1px solid rgba(255,214,10,0.25)', boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
                        fontSize: 11, fontWeight: 600, color: '#ffe88a', zIndex: 50,
                      }}>
                        <span style={{ color: '#fff', fontWeight: 800 }}>{row.quiet}</span> no contact 7+ days
                        <div style={{ position: 'absolute', bottom: -5, left: '50%', transform: 'translateX(-50%) rotate(45deg)', width: 8, height: 8, background: 'rgba(35,35,10,0.98)', borderRight: '1px solid rgba(255,214,10,0.25)', borderBottom: '1px solid rgba(255,214,10,0.25)' }} />
                      </div>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
          {/* Legend */}
          <div style={{ padding: '10px 22px 14px', borderTop: '1px solid rgba(255,255,255,0.04)', display: 'flex', gap: 16, fontSize: 10, color: 'var(--text-secondary)' }}>
            <span><span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 2, background: '#ff6b6b', marginRight: 4, verticalAlign: 'middle' }} />Overdue</span>
            <span><span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 2, background: '#ffb340', marginRight: 4, verticalAlign: 'middle' }} />Due This Week</span>
            <span><span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 2, background: '#ffe066', marginRight: 4, verticalAlign: 'middle' }} />No Contact 7+</span>
          </div>
        </div>
      </div>

      {/* ─── Premium Team Roster ──────────────────────────────────────── */}
      <div style={{
        marginBottom: 24, borderRadius: 22, overflow: 'hidden',
        border: '1px solid rgba(255,255,255,0.05)',
        background: 'linear-gradient(160deg, rgba(255,255,255,0.02) 0%, rgba(255,255,255,0.005) 100%)',
      }}>
        <div style={{
          padding: '16px 22px',
          borderBottom: '1px solid rgba(255,255,255,0.05)',
          background: 'rgba(255,255,255,0.015)',
        }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Team Roster
          </span>
        </div>
        <div style={{ padding: '12px 16px 16px', display: 'grid', gap: 6 }}>
          {filteredPlanners.map((planner, idx) => {
            const tm = teamManagers.find(m => m.id === planner.team_manager_id)
            const clientCount = summaryByAssignee?.[planner.id]?.total_clients ?? 0
            return (
              <div key={planner.id} style={{
                display: 'flex', alignItems: 'center', gap: 14, padding: '12px 16px',
                borderRadius: 14, background: 'rgba(255,255,255,0.015)',
                opacity: 0, animation: `slideInRow 0.35s ${idx * 0.05}s ease forwards`,
                transition: 'background 0.2s',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.04)' }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.015)' }}
              >
                <div style={{
                  width: 36, height: 36, borderRadius: '50%',
                  background: `linear-gradient(135deg, hsl(${(planner.full_name?.charCodeAt(0) ?? 0) * 11 % 360}, 45%, 35%), hsl(${(planner.full_name?.charCodeAt(0) ?? 0) * 11 % 360}, 35%, 25%))`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 12, fontWeight: 800, color: 'rgba(255,255,255,0.85)', flexShrink: 0,
                }}>
                  {(planner.full_name ?? '?').split(' ').map(n => n[0]).join('').slice(0, 2)}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>{planner.full_name ?? 'Unknown'}</div>
                  <div style={{ fontSize: 10, color: 'var(--text-secondary)', marginTop: 1 }}>
                    TM: {tm?.full_name ?? <span style={{ color: '#ff9f0a' }}>Unassigned</span>}
                  </div>
                </div>
                <span style={{
                  fontSize: 10, fontWeight: 700, padding: '3px 10px', borderRadius: 20,
                  background: 'rgba(48,209,88,0.1)', color: '#30d158',
                  textTransform: 'uppercase', letterSpacing: '0.06em',
                }}>
                  Support Planner
                </span>
                <Link href={teamLink('all', planner.id)} style={{
                  textDecoration: 'none', fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)',
                  padding: '4px 10px', borderRadius: 8, background: 'rgba(255,255,255,0.04)',
                }}>
                  {clientCount} client{clientCount !== 1 ? 's' : ''}
                </Link>
              </div>
            )
          })}
          {filteredTeamManagers.map((manager, idx) => (
            <div key={manager.id} style={{
              display: 'flex', alignItems: 'center', gap: 14, padding: '12px 16px',
              borderRadius: 14, background: 'rgba(255,159,10,0.03)',
              borderLeft: '3px solid rgba(255,159,10,0.3)',
              opacity: 0, animation: `slideInRow 0.35s ${(filteredPlanners.length + idx) * 0.05}s ease forwards`,
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,159,10,0.06)' }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(255,159,10,0.03)' }}
            >
              <div style={{
                width: 36, height: 36, borderRadius: '50%',
                background: 'linear-gradient(135deg, #4a3818, #352a12)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 12, fontWeight: 800, color: 'rgba(255,255,255,0.85)', flexShrink: 0,
              }}>
                {(manager.full_name ?? '?').split(' ').map(n => n[0]).join('').slice(0, 2)}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>{manager.full_name ?? 'Unknown'}</div>
              </div>
              <span style={{
                fontSize: 10, fontWeight: 700, padding: '3px 10px', borderRadius: 20,
                background: 'rgba(255,159,10,0.12)', color: '#ff9f0a',
                textTransform: 'uppercase', letterSpacing: '0.06em',
              }}>
                Team Manager
              </span>
              <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)', padding: '4px 10px', borderRadius: 8, background: 'rgba(255,255,255,0.04)' }}>
                {planners.filter(p => p.team_manager_id === manager.id).length} planner{planners.filter(p => p.team_manager_id === manager.id).length !== 1 ? 's' : ''}
              </span>
            </div>
          ))}
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

      {/* Mobile responsive overrides */}
      <style>{`
        @media (max-width: 768px) {
          .scp-hero-row {
            flex-direction: column !important;
          }
          .scp-hero-welcome {
            flex: 1 1 auto !important;
            min-height: auto !important;
          }
          .scp-two-col {
            grid-template-columns: 1fr !important;
          }
          .premium-stat-card {
            min-height: 100px !important;
          }
        }
      `}</style>
    </div>
  )
}
