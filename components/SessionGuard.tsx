'use client'
import { useEffect, useState, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import IdleTimeout from './IdleTimeout'

/**
 * SessionGuard — security layer mounted in root layout for all routes.
 *
 *  1. IdleTimeout — 15min inactivity → warning → signout
 *  2. Auth event handling — SIGNED_OUT, TOKEN_REFRESHED
 *  3. Periodic freshness check — 60s getUser() poll
 *  4. PWA close detection — sendBeacon signout on swipe-away
 */
export default function SessionGuard() {
  const [authed, setAuthed] = useState(false)
  const router = useRouter()
  const supabase = createClient()
  const isStandalone = useRef(false)

  const redirectToLogin = useCallback(
    (reason: string) => {
      if (typeof window !== 'undefined' && window.location.pathname === '/login') return
      router.push(`/login?reason=${reason}`)
    },
    [router]
  )

  useEffect(() => {
    // Detect if running as installed PWA (standalone mode)
    isStandalone.current =
      typeof window !== 'undefined' &&
      (window.matchMedia?.('(display-mode: standalone)')?.matches ||
       (window.navigator as any).standalone === true)

    supabase.auth.getSession().then(({ data }) => {
      setAuthed(!!data.session)
    })

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      switch (event) {
        case 'TOKEN_REFRESHED':
          setAuthed(!!session)
          break
        case 'SIGNED_OUT':
          setAuthed(false)
          redirectToLogin('signed_out')
          break
        default:
          setAuthed(!!session)
      }
    })

    // ── Periodic session freshness check (60s) ──
    const freshnessInterval = setInterval(async () => {
      const { data, error } = await supabase.auth.getUser()
      if (error || !data.user) {
        await supabase.auth.signOut()
      } else if (data.user.user_metadata?.disabled) {
        await supabase.auth.signOut()
        redirectToLogin('account_deactivated')
      }
    }, 60_000)

    // ── PWA close / swipe-away detection ──
    // When a PWA is swiped away on iOS/Android, the page transitions
    // through visibilitychange → pagehide → process kill. We use
    // sendBeacon to fire a signout request that survives the kill.
    //
    // We only do this for standalone (installed) PWAs — in a regular
    // browser tab, closing a tab shouldn't sign you out since you
    // might have other tabs open.

    function handleVisibilityChange() {
      if (
        document.visibilityState === 'hidden' &&
        isStandalone.current
      ) {
        // Fire-and-forget signout via beacon
        navigator.sendBeacon('/api/auth/signout')
        // Also clear client-side session storage
        supabase.auth.signOut()
      }
    }

    function handlePageHide() {
      if (isStandalone.current) {
        // Fallback for browsers that fire pagehide but not visibilitychange
        navigator.sendBeacon('/api/auth/signout')
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    window.addEventListener('pagehide', handlePageHide)

    return () => {
      subscription.unsubscribe()
      clearInterval(freshnessInterval)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      window.removeEventListener('pagehide', handlePageHide)
    }
  }, [supabase, redirectToLogin])

  if (!authed) return null

  // 15-minute timeout, 2-minute warning
  return <IdleTimeout timeoutMs={15 * 60 * 1000} warningMs={2 * 60 * 1000} />
}
