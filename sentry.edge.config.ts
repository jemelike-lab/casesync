// Sentry server-side error tracking
// To enable: install @sentry/nextjs and set NEXT_PUBLIC_SENTRY_DSN in Vercel
if (process.env.NEXT_PUBLIC_SENTRY_DSN) {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Sentry = require('@sentry/nextjs')
    Sentry.init({
      dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
      tracesSampleRate: 0.1,
      environment: process.env.NODE_ENV,
    })
  } catch {
    // @sentry/nextjs not installed yet
  }
}
