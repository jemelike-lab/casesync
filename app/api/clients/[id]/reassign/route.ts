import { NextResponse } from 'next/server'
import { withAuth } from '@/lib/api-auth'
import { auditLog } from '@/lib/audit'
import { isAzureConfigured, withRlsContext } from '@/lib/db/azure'

export const dynamic = 'force-dynamic'

/**
 * POST /api/clients/[id]/reassign
 *
 * Wraps the reassign_client(...) RPC so the UI has a single endpoint that:
 *   1. Goes through withAuth (so we have user/role/email context for audit)
 *   2. Writes the action to audit_logs (the RPC writes to client_assignment_history,
 *      which is a separate purpose-built table — this gives us cross-resource
 *      coverage)
 *   3. Translates RPC errors into clean HTTP responses
 *
 * Body: { new_planner_id: uuid, reason?: string }
 */

export const POST = withAuth(
  async (req, ctx, routeCtx) => {
    const { id: clientId } = (await routeCtx?.params) ?? {}
    if (!clientId) {
      return NextResponse.json({ error: 'Missing client id' }, { status: 400 })
    }

    let body: { new_planner_id?: string; reason?: string }
    try {
      body = await req.json()
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
    }

    const newPlannerId = body.new_planner_id
    const reason = body.reason?.trim() || null

    if (!newPlannerId) {
      return NextResponse.json(
        { error: 'new_planner_id is required' },
        { status: 400 }
      )
    }

    // Capture the old planner before the swap so we can audit it
    let before: { assigned_to?: string | null; first_name?: string | null; last_name?: string | null } | null = null
    if (isAzureConfigured()) {
      before = await withRlsContext(ctx.user.id, async (sql) => {
        const rows = await sql`SELECT assigned_to, first_name, last_name FROM clients WHERE id = ${clientId} LIMIT 1`
        return (rows[0] ?? null) as unknown as { assigned_to?: string | null; first_name?: string | null; last_name?: string | null } | null
      })
    } else {
      const { data } = await ctx.admin
        .from('clients')
        .select('assigned_to, first_name, last_name')
        .eq('id', clientId)
        .single()
      before = data
    }

    // Call the RPC via the user's session so auth.uid() resolves correctly
    // and the RPC's role check fires.
    let rpcErr: { message: string } | null = null
    if (isAzureConfigured()) {
      try {
        await withRlsContext(ctx.user.id, (sql) => sql`SELECT reassign_client(${clientId}, ${newPlannerId}, ${reason})`)
      } catch (e) {
        rpcErr = { message: (e as Error).message }
      }
    } else {
      const { error } = await ctx.supabase.rpc('reassign_client', {
        _client_id: clientId,
        _new_planner_id: newPlannerId,
        _reason: reason,
      })
      rpcErr = error
    }

    if (rpcErr) {
      await auditLog(req, {
        userId: ctx.user.id,
        userEmail: ctx.user.email,
        userRole: ctx.role,
        action: 'client.reassign.denied',
        resourceType: 'client',
        resourceId: clientId,
        details: {
          attempted_to: newPlannerId,
          reason,
          error: rpcErr.message,
        },
      })

      // RPC raises 'Only supervisors...' / 'Target user...' / 'Client not found'
      const msg = rpcErr.message
      const isAuthz = /Only (supervisors|team managers)/i.test(msg)
      const isNotFound = /not found/i.test(msg)
      return NextResponse.json(
        { error: msg },
        { status: isAuthz ? 403 : isNotFound ? 404 : 400 }
      )
    }

    await auditLog(req, {
      userId: ctx.user.id,
      userEmail: ctx.user.email,
      userRole: ctx.role,
      action: 'client.reassign',
      resourceType: 'client',
      resourceId: clientId,
      details: {
        from_planner_id: before?.assigned_to ?? null,
        to_planner_id: newPlannerId,
        reason,
      },
    })

    return NextResponse.json({ ok: true })
  },
  { roles: ['team_manager', 'supervisor', 'it', 'administrator'] }
)
