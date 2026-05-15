import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

/**
 * Supabase session refresh middleware.
 *
 * Supabase Auth uses two cookies: `sb-<ref>-auth-token` (access, short-lived)
 * and `sb-<ref>-auth-token-code-verifier` (refresh, long-lived). When the
 * access token expires, the server-side `getUser()` call refreshes it
 * automatically — but ONLY if the refreshed cookies are written back to the
 * response. Without middleware doing this on every request, API routes see
 * stale cookies and return 401.
 *
 * This is the Supabase-recommended pattern for Next.js App Router with
 * @supabase/ssr >= 0.5.
 */
export async function updateSession(request: NextRequest) {
  // Start with a pass-through response so Supabase can attach Set-Cookie
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          // 1) Write to the incoming request so downstream server components
          //    see the refreshed tokens immediately.
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          )

          // 2) Write to the response so the browser stores the refreshed tokens.
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // IMPORTANT: Do NOT use getSession() here — it only reads from local storage
  // and does NOT validate with the Supabase Auth server. getUser() sends a
  // request to the Auth server every time, refreshing the token if needed.
  //
  // We intentionally discard the result; the side-effect of refreshing the
  // cookie is what matters.
  const {
    data: { user },
  } = await supabase.auth.getUser()

  // If no valid session and not already on login/auth pages, redirect to login.
  // This prevents ghost sessions where the UI looks logged-in but API calls fail.
  if (
    !user &&
    !request.nextUrl.pathname.startsWith('/login') &&
    !request.nextUrl.pathname.startsWith('/auth') &&
    !request.nextUrl.pathname.startsWith('/api/auth') &&
    !request.nextUrl.pathname.startsWith('/reset-password') &&
    !request.nextUrl.pathname.startsWith('/invite') &&
    !request.nextUrl.pathname.startsWith('/_next') &&
    !request.nextUrl.pathname.startsWith('/manifest') &&
    !request.nextUrl.pathname.startsWith('/sw') &&
    !request.nextUrl.pathname.startsWith('/favicon') &&
    !request.nextUrl.pathname.startsWith('/icons') &&
    request.nextUrl.pathname !== '/'
  ) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    url.searchParams.set('reason', 'session_expired')
    return NextResponse.redirect(url)
  }

  return supabaseResponse
}
