// app/api/case-ai/conversations/[id]/route.ts
// Batch D: load (GET) or delete (DELETE) one of the caller's saved Casey
// conversations. Azure RLS under withRlsContext(userId) is the authority — a
// foreign or unknown id simply resolves to zero rows, which we surface as 404.

import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { isAzureConfigured, withRlsContext } from '@/lib/db/azure'
import { validateUUID } from '@/lib/validation'

export const dynamic = 'force-dynamic'

// Enough for any realistic resume; the composer also caps outbound context at
// 50 messages, so older history is view-only anyway.
const MAX_MESSAGES = 100

async function requireUser(): Promise<{ userId: string } | NextResponse> {
  const serverSupabase = await createServerClient()
  const { data: authData, error: authErr } = await serverSupabase.auth.getUser()
  if (authErr || !authData?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  return { userId: authData.user.id }
}

export async function GET(
  _req: NextRequest,
  routeCtx: { params: Promise<{ id: string }> },
) {
  const auth = await requireUser()
  if (auth instanceof NextResponse) return auth
  const { userId } = auth

  const { id } = await routeCtx.params
  if (!id || !validateUUID(id)) {
    return NextResponse.json({ error: 'Invalid conversation id' }, { status: 400 })
  }
  if (!isAzureConfigured()) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  try {
    const result = await withRlsContext(userId, async (sql) => {
      const convo = await sql`
        SELECT id, title, client_uuid, created_at, updated_at
        FROM bot_conversations WHERE id = ${id} LIMIT 1
      `
      if (convo.length === 0) return null
      const messages = await sql`
        SELECT id, role, content, created_at
        FROM bot_messages
        WHERE conversation_id = ${id}
        ORDER BY created_at ASC, id ASC
        LIMIT ${MAX_MESSAGES}
      `
      return { conversation: convo[0], messages }
    })
    if (!result) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }
    return NextResponse.json(result)
  } catch (err) {
    console.error('[Casey] conversation load failed:', err)
    return NextResponse.json({ error: 'Failed to load conversation' }, { status: 500 })
  }
}

export async function DELETE(
  _req: NextRequest,
  routeCtx: { params: Promise<{ id: string }> },
) {
  const auth = await requireUser()
  if (auth instanceof NextResponse) return auth
  const { userId } = auth

  const { id } = await routeCtx.params
  if (!id || !validateUUID(id)) {
    return NextResponse.json({ error: 'Invalid conversation id' }, { status: 400 })
  }
  if (!isAzureConfigured()) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  try {
    const deleted = await withRlsContext(userId, (sql) => sql`
      DELETE FROM bot_conversations WHERE id = ${id} RETURNING id
    `)
    if (deleted.length === 0) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }
    // bot_messages / bot_feedback rows follow via ON DELETE CASCADE.
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[Casey] conversation delete failed:', err)
    return NextResponse.json({ error: 'Failed to delete conversation' }, { status: 500 })
  }
}
