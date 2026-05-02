import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

/**
 * POST /api/auth/signout
 *
 * Server-side sign-out endpoint. Used by:
 *  - navigator.sendBeacon() when the PWA is swiped away / closed
 *  - Any client that needs a reliable fire-and-forget signout
 *
 * Clears the Supabase session cookies and the cs_last_activity cookie.
 */
export async function POST() {
  const cookieStore = await cookies()

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (cookiesToSet) => {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {
            // Headers already sent — cookies can't be set
          }
        },
      },
    }
  )

  await supabase.auth.signOut()

  // Also clear the inactivity cookie
  try {
    cookieStore.delete('cs_last_activity')
  } catch {
    // Ignore
  }

  return NextResponse.json({ ok: true })
}
