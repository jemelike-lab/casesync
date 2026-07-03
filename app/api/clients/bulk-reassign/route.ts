import { NextResponse } from 'next/server'
import { withAuth } from '@/lib/api-auth'
import { auditLog } from '@/lib/audit'
import { isAzureConfigured, withRlsContext } from '@/lib/db/azure'

export const dynamic = 'force-dynamic'

/**
 * POST /api/clients/bulk-reassign — transfer-board + dashboard bulk moves.
 *
 * Body: { client_ids: uuid[], new_planner_id: uuid | null }
 * null unassigns (the transfer board's "back to unassigned" column).
 *
 * Phase 3 data plane: updates run in Azure under the CALLER's RLS scope when
 * configured; Supabase session client otherwise. This is behavior-parity with
 * the previous direct client-side updates (which bypassed the reassign RPC),
 * plus audit_logs coverage those updates never had. Single-client reassign
 * with reason/history stays on /api/clients/[id]/reassign.
 *
 * Rows not visible under the caller's RLS are silently skipped (RETURNING
 * only reports visible rows) — same semantics the direct .in() update had.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const MAX_IDS = 200

export const POST = withAuth(
  async (req, ctx) => {
    let body: { client_ids?: unknown; new_planner_id?: unknown }
    try {
      body = await req.json()
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
    }

    const ids = Array.isArray(body.client_ids) ? body.client_ids : []
    if (
      ids.length === 0 ||
      ids.length > MAX_IDS ||
      !ids.every((v) => typeof v === 'string' && UUID_RE.test(v))
    ) {
      return NextResponse.json({ error: `client_ids must be 1-${MAX_IDS} uuids` }, { status: 400 })
    }
    const plannerId =
      body.new_planner_id === null
        ? null
        : typeof body.new_planner_id === 'string' && UUID_RE.test(body.new_planner_id)
          ? body.new_planner_id
          : undefined
    if (plannerId === undefined) {
      return NextResponse.json({ error: 'new_planner_id must be a uuid or null' }, { status: 400 })
    }

    let updatedIds: string[] = []
    let updateErr: string | null = null
    if (isAzureConfigured()) {
      try {
        const rows = await withRlsContext(ctx.user.id, (sql) =>
          sql`UPDATE clients SET assigned_to = ${plannerId} WHERE id = ANY(${ids as string[]}::uuid[]) RETURNING id`
        )
        updatedIds = (rows as unknown as { id: string }[]).map((r) => r.id)
      } catch (e) {
        updateErr = (e as Error).message
      }
    } else {
      const { data, error } = await ctx.supabase
        .from('clients')
        .update({ assigned_to: plannerId })
        .in('id', ids)
        .select('id')
      if (error) updateErr = error.message
      else updatedIds = ((data ?? []) as { id: string }[]).map((r) => r.id)
    }

    if (updateErr) {
      await auditLog(req, {
        userId: ctx.user.id, userEmail: ctx.user.email, userRole: ctx.role,
        action: 'client.reassign.denied', resourceType: 'client',
        details: { bulk: true, attempted_ids: ids.length, to_planner_id: plannerId, error: updateErr },
      })
      return NextResponse.json({ error: updateErr }, { status: 400 })
    }

    await auditLog(req, {
      userId: ctx.user.id, userEmail: ctx.user.email, userRole: ctx.role,
      action: 'client.reassign', resourceType: 'client',
      details: { bulk: true, client_ids: updatedIds, to_planner_id: plannerId },
    })

    return NextResponse.json({ ok: true, updated: updatedIds.length, ids: updatedIds })
  },
  { roles: ['team_manager', 'supervisor', 'it', 'administrator'] }
)
