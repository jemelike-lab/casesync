// app/api/admin/activity/route.ts
// Activity Monitor data feed. Gated by the explicit two-person allowlist in
// lib/monitor-access.ts (NOT by role - see that file for why). Reads run
// under the caller's own RLS context; user_presence and audit_logs elevated
// SELECT policies are the DB-level outer bound.

import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { isAzureConfigured, withRlsContext } from '@/lib/db/azure'
import { canViewActivityMonitor } from '@/lib/monitor-access'
import { auditLog } from '@/lib/audit'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const supabase = await createServerClient()
  const { data: authData, error: authErr } = await supabase.auth.getUser()
  if (authErr || !authData?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const userId = authData.user.id
  if (!canViewActivityMonitor(userId)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  if (!isAzureConfigured()) {
    return NextResponse.json({ online: [], sessions: [], feed: [], now: new Date().toISOString() })
  }

  try {
    const data = await withRlsContext(userId, async (sql) => {
      const online = await sql`
        SELECT up.user_id, up.last_seen_at, up.session_started_at, up.current_path,
               p.full_name, p.role
        FROM user_presence up
        LEFT JOIN profiles p ON p.id = up.user_id
        ORDER BY up.last_seen_at DESC
        LIMIT 50
      `
      const sessions = await sql`
        SELECT user_id, user_email, details, ip_address, user_agent, created_at
        FROM audit_logs
        WHERE action = 'auth.login'
        ORDER BY created_at DESC
        LIMIT 30
      `
      const feed = await sql`
        SELECT a.user_id, a.user_email, a.action, a.resource_type, a.resource_id,
               a.details, a.created_at, p.full_name
        FROM audit_logs a
        LEFT JOIN profiles p ON p.id = a.user_id
        WHERE a.action <> 'admin.activity_monitor.view'
        ORDER BY a.created_at DESC
        LIMIT 60
      `
      return { online, sessions, feed }
    })
    // The monitor itself leaves a trail.
    await auditLog(req, {
      userId,
      userEmail: authData.user.email ?? undefined,
      action: 'admin.activity_monitor.view',
    })
    return NextResponse.json({ ...data, now: new Date().toISOString() })
  } catch (err) {
    console.error('[ActivityMonitor] fetch failed:', err)
    return NextResponse.json({ error: 'Fetch failed' }, { status: 500 })
  }
}
