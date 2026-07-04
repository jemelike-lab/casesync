// app/api/case-ai/feedback/route.ts
// Batch D: thumbs up/down on a persisted assistant message.
//
// Ownership is proven by an RLS-scoped read of the message itself — the caller
// can only rate messages from their own conversations. The rated message's
// first ~400 chars are denormalized into bot_feedback so elevated roles can
// review feedback quality WITHOUT reading anyone's full conversations
// (bot_conversations/bot_messages stay strictly owner-only).

import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { isAzureConfigured, withRlsContext } from '@/lib/db/azure'
import { validateUUID } from '@/lib/validation'

export const dynamic = 'force-dynamic'

const EXCERPT_CHARS = 400
const MAX_COMMENT_CHARS = 500

export async function POST(req: NextRequest) {
  const serverSupabase = await createServerClient()
  const { data: authData, error: authErr } = await serverSupabase.auth.getUser()
  if (authErr || !authData?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const userId = authData.user.id

  if (!isAzureConfigured()) {
    return NextResponse.json({ error: 'Feedback unavailable' }, { status: 503 })
  }

  let body: { message_id?: unknown; rating?: unknown; comment?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const messageId = typeof body.message_id === 'string' ? body.message_id : ''
  const rating = body.rating === 1 || body.rating === -1 ? body.rating : null
  const comment =
    typeof body.comment === 'string' && body.comment.trim()
      ? body.comment.trim().slice(0, MAX_COMMENT_CHARS)
      : null

  if (!validateUUID(messageId) || rating === null) {
    return NextResponse.json(
      { error: 'message_id (uuid) and rating (1 or -1) are required' },
      { status: 400 },
    )
  }

  try {
    const ok = await withRlsContext(userId, async (sql) => {
      // RLS-scoped: only resolves if this assistant message is the caller's own.
      const rows = await sql`
        SELECT id, conversation_id, content
        FROM bot_messages
        WHERE id = ${messageId} AND role = 'assistant'
        LIMIT 1
      `
      if (rows.length === 0) return false
      const msg = rows[0] as { conversation_id: string; content: string }
      const excerpt = String(msg.content ?? '').slice(0, EXCERPT_CHARS)
      await sql`
        INSERT INTO bot_feedback (message_id, conversation_id, user_id, rating, comment, message_excerpt)
        VALUES (${messageId}, ${msg.conversation_id}, ${userId}, ${rating}, ${comment}, ${excerpt})
        ON CONFLICT (message_id, user_id)
        DO UPDATE SET rating = EXCLUDED.rating,
                      comment = EXCLUDED.comment,
                      updated_at = now()
      `
      return true
    })
    if (!ok) {
      return NextResponse.json({ error: 'Message not found' }, { status: 404 })
    }
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[Casey] feedback failed:', err)
    return NextResponse.json({ error: 'Failed to record feedback' }, { status: 500 })
  }
}
