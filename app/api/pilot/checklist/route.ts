// app/api/pilot/checklist/route.ts
// Pilot checklist state (pilot_roster + pilot_checklist_progress on Azure).
//
// GET          \u2014 caller's own pilot state: { inPilot, cohort, startedAt, completed[] }
// GET ?all=1   \u2014 supervisor-like live view: every active pilot member + progress.
//                RLS enforces the same at the database (elevated read is
//                supervisor/administrator only), so a bypassed app check
//                still returns only the caller's own rows.
// POST         \u2014 { taskKey, done } toggle for the caller. Active roster
//                membership is enforced by the progress INSERT policy.

import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { isAzureConfigured, withRlsContext } from '@/lib/db/azure'
import { isSupervisorLike } from '@/lib/roles'
import { PILOT_TASK_KEYS } from '@/lib/pilot-tasks'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const supabase = await createServerClient()
  const { data: authData, error: authErr } = await supabase.auth.getUser()
  if (authErr || !authData?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const userId = authData.user.id
  if (!isAzureConfigured()) {
    return NextResponse.json({ inPilot: false })
  }

  const wantAll = new URL(req.url).searchParams.get('all') === '1'

  try {
    if (wantAll) {
      const { data: profile } = await supabase.from('profiles').select('role').eq('id', userId).single()
      if (!isSupervisorLike(String(profile?.role ?? '').toLowerCase())) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      }
      const members = await withRlsContext(userId, async (sql) => {
        const roster = await sql`
          SELECT r.user_id, r.cohort, r.started_at, r.ended_at, p.full_name
          FROM pilot_roster r
          LEFT JOIN profiles p ON p.id = r.user_id
          WHERE r.ended_at IS NULL
          ORDER BY r.started_at ASC
        `
        const progress = await sql`
          SELECT user_id, task_key, completed_at FROM pilot_checklist_progress
        `
        const byUser = new Map<string, { task_key: string; completed_at: string }[]>()
        for (const row of progress as unknown as { user_id: string; task_key: string; completed_at: string }[]) {
          const list = byUser.get(row.user_id) ?? []
          list.push({ task_key: row.task_key, completed_at: row.completed_at })
          byUser.set(row.user_id, list)
        }
        return (roster as unknown as { user_id: string; cohort: string; started_at: string; full_name: string | null }[]).map(r => ({
          userId: r.user_id,
          name: r.full_name,
          cohort: r.cohort,
          startedAt: r.started_at,
          completed: (byUser.get(r.user_id) ?? []).map(x => x.task_key),
        }))
      })
      return NextResponse.json({ members })
    }

    const state = await withRlsContext(userId, async (sql) => {
      const roster = await sql`
        SELECT cohort, started_at FROM pilot_roster
        WHERE user_id = ${userId} AND ended_at IS NULL
        LIMIT 1
      `
      if (!roster.length) return { inPilot: false as const }
      const rows = await sql`
        SELECT task_key FROM pilot_checklist_progress WHERE user_id = ${userId}
      `
      return {
        inPilot: true as const,
        cohort: (roster[0] as { cohort: string }).cohort,
        startedAt: (roster[0] as unknown as { started_at: string }).started_at,
        completed: (rows as unknown as { task_key: string }[]).map(r => r.task_key),
      }
    })
    return NextResponse.json(state)
  } catch (err) {
    console.error('[Pilot] checklist GET failed:', err)
    return NextResponse.json({ inPilot: false })
  }
}

export async function POST(req: NextRequest) {
  const supabase = await createServerClient()
  const { data: authData, error: authErr } = await supabase.auth.getUser()
  if (authErr || !authData?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const userId = authData.user.id
  if (!isAzureConfigured()) {
    return NextResponse.json({ error: 'Pilot unavailable' }, { status: 503 })
  }

  let body: { taskKey?: unknown; done?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }
  const taskKey = typeof body.taskKey === 'string' && PILOT_TASK_KEYS.has(body.taskKey) ? body.taskKey : null
  const done = body.done === true
  if (!taskKey) {
    return NextResponse.json({ error: 'Unknown taskKey' }, { status: 400 })
  }

  try {
    await withRlsContext(userId, async (sql) => {
      if (done) {
        await sql`
          INSERT INTO pilot_checklist_progress (user_id, task_key)
          VALUES (${userId}, ${taskKey})
          ON CONFLICT (user_id, task_key) DO NOTHING
        `
      } else {
        await sql`
          DELETE FROM pilot_checklist_progress
          WHERE user_id = ${userId} AND task_key = ${taskKey}
        `
      }
    })
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[Pilot] checklist POST failed:', err)
    // RLS denies inserts from non-members \u2014 surface as 403, not 500.
    return NextResponse.json({ error: 'Not an active pilot member' }, { status: 403 })
  }
}
