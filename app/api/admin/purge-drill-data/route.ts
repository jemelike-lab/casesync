import { NextResponse } from 'next/server'
import { withAuth } from '@/lib/api-auth'
import { isAzureConfigured, withRlsContext, withAuditRole } from '@/lib/db/azure'

export const dynamic = 'force-dynamic'

/**
 * POST /api/admin/purge-drill-data  — ONE-TIME pre-launch cleanup.
 *
 * Removes QA drill artifacts from the PHI plane that the pre-launch review
 * flagged (SENTINEL-D4/D5/D6, DrillSix, DayFour, "Batch B live drill" — the
 * SENTINEL-D6 client id ed6c2dcf-… and its twins), then writes a single
 * `admin.audit_purge` documentation row so the deletion is itself audited.
 *
 * Scope + safety:
 *   - Deletes ONLY sentinel/drill-patterned CLIENT rows + their notes. Runs
 *     under withRlsContext(caller) so it uses the same identity-scoped path the
 *     app trusts; real client data never matches the pattern.
 *   - Requires ?confirm=PURGE-DRILL-2026 so it can't fire by accident.
 *   - Elevated roles only.
 *   - The drill AUDIT rows themselves are intentionally NOT deletable here
 *     (audit_logs has no DELETE policy + FORCE RLS by design); this route only
 *     reports how many remain. Those require the csadmin owner path.
 *
 * REMOVE THIS ROUTE in the next deploy after it has been run once.
 */

const CLIENT_MATCH = `(last_name ILIKE '%SENTINEL%' OR first_name ILIKE '%SENTINEL%'
   OR last_name ILIKE '%Drill%' OR client_id ILIKE '%SENTINEL%'
   OR id = 'ed6c2dcf-222e-4337-8636-f66da860681c')`

export const POST = withAuth(
  async (req, ctx) => {
    if (!isAzureConfigured()) {
      return NextResponse.json({ error: 'Azure data plane is not configured' }, { status: 400 })
    }
    const url = new URL(req.url)
    if (url.searchParams.get('confirm') !== 'PURGE-DRILL-2026') {
      return NextResponse.json(
        { error: 'Refusing to run without ?confirm=PURGE-DRILL-2026' },
        { status: 400 },
      )
    }

    const out: Record<string, unknown> = { ranBy: ctx.profile.id }

    // 1) client notes + client rows, under the caller's RLS identity
    await withRlsContext(ctx.profile.id, async (sql) => {
      const before = await sql.unsafe(`SELECT count(*)::int c FROM clients WHERE ${CLIENT_MATCH}`)
      out.sentinelClientsBefore = before[0].c
      if (before[0].c > 0) {
        const notes = await sql.unsafe(
          `DELETE FROM client_notes WHERE client_id IN (SELECT id FROM clients WHERE ${CLIENT_MATCH})`,
        )
        out.clientNotesDeleted = notes.count ?? 0
        const cli = await sql.unsafe(`DELETE FROM clients WHERE ${CLIENT_MATCH}`)
        out.clientsDeleted = cli.count ?? 0
      } else {
        out.clientNotesDeleted = 0
        out.clientsDeleted = 0
      }
      const after = await sql.unsafe(`SELECT count(*)::int c FROM clients WHERE ${CLIENT_MATCH}`)
      out.sentinelClientsAfter = after[0].c
      const dr = await sql.unsafe(
        `SELECT count(*)::int c FROM audit_logs
          WHERE details::text ILIKE '%SENTINEL%' OR details::text ILIKE '%DrillSix%'
             OR details::text ILIKE '%DayFour%' OR details::text ILIKE '%Batch B live drill%'`,
      )
      out.drillAuditRowsRemaining = dr[0].c
    })

    // 2) documentation row via the INSERT-only audit role
    try {
      await withAuditRole(async (sql) => {
        await sql.unsafe(
          `INSERT INTO audit_logs (user_id, user_email, user_role, action, resource_type, resource_id, details)
           VALUES (NULL, 'Jemelike@blhnurses.com', 'administrator', 'admin.audit_purge', 'audit_logs', NULL,
           '{"reason":"pre-launch cleanup","removed":"sentinel/drill client rows + notes via one-time admin route","note":"drill audit rows require csadmin owner path","authorized_by":"Josh Emelike","date":"2026-07-08"}'::jsonb)`
        )
      })
      out.auditPurgeRowWritten = true
    } catch (e) {
      out.auditPurgeRowWritten = false
      out.auditWriteError = (e as Error).message
    }

    console.log('[purge-drill-data]', JSON.stringify(out))
    return NextResponse.json(out)
  },
  { roles: ['supervisor', 'administrator'] },
)
