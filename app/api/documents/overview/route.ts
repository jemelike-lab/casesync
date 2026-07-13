import { NextResponse } from 'next/server'
import { withAuth } from '@/lib/api-auth'
import { isAzureConfigured, withRlsContext } from '@/lib/db/azure'
import { businessTodayStr } from '@/lib/business-date'
import { FILE_FOLDERS, folderOf } from '@/lib/document-folders'
import { isSupervisorLike } from '@/lib/roles'

export const dynamic = 'force-dynamic'

type ClientRow = { id: string; client_id: string; first_name: string; last_name: string }
type CountRow = { client_id: string; category: string; n: number }
type ExpiringRow = { client_id: string; file_name: string; category: string; expires_at: string }

// ---------------------------------------------------------------------------
// GET /api/documents/overview
// Data for the /documents supervisor page (2026-07-12 file-organization
// build): a per-client folder-count matrix ("is every chart complete?") and
// the expired / expiring-within-30-days document queue. Elevated roles only;
// team managers are auto-scoped to their own team plus unassigned clients
// (mirrors /team — unassigned is the highest-risk state). Counts follow the
// house rule: active, client_classification = 'real' clients only.
// ---------------------------------------------------------------------------
export const GET = withAuth(
  async (req, ctx) => {
    const role = ctx.role
    const today = businessTodayStr()

    let clients: ClientRow[] = []
    let counts: CountRow[] = []
    let expiring: ExpiringRow[] = []

    if (isAzureConfigured()) {
      const result = await withRlsContext(ctx.user.id, async (sql) => {
        let scope = sql``
        if (role === 'team_manager') {
          const tm = await sql`SELECT id FROM profiles WHERE team_manager_id = ${ctx.user.id}`
          const ids = (tm as unknown as { id: string }[]).map((m) => m.id)
          ids.push(ctx.user.id)
          scope = sql`AND (c.assigned_to = ANY(${ids}::uuid[]) OR c.assigned_to IS NULL)`
        } else if (!isSupervisorLike(role)) {
          scope = sql`AND c.assigned_to = ${'00000000-0000-0000-0000-000000000000'}`
        }
        const base = sql`c.is_active = true AND c.client_classification = 'real' ${scope}`

        const clientRows = await sql`SELECT c.id, c.client_id, c.first_name, c.last_name FROM clients c WHERE ${base} ORDER BY c.last_name ASC, c.first_name ASC`
        const countRows = await sql`SELECT cd.client_id, cd.category, COUNT(*)::int AS n FROM client_documents cd JOIN clients c ON c.id = cd.client_id WHERE ${base} GROUP BY cd.client_id, cd.category`
        const expiringRows = await sql`SELECT cd.client_id, cd.file_name, cd.category, cd.expires_at::text AS expires_at FROM client_documents cd JOIN clients c ON c.id = cd.client_id WHERE ${base} AND cd.expires_at IS NOT NULL AND cd.expires_at <= ${today}::date + 30 ORDER BY cd.expires_at ASC LIMIT 300`
        return { clientRows, countRows, expiringRows }
      })
      clients = result.clientRows as unknown as ClientRow[]
      counts = result.countRows as unknown as CountRow[]
      expiring = result.expiringRows as unknown as ExpiringRow[]
    } else {
      // Dev fallback: service-role client with the same explicit scoping.
      let clientQuery = ctx.admin
        .from('clients')
        .select('id, client_id, first_name, last_name, assigned_to')
        .eq('is_active', true)
        .eq('client_classification', 'real')
      if (role === 'team_manager') {
        const { data: tm } = await ctx.admin
          .from('profiles')
          .select('id')
          .eq('team_manager_id', ctx.user.id)
        const ids = (tm ?? []).map((m: { id: string }) => m.id)
        ids.push(ctx.user.id)
        clientQuery = clientQuery.or(`assigned_to.in.(${ids.join(',')}),assigned_to.is.null`)
      } else if (!isSupervisorLike(role)) {
        clientQuery = clientQuery.eq('assigned_to', '00000000-0000-0000-0000-000000000000')
      }
      const { data: clientRows, error: cErr } = await clientQuery.order('last_name', { ascending: true })
      if (cErr) return NextResponse.json({ error: cErr.message }, { status: 500 })
      clients = (clientRows ?? []) as ClientRow[]

      const clientIds = clients.map((c) => c.id)
      if (clientIds.length > 0) {
        const { data: docRows } = await ctx.admin
          .from('client_documents')
          .select('client_id, category, file_name, expires_at')
          .in('client_id', clientIds)
        const tally = new Map<string, number>()
        for (const d of docRows ?? []) {
          const key = `${d.client_id}::${d.category}`
          tally.set(key, (tally.get(key) ?? 0) + 1)
          if (d.expires_at && d.expires_at <= businessTodayStrPlus30(today)) {
            expiring.push({ client_id: d.client_id, file_name: d.file_name, category: d.category, expires_at: d.expires_at })
          }
        }
        counts = Array.from(tally.entries()).map(([key, n]) => {
          const [client_id, category] = key.split('::')
          return { client_id, category, n }
        })
        expiring.sort((a, b) => a.expires_at.localeCompare(b.expires_at))
        expiring = expiring.slice(0, 300)
      }
    }

    // Pivot counts into per-client folder totals.
    const folderKeys = FILE_FOLDERS.map((f) => f.key)
    const byClient = new Map<string, Record<string, number>>()
    for (const row of counts) {
      const rec = byClient.get(row.client_id) ?? Object.fromEntries(folderKeys.map((k) => [k, 0]))
      rec[folderOf(row.category)] = (rec[folderOf(row.category)] ?? 0) + Number(row.n)
      byClient.set(row.client_id, rec)
    }

    const nameOf = new Map(clients.map((c) => [c.id, `${c.last_name}, ${c.first_name}`]))
    const matrix = clients.map((c) => {
      const folders = byClient.get(c.id) ?? Object.fromEntries(folderKeys.map((k) => [k, 0]))
      const total = folderKeys.reduce((sum, k) => sum + (folders[k] ?? 0), 0)
      return { id: c.id, clientId: c.client_id, name: nameOf.get(c.id) ?? c.client_id, folders, total }
    })

    const expiringOut = expiring.map((e) => ({
      clientId: e.client_id,
      clientName: nameOf.get(e.client_id) ?? '—',
      fileName: e.file_name,
      category: e.category,
      expiresAt: e.expires_at.split('T')[0],
      status: e.expires_at.split('T')[0] < today ? ('expired' as const) : ('soon' as const),
    }))

    return NextResponse.json({
      generatedAt: today,
      folders: FILE_FOLDERS,
      clients: matrix,
      expiring: expiringOut,
    })
  },
  { roles: 'elevated' }
)

function businessTodayStrPlus30(today: string): string {
  const d = new Date(today + 'T00:00:00')
  d.setDate(d.getDate() + 30)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
