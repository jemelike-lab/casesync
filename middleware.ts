import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

// Inactivity timeout: 30 minutes (in seconds)
const INACTIVITY_TIMEOUT = 30 * 60

export async function middleware(request: NextRequest) {
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
          cookiesToSet.forEach(({ name, value, options }) =>
            request.cookies.set(name, value)
          )
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // Refresh the session - this is critical for SSR auth
  const {
    data: { user },
  } = await supabase.auth.getUser()

  // Check inactivity timeout via cookie
  const lastActivity = request.cookies.get('cs_last_activity')?.value
  const now = Math.floor(Date.now() / 1000)

  if (user && lastActivity) {
    const elapsed = now - parseInt(lastActivity, 10)
    if (elapsed > INACTIVITY_TIMEOUT) {
      // Session timed out due to inactivity - sign out
      await supabase.auth.signOut()
      const loginUrl = request.nextUrl.clone()
      loginUrl.pathname = '/auth'
      loginUrl.searchParams.set('reason', 'timeout')
      const redirectResponse = NextResponse.redirect(loginUrl)
      // Clear the activity cookie
      redirectResponse.cookies.delete('cs_last_activity')
      return redirectResponse
    }
  }

  // Update last activity timestamp for authenticated users
  if (user) {
    supabaseResponse.cookies.set('cs_last_activity', String(now), {
      path: '/',
      httpOnly: false, // client JS needs to read/update this
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: INACTIVITY_TIMEOUT,
    })
  }

  // If no user and trying to access protected routes, redirect to login
  if (
    !user &&
    !request.nextUrl.pathname.startsWith('/auth') &&
    !request.nextUrl.pathname.startsWith('/api/auth') &&
    !request.nextUrl.pathname.startsWith('/_next') &&
    !request.nextUrl.pathname.startsWith('/favicon') &&
    !request.nextUrl.pathname.includes('.')
  ) {
    const loginUrl = request.nextUrl.clone()
    loginUrl.pathname = '/auth'
    return NextResponse.redirect(loginUrl)
  }

  return supabaseResponse
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization)
     * - favicon.ico (favicon)
     * - public folder files
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|manifest|webmanifest)$).*)',
  ],
}
