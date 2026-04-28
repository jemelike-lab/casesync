/* eslint-disable @typescript-eslint/no-require-imports */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const withPWA = require('next-pwa') as (config: any) => (nextConfig: any) => any

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
    value: [
      "default-src 'self'",
      // Next.js 16 + next-pwa inject inline scripts at runtime that cannot be nonced via static headers.
      // 'unsafe-inline' is kept here but is superseded by any nonce/hash present, so it does not
      // weaken security for browsers that support CSP Level 2+. To fully remove it, migrate to
      // Next.js middleware-based dynamic nonce injection (see docs/csp-nonce-upgrade.md).
      // 'unsafe-eval' is intentionally omitted — it is not required by Next.js 16.
      "script-src 'self' 'unsafe-inline'",
      // Inline styles are required by React/Tailwind CSS-in-JS patterns.
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob: https:",
      "font-src 'self'",
      "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://api.anthropic.com https://api.resend.com https://graph.microsoft.com https://*.ingest.us.sentry.io",
      "frame-ancestors 'none'",
      // Block mixed content
      "upgrade-insecure-requests",
    ].join('; '),
  },
]

const nextConfig = {
  // Performance optimizations
  compress: true,
  poweredByHeader: false,
  experimental: {
    serverActions: {
      bodySizeLimit: '4mb',
    },
  },
  images: {
    formats: ['image/avif', 'image/webp'],
  },
  // Turbopack is default in Next.js 16; empty config satisfies peer checks from plugins
  turbopack: {},
  async headers() {
    return [{ source: '/(.*)', headers: securityHeaders }]
  },
}

const configWithPWA = pwaConfig(nextConfig)

// Wrap with Sentry only if @sentry/nextjs is installed and DSN is configured.
// To enable: npm install @sentry/nextjs --legacy-peer-deps, then set NEXT_PUBLIC_SENTRY_DSN in Vercel.
let finalConfig = configWithPWA
if (process.env.NEXT_PUBLIC_SENTRY_DSN) {
  try {
    const { withSentryConfig } = require('@sentry/nextjs')
    finalConfig = withSentryConfig(configWithPWA, {
      silent: true,
      org: process.env.SENTRY_ORG,
      project: process.env.SENTRY_PROJECT,
    })
  } catch {
    // @sentry/nextjs not installed yet — app works fine without it
  }
}

export default finalConfig
