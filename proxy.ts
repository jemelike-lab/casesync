import { createServerClient } from '@supabase/ssr'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

/**
 * CaseSync Proxy — Session Management & Route Protection
 *
 * 1. Auth gate: refreshes Supabase session on every request.
 *    Redirects to /login if session is missing or expired.
 *
 * 2. HIPAA inactivity timeout (30 min): tracks last activity via an
 *    httpOnly `cs_last_activity` cookie. Signs out server-side and
 *    redirects to /login?reason=session_timeout on inactivity.
 *
 * 3. Disabled-user check: signs out and redirects if user_metadata.disabled.
 *
 * 4. API routes: returns 401 JSON instead of redirecting.
 */

/** HIPAA inactivity timeout in seconds (30 minutes) */
const INACTIVITY_TIMEOUT_S = 30 * 60

const PUBLIC_PATHS = [
  '/login',
  '/accept-invite',
  '/reset-password',
  '/onboarding',
  '/offline',
  '/security',
  '/api/auth',
  '/api/health',
  '/api/webhooks',
]

function isPublic(pathname: string): boolean {
  return PUBLIC_PATHS.some((p) => pathname.startsWith(p))
}

function isApiRoute(pathname: string): boolean {
  return pathname.startsWith('/api/')
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Allow public routes through without any auth check
  if (isPublic(pathname)) {
    return NextResponse.next()
  }

  let response = NextResponse.next({
    request: { headers: request.headers },
  })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (cookiesToSet) => {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          )
          response = NextResponse.next({ request: { headers: request.headers } })
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const {
    data: { user },
  } = await supabase.auth.getUser()

  // ---------- No valid session ----------
  if (!user) {
    if (isApiRoute(pathname)) {
      return NextResponse.json(
        { error: 'Unauthorized — session expired or missing' },
        { status: 401 }
      )
    }
    const loginUrl = new URL('/login', request.url)
    loginUrl.searchParams.set('reason', 'session_timeout')
    loginUrl.searchParams.set('redirect', pathname)
    return NextResponse.redirect(loginUrl)
  }

  // ---------- Disabled user check ----------
  if (user.user_metadata?.disabled) {
    await supabase.auth.signOut()
    return NextResponse.redirect(new URL('/login', request.url))
  }

  // ---------- Inactivity timeout (HIPAA 30 min) ----------
  const now = Math.floor(Date.now() / 1000)
  const lastActivity = parseInt(
    request.cookies.get('cs_last_activity')?.value ?? '0',
    10
  )

  if (lastActivity > 0 && now - lastActivity > INACTIVITY_TIMEOUT_S) {
    // Sign out server-side — invalidates the session, not just the cookie
    await supabase.auth.signOut()

    if (isApiRoute(pathname)) {
      return NextResponse.json(
        { error: 'Session timed out due to inactivity' },
        { status: 401 }
      )
    }

    const loginUrl = new URL('/login', request.url)
    loginUrl.searchParams.set('reason', 'session_timeout')
    loginUrl.searchParams.set('redirect', pathname)

    const redirectResponse = NextResponse.redirect(loginUrl)
    redirectResponse.cookies.delete('cs_last_activity')
    return redirectResponse
  }

  // ---------- Refresh activity timestamp ----------
  response.cookies.set('cs_last_activity', String(now), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: INACTIVITY_TIMEOUT_S,
  })

  return response
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|logo.png|manifest.json|sw.js|workbox-.*).*)',
  ],
}