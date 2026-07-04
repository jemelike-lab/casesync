// app/api/bot-knowledge/route.ts
// Batch D: admin CRUD for the BLH Bot knowledge base (Supabase `bot_knowledge`).
// Elevated roles only — matches the /admin page gate. Writes go through the
// caller's OWN session client so Supabase RLS is enforced end to end (the
// withAuth admin client is deliberately not used for writes here).

import { NextResponse } from 'next/server'
import { withAuth } from '@/lib/api-auth'
import { invalidateBotKnowledgeCache } from '@/lib/bot-knowledge'

export const dynamic = 'force-dynamic'

const ELEVATED = ['supervisor', 'it', 'administrator'] as const

const MAX_TITLE = 120
const MAX_CONTENT = 4000
const CATEGORIES = ['general', 'policy', 'procedure', 'deadlines', 'contacts', 'faq'] as const

export const GET = withAuth(
  async (_req, ctx) => {
    const { data, error } = await ctx.supabase
      .from('bot_knowledge')
      .select('id, title, content, category, is_active, sort_order, updated_by, created_at, updated_at')
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true })
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    return NextResponse.json({ entries: data ?? [] })
  },
  { roles: [...ELEVATED] },
)

export const POST = withAuth(
  async (req, ctx) => {
    let body: Record<string, unknown>
    try {
      body = await req.json()
    } catch {
      return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
    }

    const title = typeof body.title === 'string' ? body.title.trim() : ''
    const content = typeof body.content === 'string' ? body.content.trim() : ''
    const category =
      typeof body.category === 'string' && (CATEGORIES as readonly string[]).includes(body.category)
        ? body.category
        : 'general'
    const sortOrder = Number.isInteger(body.sort_order) ? (body.sort_order as number) : 0

    if (!title || title.length > MAX_TITLE) {
      return NextResponse.json({ error: `Title is required (max ${MAX_TITLE} chars)` }, { status: 400 })
    }
    if (!content || content.length > MAX_CONTENT) {
      return NextResponse.json({ error: `Content is required (max ${MAX_CONTENT} chars)` }, { status: 400 })
    }

    const { data, error } = await ctx.supabase
      .from('bot_knowledge')
      .insert({ title, content, category, sort_order: sortOrder, updated_by: ctx.user.id })
      .select()
      .single()
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    // Serve the new entry on the next bot request rather than waiting out the TTL.
    invalidateBotKnowledgeCache()
    return NextResponse.json({ entry: data })
  },
  { roles: [...ELEVATED] },
)
