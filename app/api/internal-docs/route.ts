import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'

/**
 * GET /api/internal-docs
 * List or download internal documents. Supervisor/IT only.
 *
 * ?file=<path>  → download that file
 * (no params)   → list all files in internal-docs bucket
 */
export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (!profile || !['supervisor', 'it'].includes(profile.role ?? '')) {
    return NextResponse.json({ error: 'Forbidden — admin access required' }, { status: 403 })
  }

  const admin = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SECRET_KEY!
  )

  const { searchParams } = new URL(req.url)
  const file = searchParams.get('file')

  // ── Download a specific file ──
  if (file) {
    const { data, error } = await admin.storage
      .from('internal-docs')
      .download(file)

    if (error || !data) {
      return NextResponse.json({ error: error?.message ?? 'File not found' }, { status: 404 })
    }

    const buffer = Buffer.from(await data.arrayBuffer())
    const filename = file.split('/').pop() ?? 'document'

    // Determine content type
    let contentType = 'application/octet-stream'
    if (filename.endsWith('.docx')) {
      contentType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    } else if (filename.endsWith('.pdf')) {
      contentType = 'application/pdf'
    } else if (filename.endsWith('.txt')) {
      contentType = 'text/plain'
    }

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-store',
      },
    })
  }

  // ── List all files ──
  const { data: files, error } = await admin.storage
    .from('internal-docs')
    .list('', { limit: 100, sortBy: { column: 'created_at', order: 'desc' } })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const listing = (files ?? [])
    .filter(f => f.name && !f.name.startsWith('.'))
    .map(f => ({
      name: f.name,
      size: f.metadata?.size ?? 0,
      created: f.created_at,
      updated: f.updated_at,
    }))

  return NextResponse.json({ files: listing })
}
