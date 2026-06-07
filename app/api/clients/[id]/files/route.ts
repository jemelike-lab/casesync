import { NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import { withAuth } from '@/lib/api-auth'
import { auditLog } from '@/lib/audit'

export const dynamic = 'force-dynamic'

// Hard limits beyond what the bucket enforces. Bucket cap is 50MB and a
// MIME allowlist; we mirror them here so the API returns a friendly error
// before the storage call instead of letting the bucket throw.
const MAX_FILE_SIZE = 50 * 1024 * 1024
const ALLOWED_MIME = new Set<string>([
  'application/pdf',
  'image/jpeg', 'image/png', 'image/gif', 'image/webp',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
])
const ALLOWED_CATEGORIES = new Set<string>([
  'general', 'consent_form', 'assessment', 'letter', 'authorization',
  'intake', 'plan', 'correspondence', 'medical', 'financial', 'other',
])

const BUCKET = 'client-documents'

// ---------------------------------------------------------------------------
// GET /api/clients/[id]/files
// List documents for a client. RLS on client_documents enforces who can see
// what; this endpoint just runs the query under the user's session.
// ---------------------------------------------------------------------------
export const GET = withAuth(async (req, ctx, routeCtx) => {
  const { id: clientId } = (await routeCtx?.params) ?? {}
  if (!clientId) {
    return NextResponse.json({ error: 'Missing client id' }, { status: 400 })
  }

  const { data, error } = await ctx.supabase
    .from('client_documents')
    .select(
      'id, client_id, uploaded_by, file_name, file_path, file_size, mime_type, category, expires_at, created_at, storage_provider, profiles!client_documents_uploaded_by_fkey(full_name)'
    )
    .eq('client_id', clientId)
    .order('created_at', { ascending: false })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  await auditLog(req, {
    userId: ctx.user.id,
    userEmail: ctx.user.email,
    userRole: ctx.role,
    action: 'client.files.list',
    resourceType: 'client',
    resourceId: clientId,
    details: { count: data?.length ?? 0 },
  })

  return NextResponse.json({ files: data ?? [] })
})

// ---------------------------------------------------------------------------
// POST /api/clients/[id]/files
// Upload a file. Server controls the storage path (uuid filename) so callers
// can't probe other clients' folders by crafting paths.
// ---------------------------------------------------------------------------
export const POST = withAuth(async (req: NextRequest, ctx, routeCtx) => {
  const { id: clientId } = (await routeCtx?.params) ?? {}
  if (!clientId) {
    return NextResponse.json({ error: 'Missing client id' }, { status: 400 })
  }

  // Parse multipart form
  let form: FormData
  try {
    form = await req.formData()
  } catch {
    return NextResponse.json({ error: 'Invalid form data' }, { status: 400 })
  }

  const file = form.get('file')
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'No file provided' }, { status: 400 })
  }

  // Validate size
  if (file.size <= 0) {
    return NextResponse.json({ error: 'Empty file' }, { status: 400 })
  }
  if (file.size > MAX_FILE_SIZE) {
    return NextResponse.json(
      { error: `File too large (max ${MAX_FILE_SIZE / 1024 / 1024} MB)` },
      { status: 413 }
    )
  }

  // Validate MIME (trust the type the bucket also rechecks)
  const mime = file.type || 'application/octet-stream'
  if (!ALLOWED_MIME.has(mime)) {
    return NextResponse.json(
      { error: `File type not allowed: ${mime}` },
      { status: 415 }
    )
  }

  // Validate category
  const categoryRaw = String(form.get('category') ?? 'general').toLowerCase()
  const category = ALLOWED_CATEGORIES.has(categoryRaw) ? categoryRaw : 'general'

  // Optional expiry
  const expiresAtRaw = form.get('expiresAt')
  const expiresAt =
    typeof expiresAtRaw === 'string' && expiresAtRaw.length > 0
      ? expiresAtRaw
      : null

  // Server-controlled path: {clientId}/{uuid}.{ext}
  // Original filename lives in the metadata row only, never in the path.
  const ext = file.name.includes('.')
    ? '.' + file.name.split('.').pop()!.toLowerCase().replace(/[^a-z0-9]/g, '')
    : ''
  const storagePath = `${clientId}/${randomUUID()}${ext}`

  // Authorize via the access function. Storage RLS and the metadata-table
  // RLS both enforce this too, but checking up-front gives a clean 403
  // instead of a confusing storage error and avoids a wasted upload.
  // Called via the user's session client so auth.uid() resolves correctly.
  const { data: canAccess, error: accessErr } = await ctx.supabase.rpc(
    'user_can_access_client',
    { _client_id: clientId }
  )
  if (accessErr || canAccess !== true) {
    return NextResponse.json(
      { error: 'Forbidden — you do not have access to this client' },
      { status: 403 }
    )
  }

  // Upload the bytes. We use the user's session client so storage RLS still
  // applies as a second layer (defense in depth).
  const bytes = await file.arrayBuffer()
  const { error: uploadErr } = await ctx.supabase.storage
    .from(BUCKET)
    .upload(storagePath, bytes, {
      contentType: mime,
      cacheControl: '3600',
      upsert: false,
    })

  if (uploadErr) {
    return NextResponse.json(
      { error: `Upload failed: ${uploadErr.message}` },
      { status: 500 }
    )
  }

  // Insert metadata row (RLS on client_documents enforces access too)
  const { data: row, error: insertErr } = await ctx.supabase
    .from('client_documents')
    .insert({
      client_id: clientId,
      uploaded_by: ctx.user.id,
      file_name: file.name,
      file_path: storagePath,
      file_size: file.size,
      mime_type: mime,
      category,
      expires_at: expiresAt,
      storage_provider: 'supabase',
    })
    .select(
      'id, client_id, uploaded_by, file_name, file_path, file_size, mime_type, category, expires_at, created_at, storage_provider'
    )
    .single()

  if (insertErr) {
    // Best-effort cleanup: remove the orphaned storage object
    await ctx.supabase.storage.from(BUCKET).remove([storagePath])
    return NextResponse.json(
      { error: `Metadata insert failed: ${insertErr.message}` },
      { status: 500 }
    )
  }

  await auditLog(req, {
    userId: ctx.user.id,
    userEmail: ctx.user.email,
    userRole: ctx.role,
    action: 'client.files.upload',
    resourceType: 'client_document',
    resourceId: row.id,
    details: {
      client_id: clientId,
      file_name: file.name,
      mime_type: mime,
      file_size: file.size,
      category,
      storage_path: storagePath,
    },
  })

  return NextResponse.json({ file: row }, { status: 201 })
})
