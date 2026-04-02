import { NextRequest, NextResponse } from 'next/server'
import { deleteSharePointFile } from '@/lib/sharepoint'
import { createClient } from '@/lib/supabase/server'

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ itemId: string }> }
) {
  try {
    const { itemId } = await params

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Delete from SharePoint
    await deleteSharePointFile(itemId)

    // Remove from Supabase (file_path stores the SharePoint item ID)

    await supabase
      .from('client_documents')
      .delete()
      .eq('file_path', itemId)
      .eq('storage_provider', 'sharepoint')

    return NextResponse.json({ success: true })
  } catch (err: any) {
    console.error('SharePoint delete error:', err)
    return NextResponse.json(
      { error: err.message ?? 'Failed to delete file' },
      { status: 500 }
    )
  }
}
