import { createServerClient } from '@supabase/ssr'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { rateLimit } from '@/lib/rate-limit'

const INACTIVITY_TIMEOUT_S = 30 * 60
const DATA_RATE_LIMIT = 100
const DATA_RATE_WINDOW_MS = 60 * 1000

const PUBLIC_PATHS = [
  '/login', '/accept-invite', '/reset-password', '/onboarding',
  '/offline', '/security', '/api/auth', '/api/health', '/api/webhooks',
  '/api/version',
]

const DATA_API_PREFIXES = [
  '/api/clients', '/api/dashboard', '/api/reports', '/api/calendar',
  '/api/blhbot', '/api/case-ai', '/api/chat', '/api/workryn',
  '/api/guides', '/api/sharepoint',
]

function isPublic(pathname: string): boolean {
  return PUBLIC_PATHS.some((p) => pathname.startsWith(p))
}

function isApiRoute(pathname: string): boolean {
  return pathname.startsWith('/api/')
}

function isDataApiRoute(pathname: string): boolean {
  return DATA_API_PREFIXES.some((p) => pathname.startsWith(p))
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl

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

  const { data: { user } } = await supabase.auth.getUser()

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

  if (user.user_metadata?.disabled) {
    await supabase.auth.signOut()
    const loginUrl = new URL('/login', request.url)
    loginUrl.searchParams.set('reason', 'account_deactivated')
    return NextResponse.redirect(loginUrl)
  }

  const now = Math.floor(Date.now() / 1000)
  const lastActivity = parseInt(
    request.cookies.get('cs_last_activity')?.value ?? '0', 10
  )

  if (lastActivity > 0 && now - lastActivity > INACTIVITY_TIMEOUT_S) {
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

  if (isDataApiRoute(pathname)) {
    const result = rateLimit(`data:${user.id}`, {
      limit: DATA_RATE_LIMIT,
      windowMs: DATA_RATE_WINDOW_MS,
    })

    if (!result.ok) {
      const retryAfterSecs = Math.ceil((result.resetAt - Date.now()) / 1000)
      return NextResponse.json(
        { error: 'Too many requests — rate limit exceeded', retryAfter: retryAfterSecs },
        {
          status: 429,
          headers: {
            'Retry-After': String(retryAfterSecs),
            'X-RateLimit-Limit': String(DATA_RATE_LIMIT),
            'X-RateLimit-Remaining': '0',
            'X-RateLimit-Reset': String(Math.ceil(result.resetAt / 1000)),
          },
        }
      )
    }

    response.headers.set('X-RateLimit-Limit', String(DATA_RATE_LIMIT))
    response.headers.set('X-RateLimit-Remaining', String(result.remaining))
    response.headers.set('X-RateLimit-Reset', String(Math.ceil(result.resetAt / 1000)))
  }

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
    '/((?!_next/static|_next/image|favicon.ico|logo.png|manifest.json|sw.js|workbox-.*|icons/.*|splash/.*|apple-touch-icon.png).*)',
  ],
}
