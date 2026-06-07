import { NextResponse } from 'next/server'
import { withAuth } from '@/lib/api-auth'
import { auditLog } from '@/lib/audit'

export const dynamic = 'force-dynamic'

const BUCKET = 'client-documents'
const SIGNED_URL_TTL_SECONDS = 300 // 5 minutes

// ---------------------------------------------------------------------------
// GET /api/clients/[id]/files/[fileId]/view-url
// Returns a short-lived signed URL for inline viewing. Caller must already
// be authorized for this client (RLS on client_documents enforces this when
// we look up the file).
// ---------------------------------------------------------------------------
export const GET = withAuth(async (req, ctx, routeCtx) => {
  const { id: clientId, fileId } = (await routeCtx?.params) ?? {}
  if (!clientId || !fileId) {
    return NextResponse.json(
      { error: 'Missing client id or file id' },
      { status: 400 }
    )
  }

  // Look up the file via the user's session — RLS hides it if not authorized
  const { data: doc, error: lookupErr } = await ctx.supabase
    .from('client_documents')
    .select('id, client_id, file_path, file_name, mime_type, storage_provider')
    .eq('id', fileId)
    .eq('client_id', clientId)
    .single()

  if (lookupErr || !doc) {
    await auditLog(req, {
      userId: ctx.user.id,
      userEmail: ctx.user.email,
      userRole: ctx.role,
      action: 'client.files.view.denied',
      resourceType: 'client_document',
      resourceId: fileId,
      details: { client_id: clientId, reason: lookupErr?.message ?? 'not found or not authorized' },
    })
    return NextResponse.json({ error: 'File not found' }, { status: 404 })
  }

  // SharePoint files don't live in our bucket; the caller should use the
  // SharePoint webUrl from the list payload instead.
  if (doc.storage_provider && doc.storage_provider !== 'supabase') {
    return NextResponse.json(
      {
        error: `File is stored in ${doc.storage_provider}; use that provider's URL`,
      },
      { status: 400 }
    )
  }

  // Generate a short-lived signed URL for inline viewing.
  // The transform option forces inline disposition so the browser renders
  // PDFs/images instead of downloading.
  const { data: signed, error: signErr } = await ctx.supabase.storage
    .from(BUCKET)
    .createSignedUrl(doc.file_path, SIGNED_URL_TTL_SECONDS)

  if (signErr || !signed?.signedUrl) {
    return NextResponse.json(
      { error: signErr?.message ?? 'Failed to sign URL' },
      { status: 500 }
    )
  }

  await auditLog(req, {
    userId: ctx.user.id,
    userEmail: ctx.user.email,
    userRole: ctx.role,
    action: 'client.files.view',
    resourceType: 'client_document',
    resourceId: doc.id,
    details: {
      client_id: clientId,
      file_name: doc.file_name,
      mime_type: doc.mime_type,
      ttl_seconds: SIGNED_URL_TTL_SECONDS,
    },
  })

  return NextResponse.json({
    url: signed.signedUrl,
    file_name: doc.file_name,
    mime_type: doc.mime_type,
    expires_in: SIGNED_URL_TTL_SECONDS,
  })
})
