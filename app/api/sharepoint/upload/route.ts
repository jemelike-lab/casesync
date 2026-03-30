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
    const buffer = Buffer.from(arrayBuffer)

    const { webUrl, itemId } = await uploadToSharePoint(
      clientId,
      file.name,
      buffer,
      file.type || 'application/octet-stream'
    )

    // Save metadata to Supabase
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

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
  } catch (err: any) {
    console.error('SharePoint upload error:', err)
    return NextResponse.json(
      { error: err.message ?? 'Upload failed' },
      { status: 500 }
    )
  }
}
