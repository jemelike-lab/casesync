import { NextRequest, NextResponse } from 'next/server'
import { listClientFiles } from '@/lib/sharepoint'
import { createClient } from '@/lib/supabase/server'

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ clientId: string }> }
) {
  try {
    const { clientId } = await params

    const supabase = await createClient()

    // Resolve the human client_id text for SharePoint folder naming (must match upload route)
    const { data: clientRow } = await supabase
      .from('clients')
      .select('client_id')
      .eq('id', clientId)
      .single()

    const clientFolder = clientRow?.client_id || clientId

    const spFiles = await listClientFiles(clientFolder)

    // Get metadata from Supabase for SharePoint files
    const { data: dbDocs } = await supabase
      .from('client_documents')
      .select('*, profiles!client_documents_uploaded_by_fkey(full_name)')
      .eq('client_id', clientId)
      .eq('storage_provider', 'sharepoint')

    // Build a map: itemId → db record
    const dbMap = new Map<string, any>()
    for (const doc of dbDocs ?? []) {
      dbMap.set(doc.file_path, doc)
    }

    // Merge SharePoint file list with Supabase metadata
    const merged = spFiles.map((f) => {
      const meta = dbMap.get(f.id)
      return {
        ...f,
        dbId: meta?.id ?? null,
        category: meta?.category ?? 'general',
        expiresAt: meta?.expires_at ?? null,
        uploadedBy: meta?.profiles?.full_name ?? f.createdBy,
        storageProvider: 'sharepoint',
      }
    })

    return NextResponse.json(merged)
  } catch (err: any) {
    console.error('SharePoint list error:', err)
    return NextResponse.json(
      { error: err.message ?? 'Failed to list files' },
      { status: 500 }
    )
  }
}
