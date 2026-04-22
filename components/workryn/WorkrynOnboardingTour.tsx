'use client'
import { useState, useEffect, useCallback } from 'react'

const TOUR_KEY = 'workryn-tour-complete'

interface TourStep {
  id: number
  emoji: string
  title: string
  content: string
  target?: string
  position?: 'top' | 'bottom' | 'left' | 'right' | 'center'
}

const TOUR_STEPS: TourStep[] = [
  { id: 1, emoji: '👋', title: 'Welcome to Workryn!', position: 'center',
    content: "Workryn is your employee portal at Beatrice Loving Heart. Clock in, view your schedule, complete training, and more. Let us take a quick tour.",
  },
  { id: 2, emoji: '🧭', title: 'Sidebar Navigation',
    content: "Everything is accessible from this sidebar. Your role determines which sections you can see.",
    target: '[data-tour-w="sidebar"]', position: 'right',
  },
  { id: 3, emoji: '📊', title: 'Dashboard',
    content: "Your dashboard shows your tasks, open tickets, hours this week, and today's schedule at a glance.",
    target: '[data-tour-w="dashboard"]', position: 'right',
  },
  { id: 4, emoji: '⏱️', title: 'Time Clock',
    content: "Clock in and out right here. Your timesheet and full history are just a tab away. Break options appear once you are clocked in.",
    target: '[data-tour-w="time-clock"]', position: 'right',
  },
  { id: 5, emoji: '📅', title: 'Schedule',
    content: "See your weekly schedule in a clean grid. Team Managers and Supervisors can add and edit shifts for the whole team.",
    target: '[data-tour-w="schedule"]', position: 'right',
  },
  { id: 6, emoji: '✅', title: 'Tasks',
    content: "Tasks assigned to you live here. Track progress, update status, and leave comments.",
    target: '[data-tour-w="tasks"]', position: 'right',
  },
  { id: 7, emoji: '🎫', title: 'Tickets',
    content: "Submit IT or support tickets here. Track their status and communicate with your team in the thread.",
    target: '[data-tour-w="tickets"]', position: 'right',
  },
  { id: 8, emoji: '📚', title: 'Training',
    content: "Complete required training courses and quizzes. Your progress is tracked and managers can see your completion status.",
    target: '[data-tour-w="training"]', position: 'right',
  },
  { id: 9, emoji: '🔔', title: 'Notifications',
    content: "The bell icon shows your real-time notifications — task assignments, reminders, and shift updates.",
    target: '[data-tour-w="notif-bell"]', position: 'bottom',
  },
  { id: 10, emoji: '↔️', title: 'Switch to CaseSync',
    content: "Use this toggle to jump back to the CaseSync case management portal at any time.",
    target: '[data-tour-w="cs-toggle"]', position: 'right',
  },
  { id: 11, emoji: '🚀', title: 'You are all set!', position: 'center',
    content: "That covers everything. Your role controls your access — if something seems missing, check with your supervisor.",
  },
]

interface SpotlightRect { top: number; left: number; width: number; height: number }

function getTargetRect(selector: string): SpotlightRect | null {
  const el = document.querySelector(selector)
  if (!el) return null
  const r = el.getBoundingClientRect()
  return { top: r.top + window.scrollY, left: r.left + window.scrollX, width: r.width, height: r.height }
}

function computePos(rect: SpotlightRect | null, pos: TourStep['position'], tw: number, th: number) {
  if (!rect || pos === 'center') return { top: '50%', left: '50%', transform: 'translate(-50%,-50%)' }
  const pad = 20
  const { top, left, width, height } = rect
  switch (pos) {
    case 'bottom': return { top: top + height + pad, left: Math.max(pad, Math.min(left + width / 2 - tw / 2, window.innerWidth - tw - pad)) }
    case 'top':    return { top: top - th - pad,    left: Math.max(pad, Math.min(left + width / 2 - tw / 2, window.innerWidth - tw - pad)) }
    case 'right':  return { top: Math.max(pad, top + height / 2 - th / 2), left: left + width + pad }
    case 'left':   return { top: Math.max(pad, top + height / 2 - th / 2), left: left - tw - pad }
    default:       return { top: top + height + pad, left: Math.max(pad, left) }
  }
}

interface Props { forceShow?: boolean; onClose?: () => void }

