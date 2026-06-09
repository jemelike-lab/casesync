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

    // ── Background detection (iOS PWA reliable) ──
    // iOS PWAs don't honor session cookies — the WebKit process is
    // suspended (not killed) on swipe-away, so cookies persist. And
    // pagehide may not fire. We use visibilitychange + localStorage:
    //  - hidden  → record timestamp
    //  - visible → if elapsed > GRACE_MS, force logout
    // localStorage survives the suspend, so the check on resume is reliable.
    const BACKGROUND_GRACE_MS = 30_000 // 30 seconds
    const HIDDEN_AT_KEY = 'cs_hidden_at'

    // Clear any stale hidden-timestamp from a previous browser session.
    // localStorage persists across PWA restarts and browser tab closes, so
    // without this cleanup the FIRST visibilitychange in a new session
    // would compare against an ancient timestamp and force an immediate
    // logout — even on something as innocuous as a sidebar nav.
    try { localStorage.removeItem(HIDDEN_AT_KEY) } catch { /* ignore */ }

    function handleVisibility() {
      if (document.visibilityState === 'hidden') {
        try {
          localStorage.setItem(HIDDEN_AT_KEY, String(Date.now()))
        } catch {
          // localStorage may throw in private mode — ignore
        }
        return
      }

      if (document.visibilityState === 'visible') {
        let hiddenAt = 0
        try {
          hiddenAt = parseInt(localStorage.getItem(HIDDEN_AT_KEY) || '0', 10)
          localStorage.removeItem(HIDDEN_AT_KEY)
        } catch {
          // ignore
        }
        if (hiddenAt > 0 && Date.now() - hiddenAt > BACKGROUND_GRACE_MS) {
          // App was backgrounded too long → force logout
          supabase.auth.signOut().finally(() => {
            redirectToLogin('signed_out')
          })
        }
      }
    }

    document.addEventListener('visibilitychange', handleVisibility)

    // pagehide handler removed — it fired on every same-origin navigation
    // (clicking any sidebar link), which sent a sendBeacon to /api/auth/signout
    // and killed the server session before the next page could load. iOS PWA
    // backgrounding is already covered by the visibilitychange handler above;
    // browser tab close lets the server-side inactivity timeout reap naturally.

    return () => {
      subscription.unsubscribe()
      clearInterval(freshnessInterval)
      document.removeEventListener('visibilitychange', handleVisibility)
    }
  }, [supabase, redirectToLogin])

  if (!authed) return null

  // 15-minute timeout, 2-minute warning
  return <IdleTimeout timeoutMs={15 * 60 * 1000} warningMs={2 * 60 * 1000} />
}
