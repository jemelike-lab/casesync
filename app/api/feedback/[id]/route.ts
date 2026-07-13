// app/api/feedback/[id]/route.ts
// Triage a feedback report: status transitions, resolution note, assignment.
// App-gated to isSupervisorLike; the feedback_update_elevated RLS policy
// enforces the same at the database layer.
//
// Response loop: when a triager closes a report (resolved | wont_fix) the
// REPORTER is emailed the resolution note and asked to confirm the fix from
// the "My reports" view in the feedback widget (confirm/reopen happens via
// /api/feedback/[id]/respond). Mail failures are logged, never fatal — the
// status change is already committed.
//
// Triagers can set: new | in_progress | resolved | wont_fix.
// 'confirmed' and 'reopened' are reporter-owned and NOT settable here.

import { NextRequest, NextResponse } from 'next/server'
import { createClient as createSupabaseAdmin } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { isAzureConfigured, withRlsContext } from '@/lib/db/azure'
import { isSupervisorLike } from '@/lib/roles'
import { validateUUID } from '@/lib/validation'
import { sendEmail } from '@/lib/email'
import { feedbackClosedEmail } from '@/lib/email-templates'

export const dynamic = 'force-dynamic'

const TRIAGE_STATUSES = ['new', 'in_progress', 'resolved', 'wont_fix'] as const
type TriageStatus = (typeof TRIAGE_STATUSES)[number]
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

  let body: { status?: unknown; resolution_note?: unknown; assigned_to?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const status = TRIAGE_STATUSES.includes(body.status as TriageStatus)
    ? (body.status as TriageStatus)
    : null
  const hasAssignment = Object.prototype.hasOwnProperty.call(body, 'assigned_to')
  const assignedTo =
    hasAssignment && typeof body.assigned_to === 'string' && validateUUID(body.assigned_to)
      ? body.assigned_to
      : null
  if (hasAssignment && body.assigned_to !== null && !assignedTo) {
    return NextResponse.json({ error: 'assigned_to must be a profile UUID or null' }, { status: 400 })
  }

  if (!status && !hasAssignment) {
    return NextResponse.json(
      { error: 'status (new|in_progress|resolved|wont_fix) and/or assigned_to is required' },
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
      // Assignment (name denormalized like author_name, so the board renders
      // without joins even if the profile is later renamed/removed).
      if (hasAssignment) {
        let assigneeName: string | null = null
        if (assignedTo) {
          const p = await sql`SELECT full_name FROM profiles WHERE id = ${assignedTo} LIMIT 1`
          assigneeName = (p[0]?.full_name as string | undefined) ?? null
        }
        const rows = await sql`
          UPDATE feedback_reports
          SET assigned_to = ${assignedTo},
              assigned_to_name = ${assignedTo ? assigneeName : null},
              updated_at = now()
          WHERE id = ${id}
          RETURNING id
        `
        if (rows.length === 0) return null
      }

      if (status) {
        const rows = await sql`
          UPDATE feedback_reports
          SET status = ${status},
              resolution_note = ${note},
              resolved_by = ${isClosed ? userId : null},
              resolved_at = CASE WHEN ${isClosed} THEN now() ELSE NULL END,
              updated_at = now()
          WHERE id = ${id}
          RETURNING id
        `
        if (rows.length === 0) return null
      }

      const full = await sql`SELECT * FROM feedback_reports WHERE id = ${id} LIMIT 1`
      return full.length > 0 ? (full[0] as Record<string, unknown>) : null
    })

    if (!updated) {
      return NextResponse.json({ error: 'Report not found' }, { status: 404 })
    }

    // Close the loop: tell the reporter, ask them to confirm. Service-role
    // client (same pattern as app/actions/notifications.ts) because profiles
    // RLS scopes email visibility — this is a system notification, and the
    // recipient is the report's own author, nothing broader.
    if (isClosed) {
      try {
        const admin = createSupabaseAdmin(
          process.env.NEXT_PUBLIC_SUPABASE_URL!,
          process.env.SUPABASE_SERVICE_ROLE_KEY!,
        )
        const { data: reporter } = await admin
          .from('profiles')
          .select('email')
          .eq('id', updated.user_id as string)
          .single()
        if (reporter?.email) {
          const { subject, html } = feedbackClosedEmail({
            reportType: updated.type as 'bug' | 'suggestion' | 'question',
            closedAs: status as 'resolved' | 'wont_fix',
            message: updated.message as string,
            resolutionNote: (updated.resolution_note as string | null) ?? null,
          })
          await sendEmail({ to: reporter.email as string, subject, html })
        } else {
          console.warn('[Feedback] no email on reporter profile — close notification skipped:', updated.user_id)
        }
      } catch (mailErr) {
        console.error('[Feedback] reporter notification failed (status change stored):', mailErr)
      }
    }

    return NextResponse.json({ ok: true, report: updated })
  } catch (err) {
    console.error('[Feedback] triage update failed:', err)
    return NextResponse.json({ error: 'Failed to update report' }, { status: 500 })
  }
}
