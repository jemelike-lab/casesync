import { NextResponse } from 'next/server'
import { withAuth } from '@/lib/api-auth'
import { auditLog } from '@/lib/audit'
import { isAzureConfigured, withRlsContext } from '@/lib/db/azure'
import { getDownloadUrl } from '@/lib/sharepoint'
import { buildZip, ZipEntry } from '@/lib/zip'
import { businessTodayStr } from '@/lib/business-date'
import { FOLDER_KEYS, FOLDER_LABELS, folderOf } from '@/lib/document-folders'
import { isSupervisorLike } from '@/lib/roles'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const BUCKET = 'client-documents'
// Bulk-download byte budget. The classic ZIP format and serverless memory
// both tolerate far more, but a record pull should never silently become a
// multi-gigabyte response; anything skipped is listed in _download-report.txt.
const MAX_TOTAL_BYTES = 100 * 1024 * 1024

type DocRow = {
  id: string
  file_name: string
  file_path: string
  category: string
  storage_provider: string | null
  created_at: string | null
}

function sanitizeName(name: string): string {
  // Strip path separators / control chars so archive entries can't escape
  // their folder; keep everything else (spaces, unicode) as uploaded.
  const cleaned = name.replace(/[\\/\u0000-\u001f]/g, '_').trim()
  return cleaned || 'file'
}