export default function WorkrynOnboardingTour({ forceShow = false, onClose }: Props) {
  const [step, setStep] = useState(0)
  const [visible, setVisible] = useState(false)
  const [rect, setRect] = useState<SpotlightRect | null>(null)

  useEffect(() => {
    if (forceShow) { setVisible(true); setStep(0); return }
    // Check for handoff from CaseSync tour
    const params = new URLSearchParams(window.location.search)
    if (params.get('tour') === '1') {
      // Strip the param from the URL without navigation
      const url = new URL(window.location.href)
      url.searchParams.delete('tour')
      window.history.replaceState({}, '', url.toString())
      setVisible(true)
      return
    }
    const done = localStorage.getItem(TOUR_KEY)
    if (!done) { const t = setTimeout(() => setVisible(true), 900); return () => clearTimeout(t) }
  }, [forceShow])

  const cur = TOUR_STEPS[step]

  useEffect(() => {
    if (!visible || !cur?.target) { setRect(null); return }
    let attempts = 0
    const tryGet = () => {
      const r = getTargetRect(cur.target!)
      if (r) setRect(r)
      else if (attempts++ < 6) setTimeout(tryGet, 200)
    }
    tryGet()
  }, [step, visible, cur])

  const close = useCallback((fromLast?: boolean) => {
    setVisible(false)
    localStorage.setItem(TOUR_KEY, 'true')
    onClose?.()
    if (fromLast) {
      window.location.href = '/dashboard'
    }
  }, [onClose])

  const next = useCallback(() => {
    if (step < TOUR_STEPS.length - 1) setStep(s => s + 1)
    else close(true)
  }, [step, close])

  useEffect(() => {
    if (!visible) return
    const h = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight' || e.key === 'Enter') next()
      if (e.key === 'Escape') close()
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [visible, next, close])

  if (!visible) return null

  const TW = 320
  const TH = 220
  const isCenter = cur.position === 'center' || !cur.target
  const isLast = step === TOUR_STEPS.length - 1
  const tooltipPos = computePos(rect, cur.position, TW, TH)

  return (
    <>
      <div style={{ position: 'fixed', inset: 0, zIndex: 9000, pointerEvents: isCenter ? 'none' : 'auto' }}>
        {rect ? (
          <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }} aria-hidden>
            <defs>
              <mask id="w-tour-mask">
                <rect width="100%" height="100%" fill="white" />
                <rect x={rect.left - 8} y={rect.top - 8} width={rect.width + 16} height={rect.height + 16} rx={10} fill="black" />
              </mask>
            </defs>
            <rect width="100%" height="100%" fill="rgba(0,0,0,0.68)" mask="url(#w-tour-mask)" />
            <rect x={rect.left - 8} y={rect.top - 8} width={rect.width + 16} height={rect.height + 16}
              rx={10} fill="transparent" stroke="#2563eb" strokeWidth={2.5} />
          </svg>
        ) : (
          <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.68)' }} />
        )}
      </div>

      <div
        role="dialog" aria-modal aria-label={`Tour step ${step + 1} of ${TOUR_STEPS.length}: ${cur.title}`}
        style={{
          position: 'fixed', zIndex: 9001,
          width: TW, maxWidth: 'calc(100vw - 32px)',
          background: '#ffffff',
          borderRadius: 16,
          boxShadow: '0 24px 64px rgba(0,0,0,0.35), 0 0 0 1px rgba(0,0,0,0.07)',
          padding: '22px 24px 20px',
          color: '#111827',
          ...(isCenter ? { top: '50%', left: '50%', transform: 'translate(-50%,-50%)' } : tooltipPos),
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <div style={{ display: 'flex', gap: 4 }}>
            {TOUR_STEPS.map((_, i) => (
              <div key={i} style={{
                width: i === step ? 20 : 6, height: 6, borderRadius: 3,
                background: i === step ? '#2563eb' : i < step ? '#93c5fd' : '#e5e7eb',
                transition: 'width 0.2s, background 0.2s',
              }} />
            ))}
          </div>
          <span style={{ fontSize: 11, color: '#9ca3af', fontWeight: 500 }}>{step + 1} / {TOUR_STEPS.length}</span>
        </div>

        <p style={{ margin: '0 0 4px', fontSize: 22 }}>{cur.emoji}</p>
        <h3 style={{ margin: '0 0 8px', fontSize: 16, fontWeight: 700, color: '#111827', letterSpacing: '-0.01em' }}>
          {cur.title}
        </h3>
        <p style={{ margin: '0 0 18px', fontSize: 13.5, lineHeight: 1.6, color: '#374151' }}>
          {cur.content}
        </p>

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', alignItems: 'center' }}>
          {!isLast && (
            <button onClick={close} style={{ background: 'none', border: 'none', color: '#9ca3af', fontSize: 13, cursor: 'pointer', padding: '6px 10px', borderRadius: 7 }}>
              Skip tour
            </button>
          )}
          <button onClick={next} autoFocus style={{
            background: 'linear-gradient(135deg,#2563eb,#3b82f6)', color: '#fff', border: 'none',
            borderRadius: 9, padding: '10px 22px', fontSize: 14, fontWeight: 600, cursor: 'pointer',
            boxShadow: '0 2px 12px rgba(37,99,235,0.35)',
          }}>
            {isLast ? "Back to CaseSync 🚀" : 'Next →'}
          </button>
        </div>
      </div>
    </>
  )
}

export function useWorkrynTour() {
  const start = useCallback(() => { localStorage.removeItem(TOUR_KEY); window.location.reload() }, [])
  return { startTour: start, TOUR_KEY }
}