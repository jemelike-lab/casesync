// app/api/feedback/route.ts
// Tester feedback / issue reporting (edge-tab widget → feedback_reports on Azure).
//
// POST — any authenticated user files a report as themselves. Diagnostic
//        context (build SHA, user agent) is captured SERVER-side so it is
//        authoritative; the client supplies only page_path + viewport.
// GET  — triage list / new-count. App-gated to isSupervisorLike; the RLS
//        policies on feedback_reports enforce the same at the database, so a
//        bypassed app check still returns only the caller's own rows.

import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { isAzureConfigured, withRlsContext } from '@/lib/db/azure'
import { isSupervisorLike } from '@/lib/roles'

export const dynamic = 'force-dynamic'

const TYPES = ['bug', 'suggestion', 'question'] as const
const SEVERITIES = ['blocking', 'annoying', 'minor'] as const
const STATUSES = ['new', 'in_progress', 'resolved', 'wont_fix'] as const

const MAX_MESSAGE = 2000
const MAX_PATH = 300
const MAX_UA = 300
const MAX_VIEWPORT = 40

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

  let body: {
    type?: unknown
    severity?: unknown
    message?: unknown
    page_path?: unknown
    viewport?: unknown
  }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const type = TYPES.includes(body.type as (typeof TYPES)[number])
    ? (body.type as (typeof TYPES)[number])
    : null
  const severity =
    type === 'bug' && SEVERITIES.includes(body.severity as (typeof SEVERITIES)[number])
      ? (body.severity as (typeof SEVERITIES)[number])
      : null
  const message =
    typeof body.message === 'string' && body.message.trim()
      ? body.message.trim().slice(0, MAX_MESSAGE)
      : null
  const pagePath =
    typeof body.page_path === 'string' && body.page_path.trim()
      ? body.page_path.trim().slice(0, MAX_PATH)
      : null
  const viewport =
    typeof body.viewport === 'string' && body.viewport.trim()
      ? body.viewport.trim().slice(0, MAX_VIEWPORT)
      : null

  if (!type || !message) {
    return NextResponse.json(
      { error: 'type (bug|suggestion|question) and message are required' },
      { status: 400 },
    )
  }

  // Server-side authoritative context.
  const appCommit = (process.env.VERCEL_GIT_COMMIT_SHA ?? '').slice(0, 40) || null
  const userAgent = (req.headers.get('user-agent') ?? '').slice(0, MAX_UA) || null

  // Denormalize author identity so triage renders without joins even if the
  // profile is later renamed/removed.
  const { data: profile } = await serverSupabase
    .from('profiles')
    .select('full_name, role')
    .eq('id', userId)
    .single()
  const authorName = (profile?.full_name as string | undefined) ?? null
  const authorRole = (profile?.role as string | undefined) ?? null

  try {
    const created = await withRlsContext(userId, async (sql) => {
      const rows = await sql`
        INSERT INTO feedback_reports
          (user_id, author_name, author_role, type, severity, message,
           page_path, app_commit, user_agent, viewport)
        VALUES
          (${userId}, ${authorName}, ${authorRole}, ${type}, ${severity}, ${message},
           ${pagePath}, ${appCommit}, ${userAgent}, ${viewport})
        RETURNING id, created_at
      `
      return rows[0] as { id: string; created_at: string }
    })
    return NextResponse.json({ ok: true, id: created.id })
  } catch (err) {
    console.error('[Feedback] create failed:', err)
    return NextResponse.json({ error: 'Failed to submit feedback' }, { status: 500 })
  }
}

export async function GET(req: NextRequest) {
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

  const url = new URL(req.url)

  // Lightweight badge: /api/feedback?count=new → { new_count }
  if (url.searchParams.get('count') === 'new') {
    try {
      const rows = await withRlsContext(userId, (sql) =>
        sql`SELECT count(*)::int AS new_count FROM feedback_reports WHERE status = 'new'`,
      )
      return NextResponse.json({ new_count: (rows[0] as { new_count: number }).new_count })
    } catch (err) {
      console.error('[Feedback] count failed:', err)
      return NextResponse.json({ error: 'Failed to load count' }, { status: 500 })
    }
  }

  const statusParam = url.searchParams.get('status')
  const status = STATUSES.includes(statusParam as (typeof STATUSES)[number])
    ? (statusParam as (typeof STATUSES)[number])
    : null
  const typeParam = url.searchParams.get('type')
  const type = TYPES.includes(typeParam as (typeof TYPES)[number])
    ? (typeParam as (typeof TYPES)[number])
    : null

  try {
    const rows = await withRlsContext(userId, (sql) => sql`
      SELECT id, created_at, updated_at, user_id, author_name, author_role,
             type, severity, message, page_path, app_commit, user_agent,
             viewport, status, resolution_note, resolved_by, resolved_at
      FROM feedback_reports
      WHERE (${status}::text IS NULL OR status = ${status})
        AND (${type}::text IS NULL OR type = ${type})
      ORDER BY created_at DESC
      LIMIT 500
    `)
    return NextResponse.json({ reports: rows })
  } catch (err) {
    console.error('[Feedback] list failed:', err)
    return NextResponse.json({ error: 'Failed to load feedback' }, { status: 500 })
  }
}
