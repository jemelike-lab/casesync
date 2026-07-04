// app/api/bot-knowledge/[id]/route.ts
// Batch D: update / delete a BLH Bot knowledge entry. Supervisor /
// administrator only (IT excluded); RLS-enforced via the caller's own session client.

import { NextResponse } from 'next/server'
import { withAuth } from '@/lib/api-auth'
import { invalidateBotKnowledgeCache } from '@/lib/bot-knowledge'
import { validateUUID } from '@/lib/validation'

export const dynamic = 'force-dynamic'

const KB_EDITORS = ['supervisor', 'administrator'] as const

const MAX_TITLE = 120
const MAX_CONTENT = 4000
const CATEGORIES = ['general', 'policy', 'procedure', 'deadlines', 'contacts', 'faq'] as const

export const PATCH = withAuth(
  async (req, ctx, routeCtx) => {
    const { id } = (await routeCtx?.params) ?? {}
    if (!id || !validateUUID(id)) {
      return NextResponse.json({ error: 'Invalid entry id' }, { status: 400 })
    }

    let body: Record<string, unknown>
    try {
      body = await req.json()
    } catch {
      return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
    }

    // Strict whitelist — unknown keys are a 400, not a silent no-op
    // (per the update_date lesson: silent key-drops hide real failures).
    const updates: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(body)) {
      if (key === 'title') {
        const v = typeof value === 'string' ? value.trim() : ''
        if (!v || v.length > MAX_TITLE) {
          return NextResponse.json({ error: `Title must be 1–${MAX_TITLE} chars` }, { status: 400 })
        }
        updates.title = v
      } else if (key === 'content') {
        const v = typeof value === 'string' ? value.trim() : ''
        if (!v || v.length > MAX_CONTENT) {
          return NextResponse.json({ error: `Content must be 1–${MAX_CONTENT} chars` }, { status: 400 })
        }
        updates.content = v
      } else if (key === 'category') {
        if (typeof value !== 'string' || !(CATEGORIES as readonly string[]).includes(value)) {
          return NextResponse.json({ error: 'Unknown category' }, { status: 400 })
        }
        updates.category = value
      } else if (key === 'is_active') {
        if (typeof value !== 'boolean') {
          return NextResponse.json({ error: 'is_active must be boolean' }, { status: 400 })
        }
        updates.is_active = value
      } else if (key === 'sort_order') {
        if (!Number.isInteger(value)) {
          return NextResponse.json({ error: 'sort_order must be an integer' }, { status: 400 })
        }
        updates.sort_order = value
      } else {
        return NextResponse.json({ error: `Unknown field: ${key}` }, { status: 400 })
      }
    }
    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'No fields to update' }, { status: 400 })
    }
    updates.updated_by = ctx.user.id
    updates.updated_at = new Date().toISOString()

    const { data, error } = await ctx.supabase
      .from('bot_knowledge')
      .update(updates)
      .eq('id', id)
      .select()
      .single()
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    invalidateBotKnowledgeCache()
    return NextResponse.json({ entry: data })
  },
  { roles: [...KB_EDITORS] },
)

export const DELETE = withAuth(
  async (_req, ctx, routeCtx) => {
    const { id } = (await routeCtx?.params) ?? {}
    if (!id || !validateUUID(id)) {
      return NextResponse.json({ error: 'Invalid entry id' }, { status: 400 })
    }
    const { error } = await ctx.supabase.from('bot_knowledge').delete().eq('id', id)
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    invalidateBotKnowledgeCache()
    return NextResponse.json({ ok: true })
  },
  { roles: [...KB_EDITORS] },
)
