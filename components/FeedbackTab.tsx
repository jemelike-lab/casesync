'use client'

// FeedbackTab — tester feedback / issue reporting entry point + response loop.
//
// A slim glass tab pinned to the right edge (mid-height, every authenticated
// page, CaseSync AND Workryn) opening a compact modal with two views:
//   * New report — file a bug/suggestion/question. Diagnostic context is
//     captured automatically: the client sends page_path + viewport; the API
//     adds build SHA + user agent server-side. Reports land in
//     feedback_reports on the Azure plane (owner-insert RLS).
//   * My reports — the reporter's own reports with live status. When triage
//     marks a report Resolved, the reporter confirms the fix here ("It's
//     fixed" → confirmed) or bounces it back ("Still broken" → reopened,
//     which re-queues it and pings the triage inbox).
//
// An amber dot on the edge tab means ≥1 of the user's reports is awaiting
// their confirmation (cached in sessionStorage for 5 min to keep the check
// off the hot path). Arriving with ?feedback=mine (from the resolution
// email) auto-opens the My reports view.
//
// Placement: top 45% right edge — well clear of Casey's launcher (bottom
// right, zIndex 600). This tab sits at zIndex 590 so Casey's open panel
// always wins.

import { useCallback, useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'

type FeedbackType = 'bug' | 'suggestion' | 'question'
type FeedbackSeverity = 'blocking' | 'annoying' | 'minor'
type ReportStatus = 'new' | 'in_progress' | 'resolved' | 'confirmed' | 'reopened' | 'wont_fix'
type View = 'compose' | 'mine'

interface MyReport {
  id: string
  created_at: string
  type: FeedbackType
  severity: FeedbackSeverity | null
  message: string
  page_path: string | null
  status: ReportStatus
  resolution_note: string | null
  reporter_note?: string | null
}

const TYPE_OPTIONS: { value: FeedbackType; label: string; icon: string }[] = [
  { value: 'bug', label: 'Bug', icon: '🐞' },
  { value: 'suggestion', label: 'Suggestion', icon: '💡' },
  { value: 'question', label: 'Question', icon: '❓' },
]

const SEVERITY_OPTIONS: { value: FeedbackSeverity; label: string; color: string }[] = [
  { value: 'blocking', label: 'Blocking me', color: 'var(--red)' },
  { value: 'annoying', label: 'Annoying', color: 'var(--orange)' },
  { value: 'minor', label: 'Minor', color: 'var(--text-secondary)' },
]

const STATUS_META: Record<ReportStatus, { label: string; color: string }> = {
  new: { label: 'Received', color: 'var(--accent)' },
  in_progress: { label: 'In progress', color: 'var(--orange)' },
  resolved: { label: 'Resolved — confirm?', color: 'var(--green)' },
  confirmed: { label: 'Confirmed ✓', color: 'var(--green)' },
  reopened: { label: 'Reopened', color: 'var(--red)' },
  wont_fix: { label: 'Closed', color: 'var(--text-secondary)' },
}

const MAX_MESSAGE = 2000
const AWAIT_CACHE_KEY = 'cs-fb-awaiting'
const AWAIT_CACHE_TTL_MS = 5 * 60 * 1000

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

export default function FeedbackTab() {
  const pathname = usePathname() ?? ''
  const [open, setOpen] = useState(false)
  const [view, setView] = useState<View>('compose')
  const [type, setType] = useState<FeedbackType>('bug')
  const [severity, setSeverity] = useState<FeedbackSeverity>('annoying')
  const [message, setMessage] = useState('')
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // My reports state.
  const [mine, setMine] = useState<MyReport[] | null>(null)
  const [mineLoading, setMineLoading] = useState(false)
  const [mineError, setMineError] = useState<string | null>(null)
  const [respondingId, setRespondingId] = useState<string | null>(null)
  const [reopenDraftId, setReopenDraftId] = useState<string | null>(null)
  const [reopenNote, setReopenNote] = useState('')
  const [awaiting, setAwaiting] = useState(0)

  const close = useCallback(() => {
    setOpen(false)
    setError(null)
    setSending(false)
    setReopenDraftId(null)
    setReopenNote('')
  }, [])

  const refreshAwaitingDot = useCallback((reports: MyReport[]) => {
    const count = reports.filter((r) => r.status === 'resolved').length
    setAwaiting(count)
    try {
      sessionStorage.setItem(AWAIT_CACHE_KEY, JSON.stringify({ count, at: Date.now() }))
    } catch { /* private mode etc. — dot just won't cache */ }
  }, [])

  const loadMine = useCallback(async () => {
    setMineLoading(true)
    setMineError(null)
    try {
      const res = await fetch('/api/feedback?mine=1')
      const d = await res.json().catch(() => null)
      if (!res.ok) throw new Error(d?.error ?? 'Could not load your reports.')
      const reports = (d?.reports ?? []) as MyReport[]
      setMine(reports)
      refreshAwaitingDot(reports)
    } catch (e) {
      setMineError(e instanceof Error ? e.message : 'Could not load your reports.')
    } finally {
      setMineLoading(false)
    }
  }, [refreshAwaitingDot])

  // Awaiting-confirmation dot: cheap cached check on mount.
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(AWAIT_CACHE_KEY)
      if (raw) {
        const cached = JSON.parse(raw) as { count: number; at: number }
        if (Date.now() - cached.at < AWAIT_CACHE_TTL_MS) {
          setAwaiting(cached.count)
          return
        }
      }
    } catch { /* fall through to fetch */ }
    fetch('/api/feedback?mine=1')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d?.reports) refreshAwaitingDot(d.reports as MyReport[])
      })
      .catch(() => { /* dot is best-effort */ })
  }, [refreshAwaitingDot])

  // Arriving from a resolution email (?feedback=mine) → open My reports.
  useEffect(() => {
    if (typeof window === 'undefined') return
    if (new URLSearchParams(window.location.search).get('feedback') === 'mine') {
      setView('mine')
      setOpen(true)
      loadMine()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Escape closes the modal.
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, close])

  // Other surfaces (pilot checklist card) open this modal pre-tagged via:
  //   window.dispatchEvent(new CustomEvent('cs:open-feedback', { detail: { context } }))
  useEffect(() => {
    const onOpen = (e: Event) => {
      const detail = (e as CustomEvent<{ context?: string }>).detail
      if (detail?.context) {
        setMessage(prev => (prev.trim() ? prev : `[${detail.context}] `))
      }
      setSent(false)
      setError(null)
      setView('compose')
      setOpen(true)
    }
    window.addEventListener('cs:open-feedback', onOpen)
    return () => window.removeEventListener('cs:open-feedback', onOpen)
  }, [])

  const handleSubmit = async () => {
    const trimmed = message.trim()
    if (!trimmed || sending) return
    setSending(true)
    setError(null)
    try {
      const res = await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type,
          severity: type === 'bug' ? severity : null,
          message: trimmed,
          page_path: pathname,
          viewport:
            typeof window !== 'undefined'
              ? `${window.innerWidth}x${window.innerHeight}`
              : null,
        }),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => null)
        throw new Error(d?.error ?? 'Could not send — try again.')
      }
      setSent(true)
      setMessage('')
      setMine(null) // stale — refetch next time My reports opens
      setTimeout(() => {
        setSent(false)
        setOpen(false)
      }, 1800)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not send — try again.')
    } finally {
      setSending(false)
    }
  }

  const respond = async (report: MyReport, action: 'confirm' | 'reopen') => {
    if (respondingId) return
    setRespondingId(report.id)
    setMineError(null)
    try {
      const res = await fetch(`/api/feedback/${report.id}/respond`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action,
          note: action === 'reopen' && reopenNote.trim() ? reopenNote.trim() : null,
        }),
      })
      const d = await res.json().catch(() => null)
      if (!res.ok) throw new Error(d?.error ?? 'Could not save your response.')
      const next = (mine ?? []).map((r) =>
        r.id === report.id
          ? { ...r, status: (action === 'confirm' ? 'confirmed' : 'reopened') as ReportStatus }
          : r,
      )
      setMine(next)
      refreshAwaitingDot(next)
      setReopenDraftId(null)
      setReopenNote('')
    } catch (e) {
      setMineError(e instanceof Error ? e.message : 'Could not save your response.')
    } finally {
      setRespondingId(null)
    }
  }

  // Hidden on public/unauthenticated routes AND on Workryn (/w/*) — the
  // feedback tab is a CaseSync surface only (Josh 08-02).
  const HIDDEN_PREFIXES = ['/w', '/login', '/onboarding', '/reset-password', '/accept-invite', '/auth', '/offline']
  if (HIDDEN_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + '/'))) return null

  const inputBase: React.CSSProperties = {
    background: 'var(--bg)',
    color: 'var(--text)',
    border: '1px solid var(--border)',
    borderRadius: 8,
    fontSize: 13,
    fontFamily: 'inherit',
  }

  const viewTab = (v: View, label: string) => {
    const active = view === v
    return (
      <button
        key={v}
        onClick={() => {
          setView(v)
          setSent(false)
          setError(null)
          if (v === 'mine' && mine === null && !mineLoading) loadMine()
        }}
        style={{
          padding: '6px 12px',
          borderRadius: 999,
          fontSize: 12,
          fontWeight: 700,
          cursor: 'pointer',
          background: active ? 'rgba(30,124,255,0.16)' : 'transparent',
          border: `1px solid ${active ? 'var(--accent)' : 'var(--border)'}`,
          color: active ? 'var(--accent)' : 'var(--text-secondary)',
          position: 'relative',
        }}
      >
        {label}
        {v === 'mine' && awaiting > 0 && (
          <span
            aria-label={`${awaiting} awaiting your confirmation`}
            style={{
              position: 'absolute', top: -3, right: -3, width: 9, height: 9,
              borderRadius: '50%', background: 'var(--orange)',
              border: '1.5px solid var(--surface)',
            }}
          />
        )}
      </button>
    )
  }

  return (
    <>
      <style>{`
        .fb-edge-tab { transition: transform 0.15s ease, box-shadow 0.15s ease; }
        .fb-edge-tab:hover { transform: translateY(-50%) translateX(-2px); box-shadow: 0 6px 20px rgba(30,124,255,0.45); }
        @keyframes fb-modal-in {
          from { opacity: 0; transform: translateY(14px) scale(0.97); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
        .fb-modal-card { animation: fb-modal-in 0.2s ease; }
        @keyframes fb-dot-pulse {
          0%, 100% { box-shadow: 0 0 0 0 rgba(255,159,10,0.55); }
          50% { box-shadow: 0 0 0 5px rgba(255,159,10,0); }
        }
        .fb-await-dot { animation: fb-dot-pulse 2s ease infinite; }
        @media (max-width: 480px) {
          .fb-edge-tab { padding: 9px 5px !important; }
          .fb-edge-tab span { font-size: 10px !important; }
        }
      `}</style>

      {/* Edge tab */}
      {!open && (
        <button
          className="fb-edge-tab"
          onClick={() => {
            setSent(false)
            setError(null)
            // If something awaits their confirmation, land them right on it.
            if (awaiting > 0) {
              setView('mine')
              loadMine()
            }
            setOpen(true)
          }}
          aria-label="Report an issue or share feedback"
          title={awaiting > 0 ? `${awaiting} report${awaiting === 1 ? '' : 's'} awaiting your confirmation` : 'Report an issue or share feedback'}
          style={{
            position: 'fixed',
            right: 0,
            top: '45%',
            transform: 'translateY(-50%)',
            zIndex: 590,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 6,
            padding: '12px 7px',
            background: 'linear-gradient(160deg, rgba(30,124,255,0.92), rgba(26,111,235,0.92))',
            border: '1.5px solid rgba(255,255,255,0.5)',
            borderRight: 'none',
            borderRadius: '10px 0 0 10px',
            backdropFilter: 'blur(8px)',
            boxShadow: '0 4px 14px rgba(30,124,255,0.3)',
            cursor: 'pointer',
            color: '#ffffff',
          }}
        >
          {awaiting > 0 && (
            <span
              className="fb-await-dot"
              aria-hidden="true"
              style={{
                position: 'absolute', top: -4, left: -4, width: 11, height: 11,
                borderRadius: '50%', background: 'var(--orange, #ff9f0a)',
                border: '1.5px solid #fff',
              }}
            />
          )}
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            <line x1="12" y1="7" x2="12" y2="11" />
            <circle cx="12" cy="14" r="0.5" fill="currentColor" />
          </svg>
          <span
            style={{
              writingMode: 'vertical-rl',
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: '0.06em',
              userSelect: 'none',
            }}
          >
            Feedback
          </span>
        </button>
      )}

      {/* Modal */}
      {open && (
        <div
          onClick={close}
          role="presentation"
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 1000,
            background: 'rgba(0,0,0,0.55)',
            backdropFilter: 'blur(4px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 16,
          }}
        >
          <div
            className="fb-modal-card"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label="Report an issue or share feedback"
            style={{
              width: 'min(520px, 100%)',
              maxHeight: 'min(640px, 92vh)',
              overflowY: 'auto',
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              borderRadius: 16,
              padding: 20,
              boxShadow: '0 20px 60px rgba(0,0,0,0.35)',
              color: 'var(--text)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <div style={{ display: 'flex', gap: 6 }}>
                {viewTab('compose', 'New report')}
                {viewTab('mine', 'My reports')}
              </div>
              <button
                onClick={close}
                aria-label="Close"
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: 'var(--text-secondary)',
                  fontSize: 18,
                  cursor: 'pointer',
                  lineHeight: 1,
                  padding: 4,
                }}
              >
                ✕
              </button>
            </div>

            {view === 'compose' && (sent ? (
              <div style={{ textAlign: 'center', padding: '28px 8px' }}>
                <div style={{ fontSize: 34, marginBottom: 8 }}>✅</div>
                <div style={{ fontSize: 15, fontWeight: 600 }}>Sent — thank you</div>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4 }}>
                  Your report went straight to the team. Track it under &ldquo;My reports&rdquo;.
                </div>
              </div>
            ) : (
              <>
                {/* Type */}
                <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
                  {TYPE_OPTIONS.map((opt) => {
                    const active = type === opt.value
                    return (
                      <button
                        key={opt.value}
                        onClick={() => setType(opt.value)}
                        style={{
                          flex: 1,
                          padding: '8px 6px',
                          borderRadius: 8,
                          fontSize: 12.5,
                          fontWeight: 600,
                          cursor: 'pointer',
                          background: active ? 'rgba(30,124,255,0.16)' : 'transparent',
                          border: `1px solid ${active ? 'var(--accent)' : 'var(--border)'}`,
                          color: active ? 'var(--accent)' : 'var(--text-secondary)',
                        }}
                      >
                        {opt.icon} {opt.label}
                      </button>
                    )
                  })}
                </div>

                {/* Severity (bugs only) */}
                {type === 'bug' && (
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 12 }}>
                    <span style={{ fontSize: 12, color: 'var(--text-secondary)', marginRight: 2 }}>
                      How bad?
                    </span>
                    {SEVERITY_OPTIONS.map((opt) => {
                      const active = severity === opt.value
                      return (
                        <button
                          key={opt.value}
                          onClick={() => setSeverity(opt.value)}
                          style={{
                            padding: '5px 10px',
                            borderRadius: 999,
                            fontSize: 11.5,
                            fontWeight: 600,
                            cursor: 'pointer',
                            background: active ? 'var(--surface-2)' : 'transparent',
                            border: `1px solid ${active ? opt.color : 'var(--border)'}`,
                            color: active ? opt.color : 'var(--text-secondary)',
                          }}
                        >
                          {opt.label}
                        </button>
                      )
                    })}
                  </div>
                )}

                <textarea
                  value={message}
                  onChange={(e) => setMessage(e.target.value.slice(0, MAX_MESSAGE))}
                  placeholder={
                    type === 'bug'
                      ? 'What happened, and what did you expect instead?'
                      : type === 'suggestion'
                        ? 'What would make this better?'
                        : 'What can we help clear up?'
                  }
                  rows={5}
                  autoFocus
                  style={{
                    ...inputBase,
                    width: '100%',
                    padding: '10px 12px',
                    resize: 'vertical',
                    minHeight: 100,
                    boxSizing: 'border-box',
                    lineHeight: 1.5,
                  }}
                />

                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    marginTop: 8,
                    fontSize: 11,
                    color: 'var(--text-secondary)',
                  }}
                >
                  <span aria-hidden="true">📎</span>
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    Included automatically: {pathname || '/'} · browser + build info
                  </span>
                </div>

                {error && (
                  <div style={{ marginTop: 10, fontSize: 12, color: 'var(--red)' }}>{error}</div>
                )}

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 14 }}>
                  <button
                    onClick={close}
                    style={{
                      padding: '8px 14px',
                      borderRadius: 8,
                      fontSize: 13,
                      fontWeight: 600,
                      cursor: 'pointer',
                      background: 'transparent',
                      border: '1px solid var(--border)',
                      color: 'var(--text-secondary)',
                    }}
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleSubmit}
                    disabled={!message.trim() || sending}
                    style={{
                      padding: '8px 18px',
                      borderRadius: 8,
                      fontSize: 13,
                      fontWeight: 700,
                      cursor: !message.trim() || sending ? 'not-allowed' : 'pointer',
                      opacity: !message.trim() || sending ? 0.55 : 1,
                      background: 'linear-gradient(135deg, #1E7CFF, #1A6FEB)',
                      border: '1px solid rgba(255,255,255,0.35)',
                      color: '#ffffff',
                    }}
                  >
                    {sending ? 'Sending…' : 'Send report'}
                  </button>
                </div>
              </>
            ))}

            {view === 'mine' && (
              <div>
                {mineLoading && (
                  <div style={{ padding: '24px 0', textAlign: 'center', fontSize: 13, color: 'var(--text-secondary)' }}>
                    Loading your reports…
                  </div>
                )}
                {mineError && (
                  <div style={{ marginBottom: 10, fontSize: 12.5, color: 'var(--red)' }}>{mineError}</div>
                )}
                {!mineLoading && mine !== null && mine.length === 0 && (
                  <div style={{
                    padding: '28px 12px', textAlign: 'center', fontSize: 13,
                    color: 'var(--text-secondary)', border: '1px dashed var(--border)', borderRadius: 12,
                  }}>
                    You haven&rsquo;t filed any reports yet. Spot something off? Use &ldquo;New report&rdquo;.
                  </div>
                )}
                {!mineLoading && mine !== null && mine.length > 0 && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {mine.map((r) => {
                      const sm = STATUS_META[r.status] ?? STATUS_META.new
                      const tm = TYPE_OPTIONS.find((t) => t.value === r.type)
                      const awaitingMe = r.status === 'resolved'
                      const draftingReopen = reopenDraftId === r.id
                      return (
                        <div
                          key={r.id}
                          style={{
                            border: `1px solid ${awaitingMe ? 'var(--green)' : 'var(--border)'}`,
                            borderRadius: 12,
                            padding: '10px 12px',
                            background: 'var(--bg)',
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                            <span style={{ fontSize: 14 }}>{tm?.icon ?? '🐞'}</span>
                            <span style={{
                              fontSize: 10.5, fontWeight: 700, padding: '2px 8px', borderRadius: 999,
                              border: `1px solid ${sm.color}`, color: sm.color, whiteSpace: 'nowrap',
                            }}>
                              {sm.label}
                            </span>
                            <span style={{ flex: 1 }} />
                            <span style={{ fontSize: 11, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
                              {timeAgo(r.created_at)}
                            </span>
                          </div>
                          <div style={{ fontSize: 12.5, lineHeight: 1.5, color: 'var(--text)', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                            {r.message.length > 220 ? `${r.message.slice(0, 220)}…` : r.message}
                          </div>
                          {r.resolution_note && (
                            <div style={{
                              marginTop: 8, padding: '8px 10px', borderRadius: 8,
                              borderLeft: '3px solid var(--green)', background: 'var(--surface)',
                              fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5, whiteSpace: 'pre-wrap',
                            }}>
                              <strong style={{ color: 'var(--text)' }}>Team:</strong> {r.resolution_note}
                            </div>
                          )}

                          {awaitingMe && !draftingReopen && (
                            <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
                              <button
                                onClick={() => respond(r, 'confirm')}
                                disabled={respondingId === r.id}
                                style={{
                                  padding: '7px 14px', borderRadius: 8, fontSize: 12.5, fontWeight: 700,
                                  cursor: respondingId === r.id ? 'not-allowed' : 'pointer',
                                  opacity: respondingId === r.id ? 0.6 : 1,
                                  background: 'var(--green)', border: 'none', color: '#fff',
                                }}
                              >
                                ✔ It&rsquo;s fixed
                              </button>
                              <button
                                onClick={() => {
                                  setReopenDraftId(r.id)
                                  setReopenNote('')
                                }}
                                disabled={respondingId === r.id}
                                style={{
                                  padding: '7px 14px', borderRadius: 8, fontSize: 12.5, fontWeight: 700,
                                  cursor: respondingId === r.id ? 'not-allowed' : 'pointer',
                                  background: 'transparent', border: '1px solid var(--red)', color: 'var(--red)',
                                }}
                              >
                                Still broken
                              </button>
                            </div>
                          )}

                          {awaitingMe && draftingReopen && (
                            <div style={{ marginTop: 10 }}>
                              <textarea
                                value={reopenNote}
                                onChange={(e) => setReopenNote(e.target.value.slice(0, 1000))}
                                placeholder="What's still broken? (optional, but it helps)"
                                rows={2}
                                autoFocus
                                style={{
                                  ...inputBase, width: '100%', boxSizing: 'border-box',
                                  padding: '8px 10px', resize: 'vertical', lineHeight: 1.5,
                                }}
                              />
                              <div style={{ display: 'flex', gap: 8, marginTop: 8, justifyContent: 'flex-end' }}>
                                <button
                                  onClick={() => { setReopenDraftId(null); setReopenNote('') }}
                                  style={{
                                    padding: '6px 12px', borderRadius: 8, fontSize: 12, fontWeight: 600,
                                    cursor: 'pointer', background: 'transparent',
                                    border: '1px solid var(--border)', color: 'var(--text-secondary)',
                                  }}
                                >
                                  Cancel
                                </button>
                                <button
                                  onClick={() => respond(r, 'reopen')}
                                  disabled={respondingId === r.id}
                                  style={{
                                    padding: '6px 14px', borderRadius: 8, fontSize: 12, fontWeight: 700,
                                    cursor: respondingId === r.id ? 'not-allowed' : 'pointer',
                                    opacity: respondingId === r.id ? 0.6 : 1,
                                    background: 'var(--red)', border: 'none', color: '#fff',
                                  }}
                                >
                                  {respondingId === r.id ? 'Sending…' : 'Send back to team'}
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  )
}
