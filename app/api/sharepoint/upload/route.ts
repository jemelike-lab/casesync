import { NextRequest, NextResponse } from 'next/server'
import { uploadToSharePoint } from '@/lib/sharepoint'
import { createClient } from '@/lib/supabase/server'
import { rateLimit } from '@/lib/rate-limit'
import { auditLog } from '@/lib/audit'
import { isAzureConfigured, withRlsContext } from '@/lib/db/azure'

// Allowed categories — single source of truth in lib/document-folders
// (also enforced by the client_documents_category_check DB constraint).
import { ALLOWED_CATEGORIES } from '@/lib/document-folders'

export async function POST(req: NextRequest) {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
  const rl = rateLimit(`sharepoint-upload:${ip}`, { limit: 20, windowMs: 60_000 })
  if (!rl.ok) {
    return NextResponse.json({ error: 'rate_limited' }, { status: 429 })
  }

  try {
    const formData = await req.formData()
    const file = formData.get('file') as File | null
    const clientId = formData.get('clientId') as string | null
    const categoryRaw = String(formData.get('category') ?? '').toLowerCase()
    if (!categoryRaw) {
      return NextResponse.json({ error: 'Category is required' }, { status: 400 })
    }
    if (!ALLOWED_CATEGORIES.has(categoryRaw)) {
      return NextResponse.json({ error: `Unknown category: ${categoryRaw}` }, { status: 400 })
    }
    const category = categoryRaw
    const expiresAt = formData.get('expiresAt') as string | null

    if (!file || !clientId) {
      return NextResponse.json({ error: 'file and clientId are required' }, { status: 400 })
    }

    const arrayBuffer = await file.arrayBuffer()

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Resolve the human client_id text for SharePoint folder naming
    let clientRow: { client_id: string } | null = null
    if (isAzureConfigured()) {
      clientRow = await withRlsContext(user.id, async (sql) => {
        const rows = await sql`SELECT client_id FROM clients WHERE id = ${clientId} LIMIT 1`
        return (rows[0] ?? null) as unknown as { client_id: string } | null
      })
    } else {
      const { data } = await supabase
        .from('clients')
        .select('client_id')
        .eq('id', clientId)
        .single()
      clientRow = data
    }

    const rawFolder = clientRow?.client_id || clientId
    // SharePoint folder naming rules are strict (no \/:*?"<>| etc.).
    // Use a conservative sanitizer.
    const clientFolder = rawFolder
      .replace(/[,\\/:*?"<>|#%&{}~]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 80) || clientId

    const { webUrl, itemId } = await uploadToSharePoint(
      clientFolder,
      file.name,
      arrayBuffer,
      file.type || 'application/octet-stream'
    )

    // Save metadata to Supabase

    let insertedData: { id: string } | null = null
    let insertErr: { message: string } | null = null
    if (isAzureConfigured()) {
      try {
        insertedData = await withRlsContext(user.id, async (sql) => {
          const rows = await sql`INSERT INTO client_documents (client_id, uploaded_by, file_name, file_path, file_size, mime_type, category, expires_at, storage_provider) VALUES (${clientId}, ${user?.id ?? null}, ${file.name}, ${itemId}, ${file.size}, ${file.type}, ${category}, ${expiresAt || null}, 'sharepoint') RETURNING id`
          return (rows[0] ?? null) as unknown as { id: string } | null
        })
      } catch (e) {
        insertErr = { message: (e as Error).message }
      }
    } else {
      const { data, error } = await supabase
        .from('client_documents')
        .insert({
          client_id: clientId,
          uploaded_by: user?.id,
          file_name: file.name,
          file_path: itemId, // store SharePoint item ID as file_path
          file_size: file.size,
          mime_type: file.type,
          category,
          expires_at: expiresAt || null,
          storage_provider: 'sharepoint',
        })
        .select()
        .single()
      insertedData = data
      insertErr = error
    }

    if (insertErr) {
      console.error('Supabase insert error:', insertErr)
      // Still return success — file is in SharePoint

    // Audit: log document upload
    await auditLog(req, { userId: user.id, userEmail: user.email ?? undefined, action: 'client.create', resourceType: 'sharepoint_document', details: { filename: file?.name } }).catch(() => {})
      return NextResponse.json({ id: itemId, name: file.name, webUrl })
    }

    return NextResponse.json({ id: itemId, dbId: insertedData?.id, name: file.name, webUrl })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Upload failed'
    console.error('SharePoint upload error:', err)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
