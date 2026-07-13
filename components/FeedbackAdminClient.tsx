'use client'

// FeedbackAdminClient — triage surface for tester feedback (see
// app/admin/feedback/page.tsx for the access model). Follows AdminClient's
// inline-style conventions and the shared CSS theme variables.

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { getRoleLabel } from '@/lib/roles'

export interface FeedbackReport {
  id: string
  created_at: string
  updated_at: string
  user_id: string
  author_name: string | null
  author_role: string | null
  type: 'bug' | 'suggestion' | 'question'
  severity: 'blocking' | 'annoying' | 'minor' | null
  message: string
  page_path: string | null
  app_commit: string | null
  user_agent: string | null
  viewport: string | null
  status: 'new' | 'in_progress' | 'resolved' | 'confirmed' | 'reopened' | 'wont_fix'
  resolution_note: string | null
  resolved_by: string | null
  resolved_at: string | null
  // Response-loop fields (azure_feedback_close_loop.sql) — optional so rows
  // render fine during the migration window.
  assigned_to?: string | null
  assigned_to_name?: string | null
  reporter_note?: string | null
  confirmed_at?: string | null
  reopen_count?: number
}

interface Assignee {
  id: string
  full_name: string | null
  role: string | null
}

type StatusFilter = 'new' | 'reopened' | 'in_progress' | 'resolved' | 'confirmed' | 'wont_fix' | 'all'
type TypeFilter = 'all' | 'bug' | 'suggestion' | 'question'

const STATUS_LABELS: Record<FeedbackReport['status'], string> = {
  new: 'New',
  in_progress: 'In progress',
  resolved: 'Resolved',
  confirmed: 'Confirmed ✓',
  reopened: 'Reopened',
  wont_fix: "Won't fix",
}

const STATUS_COLORS: Record<FeedbackReport['status'], string> = {
  new: 'var(--accent)',
  in_progress: 'var(--orange)',
  resolved: 'var(--green)',
  confirmed: '#30d158',
  reopened: 'var(--red)',
  wont_fix: 'var(--text-secondary)',
}

const SEVERITY_COLORS: Record<string, string> = {
  blocking: 'var(--red)',
  annoying: 'var(--orange)',
  minor: 'var(--text-secondary)',
}

const TYPE_META: Record<FeedbackReport['type'], { label: string; icon: string }> = {
  bug: { label: 'Bug', icon: '🐞' },
  suggestion: { label: 'Suggestion', icon: '💡' },
  question: { label: 'Question', icon: '❓' },
}

function timeAgo(iso: string): string {
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return ''
  const mins = Math.floor((Date.now() - then) / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 14) return `${days}d ago`
  return new Date(iso).toLocaleDateString()
}

