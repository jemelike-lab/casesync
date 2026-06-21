import { createBrowserClient } from '@supabase/ssr'

/**
 * Browser Supabase client with **session-only cookies**.
 *
 * By overriding setAll we strip `max-age` and `expires` from every auth
 * cookie, so the browser deletes them when the app/tab is closed.
 * This enforces "close app = log out".
 */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          // No `document` during SSR. Return no cookies so the auth client's
          // init can't throw "document is not defined" when a component
          // constructs this browser client server-side. Server-side auth is
          // handled by the server client; this one only matters in the browser.
          if (typeof document === 'undefined') return []
          return document.cookie
            .split('; ')
            .filter(Boolean)
            .map((c) => {
              const idx = c.indexOf('=')
              return {
                name: c.slice(0, idx),
                value: c.slice(idx + 1),
              }
            })
        },
        setAll(cookiesToSet) {
          if (typeof document === 'undefined') return
          cookiesToSet.forEach(({ name, value, options }) => {
            // Build cookie string WITHOUT max-age or expires → session cookie
            const parts = [`${name}=${value}`, 'path=/']
            if (options?.sameSite) parts.push(`samesite=${options.sameSite}`)
            if (
              options?.secure ||
              (typeof location !== 'undefined' &&
                location.protocol === 'https:')
            )
              parts.push('secure')
            if (options?.domain) parts.push(`domain=${options.domain}`)
            document.cookie = parts.join('; ')
          })
        },
      },
    }
  )
}
