type Entry = { count: number; resetAt: number }

// Simple in-memory rate limiter for serverless.
// Note: per-instance only (good enough to curb abuse, not a strict global limit).
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
