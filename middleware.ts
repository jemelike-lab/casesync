/**
 * Edge middleware — request-level auth guard + security headers.
 *
 * Responsibilities:
 *   1. Refresh the Supabase session cookie on every request so JWTs never
 *      get stale (companion fix to JWT-expiry=5min in migration 022).
 *   2. Redirect unauthenticated users hitting protected paths to /login,
 *      preserving the intended destination as ?next=.
 *   3. Set request-level security headers (X-Frame-Options: DENY,
 *      X-Content-Type-Options: nosniff, Referrer-Policy, etc.).
 *
 * The matcher at the bottom excludes static assets, the login page, the
 * invite-acceptance flow, health/webhook endpoints, and Next internals.
 *
 * CSRF: Supabase's auth cookie is SameSite=Lax by default, which blocks
 * cross-site POST/PUT/PATCH/DELETE from another origin. The middleware
 * also rejects state-changing requests whose `Origin` header does not
 * match the request host as defense in depth.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'

// Paths that always require authentication. Path *prefix* matching.
const PROTECTED_PREFIXES = [
  '/dashboard',
  '/clients',
  '/admin',
  '/supervisor',
  '/team',
  '/settings',
  '/calendar',
  '/chat',
  '/help',
  '/onboarding',
  '/security',
  '/w',
  '/api/clients',
  '/api/reports',
  '/api/dashboard',
  '/api/sharepoint',
  '/api/calendar',
  '/api/chat',
  '/api/case-ai',
  '/api/blhbot',
  '/api/client-summary',
  '/api/check-deadlines',
  '/api/internal-docs',
  '/api/workryn',
]

// State-changing methods we apply Origin checks to.
const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])

// Paths exempt from the Origin check (webhooks called server-to-server,
// auth bootstrap routes whose own handlers do signature validation).
const ORIGIN_CHECK_EXEMPT = [
  '/api/webhooks/',                  // Vercel + future webhooks (own secret)
  '/api/auth/rate-limit',            // pre-login, no Origin yet from form
  '/api/workryn/evaluations/cron',   // Vercel cron header-authed
  '/api/check-deadlines',            // Vercel cron header-authed
  '/api/health',
  '/api/version',
]

function isProtected(pathname: string): boolean {
  return PROTECTED_PREFIXES.some(p => pathname === p || pathname.startsWith(p + '/'))
}

function isOriginExempt(pathname: string): boolean {
  return ORIGIN_CHECK_EXEMPT.some(p => pathname === p || pathname.startsWith(p))
}

const SECURITY_HEADERS: Record<string, string> = {
  // Stronger than next.config.ts SAMEORIGIN — HIPAA wants DENY.
  'X-Frame-Options': 'DENY',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  'Strict-Transport-Security': 'max-age=63072000; includeSubDomains; preload',
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl
  const method = req.method.toUpperCase()

  // ── 1. Origin / CSRF defense for mutating requests ─────────────────────────
  if (MUTATING_METHODS.has(method) && !isOriginExempt(pathname)) {
    const origin = req.headers.get('origin')
    const host = req.headers.get('host')

    // Same-origin browser requests always send Origin matching Host.
    // Server-to-server callers (no Origin) must go through the exempt list.
    if (origin) {
      try {
        const originHost = new URL(origin).host
        if (originHost !== host) {
          return NextResponse.json(
            { error: 'Cross-origin request rejected' },
            { status: 403 }
          )
        }
      } catch {
        return NextResponse.json(
          { error: 'Malformed Origin header' },
          { status: 400 }
        )
      }
    }
  }

  // ── 2. Build a response we can mutate cookies on ───────────────────────────
  let response = NextResponse.next({ request: req })

  // ── 3. Refresh the Supabase session on every request ───────────────────────
  // This keeps the JWT fresh so the 5-minute expiry from migration 022 never
  // ages out under active use.
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return req.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => req.cookies.set(name, value))
          response = NextResponse.next({ request: req })
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()

  // ── 4. Redirect unauthenticated users away from protected paths ────────────
  if (!user && isProtected(pathname)) {
    const url = req.nextUrl.clone()
    url.pathname = '/login'
    // Don't echo back the API path as a redirect target (would 404)
    if (!pathname.startsWith('/api/')) {
      url.searchParams.set('next', pathname + (req.nextUrl.search || ''))
    }
    return NextResponse.redirect(url)
  }

  // ── 5. Attach security headers ─────────────────────────────────────────────
  for (const [k, v] of Object.entries(SECURITY_HEADERS)) {
    response.headers.set(k, v)
  }

  return response
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     *   - /api/health, /api/version, /api/webhooks (exempted in code anyway)
     *   - /_next/static, /_next/image (build assets)
     *   - /favicon.ico, robots.txt, sitemap.xml, sw.js (PWA),
     *     workbox-*.js (PWA), manifest.* (PWA)
     *   - Public images and the offline page
     */
    '/((?!_next/static|_next/image|favicon\\.ico|robots\\.txt|sitemap\\.xml|sw\\.js|workbox-.*|manifest\\..*|offline|images/|login|accept-invite|auth/callback|auth/confirm|reset-password|api/health|api/version).*)',
  ],
}
