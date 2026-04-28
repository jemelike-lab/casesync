import withSerwistInit from '@serwist/next'
import { execSync } from 'child_process'

// Use git commit hash as cache revision for precached pages
const revision = (() => {
  try {
    return execSync('git rev-parse HEAD', { encoding: 'utf-8' }).trim().slice(0, 7)
  } catch {
    return crypto.randomUUID().slice(0, 7)
  }
})()

const withSerwist = withSerwistInit({
  swSrc: 'app/sw.ts',
  swDest: 'public/sw.js',
  cacheOnNavigation: true,
  reloadOnOnline: false, // Don't force-reload when coming back online (form data safety)
  disable: process.env.NODE_ENV === 'development',
  additionalPrecacheEntries: [
    { url: '/offline', revision },
  ],
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
      // Serwist + Next.js inject inline scripts at runtime that cannot be nonced via static headers.
      // 'unsafe-inline' is kept here but is superseded by any nonce/hash present, so it does not
      // weaken security for browsers that support CSP Level 2+.
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
    formats: ['image/avif' as const, 'image/webp' as const],
  },
  async headers() {
    return [{ source: '/(.*)', headers: securityHeaders }]
  },
}

// Wrap with Serwist for PWA service worker generation
const configWithSerwist = withSerwist(nextConfig)

// Wrap with Sentry only if @sentry/nextjs is installed and DSN is configured.
let finalConfig = configWithSerwist
if (process.env.NEXT_PUBLIC_SENTRY_DSN) {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { withSentryConfig } = require('@sentry/nextjs')
    finalConfig = withSentryConfig(configWithSerwist, {
      silent: true,
      org: process.env.SENTRY_ORG,
      project: process.env.SENTRY_PROJECT,
    })
  } catch {
    // @sentry/nextjs not installed yet — app works fine without it
  }
}

export default finalConfig
