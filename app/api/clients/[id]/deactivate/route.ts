import { NextResponse } from 'next/server'
import { withAuth } from '@/lib/api-auth'
import { auditLog } from '@/lib/audit'
import { isAzureConfigured, withRlsContext } from '@/lib/db/azure'

export const dynamic = 'force-dynamic'

/**
 * POST /api/clients/[id]/deactivate
 *
 * Soft-deactivates a client (e.g. Mark-as-Deceased) through a server route so
 * the write is Azure-aware. The previous implementation wrote to the clients
 * table directly from the browser Supabase client, which would silently hit the
 * abandoned Supabase table after the PHI cutover to Azure.
 *
 * Mirrors the reassign route: withAuth supplies user/role/email for the audit,
 * the clients UPDATE is split across Azure (withRlsContext) vs Supabase, and the
 * action is written to audit_logs. The activity_log feed row is written
 * client-side (activity_log stays in Supabase), matching the reassign flow.
 *
 * Body: { reason?: string }  — defaults to 'deceased'
 */

export const POST = withAuth(
  async (req, ctx, routeCtx) => {
    const { id: clientId } = (await routeCtx?.params) ?? {}
    if (!clientId) {
      return NextResponse.json({ error: 'Missing client id' }, { status: 400 })
    }

    let body: { reason?: string }
    try {
      body = await req.json()
    } catch {
      body = {}
    }
    const reason = (body.reason?.trim() || 'deceased').toLowerCase()

    const nowIso = new Date().toISOString()

    // Deactivate the client (Azure-aware, mirrors the reassign split).
    let updErr: { message: string } | null = null
    if (isAzureConfigured()) {
      try {
        await withRlsContext(ctx.user.id, (sql) => sql`
          UPDATE clients
             SET is_active = false,
                 deactivation_reason = ${reason},
                 deactivated_at = ${nowIso},
                 deactivated_by = ${ctx.user.id}
           WHERE id = ${clientId}
        `)
      } catch (e) {
        updErr = { message: (e as Error).message }
      }
    } else {
      const { error } = await ctx.supabase
        .from('clients')
        .update({
          is_active: false,
          deactivation_reason: reason,
          deactivated_at: nowIso,
          deactivated_by: ctx.user.id,
        })
        .eq('id', clientId)
      updErr = error
    }

    if (updErr) {
      await auditLog(req, {
        userId: ctx.user.id,
        userEmail: ctx.user.email,
        userRole: ctx.role,
        action: 'client.deactivate.denied',
        resourceType: 'client',
        resourceId: clientId,
        details: { reason, error: updErr.message },
      })
      const isAuthz = /permission|denied|not authorized|policy/i.test(updErr.message)
      return NextResponse.json(
        { error: updErr.message },
        { status: isAuthz ? 403 : 400 }
      )
    }

    await auditLog(req, {
      userId: ctx.user.id,
      userEmail: ctx.user.email,
      userRole: ctx.role,
      action: 'client.deactivate',
      resourceType: 'client',
      resourceId: clientId,
      details: { reason },
    })

    return NextResponse.json({ ok: true })
  },
  { roles: ['team_manager', 'supervisor', 'it'] }
)
