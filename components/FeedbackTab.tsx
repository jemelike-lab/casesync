'use client'

// FeedbackTab — tester feedback / issue reporting entry point.
//
// A slim glass tab pinned to the right edge (mid-height, every authenticated
// page, CaseSync AND Workryn) opening a compact report modal. Diagnostic
// context is captured automatically: the client sends page_path + viewport;
// the API adds build SHA + user agent server-side. Reports land in
// feedback_reports on the Azure plane (owner-insert RLS).
//
// Placement: top 45% right edge — well clear of Casey's launcher (bottom
// right, zIndex 600). This tab sits at zIndex 590 so Casey's open panel
// always wins.

import { useCallback, useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'

type FeedbackType = 'bug' | 'suggestion' | 'question'
type FeedbackSeverity = 'blocking' | 'annoying' | 'minor'

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

const MAX_MESSAGE = 2000

export default function FeedbackTab() {
  const pathname = usePathname() ?? ''
  const [open, setOpen] = useState(false)
  const [type, setType] = useState<FeedbackType>('bug')
  const [severity, setSeverity] = useState<FeedbackSeverity>('annoying')
  const [message, setMessage] = useState('')
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const close = useCallback(() => {
    setOpen(false)
    setError(null)
    setSending(false)
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

  // Hidden on public/unauthenticated routes. Deliberately VISIBLE on /w/*:
  // the SP test pass covers Workryn surfaces (Time Clock, Schedule) too.
  const HIDDEN_PREFIXES = ['/login', '/onboarding', '/reset-password', '/accept-invite', '/auth', '/offline']
  if (HIDDEN_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + '/'))) return null

  const inputBase: React.CSSProperties = {
    background: 'var(--bg)',
    color: 'var(--text)',
    border: '1px solid var(--border)',
    borderRadius: 8,
    fontSize: 13,
    fontFamily: 'inherit',
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
        @media (max-width: 480px) {
          .fb-edge-tab { padding: 9px 5px !important; }
          .fb-edge-tab span { font-size: 10px !important; }
        }
      `}</style>

      {/* Edge tab */}
      {!open && (
        <button
          className="fb-edge-tab"
          onClick={() => setOpen(true)}
          aria-label="Report an issue or share feedback"
          title="Report an issue or share feedback"
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
              width: 'min(480px, 100%)',
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              borderRadius: 16,
              padding: 20,
              boxShadow: '0 20px 60px rgba(0,0,0,0.35)',
              color: 'var(--text)',
            }}
          >
            {sent ? (
              <div style={{ textAlign: 'center', padding: '28px 8px' }}>
                <div style={{ fontSize: 34, marginBottom: 8 }}>✅</div>
                <div style={{ fontSize: 15, fontWeight: 600 }}>Sent — thank you</div>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4 }}>
                  Your report went straight to the team.
                </div>
              </div>
            ) : (
              <>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                  <h2 style={{ fontSize: 15, fontWeight: 700, margin: 0 }}>
                    Report an issue or share feedback
                  </h2>
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
            )}
          </div>
        </div>
      )}
    </>
  )
}
