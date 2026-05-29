'use client'
import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import IdleTimeout from './IdleTimeout'

/**
 * SessionGuard — security layer mounted in root layout for all routes.
 *
 *  1. IdleTimeout — 15min inactivity → warning → signout
 *  2. Auth event handling — SIGNED_OUT, TOKEN_REFRESHED
 *  3. Periodic freshness check — 60s getUser() poll
 *  4. Page close detection — sendBeacon signout on tab/app close
 */
export default function SessionGuard() {
  const [authed, setAuthed] = useState(false)
  const router = useRouter()
  const supabase = createClient()
  const redirectToLogin = useCallback(
    (reason: string) => {
      if (typeof window !== 'undefined' && window.location.pathname === '/login') return
      router.push(`/login?reason=${reason}`)
    },
    [router]
  )

  useEffect(() => {
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

    // ── Page close / swipe-away detection ──
    // When the app is closed or swiped away, the page transitions
    // through visibilitychange → pagehide → process kill. We use
    // sendBeacon to fire a signout request that survives the kill.
    //
    // We only use pagehide (not visibilitychange) because
    // visibilitychange fires on benign transitions like in-app
    // navigation, share sheet opens, and notification pull-downs.
    // The !e.persisted check avoids bfcache false positives.

    function handlePageHide(e: PageTransitionEvent) {
      // Fire-and-forget signout on actual page unload (not bfcache).
      // Covers browser tab close, app swipe-away, and PWA kill.
      if (!e.persisted) {
        navigator.sendBeacon('/api/auth/signout')
      }
    }

    window.addEventListener('pagehide', handlePageHide)

    return () => {
      subscription.unsubscribe()
      clearInterval(freshnessInterval)
      window.removeEventListener('pagehide', handlePageHide)
    }
  }, [supabase, redirectToLogin])

  if (!authed) return null

  // 15-minute timeout, 2-minute warning
  return <IdleTimeout timeoutMs={15 * 60 * 1000} warningMs={2 * 60 * 1000} />
}
