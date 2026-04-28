import { NextRequest, NextResponse } from 'next/server'
import { getDownloadUrl } from '@/lib/sharepoint'
import { createClient } from '@/lib/supabase/server'
import { auditLog } from '@/lib/audit'

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ itemId: string }> }
) {
  try {
    const { itemId } = await params

    // Require auth (prevents anonymous access to app-only SharePoint downloads)
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const url = await getDownloadUrl(itemId)

    // Audit: log document download
    await auditLog(req, { userId: session.user.id, userEmail: session.user.email ?? undefined, action: 'client.view', resourceType: 'sharepoint_document', resourceId: itemId }).catch(() => {})
    return NextResponse.redirect(url)
  } catch (err: any) {
    console.error('SharePoint download error:', err)
    return NextResponse.json(
      { error: err.message ?? 'Failed to get download URL' },
      { status: 500 }
    )
  }
}
