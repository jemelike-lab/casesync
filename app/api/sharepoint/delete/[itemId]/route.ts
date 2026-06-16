import { NextRequest, NextResponse } from 'next/server'
import { deleteSharePointFile } from '@/lib/sharepoint'
import { createClient } from '@/lib/supabase/server'
import { auditLog } from '@/lib/audit'
import { isSupervisorLike } from '@/lib/roles'
import { isAzureConfigured, withRlsContext } from '@/lib/db/azure'

/**
 * DELETE /api/sharepoint/delete/[itemId]
 *
 * Role gate: supervisor / it ONLY.
 * Document deletion is a HIPAA-significant action — supports_planner and
 * team_manager must NOT have direct delete authority over client documents.
 *
 * Fix 2026-05-22: previously any authenticated user could delete any
 * SharePoint file by item ID. See AUDIT_2026-05-22.md §2A finding P0-3.
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ itemId: string }> }
) {
  try {
    const { itemId } = await params

    if (!itemId || typeof itemId !== 'string' || itemId.length > 256) {
      return NextResponse.json({ error: 'Invalid itemId' }, { status: 400 })
    }

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    let profile: { id: string; role: string } | null = null
    if (isAzureConfigured()) {
      profile = await withRlsContext(user.id, async (sql) => {
        const rows = await sql`SELECT id, role FROM profiles WHERE id = ${user.id} LIMIT 1`
        return (rows[0] ?? null) as unknown as { id: string; role: string } | null
      })
    } else {
      const { data } = await supabase
        .from('profiles')
        .select('id, role')
        .eq('id', user.id)
        .single()
      profile = data
    }

    if (!profile || !isSupervisorLike(profile.role)) {
      // Audit attempted privilege escalation
      await auditLog(req, {
        userId: user.id,
        userEmail: user.email ?? undefined,
        userRole: profile?.role,
        action: 'client.delete',
        resourceType: 'sharepoint_document',
        resourceId: itemId,
        details: { denied: true, reason: 'insufficient_role' },
      }).catch(() => {})
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // Delete from SharePoint
    await deleteSharePointFile(itemId)

    // Remove from Supabase (file_path stores the SharePoint item ID)
    if (isAzureConfigured()) {
      await withRlsContext(user.id, (sql) => sql`DELETE FROM client_documents WHERE file_path = ${itemId} AND storage_provider = 'sharepoint'`)
    } else {
      await supabase
        .from('client_documents')
        .delete()
        .eq('file_path', itemId)
        .eq('storage_provider', 'sharepoint')
    }

    // Audit: log document deletion
    await auditLog(req, {
      userId: user.id,
      userEmail: user.email ?? undefined,
      userRole: profile.role,
      action: 'client.delete',
      resourceType: 'sharepoint_document',
      resourceId: itemId,
    }).catch(() => {})

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('SharePoint delete error:', err instanceof Error ? err.message : 'unknown')
    // Do NOT echo err.message to the client — could leak SharePoint / Graph internals.
    return NextResponse.json({ error: 'Failed to delete file' }, { status: 500 })
  }
}
