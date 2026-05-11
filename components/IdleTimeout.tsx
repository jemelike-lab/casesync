'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

interface Props {
  timeoutMs: number
  warningMs?: number // Show warning this many ms before timeout
}

export default function IdleTimeout({ timeoutMs, warningMs = 120000 }: Props) {
  const router = useRouter()
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const warningTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const supabase = createClient()
  const [showWarning, setShowWarning] = useState(false)
  const [countdown, setCountdown] = useState(0)
  // Track whether the component has mounted and set the cookie at least once
  const hasInitialized = useRef(false)

  const handleLogout = useCallback(async () => {
    await supabase.auth.signOut()
    router.push('/login?reason=session_timeout')
  }, [supabase, router])

  /** Write the cs_last_activity cookie from the client side */
  const touchActivityCookie = useCallback(() => {
    const now = Math.floor(Date.now() / 1000)
    // Match the middleware's maxAge so they stay in sync
    const maxAgeSecs = Math.floor(timeoutMs / 1000)
    document.cookie = `cs_last_activity=${now}; path=/; max-age=${maxAgeSecs}; samesite=lax${
      location.protocol === 'https:' ? '; secure' : ''
    }`
  }, [timeoutMs])

  const reset = useCallback(() => {
    // Clear existing timers
    if (timerRef.current) clearTimeout(timerRef.current)
    if (warningTimerRef.current) clearTimeout(warningTimerRef.current)

    // Hide warning if showing
    setShowWarning(false)

    // Update the activity cookie on every reset so laptop-close checks
    // have an accurate "last active" timestamp
    touchActivityCookie()

    // Set warning timer
    warningTimerRef.current = setTimeout(() => {
      setShowWarning(true)
      setCountdown(Math.floor(warningMs / 1000))
    }, timeoutMs - warningMs)

    // Set logout timer
    timerRef.current = setTimeout(handleLogout, timeoutMs)
  }, [timeoutMs, warningMs, handleLogout, touchActivityCookie])

  // Countdown when warning is showing
  useEffect(() => {
    if (!showWarning) return
    const interval = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) {
          clearInterval(interval)
          return 0
        }
        return prev - 1
      })
    }, 1000)
    return () => clearInterval(interval)
  }, [showWarning])

  useEffect(() => {
    const events = ['mousedown', 'mousemove', 'keydown', 'scroll', 'touchstart']
    events.forEach(e => window.addEventListener(e, reset))
    hasInitialized.current = true
    reset()

    // Visibility change handler — catches laptop close/reopen.
    // setTimeout is suspended while the laptop is asleep, so we
    // must check real elapsed time when the tab becomes visible.
    const handleVisibility = () => {
      if (document.visibilityState !== 'visible') return

      const cookie = document.cookie
        .split('; ')
        .find((c) => c.startsWith('cs_last_activity='))
      const lastActivity = cookie ? parseInt(cookie.split('=')[1], 10) : 0
      const now = Math.floor(Date.now() / 1000)

      // If the cookie is missing (expired) or unset, and we know the
      // component previously initialized, then the session has definitely
      // exceeded the timeout while the laptop was asleep.
      if (!lastActivity && hasInitialized.current) {
        handleLogout()
        return
      }

      const elapsed = now - lastActivity

      if (elapsed * 1000 > timeoutMs) {
        // Timed out while asleep — sign out immediately
        handleLogout()
      } else if (elapsed * 1000 > timeoutMs - warningMs) {
        // Within warning window — show warning with correct remaining time
        const remaining = Math.floor((timeoutMs / 1000) - elapsed)
        setShowWarning(true)
        setCountdown(Math.max(remaining, 0))
      } else {
        // Still within timeout — reset timers with fresh activity
        reset()
      }
    }
    document.addEventListener('visibilitychange', handleVisibility)

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
      if (warningTimerRef.current) clearTimeout(warningTimerRef.current)
      events.forEach(e => window.removeEventListener(e, reset))
      document.removeEventListener('visibilitychange', handleVisibility)
    }
  }, [reset, timeoutMs, warningMs, handleLogout])

  if (!showWarning) return null

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="timeout-title"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 10000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(0,0,0,0.7)',
        backdropFilter: 'blur(4px)',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: '#fff',
          borderRadius: 16,
          padding: '32px',
          maxWidth: 440,
          width: 'calc(100vw - 32px)',
          boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
        }}
      >
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <div
            style={{
              width: 64,
              height: 64,
              borderRadius: '50%',
              background: '#FEF3C7',
              margin: '0 auto 16px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 32,
            }}
          >
            ⏱️
          </div>
          <h2
            id="timeout-title"
            style={{
              margin: '0 0 8px',
              fontSize: 20,
              fontWeight: 700,
              color: '#111827',
            }}
          >
            Session Timeout Warning
          </h2>
          <p style={{ margin: 0, fontSize: 14, color: '#6b7280', lineHeight: 1.5 }}>
            You&apos;ve been inactive for a while. For security reasons, your session
            will expire in:
          </p>
        </div>

        <div
          style={{
            background: '#F3F4F6',
            borderRadius: 12,
            padding: '16px',
            marginBottom: 24,
            textAlign: 'center',
          }}
        >
          <div style={{ fontSize: 48, fontWeight: 800, color: '#2563eb', fontVariantNumeric: 'tabular-nums' }}>
            {Math.floor(countdown / 60)}:{String(countdown % 60).padStart(2, '0')}
          </div>
          <div style={{ fontSize: 12, color: '#6b7280', marginTop: 4 }}>
            minutes remaining
          </div>
        </div>

        <button
          onClick={reset}
          autoFocus
          style={{
            width: '100%',
            background: '#2563eb',
            color: '#fff',
            border: 'none',
            borderRadius: 10,
            padding: '14px 24px',
            fontSize: 15,
            fontWeight: 600,
            cursor: 'pointer',
            transition: 'background 0.15s',
          }}
          onMouseEnter={e => (e.currentTarget.style.background = '#6D28D9')}
          onMouseLeave={e => (e.currentTarget.style.background = '#2563eb')}
        >
          Continue My Session
        </button>

        <button
          onClick={handleLogout}
          style={{
            width: '100%',
            background: 'transparent',
            color: '#6b7280',
            border: 'none',
            borderRadius: 10,
            padding: '12px 24px',
            fontSize: 14,
            fontWeight: 500,
            cursor: 'pointer',
            marginTop: 8,
          }}
        >
          Log Out Now
        </button>
      </div>
    </div>
  )
}
