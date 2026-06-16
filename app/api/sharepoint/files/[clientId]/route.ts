import { NextRequest, NextResponse } from 'next/server'
import { listClientFiles } from '@/lib/sharepoint'
import { createClient } from '@/lib/supabase/server'
import { isAzureConfigured, withRlsContext } from '@/lib/db/azure'

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ clientId: string }> }
) {
  try {
    const { clientId } = await params

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Resolve the human client_id text for SharePoint folder naming (must match upload route)
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

    const clientFolder = clientRow?.client_id || clientId

    const spFiles = await listClientFiles(clientFolder)

    // Get metadata from Supabase for SharePoint files
    let dbDocs: any[] | null = null
    if (isAzureConfigured()) {
      dbDocs = await withRlsContext(user.id, async (sql) => {
        const rows = await sql`SELECT cd.*, p.full_name AS p_full_name FROM client_documents cd LEFT JOIN profiles p ON p.id = cd.uploaded_by WHERE cd.client_id = ${clientId} AND cd.storage_provider = 'sharepoint'`
        return (rows as unknown as any[]).map((r) => {
          const { p_full_name, ...rest } = r
          return { ...rest, profiles: p_full_name != null ? { full_name: p_full_name } : null }
        })
      })
    } else {
      const { data } = await supabase
        .from('client_documents')
        .select('*, profiles!client_documents_uploaded_by_fkey(full_name)')
        .eq('client_id', clientId)
        .eq('storage_provider', 'sharepoint')
      dbDocs = data
    }

    // Build a map: itemId → db record
    const dbMap = new Map<string, any>()
    for (const doc of dbDocs ?? []) {
      dbMap.set(doc.file_path, doc)
    }

    // Normalize to the ClientFile shape the UI renders (matches the bucket route).
    const files = spFiles.map((f) => {
      const meta = dbMap.get(f.id)
      return {
        id: f.id,
        client_id: clientId,
        uploaded_by: meta?.uploaded_by ?? '',
        file_name: f.name,
        file_path: f.id,
        file_size: f.size ?? null,
        mime_type: f.mimeType ?? null,
        category: meta?.category ?? 'general',
        expires_at: meta?.expires_at ?? null,
        created_at: f.createdAt,
        storage_provider: 'sharepoint',
        profiles: meta?.profiles ?? (f.createdBy ? { full_name: f.createdBy } : null),
        dbId: meta?.id ?? null,
      }
    })

    return NextResponse.json({ files })
  } catch (err: any) {
    console.error('SharePoint list error:', err)
    return NextResponse.json(
      { error: err.message ?? 'Failed to list files' },
      { status: 500 }
    )
  }
}
