import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

const WINDOW_MS = 60 * 1000 // 1 minute
const MAX_REQUESTS_PER_WINDOW = 20

/**
 * Check AI endpoint rate limit for the authenticated user.
 * Returns null if within limits, or a NextResponse 429 if exceeded.
 */
export async function checkAiRateLimit(
  req: NextRequest,
  endpoint: string
): Promise<NextResponse | null> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const windowStart = new Date(Date.now() - WINDOW_MS).toISOString()

  // Use service role to bypass RLS on ai_rate_limits
  const { createClient: createServiceClient } = await import('@supabase/supabase-js')
  const serviceSupabase = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!  // fixed: was SUPABASE_SECRET_KEY
  )

  const { count } = await serviceSupabase
    .from('ai_rate_limits')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', user.id)
    .eq('endpoint', endpoint)
    .gte('window_start', windowStart)

  if ((count ?? 0) >= MAX_REQUESTS_PER_WINDOW) {
    const retryAfter = Math.ceil(WINDOW_MS / 1000)
    return NextResponse.json(
      {
        error: 'Rate limit exceeded',
        message: `Too many requests to ${endpoint}. Limit: ${MAX_REQUESTS_PER_WINDOW} per ${WINDOW_MS / 1000}s window.`,
        retryAfter,
      },
      {
        status: 429,
        headers: { 'Retry-After': String(retryAfter) },
      }
    )
  }

  // Record this request  ignore conflicts from near-simultaneous requests
  try {
    await serviceSupabase
      .from('ai_rate_limits')
      .insert({
        user_id: user.id,
        endpoint,
        window_start: new Date().toISOString(),
      })
  } catch (_e) {
    // UNIQUE conflict on same-microsecond requests is harmless
  }

  return null // within limits
}
