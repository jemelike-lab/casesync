'use client'

import { useState, useEffect, useCallback } from 'react'

const TOUR_KEY = 'casesync-tour-complete'

interface TourStep {
  id: number
  emoji: string
  title: string
  content: string
  target?: string // CSS selector for element to highlight
  position?: 'top' | 'bottom' | 'left' | 'right' | 'center'
}

const TOUR_STEPS: TourStep[] = [
  {
    id: 1,
    emoji: '👋',
    title: 'Welcome to CaseSync!',
    content: "You're now logged in to BLH's case management portal. Let's take a quick 2-minute tour so you know your way around.",
    target: undefined,
    position: 'center',
  },
  {
    id: 2,
    emoji: '📊',
    title: 'Your Dashboard',
    content: "This is your Dashboard — your home base. It shows all your clients and their upcoming deadlines at a glance.",
    target: '[data-tour="dashboard-main"]',
    position: 'bottom',
  },
  {
    id: 3,
    emoji: '⚠️',
    title: 'Alert Banner',
    content: "This alert banner shows clients that need immediate attention — overdue items, compliance flags, or messages from your Team Manager.",
    target: '[data-tour="alert-banner"]',
    position: 'bottom',
  },
  {
    id: 4,
    emoji: '📅',
    title: 'Week Strip',
    content: "This week strip shows all your deadlines for the next 7 days. Red = overdue, amber = due soon, green = on track. Click any chip to jump to that client.",
    target: '[data-tour="week-strip"]',
    position: 'bottom',
  },
  {
    id: 5,
    emoji: '🔍',
    title: 'Search & Filters',
    content: "Use the search bar and filters to find specific clients quickly. You can filter by status, deadline type, or compliance flag.",
    target: '[data-tour="filter-bar"]',
    position: 'bottom',
  },
  {
    id: 6,
    emoji: '👤',
    title: 'Client Cards',
    content: "Each card represents one of your clients. Click any card to view their full profile, contact history, and deadlines.",
    target: '[data-tour="client-grid"]',
    position: 'top',
  },
  {
    id: 7,
    emoji: '🤖',
    title: 'BLH Bot',
    content: "BLH Bot is your AI assistant — click the purple button anytime you have a question. Ask about deadlines, procedures, eligibility codes, and more.",
    target: '[data-tour="blh-bot-fab"]',
    position: 'top',
  },
  {
    id: 8,
    emoji: '🔔',
    title: 'Notification Bell',
    content: "Check your notification bell for deadline reminders, compliance alerts, and team messages. A red badge means you have unread notifications.",
    target: '[data-tour="notification-bell"]',
    position: 'bottom',
  },
  {
    id: 9,
    emoji: '✅',
    title: "You're all set!",
    content: "You know the essentials! Explore the Calendar and Documents from the navigation. If you ever need help, BLH Bot is always here.",
    target: undefined,
    position: 'center',
  },
]

interface SpotlightRect {
  top: number
  left: number
  width: number
  height: number
}

function getTargetRect(selector: string): SpotlightRect | null {
  const el = document.querySelector(selector)
  if (!el) return null
  const rect = el.getBoundingClientRect()
  return {
    top: rect.top + window.scrollY,
    left: rect.left + window.scrollX,
    width: rect.width,
    height: rect.height,
  }
}

interface TooltipPosition {
  top?: number | string
  left?: number | string
  right?: number | string
  bottom?: number | string
  transform?: string
}

function computeTooltipPosition(
  spotlightRect: SpotlightRect | null,
  position: TourStep['position'],
  tooltipWidth: number,
  tooltipHeight: number
): TooltipPosition {
  if (!spotlightRect || position === 'center') {
    return {
      top: '50%',
      left: '50%',
      transform: 'translate(-50%, -50%)',
    }
  }

  const padding = 16
  const { top, left, width, height } = spotlightRect

  switch (position) {
    case 'bottom':
      return {
        top: top + height + padding,
        left: Math.max(padding, Math.min(left + width / 2 - tooltipWidth / 2, window.innerWidth - tooltipWidth - padding)),
      }
    case 'top':
      return {
        top: top - tooltipHeight - padding,
        left: Math.max(padding, Math.min(left + width / 2 - tooltipWidth / 2, window.innerWidth - tooltipWidth - padding)),
      }
    case 'right':
      return {
        top: top + height / 2 - tooltipHeight / 2,
        left: left + width + padding,
      }
    case 'left':
      return {
        top: top + height / 2 - tooltipHeight / 2,
        left: left - tooltipWidth - padding,
      }
    default:
      return {
        top: top + height + padding,
        left: Math.max(padding, left),
      }
  }
}

