import { NextResponse } from 'next/server'
import { withAuth } from '@/lib/api-auth'
import { isAzureConfigured, withRlsContext } from '@/lib/db/azure'

export const dynamic = 'force-dynamic'

/**
 * /api/clients/[id]/activity — client activity feed list + append (Azure-aware).
 *
 * Phase 3 data plane: activity_log lives in Azure when configured (bulk-contact
 * and import already write it there). Both handlers run under the CALLER's RLS
 * scope via withRlsContext; the Supabase branch uses the session client (never
 * the service role). user_id is ALWAYS the authenticated caller — never taken
 * from the body. Reads return rows shaped like the PostgREST join the UI
 * already consumes (`profiles: { full_name }`).
 *
 * POST accepts either a single entry object or { entries: [...] } (max 50) —
 * the edit form logs one row per changed field in a single call.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

type ActivityEntry = {
  action: string
  field_name: string | null
  old_value: string | null
  new_value: string | null
}

function coerceValue(v: unknown, max: number): string | null {
  if (v === null || v === undefined || v === '') return null
  const s = typeof v === 'string' ? v : String(v)
  return s.slice(0, max)
}

function sanitizeEntry(raw: unknown): { entry?: ActivityEntry; error?: string } {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { error: 'Each entry must be an object' }
  }
  const r = raw as Record<string, unknown>
  const action = typeof r.action === 'string' ? r.action.trim() : ''
  if (!action) return { error: 'action is required' }
  if (action.length > 500) return { error: 'action exceeds 500 characters' }
  return {
    entry: {
      action,
      field_name: coerceValue(r.field_name, 100),
      old_value: coerceValue(r.old_value, 1000),
      new_value: coerceValue(r.new_value, 1000),
    },
  }
}

export const GET = withAuth(async (req, ctx, routeCtx) => {
  const { id } = (await routeCtx?.params) ?? {}
  if (!id || !UUID_RE.test(id)) {
    return NextResponse.json({ error: 'Invalid client id' }, { status: 400 })
  }
  const url = new URL(req.url)
  const limit = Math.min(Math.max(Number(url.searchParams.get('limit')) || 20, 1), 100)

  if (isAzureConfigured()) {
    const rows = await withRlsContext(ctx.user.id, (sql) => sql`
      SELECT a.*, p.full_name AS actor_full_name
      FROM activity_log a
      LEFT JOIN profiles p ON p.id = a.user_id
      WHERE a.client_id = ${id}
      ORDER BY a.created_at DESC
      LIMIT ${limit}
    `)
    const entries = (rows as Record<string, unknown>[]).map(({ actor_full_name, ...a }) => ({
      ...a,
      profiles: { full_name: (actor_full_name as string | null) ?? null },
    }))
    return NextResponse.json({ entries })
  }

  const { data, error } = await ctx.supabase
    .from('activity_log')
    .select('*, profiles(full_name)')
    .eq('client_id', id)
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ entries: data ?? [] })
})

export const POST = withAuth(async (req, ctx, routeCtx) => {
  const { id } = (await routeCtx?.params) ?? {}
  if (!id || !UUID_RE.test(id)) {
    return NextResponse.json({ error: 'Invalid client id' }, { status: 400 })
  }

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const rawEntries = Array.isArray(body.entries) ? body.entries : [body]
  if (rawEntries.length === 0 || rawEntries.length > 50) {
    return NextResponse.json({ error: 'entries must contain 1-50 items' }, { status: 400 })
  }

  const entries: ActivityEntry[] = []
  for (const raw of rawEntries) {
    const { entry, error } = sanitizeEntry(raw)
    if (error) return NextResponse.json({ error }, { status: 400 })
    entries.push(entry as ActivityEntry)
  }

  const rows = entries.map((e) => ({
    client_id: id,
    user_id: ctx.user.id,
    action: e.action,
    field_name: e.field_name,
    old_value: e.old_value,
    new_value: e.new_value,
  }))

  if (isAzureConfigured()) {
    try {
      await withRlsContext(ctx.user.id, (sql) =>
        sql`INSERT INTO activity_log ${sql(rows, 'client_id', 'user_id', 'action', 'field_name', 'old_value', 'new_value')}`
      )
    } catch (e) {
      return NextResponse.json({ error: (e as Error).message }, { status: 400 })
    }
  } else {
    const { error } = await ctx.supabase.from('activity_log').insert(rows)
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  }

  return NextResponse.json({ ok: true, inserted: rows.length }, { status: 201 })
})
