// app/api/case-ai/conversations/route.ts
// Batch D: list the caller's saved BLH Bot conversations (Azure PHI plane).
//
// Auth mirrors /api/case-ai (session cookie, any authenticated staff role) —
// deliberately NOT withAuth, whose role allowlist is narrower than the bot's
// own. Scoping is done by Azure RLS under withRlsContext(userId): the query
// below can only ever see the caller's own rows.

import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { isAzureConfigured, withRlsContext } from '@/lib/db/azure'

export const dynamic = 'force-dynamic'

export async function GET(_req: NextRequest) {
  const serverSupabase = await createServerClient()
  const { data: authData, error: authErr } = await serverSupabase.auth.getUser()
  if (authErr || !authData?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const userId = authData.user.id

  // No persistence plane → no history. The UI treats this as "nothing to resume".
  if (!isAzureConfigured()) {
    return NextResponse.json({ conversations: [], persistence: false })
  }

  try {
    const rows = await withRlsContext(userId, (sql) => sql`
      SELECT c.id,
             c.title,
             c.client_uuid,
             c.updated_at,
             (SELECT count(*)::int FROM bot_messages m WHERE m.conversation_id = c.id) AS message_count
      FROM bot_conversations c
      WHERE EXISTS (SELECT 1 FROM bot_messages m WHERE m.conversation_id = c.id)
      ORDER BY c.updated_at DESC
      LIMIT 20
    `)
    return NextResponse.json({ conversations: rows, persistence: true })
  } catch (err) {
    console.error('[BLH Bot] conversations list failed:', err)
    // History being unavailable must never look like a bot outage.
    return NextResponse.json({ conversations: [], persistence: false })
  }
}
