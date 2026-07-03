import { NextResponse } from 'next/server'
import { withAuth } from '@/lib/api-auth'
import { isAzureConfigured, withRlsContext } from '@/lib/db/azure'

export const dynamic = 'force-dynamic'

/**
 * /api/clients/[id]/notes — client notes list + create (Azure-aware).
 *
 * Phase 3 data plane: client_notes lives beside clients in Azure when
 * configured (the import route already writes it there). Both handlers run
 * under the CALLER's RLS scope via withRlsContext; the Supabase branch uses
 * the session client (never the service role). Response rows match the
 * ClientNote shape the UI already consumes (`profiles: { full_name }` from
 * the author join).
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export const GET = withAuth(async (_req, ctx, routeCtx) => {
  const { id } = (await routeCtx?.params) ?? {}
  if (!id || !UUID_RE.test(id)) {
    return NextResponse.json({ error: 'Invalid client id' }, { status: 400 })
  }

  if (isAzureConfigured()) {
    const rows = await withRlsContext(ctx.user.id, (sql) => sql`
      SELECT n.id, n.client_id, n.author_id, n.content, n.created_at, p.full_name AS author_full_name
      FROM client_notes n
      LEFT JOIN profiles p ON p.id = n.author_id
      WHERE n.client_id = ${id}
      ORDER BY n.created_at DESC
    `)
    const notes = (rows as Record<string, unknown>[]).map(({ author_full_name, ...n }) => ({
      ...n,
      profiles: { full_name: (author_full_name as string | null) ?? null },
    }))
    return NextResponse.json({ notes })
  }

  const { data, error } = await ctx.supabase
    .from('client_notes')
    .select('*, profiles(full_name)')
    .eq('client_id', id)
    .order('created_at', { ascending: false })
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ notes: data ?? [] })
})

export const POST = withAuth(async (req, ctx, routeCtx) => {
  const { id } = (await routeCtx?.params) ?? {}
  if (!id || !UUID_RE.test(id)) {
    return NextResponse.json({ error: 'Invalid client id' }, { status: 400 })
  }

  let body: { content?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }
  const content = typeof body.content === 'string' ? body.content.trim() : ''
  if (!content) return NextResponse.json({ error: 'content is required' }, { status: 400 })
  if (content.length > 10000) {
    return NextResponse.json({ error: 'content exceeds 10000 characters' }, { status: 400 })
  }

  if (isAzureConfigured()) {
    let row: Record<string, unknown> | undefined
    try {
      const rows = await withRlsContext(ctx.user.id, (sql) => sql`
        INSERT INTO client_notes (client_id, author_id, content)
        VALUES (${id}, ${ctx.user.id}, ${content})
        RETURNING id, client_id, author_id, content, created_at
      `)
      row = rows[0] as Record<string, unknown> | undefined
    } catch (e) {
      return NextResponse.json({ error: (e as Error).message }, { status: 400 })
    }
    if (!row) {
      return NextResponse.json({ error: 'Insert failed (or access denied)' }, { status: 400 })
    }
    return NextResponse.json(
      { note: { ...row, profiles: { full_name: ctx.profile.full_name ?? null } } },
      { status: 201 }
    )
  }

  const { data, error } = await ctx.supabase
    .from('client_notes')
    .insert({ client_id: id, author_id: ctx.user.id, content })
    .select('*, profiles(full_name)')
    .single()
  if (error || !data) {
    return NextResponse.json({ error: error?.message ?? 'Insert failed' }, { status: 400 })
  }
  return NextResponse.json({ note: data }, { status: 201 })
})
