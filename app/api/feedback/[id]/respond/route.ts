// app/api/feedback/[id]/respond/route.ts
// The reporter's half of the response loop: confirm the fix, or bounce it back.
//
// POST { action: 'confirm' | 'reopen', note? }
//   confirm — resolved → confirmed (terminal). Reporter verified the fix.
//   reopen  — resolved → reopened. Goes straight back to the triage queue
//             (sorted first on the board) and pings the triage inbox.
//
// Owner-only and state-gated twice: the explicit WHERE (user_id = caller AND
// status = 'resolved') here, and the feedback_respond_own RLS policy at the
// database — a bypassed app check still can't move anyone else's report or
// jump states. No supervisor gate: this is deliberately open to every
// authenticated reporter, for their own resolved reports only.

import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { isAzureConfigured, withRlsContext } from '@/lib/db/azure'
import { validateUUID } from '@/lib/validation'
import { sendEmail } from '@/lib/email'
import { feedbackReopenedEmail } from '@/lib/email-templates'

export const dynamic = 'force-dynamic'

const MAX_NOTE = 1000

export async function POST(
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

  if (!isAzureConfigured()) {
    return NextResponse.json({ error: 'Feedback unavailable' }, { status: 503 })
  }

  let body: { action?: unknown; note?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const action = body.action === 'confirm' || body.action === 'reopen' ? body.action : null
  if (!action) {
    return NextResponse.json({ error: "action must be 'confirm' or 'reopen'" }, { status: 400 })
  }
  const note =
    typeof body.note === 'string' && body.note.trim()
      ? body.note.trim().slice(0, MAX_NOTE)
      : null

  try {
    const updated = await withRlsContext(userId, async (sql) => {
      const rows =
        action === 'confirm'
          ? await sql`
              UPDATE feedback_reports
              SET status = 'confirmed',
                  confirmed_at = now(),
                  reporter_note = ${note},
                  updated_at = now()
              WHERE id = ${id} AND user_id = ${userId} AND status = 'resolved'
              RETURNING *
            `
          : await sql`
              UPDATE feedback_reports
              SET status = 'reopened',
                  reopen_count = reopen_count + 1,
                  reporter_note = ${note},
                  resolved_by = NULL,
                  resolved_at = NULL,
                  updated_at = now()
              WHERE id = ${id} AND user_id = ${userId} AND status = 'resolved'
              RETURNING *
            `
      return rows.length > 0 ? (rows[0] as Record<string, unknown>) : null
    })

    if (!updated) {
      return NextResponse.json(
        { error: 'Report not found, not yours, or not awaiting your confirmation' },
        { status: 409 },
      )
    }

    // Reopens go straight back to the triage inbox. Non-fatal.
    if (action === 'reopen') {
      try {
        const notifyTo = process.env.FEEDBACK_NOTIFY_EMAIL || 'Jemelike@blhnurses.com'
        const { subject, html } = feedbackReopenedEmail({
          authorName: (updated.author_name as string | null) ?? 'A tester',
          message: updated.message as string,
          reporterNote: note,
          pagePath: (updated.page_path as string | null) ?? '—',
          reopenCount: Number(updated.reopen_count ?? 1),
        })
        await sendEmail({ to: notifyTo, subject, html })
      } catch (mailErr) {
        console.error('[Feedback] reopen notification failed (reopen stored):', mailErr)
      }
    }

    return NextResponse.json({ ok: true, report: updated })
  } catch (err) {
    console.error('[Feedback] respond failed:', err)
    return NextResponse.json({ error: 'Failed to record your response' }, { status: 500 })
  }
}
