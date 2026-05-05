'use client'

import { useEffect, useCallback, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

const INACTIVITY_TIMEOUT_MS = 30 * 60 * 1000 // 30 minutes
const ACTIVITY_COOKIE = 'cs_last_activity'

function setCookie(name: string, value: string) {
  document.cookie = `${name}=${value};path=/;max-age=${30 * 60};samesite=lax`
}

export function useInactivityTimeout() {
  const router = useRouter()
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const signOutAndRedirect = useCallback(async () => {
    const supabase = createClient()
    await supabase.auth.signOut()
    document.cookie = `${ACTIVITY_COOKIE}=;path=/;max-age=0`
    router.push('/auth?reason=timeout')
  }, [router])

  const resetTimer = useCallback(() => {
    // Update the cookie so middleware sees fresh activity
    setCookie(ACTIVITY_COOKIE, String(Math.floor(Date.now() / 1000)))

    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(signOutAndRedirect, INACTIVITY_TIMEOUT_MS)
  }, [signOutAndRedirect])

  useEffect(() => {
    // Activity events to track
    const events = ['mousedown', 'keydown', 'scroll', 'touchstart', 'mousemove']

    // Throttle: only reset every 60 seconds max
    let lastReset = 0
    const throttledReset = () => {
      const now = Date.now()
      if (now - lastReset > 60_000) {
        lastReset = now
        resetTimer()
      }
    }

    events.forEach((event) => window.addEventListener(event, throttledReset, { passive: true }))

    // Handle visibility change (laptop open/close)
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        // Check if we timed out while away
        const cookie = document.cookie
          .split('; ')
          .find((c) => c.startsWith(ACTIVITY_COOKIE + '='))
        const lastActivity = cookie ? parseInt(cookie.split('=')[1], 10) : 0
        const now = Math.floor(Date.now() / 1000)

        if (lastActivity && now - lastActivity > 30 * 60) {
          signOutAndRedirect()
        } else {
          resetTimer()
        }
      }
    }
    document.addEventListener('visibilitychange', handleVisibility)

    // Initial timer
    resetTimer()

    return () => {
      events.forEach((event) => window.removeEventListener(event, throttledReset))
      document.removeEventListener('visibilitychange', handleVisibility)
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [resetTimer, signOutAndRedirect])
}
