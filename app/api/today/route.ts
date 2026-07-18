// app/api/today/route.ts
// Phase 3 — the Today view feed. Role-scoped (SP: own caseload, TM: team,
// everyone else org-wide, mirroring the Casey executors), Azure-first, and
// driven by lib/today.ts — the exact engine behind the morning digest email,
// so the dashboard card and the inbox can never disagree.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { auditLog } from '@/lib/audit'
import { isAzureConfigured, withRlsContext } from '@/lib/db/azure'
import { computeTodayPacket, TODAY_CLIENT_COLS } from '@/lib/today'
import { businessTodayStr } from '@/lib/business-date'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const PAGE = 1000
const CEILING = 25000

export async function GET(req: NextRequest) {
  const serverSupabase = await createServerClient()
  const { data: authData, error: authErr } = await serverSupabase.auth.getUser()
  if (authErr || !authData?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const userId = authData.user.id

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  // Resolve role exactly as the bot route does (Azure identity → Supabase fallback).
  let profile: { role?: string | null } | null = null
  if (isAzureConfigured()) {
    profile = await withRlsContext(userId, async (sql) => {
      const rows = await sql`SELECT role FROM profiles WHERE id = ${userId} LIMIT 1`
      return (rows[0] ?? null) as unknown as { role?: string | null } | null
    })
  } else {
    const { data } = await supabase.from('profiles').select('role').eq('id', userId).single()
    profile = data
  }
  const userRole = profile?.role ?? 'unknown'

  auditLog(req, {
    userId,
    userEmail: authData.user.email ?? undefined,
    userRole,
    action: 'client.view',
    resourceType: 'today-view',
  }).catch(() => {})

  const todayStr = businessTodayStr()
  let rows: Record<string, unknown>[] = []
  let changes24h: { activity: number; notes: number } | null = null

  if (isAzureConfigured()) {
    const loaded = await withRlsContext(userId, async (sql) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const sqlAny = sql as any
      let scope = sql``
      if (userRole === 'supports_planner' || userRole === 'SUPPORT_PLANNER' || userRole === 'STAFF') {
        scope = sql`AND c.assigned_to = ${userId}`
      } else if (userRole === 'team_manager' || userRole === 'TEAM_MANAGER' || userRole === 'MANAGER') {
        const tm = await sql`SELECT id FROM profiles WHERE team_manager_id = ${userId}`
        const ids = (tm as unknown as { id: string }[]).map((m) => m.id)
        ids.push(userId)
        scope = sql`AND c.assigned_to = ANY(${ids}::uuid[])`
      }
      const list: Record<string, unknown>[] = []
      for (let offset = 0; offset < CEILING; offset += PAGE) {
        const page = await sqlAny`SELECT ${sqlAny.unsafe(TODAY_CLIENT_COLS)} FROM clients c WHERE c.is_active = true AND c.client_classification = 'real' ${scope} ORDER BY c.id ASC LIMIT ${PAGE} OFFSET ${offset}`
        const rowsPage = page as unknown as Record<string, unknown>[]
        list.push(...rowsPage)
        if (rowsPage.length < PAGE) break
      }
      const act = await sql`SELECT count(*)::int AS n FROM activity_log a JOIN clients c ON c.id = a.client_id WHERE a.created_at >= now() - interval '1 day' AND c.is_active = true AND c.client_classification = 'real' ${scope}`
      const nts = await sql`SELECT count(*)::int AS n FROM client_notes n JOIN clients c ON c.id = n.client_id WHERE n.created_at >= now() - interval '1 day' AND c.is_active = true AND c.client_classification = 'real' ${scope}`
      return {
        list,
        changes: {
          activity: Number((act as unknown as { n: number }[])[0]?.n ?? 0),
          notes: Number((nts as unknown as { n: number }[])[0]?.n ?? 0),
        },
      }
    })
    rows = loaded.list
    changes24h = loaded.changes
  } else {
    // Supabase fallback (non-Azure dev only): paginated scoped scan; 24h
    // change counts omitted on this plane.
    let teamIds: string[] | null = null
    if (userRole === 'team_manager' || userRole === 'TEAM_MANAGER' || userRole === 'MANAGER') {
      const { data: teamMembers } = await supabase.from('profiles').select('id').eq('team_manager_id', userId)
      teamIds = ((teamMembers || []) as { id: string }[]).map((m) => m.id)
      teamIds.push(userId)
    }
    for (let from = 0; from < CEILING; from += PAGE) {
      let q = supabase.from('clients').select(TODAY_CLIENT_COLS)
        .eq('is_active', true).eq('client_classification', 'real')
        .order('id', { ascending: true }).range(from, from + PAGE - 1)
      if (userRole === 'supports_planner' || userRole === 'SUPPORT_PLANNER' || userRole === 'STAFF') {
        q = q.eq('assigned_to', userId)
      } else if (teamIds) {
        q = q.in('assigned_to', teamIds)
      }
      const { data, error } = await q
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      rows.push(...((data ?? []) as Record<string, unknown>[]))
      if (!data || data.length < PAGE) break
    }
  }

  const packet = computeTodayPacket(rows, todayStr)
  return NextResponse.json({
    generated_for: todayStr,
    counts: packet.counts,
    focus: packet.focus,
    caught_up: packet.caught_up,
    changes_24h: changes24h,
  })
}
