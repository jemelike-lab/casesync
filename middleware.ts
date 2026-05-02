import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

/**
 * Middleware — validates Supabase session freshness on every request.
 *
 * Without this, expired JWTs could linger in cookies and the client-side
 * IdleTimeout / SessionGuard would be the only defence. This adds
 * server-side enforcement: if the token can't be refreshed, redirect
 * to /login with a reason code.
 */
export async function middleware(request: NextRequest) {
  const response = NextResponse.next({
    request: { headers: request.headers },
  })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            request.cookies.set(name, value)
            response.cookies.set(name, value, options)
          })
        },
      },
    }
  )

  // getUser() validates the JWT server-side (calls Supabase Auth).
  // If the token is expired but a refresh_token exists, the SSR client
  // will attempt a refresh automatically. If that also fails, user is null.
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { pathname } = request.nextUrl

  // Protected routes — if no valid session, redirect to login
  const isProtectedRoute =
    !pathname.startsWith('/login') &&
    !pathname.startsWith('/reset-password') &&
    !pathname.startsWith('/onboarding') &&
    !pathname.startsWith('/accept-invite') &&
    !pathname.startsWith('/api/') &&
    !pathname.startsWith('/_next/') &&
    !pathname.startsWith('/sw.js') &&
    !pathname.startsWith('/manifest') &&
    !pathname.startsWith('/icons') &&
    !pathname.startsWith('/splash') &&
    !pathname.startsWith('/logo') &&
    !pathname.startsWith('/favicon') &&
    !pathname.startsWith('/security') &&
    !pathname.startsWith('/offline')

  if (isProtectedRoute && !user) {
    const loginUrl = request.nextUrl.clone()
    loginUrl.pathname = '/login'
    loginUrl.searchParams.set('reason', 'session_expired')
    return NextResponse.redirect(loginUrl)
  }

  // If user is deactivated, sign them out and redirect
  if (user?.user_metadata?.disabled && isProtectedRoute) {
    // Clear session cookies by letting supabase handle it
    // The client-side will pick up the cleared session
    const loginUrl = request.nextUrl.clone()
    loginUrl.pathname = '/login'
    loginUrl.searchParams.set('reason', 'account_deactivated')
    return NextResponse.redirect(loginUrl)
  }

  return response
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico, logo.png, etc.
     */
    '/((?!_next/static|_next/image|favicon\\.ico|logo\\.png|apple-touch-icon\\.png).*)',
  ],
}
