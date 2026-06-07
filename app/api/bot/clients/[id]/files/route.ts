import { NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import { withBotAuth, botAuditLog } from '@/lib/bot-auth'

export const dynamic = 'force-dynamic'

const BUCKET = 'client-documents'
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
  'intake', 'plan', 'correspondence', 'medical', 'financial', 'ltss', 'other',
])

// ---------------------------------------------------------------------------
// GET /api/bot/clients/[id]/files
// Bots list files for a specific client. Service role bypasses RLS, but every
// access is audited as bot-originated.
// ---------------------------------------------------------------------------
export const GET = withBotAuth(async (req, ctx, routeCtx) => {
  const { id: clientId } = (await routeCtx?.params) ?? {}
  if (!clientId) {
    return NextResponse.json({ error: 'Missing client id' }, { status: 400 })
  }

  // Verify the client exists — give the bot a useful 404 rather than empty results
  const { data: client, error: clientErr } = await ctx.admin
    .from('clients')
    .select('id, client_id, first_name, last_name')
    .eq('id', clientId)
    .maybeSingle()

  if (clientErr) {
    return NextResponse.json({ error: clientErr.message }, { status: 500 })
  }
  if (!client) {
    return NextResponse.json({ error: 'Client not found' }, { status: 404 })
  }

  const { data: files, error: filesErr } = await ctx.admin
    .from('client_documents')
    .select(
      'id, client_id, uploaded_by, file_name, file_path, file_size, mime_type, category, expires_at, created_at, storage_provider'
    )
    .eq('client_id', clientId)
    .order('created_at', { ascending: false })

  if (filesErr) {
    return NextResponse.json({ error: filesErr.message }, { status: 500 })
  }

  await botAuditLog(req, ctx.origin, {
    action: 'bot.client.files.list',
    resourceType: 'client',
    resourceId: clientId,
    details: { count: files?.length ?? 0 },
  })

  return NextResponse.json({ client, files: files ?? [] })
})

// ---------------------------------------------------------------------------
// POST /api/bot/clients/[id]/files
// Bots attach a file to a client — used by the LTSS routing flow.
// Multipart with field `file` plus optional `category` and `expiresAt`.
// ---------------------------------------------------------------------------
export const POST = withBotAuth(async (req, ctx, routeCtx) => {
  const { id: clientId } = (await routeCtx?.params) ?? {}
  if (!clientId) {
    return NextResponse.json({ error: 'Missing client id' }, { status: 400 })
  }

  // Verify client exists
  const { data: client, error: clientErr } = await ctx.admin
    .from('clients')
    .select('id')
    .eq('id', clientId)
    .maybeSingle()

  if (clientErr) {
    return NextResponse.json({ error: clientErr.message }, { status: 500 })
  }
  if (!client) {
    return NextResponse.json({ error: 'Client not found' }, { status: 404 })
  }

  // Parse multipart
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
  if (file.size <= 0) {
    return NextResponse.json({ error: 'Empty file' }, { status: 400 })
  }
  if (file.size > MAX_FILE_SIZE) {
    return NextResponse.json(
      { error: `File too large (max ${MAX_FILE_SIZE / 1024 / 1024} MB)` },
      { status: 413 }
    )
  }

  const mime = file.type || 'application/octet-stream'
  if (!ALLOWED_MIME.has(mime)) {
    return NextResponse.json(
      { error: `File type not allowed: ${mime}` },
      { status: 415 }
    )
  }

  const categoryRaw = String(form.get('category') ?? 'ltss').toLowerCase()
  const category = ALLOWED_CATEGORIES.has(categoryRaw) ? categoryRaw : 'ltss'

  const expiresAtRaw = form.get('expiresAt')
  const expiresAt =
    typeof expiresAtRaw === 'string' && expiresAtRaw.length > 0
      ? expiresAtRaw
      : null

  // Server-controlled path matches the human upload convention.
  const ext = file.name.includes('.')
    ? '.' + file.name.split('.').pop()!.toLowerCase().replace(/[^a-z0-9]/g, '')
    : ''
  const storagePath = `${clientId}/${randomUUID()}${ext}`

  const bytes = await file.arrayBuffer()
  const { error: uploadErr } = await ctx.admin.storage
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

  // No human user is attributing the upload, so uploaded_by is null.
  const { data: row, error: insertErr } = await ctx.admin
    .from('client_documents')
    .insert({
      client_id: clientId,
      uploaded_by: null,
      file_name: file.name,
      file_path: storagePath,
      file_size: file.size,
      mime_type: mime,
      category,
      expires_at: expiresAt,
      storage_provider: 'supabase',
    })
    .select(
      'id, client_id, file_name, file_path, file_size, mime_type, category, expires_at, created_at, storage_provider'
    )
    .single()

  if (insertErr) {
    await ctx.admin.storage.from(BUCKET).remove([storagePath])
    return NextResponse.json(
      { error: `Metadata insert failed: ${insertErr.message}` },
      { status: 500 }
    )
  }

  await botAuditLog(req, ctx.origin, {
    action: 'bot.client.files.upload',
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