interface OnboardingTourProps {
  /** If true, shows the tour regardless of localStorage state (for replay) */
  forceShow?: boolean
  onClose?: () => void
}

export default function OnboardingTour({ forceShow = false, onClose }: OnboardingTourProps) {
  const [step, setStep] = useState(0)
  const [visible, setVisible] = useState(false)
  const [spotlightRect, setSpotlightRect] = useState<SpotlightRect | null>(null)

  // Decide whether to show on mount
  useEffect(() => {
    if (forceShow) {
      setVisible(true)
      setStep(0)
      return
    }
    const done = localStorage.getItem(TOUR_KEY)
    if (!done) {
      // Small delay so the dashboard renders first
      const t = setTimeout(() => setVisible(true), 800)
      return () => clearTimeout(t)
    }
  }, [forceShow])

  const currentStep = TOUR_STEPS[step]

  // Update spotlight when step changes
  useEffect(() => {
    if (!visible || !currentStep?.target) {
      setSpotlightRect(null)
      return
    }
    // Retry a few times in case the element renders async
    let attempts = 0
    const tryGetRect = () => {
      const rect = getTargetRect(currentStep.target!)
      if (rect) {
        setSpotlightRect(rect)
      } else if (attempts < 5) {
        attempts++
        setTimeout(tryGetRect, 200)
      }
    }
    tryGetRect()
  }, [step, visible, currentStep])

  const handleNext = useCallback(() => {
    if (step < TOUR_STEPS.length - 1) {
      setStep(s => s + 1)
    } else {
      handleClose()
    }
  }, [step])

  const handleClose = useCallback(() => {
    setVisible(false)
    localStorage.setItem(TOUR_KEY, 'true')
    onClose?.()
  }, [onClose])

  const handleSkip = useCallback(() => {
    handleClose()
  }, [handleClose])

  // Keyboard navigation
  useEffect(() => {
    if (!visible) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight' || e.key === 'Enter') handleNext()
      if (e.key === 'Escape') handleSkip()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [visible, handleNext, handleSkip])

  if (!visible) return null

  const TOOLTIP_W = 320
  const TOOLTIP_H = 200 // approximate
  const tooltipPos = computeTooltipPosition(spotlightRect, currentStep.position, TOOLTIP_W, TOOLTIP_H)

  const isCenter = currentStep.position === 'center' || !currentStep.target
  const isLast = step === TOUR_STEPS.length - 1

  return (
    <>
      {/* Overlay with spotlight cutout */}
      <div
        onClick={isCenter ? undefined : handleSkip}
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 9000,
          // When there's a spotlight target, use a radial gradient to punch a hole
          background: spotlightRect
            ? undefined
            : 'rgba(0,0,0,0.65)',
          pointerEvents: isCenter ? 'none' : 'auto',
        }}
      >
        {spotlightRect && (
          <svg
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}
            aria-hidden="true"
          >
            <defs>
              <mask id="tour-mask">
                {/* White = show overlay, Black = cut out (spotlight) */}
                <rect width="100%" height="100%" fill="white" />
                <rect
                  x={spotlightRect.left - 8}
                  y={spotlightRect.top - 8}
                  width={spotlightRect.width + 16}
                  height={spotlightRect.height + 16}
                  rx={10}
                  fill="black"
                />
              </mask>
            </defs>
            <rect
              width="100%"
              height="100%"
              fill="rgba(0,0,0,0.65)"
              mask="url(#tour-mask)"
            />
            {/* Highlight ring around the target */}
            <rect
              x={spotlightRect.left - 8}
              y={spotlightRect.top - 8}
              width={spotlightRect.width + 16}
              height={spotlightRect.height + 16}
              rx={10}
              fill="transparent"
              stroke="#7C3AED"
              strokeWidth={2.5}
            />
          </svg>
        )}
      </div>

      {/* Tooltip card */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Tour step ${step + 1} of ${TOUR_STEPS.length}: ${currentStep.title}`}
        style={{
          position: 'fixed',
          zIndex: 9001,
          width: TOOLTIP_W,
          background: '#fff',
          borderRadius: 14,
          boxShadow: '0 20px 60px rgba(0,0,0,0.3), 0 0 0 1px rgba(0,0,0,0.08)',
          padding: '20px 22px 18px',
          color: '#1a1a2e',
          ...(isCenter
            ? { top: '50%', left: '50%', transform: 'translate(-50%, -50%)' }
            : tooltipPos),
          // Responsive: on small screens always center
          maxWidth: 'calc(100vw - 32px)',
          transition: 'opacity 0.2s',
        }}
      >
        {/* Step indicator */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 10,
        }}>
          <div style={{ display: 'flex', gap: 4 }}>
            {TOUR_STEPS.map((_, i) => (
              <div
                key={i}
                style={{
                  width: i === step ? 18 : 6,
                  height: 6,
                  borderRadius: 3,
                  background: i === step ? '#7C3AED' : '#e5e7eb',
                  transition: 'width 0.2s, background 0.2s',
                }}
              />
            ))}
          </div>
          <span style={{ fontSize: 11, color: '#6b7280', fontWeight: 500 }}>
            {step + 1} / {TOUR_STEPS.length}
          </span>
        </div>

        {/* Content */}
        <div style={{ marginBottom: 16 }}>
          <p style={{ margin: '0 0 6px', fontSize: 20 }}>{currentStep.emoji}</p>
          <h3 style={{ margin: '0 0 8px', fontSize: 16, fontWeight: 700, color: '#111827' }}>
            {currentStep.title}
          </h3>
          <p style={{ margin: 0, fontSize: 14, lineHeight: 1.55, color: '#374151' }}>
            {currentStep.content}
          </p>
        </div>

        {/* Buttons */}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', alignItems: 'center' }}>
          {!isLast && (
            <button
              onClick={handleSkip}
              style={{
                background: 'transparent',
                border: 'none',
                color: '#9ca3af',
                fontSize: 13,
                cursor: 'pointer',
                padding: '6px 10px',
                borderRadius: 7,
              }}
            >
              Skip tour
            </button>
          )}
          <button
            onClick={handleNext}
            autoFocus
            style={{
              background: '#7C3AED',
              color: '#fff',
              border: 'none',
              borderRadius: 8,
              padding: '9px 20px',
              fontSize: 14,
              fontWeight: 600,
              cursor: 'pointer',
              transition: 'background 0.15s',
            }}
            onMouseEnter={e => (e.currentTarget.style.background = '#6D28D9')}
            onMouseLeave={e => (e.currentTarget.style.background = '#7C3AED')}
          >
            {isLast ? "Let's go! 🚀" : 'Next →'}
          </button>
        </div>
      </div>

      {/* Mobile: ensure overlay is always scrolled to top when tour is active */}
      <style>{`
        body.tour-active { overflow: hidden; }
        @media (max-width: 480px) {
          [data-tour-tooltip] {
            width: calc(100vw - 32px) !important;
            left: 16px !important;
            right: 16px !important;
            transform: none !important;
          }
        }
      `}</style>
    </>
  )
}

/**
 * Hook to trigger the tour replay.
 * Usage: const { startTour } = useOnboardingTour()
 */
export function useOnboardingTour() {
  const startTour = useCallback(() => {
    localStorage.removeItem(TOUR_KEY)
    window.location.reload() // simple approach: reload triggers the tour
  }, [])

  const resetTour = useCallback(() => {
    localStorage.removeItem(TOUR_KEY)
  }, [])

  return { startTour, resetTour, TOUR_KEY }
}
