'use client'

// FeedbackAdminClient — triage surface for tester feedback (see
// app/admin/feedback/page.tsx for the access model). Follows AdminClient's
// inline-style conventions and the shared CSS theme variables.

import { useMemo, useState } from 'react'
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
  status: 'new' | 'in_progress' | 'resolved' | 'wont_fix'
  resolution_note: string | null
  resolved_by: string | null
  resolved_at: string | null
}

type StatusFilter = 'new' | 'in_progress' | 'resolved' | 'wont_fix' | 'all'
type TypeFilter = 'all' | 'bug' | 'suggestion' | 'question'

const STATUS_LABELS: Record<FeedbackReport['status'], string> = {
  new: 'New',
  in_progress: 'In progress',
  resolved: 'Resolved',
  wont_fix: "Won't fix",
}

const STATUS_COLORS: Record<FeedbackReport['status'], string> = {
  new: 'var(--accent)',
  in_progress: 'var(--orange)',
  resolved: 'var(--green)',
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

  const counts = useMemo(() => {
    const c: Record<StatusFilter, number> = { new: 0, in_progress: 0, resolved: 0, wont_fix: 0, all: reports.length }
    for (const r of reports) c[r.status] += 1
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

  const setStatus = async (report: FeedbackReport, status: FeedbackReport['status']) => {
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
      setReports((prev) =>
        prev.map((r) =>
          r.id === report.id
            ? {
                ...r,
                status,
                resolution_note: (d?.report?.resolution_note as string | null) ?? null,
                resolved_by: (d?.report?.resolved_by as string | null) ?? null,
                resolved_at: (d?.report?.resolved_at as string | null) ?? null,
              }
            : r,
        ),
      )
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : 'Update failed')
    } finally {
      setSavingId(null)
    }
  }

  const filterTabs: { value: StatusFilter; label: string }[] = [
    { value: 'new', label: `New (${counts.new})` },
    { value: 'in_progress', label: `In progress (${counts.in_progress})` },
    { value: 'resolved', label: `Resolved (${counts.resolved})` },
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
                  <span style={{
                    fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 999,
                    border: `1px solid ${STATUS_COLORS[r.status]}`, color: STATUS_COLORS[r.status],
                    flexShrink: 0,
                  }}>
                    {STATUS_LABELS[r.status]}
                  </span>
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

                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      {r.status !== 'in_progress' && (
                        <TriageButton label="Mark in progress" color="var(--orange)" disabled={savingId === r.id} onClick={() => setStatus(r, 'in_progress')} />
                      )}
                      {r.status !== 'resolved' && (
                        <TriageButton label="Resolve" color="var(--green)" disabled={savingId === r.id} onClick={() => setStatus(r, 'resolved')} />
                      )}
                      {r.status !== 'wont_fix' && (
                        <TriageButton label="Won't fix" color="var(--text-secondary)" disabled={savingId === r.id} onClick={() => setStatus(r, 'wont_fix')} />
                      )}
                      {r.status !== 'new' && (
                        <TriageButton label="Reopen" color="var(--accent)" disabled={savingId === r.id} onClick={() => setStatus(r, 'new')} />
                      )}
                      {savingId === r.id && (
                        <span style={{ fontSize: 12, color: 'var(--text-secondary)', alignSelf: 'center' }}>Saving…</span>
                      )}
                    </div>
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