export default function FeedbackAdminClient({
  initialReports,
  unavailable,
}: {
  initialReports: FeedbackReport[]
  unavailable?: boolean
}) {
  const [reports, setReports] = useState<FeedbackReport[]>(initialReports)
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('new')
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all')
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [noteDrafts, setNoteDrafts] = useState<Record<string, string>>({})
  const [savingId, setSavingId] = useState<string | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [assignees, setAssignees] = useState<Assignee[]>([])

  // Triager candidates for the assignment dropdown (best-effort).
  useEffect(() => {
    let cancelled = false
    fetch('/api/feedback?assignees=1')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!cancelled && Array.isArray(d?.assignees)) setAssignees(d.assignees as Assignee[])
      })
      .catch(() => { /* dropdown just stays empty */ })
    return () => { cancelled = true }
  }, [])

  const counts = useMemo(() => {
    const c: Record<StatusFilter, number> = {
      new: 0, reopened: 0, in_progress: 0, resolved: 0, confirmed: 0, wont_fix: 0,
      all: reports.length,
    }
    for (const r of reports) if (c[r.status] !== undefined) c[r.status] += 1
    return c
  }, [reports])

  const visible = useMemo(
    () =>
      reports.filter(
        (r) =>
          (statusFilter === 'all' || r.status === statusFilter) &&
          (typeFilter === 'all' || r.type === typeFilter),
      ),
    [reports, statusFilter, typeFilter],
  )

  const setStatus = async (
    report: FeedbackReport,
    status: 'new' | 'in_progress' | 'resolved' | 'wont_fix',
  ) => {
    setSavingId(report.id)
    setSaveError(null)
    try {
      const res = await fetch(`/api/feedback/${report.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status,
          resolution_note: noteDrafts[report.id] ?? report.resolution_note ?? null,
        }),
      })
      const d = await res.json().catch(() => null)
      if (!res.ok) throw new Error(d?.error ?? 'Update failed')
      // The PATCH returns the full row — merge it so response-loop fields
      // (reporter_note, reopen_count, assignment) stay current too.
      setReports((prev) =>
        prev.map((r) =>
          r.id === report.id ? { ...r, ...(d?.report as Partial<FeedbackReport> | undefined) } : r,
        ),
      )
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : 'Update failed')
    } finally {
      setSavingId(null)
    }
  }

  const setAssignee = async (report: FeedbackReport, assignedTo: string | null) => {
    setSavingId(report.id)
    setSaveError(null)
    try {
      const res = await fetch(`/api/feedback/${report.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ assigned_to: assignedTo }),
      })
      const d = await res.json().catch(() => null)
      if (!res.ok) throw new Error(d?.error ?? 'Assignment failed')
      setReports((prev) =>
        prev.map((r) =>
          r.id === report.id ? { ...r, ...(d?.report as Partial<FeedbackReport> | undefined) } : r,
        ),
      )
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : 'Assignment failed')
    } finally {
      setSavingId(null)
    }
  }

  const filterTabs: { value: StatusFilter; label: string }[] = [
    { value: 'new', label: `New (${counts.new})` },
    { value: 'reopened', label: `Reopened (${counts.reopened})` },
    { value: 'in_progress', label: `In progress (${counts.in_progress})` },
    { value: 'resolved', label: `Awaiting confirm (${counts.resolved})` },
    { value: 'confirmed', label: `Confirmed (${counts.confirmed})` },
    { value: 'wont_fix', label: `Won't fix (${counts.wont_fix})` },
    { value: 'all', label: `All (${counts.all})` },
  ]

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', paddingBottom: 80 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>📮 Feedback &amp; Issues</h1>
        <Link
          href="/admin"
          style={{
            fontSize: 13, color: 'var(--accent)', textDecoration: 'none',
            padding: '6px 12px', border: '1px solid var(--border)', borderRadius: 6,
          }}
        >
          ← Admin Panel
        </Link>
      </div>

      {unavailable && (
        <div style={{
          padding: '12px 16px', borderRadius: 10, marginBottom: 16, fontSize: 13,
          border: '1px solid var(--orange)', color: 'var(--orange)',
        }}>
          Feedback storage is unavailable — the Azure data plane could not be reached, or the
          feedback_reports migration has not been applied yet.
        </div>
      )}

      <div style={{ display: 'flex', gap: 6, marginBottom: 14, flexWrap: 'wrap', alignItems: 'center' }}>
        {filterTabs.map((t) => {
          const active = statusFilter === t.value
          return (
            <button
              key={t.value}
              onClick={() => setStatusFilter(t.value)}
              style={{
                padding: '6px 12px', borderRadius: 999, fontSize: 12.5, fontWeight: 600, cursor: 'pointer',
                background: active ? 'rgba(30,124,255,0.16)' : 'transparent',
                border: `1px solid ${active ? 'var(--accent)' : 'var(--border)'}`,
                color: active ? 'var(--accent)' : 'var(--text-secondary)',
              }}
            >
              {t.label}
            </button>
          )
        })}
        <div style={{ flex: 1 }} />
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value as TypeFilter)}
          style={{
            padding: '6px 10px', borderRadius: 8, fontSize: 12.5,
            background: 'var(--surface)', color: 'var(--text)', border: '1px solid var(--border)',
          }}
        >
          <option value="all">All types</option>
          <option value="bug">Bugs</option>
          <option value="suggestion">Suggestions</option>
          <option value="question">Questions</option>
        </select>
      </div>

      {saveError && (
        <div style={{ marginBottom: 12, fontSize: 12.5, color: 'var(--red)' }}>{saveError}</div>
      )}

      {visible.length === 0 ? (
        <div style={{
          padding: '40px 20px', textAlign: 'center', fontSize: 13.5,
          color: 'var(--text-secondary)', border: '1px dashed var(--border)', borderRadius: 12,
        }}>
          {statusFilter === 'new'
            ? 'No new reports — inbox zero. 🎉'
            : 'Nothing here for this filter.'}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {visible.map((r) => {
            const expanded = expandedId === r.id
            const tm = TYPE_META[r.type]
            return (
              <div
                key={r.id}
                style={{
                  border: '1px solid var(--border)', borderRadius: 12,
                  background: 'var(--surface)', overflow: 'hidden',
                }}
              >
                <button
                  onClick={() => setExpandedId(expanded ? null : r.id)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10, width: '100%',
                    padding: '12px 14px', background: 'transparent', border: 'none',
                    cursor: 'pointer', textAlign: 'left', color: 'var(--text)',
                  }}
                >
                  <span title={tm.label} style={{ fontSize: 16 }}>{tm.icon}</span>
                  {r.type === 'bug' && r.severity && (
                    <span style={{
                      fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em',
                      padding: '2px 8px', borderRadius: 999,
                      border: `1px solid ${SEVERITY_COLORS[r.severity]}`,
                      color: SEVERITY_COLORS[r.severity],
                      flexShrink: 0,
                    }}>
                      {r.severity}
                    </span>
                  )}
                  <span style={{
                    flex: 1, fontSize: 13.5, minWidth: 0,
                    overflow: 'hidden', textOverflow: 'ellipsis',
                    whiteSpace: expanded ? 'normal' : 'nowrap',
                  }}>
                    {r.message}
                  </span>
                  {(r.reopen_count ?? 0) > 1 && (
                    <span style={{
                      fontSize: 10.5, fontWeight: 700, padding: '2px 6px', borderRadius: 999,
                      border: '1px solid var(--red)', color: 'var(--red)', flexShrink: 0,
                    }} title={`Reopened ${r.reopen_count} times`}>
                      ×{r.reopen_count}
                    </span>
                  )}
                  <span style={{
                    fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 999,
                    border: `1px solid ${STATUS_COLORS[r.status] ?? 'var(--border)'}`,
                    color: STATUS_COLORS[r.status] ?? 'var(--text-secondary)',
                    flexShrink: 0,
                  }}>
                    {STATUS_LABELS[r.status] ?? r.status}
                  </span>
                  {r.assigned_to_name && (
                    <span style={{
                      fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 999,
                      background: 'var(--surface-2, rgba(255,255,255,0.06))',
                      border: '1px solid var(--border)', color: 'var(--text-secondary)',
                      flexShrink: 0, whiteSpace: 'nowrap',
                    }} title={`Assigned to ${r.assigned_to_name}`}>
                      → {r.assigned_to_name}
                    </span>
                  )}
                  <span style={{ fontSize: 11.5, color: 'var(--text-secondary)', flexShrink: 0, whiteSpace: 'nowrap' }}>
                    {r.author_name ?? 'Unknown'} · {timeAgo(r.created_at)}
                  </span>
                </button>

                {expanded && (
                  <div style={{ padding: '0 14px 14px', borderTop: '1px solid var(--border)' }}>
                    <div style={{
                      display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                      gap: '6px 16px', padding: '12px 0', fontSize: 12, color: 'var(--text-secondary)',
                    }}>
                      <div><strong style={{ color: 'var(--text)' }}>Reporter:</strong> {r.author_name ?? '—'} ({getRoleLabel(r.author_role)})</div>
                      <div><strong style={{ color: 'var(--text)' }}>Page:</strong> {r.page_path ?? '—'}</div>
                      <div><strong style={{ color: 'var(--text)' }}>Build:</strong> {r.app_commit ? r.app_commit.slice(0, 7) : '—'} · {r.viewport ?? '—'}</div>
                      <div><strong style={{ color: 'var(--text)' }}>Filed:</strong> {new Date(r.created_at).toLocaleString()}</div>
                    </div>
                    {r.user_agent && (
                      <div style={{ fontSize: 11.5, color: 'var(--text-secondary)', marginBottom: 10, wordBreak: 'break-all' }}>
                        {r.user_agent}
                      </div>
                    )}

                    {r.reporter_note && (
                      <div style={{
                        marginBottom: 10, padding: '8px 12px', borderRadius: 8,
                        borderLeft: `3px solid ${r.status === 'confirmed' ? 'var(--green)' : 'var(--red)'}`,
                        background: 'var(--bg)', fontSize: 12.5, lineHeight: 1.5,
                        color: 'var(--text)', whiteSpace: 'pre-wrap',
                      }}>
                        <strong style={{ color: r.status === 'confirmed' ? 'var(--green)' : 'var(--red)' }}>
                          {r.status === 'confirmed' ? 'Reporter confirmed:' : 'Reporter says it’s still broken:'}
                        </strong>{' '}
                        {r.reporter_note}
                      </div>
                    )}

                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                      <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Assigned to</span>
                      <select
                        value={r.assigned_to ?? ''}
                        disabled={savingId === r.id}
                        onChange={(e) => setAssignee(r, e.target.value || null)}
                        style={{
                          padding: '6px 10px', borderRadius: 8, fontSize: 12.5,
                          background: 'var(--bg)', color: 'var(--text)', border: '1px solid var(--border)',
                          cursor: savingId === r.id ? 'wait' : 'pointer',
                        }}
                      >
                        <option value="">Unassigned</option>
                        {assignees.map((a) => (
                          <option key={a.id} value={a.id}>
                            {a.full_name ?? a.id}{a.role ? ` (${getRoleLabel(a.role)})` : ''}
                          </option>
                        ))}
                        {/* Keep a stale assignment visible even if the assignee
                            list didn't load or no longer includes them. */}
                        {r.assigned_to && !assignees.some((a) => a.id === r.assigned_to) && (
                          <option value={r.assigned_to}>{r.assigned_to_name ?? 'Assigned user'}</option>
                        )}
                      </select>
                    </div>

                    <textarea
                      value={noteDrafts[r.id] ?? r.resolution_note ?? ''}
                      onChange={(e) =>
                        setNoteDrafts((prev) => ({ ...prev, [r.id]: e.target.value.slice(0, 1000) }))
                      }
                      placeholder="Resolution note (optional — saved with the next status change)"
                      rows={2}
                      style={{
                        width: '100%', boxSizing: 'border-box', padding: '8px 10px',
                        borderRadius: 8, fontSize: 12.5, fontFamily: 'inherit', resize: 'vertical',
                        background: 'var(--bg)', color: 'var(--text)', border: '1px solid var(--border)',
                        marginBottom: 10,
                      }}
                    />

                    {r.status === 'confirmed' ? (
                      <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                        Closed — the reporter confirmed the fix{r.confirmed_at ? ` ${timeAgo(r.confirmed_at)}` : ''}. Nothing left to do. 🎉
                      </div>
                    ) : (
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        {r.status !== 'in_progress' && (
                          <TriageButton label="Mark in progress" color="var(--orange)" disabled={savingId === r.id} onClick={() => setStatus(r, 'in_progress')} />
                        )}
                        {r.status !== 'resolved' && (
                          <TriageButton
                            label={r.status === 'reopened' ? 'Resolve again (re-notifies reporter)' : 'Resolve (notifies reporter)'}
                            color="var(--green)"
                            disabled={savingId === r.id}
                            onClick={() => setStatus(r, 'resolved')}
                          />
                        )}
                        {r.status !== 'wont_fix' && (
                          <TriageButton label="Won't fix (notifies reporter)" color="var(--text-secondary)" disabled={savingId === r.id} onClick={() => setStatus(r, 'wont_fix')} />
                        )}
                        {r.status !== 'new' && (
                          <TriageButton label="Back to new" color="var(--accent)" disabled={savingId === r.id} onClick={() => setStatus(r, 'new')} />
                        )}
                        {savingId === r.id && (
                          <span style={{ fontSize: 12, color: 'var(--text-secondary)', alignSelf: 'center' }}>Saving…</span>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function TriageButton({
  label,
  color,
  disabled,
  onClick,
}: {
  label: string
  color: string
  disabled: boolean
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        padding: '6px 12px', borderRadius: 8, fontSize: 12, fontWeight: 600,
        cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.6 : 1,
        background: 'transparent', border: `1px solid ${color}`, color,
      }}
    >
      {label}
    </button>
  )
}
