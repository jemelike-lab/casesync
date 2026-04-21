import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function GET() {
  // Prune expired ai_rate_limits rows older than 2 minutes.
  // This runs every hour via Vercel cron — keeps the table small
  // so the sliding-window count query stays fast at scale.
  try {
    const serviceSupabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )
    const cutoff = new Date(Date.now() - 2 * 60 * 1000).toISOString()
    await serviceSupabase
      .from('ai_rate_limits')
      .delete()
      .lt('window_start', cutoff)
  } catch {
    // Non-fatal — health check still returns ok
  }

  return NextResponse.json(
    {
      status: 'ok',
      timestamp: new Date().toISOString(),
      version: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? 'dev',
    },
    { status: 200 }
  )
}
