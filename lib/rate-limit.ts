// Consolidated rate limiter module.
// Note: this is an in-memory limiter — suitable for non-critical abuse prevention
// (e.g. SharePoint uploads, webhook endpoints). Auth login rate limiting uses
// the persistent Supabase-backed limiter in /api/auth/rate-limit/route.ts.
// In serverless environments this resets per cold start, which is acceptable
// for these use cases.

type Entry = { count: number; resetAt: number }

const buckets = new Map<string, Entry>()

export function rateLimit(
  key: string,
  opts: { limit: number; windowMs: number }
): { ok: boolean; remaining: number; resetAt: number } {
  const now = Date.now()
  const e = buckets.get(key)
  if (!e || now >= e.resetAt) {
    const resetAt = now + opts.windowMs
    buckets.set(key, { count: 1, resetAt })
    return { ok: true, remaining: opts.limit - 1, resetAt }
  }

  if (e.count >= opts.limit) {
    return { ok: false, remaining: 0, resetAt: e.resetAt }
  }

  e.count += 1
  buckets.set(key, e)
  return { ok: true, remaining: opts.limit - e.count, resetAt: e.resetAt }
}

// Legacy alias — checkRateLimit was only used by the old auth rate limit route
// which has been replaced by the persistent Supabase-backed version.
// Kept here as a no-op export to avoid import errors if any stale references remain.
export function checkRateLimit(
  _key: string,
  _maxAttempts = 5,
  _windowMs = 15 * 60 * 1000
): { allowed: boolean; remaining: number; resetAt: number } {
  // This function is deprecated — use the persistent rate limiter in
  // /api/auth/rate-limit/route.ts for auth, or rateLimit() above for
  // non-critical in-memory limiting.
  return { allowed: true, remaining: _maxAttempts - 1, resetAt: Date.now() + _windowMs }
}
