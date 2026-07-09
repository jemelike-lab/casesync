// app/api/feedback/[id]/route.ts
// Triage a feedback report: status transitions + resolution note.
// App-gated to isSupervisorLike; the feedback_update_elevated RLS policy
// enforces the same at the database layer.

import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { isAzureConfigured, withRlsContext } from '@/lib/db/azure'
import { isSupervisorLike } from '@/lib/roles'
import { validateUUID } from '@/lib/validation'

export const dynamic = 'force-dynamic'

const STATUSES = ['new', 'in_progress', 'resolved', 'wont_fix'] as const
const MAX_NOTE = 1000

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  if (!validateUUID(id)) {
    return NextResponse.json({ error: 'Invalid report id' }, { status: 400 })
  }

  const serverSupabase = await createServerClient()
  const { data: authData, error: authErr } = await serverSupabase.auth.getUser()
  if (authErr || !authData?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const userId = authData.user.id

  const { data: profile } = await serverSupabase
    .from('profiles')
    .select('role')
    .eq('id', userId)
    .single()
  if (!isSupervisorLike(profile?.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  if (!isAzureConfigured()) {
    return NextResponse.json({ error: 'Feedback unavailable' }, { status: 503 })
  }

  let body: { status?: unknown; resolution_note?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const status = STATUSES.includes(body.status as (typeof STATUSES)[number])
    ? (body.status as (typeof STATUSES)[number])
    : null
  if (!status) {
    return NextResponse.json(
      { error: 'status (new|in_progress|resolved|wont_fix) is required' },
      { status: 400 },
    )
  }
  const note =
    typeof body.resolution_note === 'string' && body.resolution_note.trim()
      ? body.resolution_note.trim().slice(0, MAX_NOTE)
      : null

  const isClosed = status === 'resolved' || status === 'wont_fix'

  try {
    const updated = await withRlsContext(userId, async (sql) => {
      const rows = await sql`
        UPDATE feedback_reports
        SET status = ${status},
            resolution_note = ${note},
            resolved_by = ${isClosed ? userId : null},
            resolved_at = CASE WHEN ${isClosed} THEN now() ELSE NULL END,
            updated_at = now()
        WHERE id = ${id}
        RETURNING id, status, resolution_note, resolved_by, resolved_at, updated_at
      `
      return rows.length > 0 ? (rows[0] as Record<string, unknown>) : null
    })
    if (!updated) {
      return NextResponse.json({ error: 'Report not found' }, { status: 404 })
    }
    return NextResponse.json({ ok: true, report: updated })
  } catch (err) {
    console.error('[Feedback] triage update failed:', err)
    return NextResponse.json({ error: 'Failed to update report' }, { status: 500 })
  }
}
