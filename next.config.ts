import withPWA from 'next-pwa'

const pwaConfig = withPWA({
  dest: 'public',
  register: true,
  skipWaiting: true,
  disable: process.env.NODE_ENV === 'development',
})

const securityHeaders = [
  { key: 'X-DNS-Prefetch-Control', value: 'on' },
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
  { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
  {
    key: 'Content-Security-Policy',
    value:
      "default-src 'self'; script-src 'self' 'unsafe-eval' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https:; font-src 'self'; connect-src 'self' https://*.supabase.co wss://*.supabase.co https://api.resend.com https://graph.microsoft.com; frame-ancestors 'none';",
  },
]

const nextConfig = {
  // Turbopack is default in Next.js 16; add empty config to satisfy peer checks
  turbopack: {},
  async headers() {
    return [{ source: '/(.*)', headers: securityHeaders }]
  },
}

const configWithPWA = pwaConfig(nextConfig)

// Wrap with Sentry only if @sentry/nextjs is installed and DSN is configured.
// To enable: npm install @sentry/nextjs --legacy-peer-deps
let finalConfig = configWithPWA
if (process.env.NEXT_PUBLIC_SENTRY_DSN) {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { withSentryConfig } = require('@sentry/nextjs')
    finalConfig = withSentryConfig(configWithPWA, {
      silent: true,
      org: process.env.SENTRY_ORG,
      project: process.env.SENTRY_PROJECT,
    })
  } catch {
    // @sentry/nextjs not installed yet — that's fine
  }
}

export default finalConfig
