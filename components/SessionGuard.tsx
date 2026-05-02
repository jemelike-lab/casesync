'use client'
import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import IdleTimeout from './IdleTimeout'

/**
 * SessionGuard — mounts IdleTimeout for any authenticated user and
 * handles critical auth lifecycle events:
 *
 *  • TOKEN_EXPIRED  — redirect to /login immediately
 *  • SIGNED_OUT     — redirect to /login (covers admin-revoked sessions)
 *  • USER_DELETED   — redirect to /login
 *
 * Also sets up a periodic session-freshness check so that even if the
 * browser tab is idle (no user interaction to trigger IdleTimeout), an
 * expired or revoked session is caught.
 */
export default function SessionGuard() {
  const [authed, setAuthed] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  const redirectToLogin = useCallback(
    (reason: string) => {
      // Avoid redirect loops if already on /login
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
          // Good — session still valid
          setAuthed(!!session)
          break

        case 'SIGNED_OUT':
          setAuthed(false)
          redirectToLogin('signed_out')
          break

        default:
          // SIGNED_IN, INITIAL_SESSION, PASSWORD_RECOVERY, etc.
          setAuthed(!!session)
      }
    })

    // ── Periodic session freshness check ──
    // Every 60s, validate the session server-side. If revoked/expired,
    // onAuthStateChange → SIGNED_OUT handles the redirect.
    const freshnessInterval = setInterval(async () => {
      const { data, error } = await supabase.auth.getUser()
      if (error || !data.user) {
        await supabase.auth.signOut()
      } else if (data.user.user_metadata?.disabled) {
        await supabase.auth.signOut()
        redirectToLogin('account_deactivated')
      }
    }, 60_000)

    return () => {
      subscription.unsubscribe()
      clearInterval(freshnessInterval)
    }
  }, [supabase, redirectToLogin])

  if (!authed) return null

  // 15-minute timeout, 2-minute warning
  return <IdleTimeout timeoutMs={15 * 60 * 1000} warningMs={2 * 60 * 1000} />
}
