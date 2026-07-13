// app/api/pilot/roster/route.ts
// Pilot roster management \u2014 supervisor-like only (RLS enforces the same).
// POST { userId, action: 'add' | 'end', cohort? }

import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { isAzureConfigured, withRlsContext } from '@/lib/db/azure'
import { isSupervisorLike } from '@/lib/roles'

export const dynamic = 'force-dynamic'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function POST(req: NextRequest) {
  const supabase = await createServerClient()
  const { data: authData, error: authErr } = await supabase.auth.getUser()
  if (authErr || !authData?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const callerId = authData.user.id
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', callerId).single()
  if (!isSupervisorLike(String(profile?.role ?? '').toLowerCase())) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  if (!isAzureConfigured()) {
    return NextResponse.json({ error: 'Pilot unavailable' }, { status: 503 })
  }

  let body: { userId?: unknown; action?: unknown; cohort?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }
  const userId = typeof body.userId === 'string' && UUID_RE.test(body.userId) ? body.userId : null
  const action = body.action === 'add' || body.action === 'end' ? body.action : null
  const cohort = typeof body.cohort === 'string' && body.cohort.trim() ? body.cohort.trim().slice(0, 40) : 'sp-pilot-1'
  if (!userId || !action) {
    return NextResponse.json({ error: 'userId (uuid) and action (add|end) are required' }, { status: 400 })
  }

  try {
    await withRlsContext(callerId, async (sql) => {
      if (action === 'add') {
        await sql`
          INSERT INTO pilot_roster (user_id, cohort)
          VALUES (${userId}, ${cohort})
          ON CONFLICT (user_id) DO UPDATE SET ended_at = NULL, cohort = EXCLUDED.cohort
        `
      } else {
        await sql`
          UPDATE pilot_roster SET ended_at = now() WHERE user_id = ${userId}
        `
      }
    })
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[Pilot] roster POST failed:', err)
    return NextResponse.json({ error: 'Roster update failed' }, { status: 500 })
  }
}
