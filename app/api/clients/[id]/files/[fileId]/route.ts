import { NextResponse } from 'next/server'
import { withAuth } from '@/lib/api-auth'
import { auditLog } from '@/lib/audit'

export const dynamic = 'force-dynamic'

const BUCKET = 'client-documents'

// ---------------------------------------------------------------------------
// DELETE /api/clients/[id]/files/[fileId]
// Soft-deletes are not yet in the schema; this is a hard delete of both the
// storage object and the metadata row. RLS on client_documents enforces who
// can delete (uploader OR supervisor/it).
// ---------------------------------------------------------------------------
export const DELETE = withAuth(async (req, ctx, routeCtx) => {
  const { id: clientId, fileId } = (await routeCtx?.params) ?? {}
  if (!clientId || !fileId) {
    return NextResponse.json(
      { error: 'Missing client id or file id' },
      { status: 400 }
    )
  }

  // Look up first via session client so RLS applies
  const { data: doc, error: lookupErr } = await ctx.supabase
    .from('client_documents')
    .select('id, client_id, file_path, file_name, storage_provider, uploaded_by')
    .eq('id', fileId)
    .eq('client_id', clientId)
    .single()

  if (lookupErr || !doc) {
    return NextResponse.json({ error: 'File not found' }, { status: 404 })
  }

  // SharePoint files are managed by the existing /api/sharepoint/delete route.
  if (doc.storage_provider && doc.storage_provider !== 'supabase') {
    return NextResponse.json(
      { error: `Use the ${doc.storage_provider} delete endpoint for this file` },
      { status: 400 }
    )
  }

  // Delete the metadata row first (RLS authorizes); only if that succeeds
  // do we touch storage, so a denied request never strands an orphan object.
  const { error: deleteErr } = await ctx.supabase
    .from('client_documents')
    .delete()
    .eq('id', fileId)

  if (deleteErr) {
    return NextResponse.json(
      { error: deleteErr.message },
      { status: deleteErr.message.toLowerCase().includes('permission') ? 403 : 500 }
    )
  }

  // Remove the storage object. If this fails the metadata is already gone,
  // so the file becomes orphaned but inaccessible — we log and move on.
  const { error: storageErr } = await ctx.supabase.storage
    .from(BUCKET)
    .remove([doc.file_path])

  if (storageErr) {
    console.error(
      '[files.delete] Metadata deleted but storage object orphaned',
      { fileId, path: doc.file_path, error: storageErr.message }
    )
  }

  await auditLog(req, {
    userId: ctx.user.id,
    userEmail: ctx.user.email,
    userRole: ctx.role,
    action: 'client.files.delete',
    resourceType: 'client_document',
    resourceId: doc.id,
    details: {
      client_id: clientId,
      file_name: doc.file_name,
      storage_path: doc.file_path,
      storage_orphaned: !!storageErr,
    },
  })

  return NextResponse.json({ ok: true })
})
