'use client'
import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import IdleTimeout from './IdleTimeout'

/**
 * SessionGuard — security layer mounted in root layout for all routes.
 *
 *  1. IdleTimeout — 30min inactivity → warning → signout
 *  2. Auth event handling — SIGNED_OUT, TOKEN_REFRESHED
 *  3. Periodic freshness check — 60s getUser() poll
 *  4. Background tab handling — visibilitychange + localStorage grace window
 *
 * Timing rationale (updated 2026-06-11):
 *   - Idle timeout 30min: HIPAA-acceptable for ops dashboards, removes the
 *     "signed out every 15min while editing in another app" friction that
 *     bit us repeatedly during the v2 migration.
 *   - Background grace 5min: matches typical "context-switched to terminal
 *     or chat" pattern. The previous 30s was too aggressive — a single
 *     30-second context switch in dev would force-log-out on tab return.
 *     5min still reaps abandoned PWA sessions reliably.
 *   - Both values are independent: idle measures activity inside the tab,
 *     grace measures elapsed time the tab was hidden. They compose; the
 *     stricter one wins for any given pattern.
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
    //
    // 2026-06-11: BACKGROUND_GRACE_MS bumped 30s → 5min. The 30s value
    // force-logged-out on any context switch longer than half a minute
    // (terminal use, brief Slack reply, walking to the kitchen). 5min
    // is the sweet spot — abandoned PWA sessions still reap, but normal
    // multi-tasking doesn't punish the user.
    // 2026-07-04 (Josh, PHI hardening): grace is now MODE-AWARE. The 5min
    // value protects desktop context-switching (the 2026-06-11 rationale
    // above), but the installed PWA carries PHI into the field — swiping
    // away and reopening must demand credentials. Standalone gets 60s.
    const isStandalone =
      window.matchMedia?.('(display-mode: standalone)')?.matches === true ||
      (navigator as unknown as { standalone?: boolean }).standalone === true
    const BACKGROUND_GRACE_MS = isStandalone ? 60 * 1000 : 5 * 60 * 1000
    const HIDDEN_AT_KEY = 'cs_hidden_at'

    // ── Cold-relaunch guard (standalone PWA only) ──
    // sessionStorage survives suspend, reloads, and in-app navigation, but
    // is destroyed when the OS kills the PWA process. A missing marker on
    // mount therefore means the app was fully closed since last launch —
    // for PHI, that requires fresh credentials regardless of idle timers.
    // Scoped to standalone so desktop browser tabs (each with their own
    // sessionStorage) are unaffected.
    const APP_ALIVE_KEY = 'cs_app_alive'
    if (isStandalone) {
      let alive: string | null = null
      try { alive = sessionStorage.getItem(APP_ALIVE_KEY) } catch { /* private mode */ }
      try { sessionStorage.setItem(APP_ALIVE_KEY, '1') } catch { /* ignore */ }
      if (!alive && window.location.pathname !== '/login') {
        supabase.auth.getSession().then(({ data }) => {
          if (data.session) {
            supabase.auth.signOut().finally(() => redirectToLogin('app_relaunch'))
          }
        })
      }
    }

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

  // 30-minute idle timeout, 2-minute warning before signout.
  // See timing rationale at the top of the file.
  return <IdleTimeout timeoutMs={30 * 60 * 1000} warningMs={2 * 60 * 1000} />
}
