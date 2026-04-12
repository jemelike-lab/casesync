import { NextRequest, NextResponse } from 'next/server'
import { checkRateLimit } from '@/lib/rate-limit'

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
  const result = checkRateLimit(key)

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
          'X-RateLimit-Limit': '5',
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
        'X-RateLimit-Limit': '5',
        'X-RateLimit-Remaining': String(result.remaining),
        'X-RateLimit-Reset': String(Math.ceil(result.resetAt / 1000)),
      },
    }
  )
}
