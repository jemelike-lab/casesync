import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

/**
 * CaseSync Middleware — Session Management & Route Protection
 *
 * 1. Session timeout: Enforces a 30-minute HIPAA inactivity window via a
 *    `cs_last_activity` cookie. If the cookie is stale or missing and the
 *    user is hitting a protected route, they're redirected to /login.
 *
 * 2. Auth gate: Refreshes the Supabase session on every request. If the
 *    session is expired or invalid, the user is redirected to /login.
 *
 * 3. API auth: API routes that are not in the PUBLIC_API_PREFIXES list
 *    receive a 401 JSON response if the session is missing/expired.
 */

// ---------- configuration ----------

/** HIPAA inactivity timeout in seconds (30 minutes) */
const INACTIVITY_TIMEOUT_S = 30 * 60

/** Routes that don't require authentication */
const PUBLIC_PAGE_PATHS = ['/login', '/signup', '/security', '/auth/callback']

/** API route prefixes that don't require authentication */
const PUBLIC_API_PREFIXES = ['/api/auth', '/api/health', '/api/webhooks']

/** Static/internal paths the middleware should skip entirely */
function shouldSkip(pathname: string): boolean {
  return (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/favicon') ||
    pathname.startsWith('/manifest') ||
    pathname.startsWith('/sw.js') ||
    pathname.startsWith('/workbox-') ||
    pathname.startsWith('/icons') ||
    pathname === '/robots.txt' ||
    pathname === '/sitemap.xml' ||
    /\.\w{2,4}$/.test(pathname) // skip static files (.css, .js, .png, etc.)
  )
}

function isPublicPage(pathname: string): boolean {
  return PUBLIC_PAGE_PATHS.some(
    (p) => pathname === p || pathname.startsWith(p + '/')
  )
}

function isPublicApi(pathname: string): boolean {
  return PUBLIC_API_PREFIXES.some((prefix) => pathname.startsWith(prefix))
}

function isApiRoute(pathname: string): boolean {
  return pathname.startsWith('/api/')
}

// ---------- middleware ----------

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Skip static assets
  if (shouldSkip(pathname)) {
    return NextResponse.next()
  }

  // Allow public pages and public API routes through
  if (isPublicPage(pathname) || isPublicApi(pathname)) {
    return NextResponse.next()
  }

  // Create a response we can modify (set cookies on it)
  let response = NextResponse.next({
    request: { headers: request.headers },
  })

  // Build a Supabase client that reads/writes cookies on the request/response
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          // Write cookies to the request (so downstream server components see them)
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          )
          // Write cookies to the response (so the browser receives them)
          response = NextResponse.next({ request: { headers: request.headers } })
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // Refresh the session — this also sets updated cookies on the response
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  // ---------- No valid session ----------
  if (authError || !user) {
    if (isApiRoute(pathname)) {
      return NextResponse.json(
        { error: 'Unauthorized — session expired or missing' },
        { status: 401 }
      )
    }
    // Redirect pages to login
    const loginUrl = request.nextUrl.clone()
    loginUrl.pathname = '/login'
    loginUrl.searchParams.set('reason', 'session_timeout')
    loginUrl.searchParams.set('redirect', pathname)
    return NextResponse.redirect(loginUrl)
  }

  // ---------- Inactivity timeout (HIPAA) ----------
  const now = Math.floor(Date.now() / 1000)
  const lastActivity = parseInt(
    request.cookies.get('cs_last_activity')?.value ?? '0',
    10
  )

  if (lastActivity > 0 && now - lastActivity > INACTIVITY_TIMEOUT_S) {
    // Session is valid but user has been inactive too long

    // Sign out server-side so the session is invalidated, not just the cookie
    await supabase.auth.signOut()

    if (isApiRoute(pathname)) {
      return NextResponse.json(
        { error: 'Session timed out due to inactivity' },
        { status: 401 }
      )
    }

    const loginUrl = request.nextUrl.clone()
    loginUrl.pathname = '/login'
    loginUrl.searchParams.set('reason', 'session_timeout')
    loginUrl.searchParams.set('redirect', pathname)

    // Clear the activity cookie
    const redirectResponse = NextResponse.redirect(loginUrl)
    redirectResponse.cookies.delete('cs_last_activity')
    return redirectResponse
  }

  // ---------- Update activity timestamp ----------
  response.cookies.set('cs_last_activity', String(now), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: INACTIVITY_TIMEOUT_S,
  })

  return response
}

// ---------- matcher ----------
// Run on all routes except static files handled by shouldSkip above.
// The matcher is a first-pass filter; shouldSkip provides the fine-grained check.
export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico, sitemap.xml, robots.txt (static metadata)
     */
    '/((?!_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt).*)',
  ],
}