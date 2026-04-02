import { NextRequest, NextResponse } from 'next/server'
import { uploadToSharePoint } from '@/lib/sharepoint'
import { createClient } from '@/lib/supabase/server'

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData()
    const file = formData.get('file') as File | null
    const clientId = formData.get('clientId') as string | null
    const category = (formData.get('category') as string) || 'general'
    const expiresAt = formData.get('expiresAt') as string | null

    if (!file || !clientId) {
      return NextResponse.json({ error: 'file and clientId are required' }, { status: 400 })
    }

    const arrayBuffer = await file.arrayBuffer()

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    // Resolve the human client_id text for SharePoint folder naming
    const { data: clientRow } = await supabase
      .from('clients')
      .select('client_id')
      .eq('id', clientId)
      .single()

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

    if (error) {
      console.error('Supabase insert error:', error)
      // Still return success — file is in SharePoint
      return NextResponse.json({ id: itemId, name: file.name, webUrl })
    }

    return NextResponse.json({ id: data.id, name: file.name, webUrl })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Upload failed'
    console.error('SharePoint upload error:', err)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