// ---------------------------------------------------------------------------
// GET /api/clients/[id]/files/zip?folder=<key|all>
// Bundle a client's documents for one folder (or the whole chart) into a
// single ZIP — the "pull the Authorizations for client X" record request.
// Authorization mirrors Casey's get_client_files scope (planner: assigned
// clients; TM: own team + self; supervisor-like: org-wide) and is enforced
// in SQL against the Azure data plane, with RLS as backstop.
// ---------------------------------------------------------------------------
export const GET = withAuth(async (req, ctx, routeCtx) => {
  const { id: clientId } = (await routeCtx?.params) ?? {}
  if (!clientId) {
    return NextResponse.json({ error: 'Missing client id' }, { status: 400 })
  }

  const { searchParams } = new URL(req.url)
  const folder = (searchParams.get('folder') ?? 'all').toLowerCase()
  if (folder !== 'all' && !FOLDER_KEYS.has(folder)) {
    return NextResponse.json({ error: `Unknown folder: ${folder}` }, { status: 400 })
  }

  const role = ctx.role
  let clientLabel: string | null = null
  let docs: DocRow[] = []

  if (isAzureConfigured()) {
    const result = await withRlsContext(ctx.user.id, async (sql) => {
      let scope = sql``
      if (role === 'supports_planner') {
        scope = sql`AND c.assigned_to = ${ctx.user.id}`
      } else if (role === 'team_manager') {
        const tm = await sql`SELECT id FROM profiles WHERE team_manager_id = ${ctx.user.id}`
        const ids = (tm as unknown as { id: string }[]).map((m) => m.id)
        ids.push(ctx.user.id)
        scope = sql`AND c.assigned_to = ANY(${ids}::uuid[])`
      } else if (!isSupervisorLike(role)) {
        // Unknown role → defensive deny (matches clients-azure).
        scope = sql`AND c.assigned_to = ${'00000000-0000-0000-0000-000000000000'}`
      }

      const clientRows = await sql`SELECT client_id FROM clients c WHERE c.id = ${clientId} ${scope} LIMIT 1`
      const client = (clientRows[0] ?? null) as unknown as { client_id: string } | null
      if (!client) return null

      const rows = await sql`SELECT cd.id, cd.file_name, cd.file_path, cd.category, cd.storage_provider, cd.created_at::text AS created_at FROM client_documents cd WHERE cd.client_id = ${clientId} ORDER BY cd.created_at ASC`
      return { client, rows: rows as unknown as DocRow[] }
    })
    if (!result) {
      return NextResponse.json({ error: 'Client not found (or out of scope)' }, { status: 404 })
    }
    clientLabel = result.client.client_id
    docs = result.rows
  } else {
    // Dev fallback: Supabase session client — table RLS scopes rows.
    const { data: client } = await ctx.supabase
      .from('clients')
      .select('client_id')
      .eq('id', clientId)
      .single()
    if (!client) {
      return NextResponse.json({ error: 'Client not found (or out of scope)' }, { status: 404 })
    }
    clientLabel = client.client_id
    const { data, error } = await ctx.supabase
      .from('client_documents')
      .select('id, file_name, file_path, category, storage_provider, created_at')
      .eq('client_id', clientId)
      .order('created_at', { ascending: true })
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    docs = (data ?? []) as DocRow[]
  }

  const wanted = folder === 'all' ? docs : docs.filter((d) => folderOf(d.category) === folder)
  if (wanted.length === 0) {
    return NextResponse.json(
      { error: folder === 'all' ? 'No files on record for this client' : `No files in the ${FOLDER_LABELS[folder]} folder` },
      { status: 404 }
    )
  }

  // Fetch bytes per provider. Failures never sink the whole pull — they are
  // listed in _download-report.txt inside the archive instead.
  const entries: ZipEntry[] = []
  const skipped: string[] = []
  const usedNames = new Set<string>()
  let totalBytes = 0

  for (const doc of wanted) {
    const prefix = folder === 'all' ? `${FOLDER_LABELS[folderOf(doc.category)] ?? 'Other'}/` : ''
    let entryName = prefix + sanitizeName(doc.file_name)
    if (usedNames.has(entryName)) {
      const dot = entryName.lastIndexOf('.')
      let n = 2
      const base = dot > 0 ? entryName.slice(0, dot) : entryName
      const ext = dot > 0 ? entryName.slice(dot) : ''
      while (usedNames.has(`${base} (${n})${ext}`)) n++
      entryName = `${base} (${n})${ext}`
    }

    if (totalBytes >= MAX_TOTAL_BYTES) {
      skipped.push(`${doc.file_name} — skipped: archive size limit reached`)
      continue
    }

    try {
      let bytes: Uint8Array | null = null
      if (doc.storage_provider === 'sharepoint') {
        const url = await getDownloadUrl(doc.file_path)
        const res = await fetch(url)
        if (!res.ok) throw new Error(`SharePoint fetch ${res.status}`)
        bytes = new Uint8Array(await res.arrayBuffer())
      } else {
        // 'supabase' (or legacy null) → bucket object. Uses the service-role
        // client because authorization already happened above against the
        // Azure data plane; the bucket's own RLS references the retired
        // Supabase clients table and can no longer authorize real clients.
        const { data, error } = await ctx.admin.storage.from(BUCKET).download(doc.file_path)
        if (error || !data) throw new Error(error?.message ?? 'bucket download failed')
        bytes = new Uint8Array(await data.arrayBuffer())
      }
      totalBytes += bytes.length
      usedNames.add(entryName)
      entries.push({ name: entryName, data: bytes, mtime: doc.created_at ? new Date(doc.created_at) : new Date() })
    } catch (err) {
      skipped.push(`${doc.file_name} — skipped: ${err instanceof Error ? err.message : 'download failed'}`)
    }
  }

  if (entries.length === 0) {
    return NextResponse.json(
      { error: 'None of the files could be retrieved from storage', skipped },
      { status: 502 }
    )
  }

  if (skipped.length > 0) {
    entries.push({
      name: '_download-report.txt',
      data: new TextEncoder().encode(
        `The following ${skipped.length} file(s) could not be included:\n\n${skipped.join('\n')}\n`
      ),
    })
  }

  const zip = buildZip(entries)
  const today = businessTodayStr()
  const folderPart = folder === 'all' ? 'AllFiles' : (FOLDER_LABELS[folder] ?? folder).replace(/[^A-Za-z0-9]+/g, '')
  const filename = `${clientLabel ?? clientId}-${folderPart}-${today}.zip`

  await auditLog(req, {
    userId: ctx.user.id,
    userEmail: ctx.user.email,
    userRole: role,
    action: 'client.files.bulk_download',
    resourceType: 'client',
    resourceId: clientId,
    details: { folder, files: entries.length, skipped: skipped.length, bytes: zip.length },
  })

  return new NextResponse(Buffer.from(zip), {
    status: 200,
    headers: {
      'Content-Type': 'application/zip',
      'Content-Length': String(zip.length),
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  })
})
