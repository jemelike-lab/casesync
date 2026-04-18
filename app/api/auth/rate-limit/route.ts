import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// Persistent rate limiter backed by Supabase.
// Unlike the in-memory version, this survives serverless cold starts and
// works correctly across all Vercel function instances.
//
// Requires the auth_rate_limits table — see:
// supabase/migrations/013_auth_rate_limits.sql

const MAX_ATTEMPTS = 5
const WINDOW_MS = 15 * 60 * 1000 // 15 minutes

async function checkRateLimitPersistent(
  key: string
): Promise<{ allowed: boolean; remaining: number; resetAt: number }> {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const now = new Date()
  const resetAt = new Date(Date.now() + WINDOW_MS)

  // Try to get existing record
  const { data: existing } = await supabase
    .from('auth_rate_limits')
    .select('count, reset_at')
    .eq('key', key)
    .single()

  // If record exists and window is still active
  if (existing && new Date(existing.reset_at) > now) {
    const newCount = existing.count + 1
    await supabase
      .from('auth_rate_limits')
      .update({ count: newCount, updated_at: now.toISOString() })
      .eq('key', key)

    const resetAtMs = new Date(existing.reset_at).getTime()
    const allowed = newCount <= MAX_ATTEMPTS
    const remaining = Math.max(0, MAX_ATTEMPTS - newCount)
    return { allowed, remaining, resetAt: resetAtMs }
  }

  // No record or window expired — insert/reset
  await supabase
    .from('auth_rate_limits')
    .upsert({
      key,
      count: 1,
      reset_at: resetAt.toISOString(),
      updated_at: now.toISOString(),
    })

  return { allowed: true, remaining: MAX_ATTEMPTS - 1, resetAt: resetAt.getTime() }
}

export async function POST(request: NextRequest) {
  const ip =
    request.headers.get('x-forwarded-for')?.split(',')[0].trim() ??
    request.headers.get('x-real-ip') ??
    '127.0.0.1'

  let email = ''
  try {
    const body = await request.json()
    if (typeof body?.email === 'string') email = body.email.trim().toLowerCase()
  } catch {
    // ignore malformed body and fall back to IP-only bucket
  }

  const key = email ? `${ip}:${email}` : ip

  let result: { allowed: boolean; remaining: number; resetAt: number }
  try {
    result = await checkRateLimitPersistent(key)
  } catch (err) {
    // If DB is unreachable, fall back to allowing rather than blocking legit users
    console.error('[auth/rate-limit] DB error, falling back to allow:', err)
    result = { allowed: true, remaining: MAX_ATTEMPTS - 1, resetAt: Date.now() + WINDOW_MS }
  }

  if (!result.allowed) {
    const retryAfterSeconds = Math.ceil((result.resetAt - Date.now()) / 1000)
    return NextResponse.json(
      {
        error: 'Too many login attempts. Please try again later.',
        retryAfter: retryAfterSeconds,
      },
      {
        status: 429,
        headers: {
          'Retry-After': String(retryAfterSeconds),
          'X-RateLimit-Limit': String(MAX_ATTEMPTS),
          'X-RateLimit-Remaining': '0',
          'X-RateLimit-Reset': String(Math.ceil(result.resetAt / 1000)),
        },
      }
    )
  }

  return NextResponse.json(
    {
      allowed: true,
      remaining: result.remaining,
    },
    {
      headers: {
        'X-RateLimit-Limit': String(MAX_ATTEMPTS),
        'X-RateLimit-Remaining': String(result.remaining),
        'X-RateLimit-Reset': String(Math.ceil(result.resetAt / 1000)),
      },
    }
  )
}
