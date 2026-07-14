// app/api/presence/route.ts
// Heartbeat endpoint for the Activity Monitor. Every authenticated client
// POSTs { path } every ~60s (and on route change) via PresenceHeartbeat.
// A heartbeat after a 30+ minute gap counts as a session start and writes
// an `auth.login` row into audit_logs (ip + user agent captured there),
// which is what the monitor's Session History panel reads.

import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { isAzureConfigured, withRlsContext } from '@/lib/db/azure'
import { auditLog } from '@/lib/audit'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const supabase = await createServerClient()
  const { data: authData, error: authErr } = await supabase.auth.getUser()
  if (authErr || !authData?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const userId = authData.user.id
  if (!isAzureConfigured()) {
    return NextResponse.json({ ok: true, skipped: true })
  }

  let path = ''
  try {
    const body = await req.json()
    if (typeof body?.path === 'string') path = body.path.slice(0, 200)
  } catch { /* empty body is fine */ }
  const ua = (req.headers.get('user-agent') ?? '').slice(0, 300)

  try {
    const rows = await withRlsContext(userId, async (sql) => {
      return sql`
        INSERT INTO user_presence (user_id, last_seen_at, session_started_at, current_path, user_agent)
        VALUES (${userId}, now(), now(), ${path || null}, ${ua || null})
        ON CONFLICT (user_id) DO UPDATE SET
          last_seen_at = now(),
          current_path = EXCLUDED.current_path,
          user_agent = EXCLUDED.user_agent,
          session_started_at = CASE
            WHEN user_presence.last_seen_at < now() - interval '30 minutes' THEN now()
            ELSE user_presence.session_started_at
          END
        RETURNING (session_started_at > now() - interval '5 seconds') AS new_session
      `
    })
    const newSession = Boolean((rows as unknown as { new_session: boolean }[])[0]?.new_session)
    if (newSession) {
      await auditLog(req, {
        userId,
        userEmail: authData.user.email ?? undefined,
        action: 'auth.login',
        details: { source: 'presence_heartbeat', path },
      })
    }
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[Presence] heartbeat failed:', err)
    return NextResponse.json({ error: 'Heartbeat failed' }, { status: 500 })
  }
}
