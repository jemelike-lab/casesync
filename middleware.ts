import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

const PUBLIC_ROUTES = new Set(['/login', '/reset-password', '/auth/callback', '/auth/confirm'])
const SESSION_TIMEOUT_MS = 8 * 60 * 60 * 1000

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl
  if (
    pathname.startsWith('/_next') || pathname.startsWith('/api') ||
    pathname.startsWith('/manifest') || pathname.startsWith('/sw.js') ||
    pathname.startsWith('/favicon') || pathname.endsWith('.ico') ||
    pathname.endsWith('.png') || pathname.endsWith('.svg') ||
    PUBLIC_ROUTES.has(pathname)
  ) {
    return NextResponse.next()
  }

  let response = NextResponse.next({ request })
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() { return request.cookies.getAll() },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          response = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options))
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    url.searchParams.set('reason', 'session_timeout')
    url.searchParams.set('redirect', pathname)
    return NextResponse.redirect(url)
  }

  const lastActivity = request.cookies.get('cs_last_activity')?.value
  const now = Date.now()
  if (lastActivity && (now - parseInt(lastActivity, 10)) > SESSION_TIMEOUT_MS) {
    await supabase.auth.signOut()
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    url.searchParams.set('reason', 'inactivity_timeout')
    url.searchParams.set('redirect', pathname)
    const r = NextResponse.redirect(url)
    r.cookies.delete('cs_last_activity')
    return r
  }

  response.cookies.set('cs_last_activity', String(now), {
    httpOnly: true, secure: true, sameSite: 'lax', path: '/', maxAge: 86400,
  })
  return response
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt).*)'],
}
