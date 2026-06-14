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
    await auditLog(req, { userId: user.id, userEmail: user.email ?? undefined, action: 'client.view', resourceType: 'sharepoint_document', resourceId: itemId }).catch(() => {})
    const mode = req.nextUrl.searchParams.get('mode')
    if (mode === 'proxy') {
      // Same-origin byte proxy for in-portal Office preview (mammoth/SheetJS read the
      // arrayBuffer, which CORS would block on the cross-origin Graph signed URL).
      const upstream = await fetch(url)
      if (!upstream.ok || !upstream.body) {
        return NextResponse.json({ error: 'Failed to fetch file' }, { status: 502 })
      }
      const headers = new Headers()
      const ct = upstream.headers.get('content-type')
      if (ct) headers.set('content-type', ct)
      const cl = upstream.headers.get('content-length')
      if (cl) headers.set('content-length', cl)
      headers.set('cache-control', 'private, no-store')
      return new NextResponse(upstream.body, { status: 200, headers })
    }

    return NextResponse.redirect(url)
  } catch (err: any) {
    console.error('SharePoint download error:', err)
    return NextResponse.json(
      { error: err.message ?? 'Failed to get download URL' },
      { status: 500 }
    )
  }
}
