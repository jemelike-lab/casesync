import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

/**
 * Supabase session middleware.
 *
 * 1. Refreshes the auth session on every navigation (standard SSR pattern).
 * 2. Strips `maxAge` and `expires` from all Supabase auth cookies so they
 *    become **session cookies** — the browser deletes them when the app or
 *    tab is closed, enforcing "close app = log out".
 */
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
          // Forward cookies to the request so downstream server components see them
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          )

          // Recreate response to pick up modified request cookies
          supabaseResponse = NextResponse.next({ request })

          // Set cookies on the response WITHOUT maxAge/expires → session cookies
          cookiesToSet.forEach(({ name, value, options }) => {
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            const { maxAge, expires, ...sessionOptions } = options || {}
            supabaseResponse.cookies.set(name, value, {
              ...sessionOptions,
              // No maxAge, no expires → browser treats as session cookie
            })
          })
        },
      },
    }
  )

  // Refreshes the session if expired; the setAll callback writes session cookies
  await supabase.auth.getUser()

  return supabaseResponse
}

export const config = {
  matcher: [
    /*
     * Match all routes EXCEPT:
     *  - _next/static, _next/image (Next.js internals)
     *  - favicon.ico, sitemap.xml, robots.txt (static files)
     *  - Public assets (.svg, .png, .jpg, .gif, .ico, .webp, .woff2)
     */
    '/((?!_next/static|_next/image|favicon\\.ico|sitemap\\.xml|robots\\.txt|.*\\.(?:svg|png|jpg|jpeg|gif|ico|webp|woff2?)$).*)',
  ],
}
