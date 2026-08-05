// lib/previsit.ts
// Casey Flagship Phase 1 — deterministic pre-visit packet assembler.
//
// One role-scoped pass that bundles EVERYTHING a planner needs before walking
// in to see a client: identity snapshot, the full 13-field deadline canon with
// overdue/upcoming status, contact recency, POS submission readiness (reuses
// evaluateReadiness VERBATIM — the five gates live in exactly one place),
// recent case notes, and the document inventory. Consumed by BOTH the Casey
// chat tool (get_previsit_brief) and the one-tap /api/case-ai/previsit
// endpoint so chat and the client-page AI rail can never disagree.
//
// Role scoping mirrors get_client_notes / get_client_files /
// evaluate_client_readiness EXACTLY (planner: own clients; team manager: own
// team; everyone else org-wide). Azure-first with a dev-only Supabase fallback.

import { isAzureConfigured, withRlsContext } from './db/azure'
import { evaluateReadiness, SIGNATURE_CATEGORIES } from './readiness'
import { businessTodayStr } from './business-date'
import { PRIORITY_DATE_FIELDS, PRIORITY_DATE_LABELS } from './types'

const NOTES_LIMIT = 8
const FILES_LIMIT = 50
const NOTE_TRIM = 400

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** The 13-field deadline canon as plain strings — single source: lib/types. */
export const PREVISIT_DEADLINE_FIELDS: string[] = PRIORITY_DATE_FIELDS as string[]

/** Human label for a deadline column (falls back to the column name). */
export function deadlineLabel(field: string): string {
  return PRIORITY_DATE_LABELS[field] ?? field
}

// Explicit column whitelist — keeps the token budget bounded and the
// Azure/Supabase branches identical.
const PREVISIT_CLIENT_COLS: string[] = [
  'id', 'client_id', 'first_name', 'last_name', 'category', 'eligibility_code',
  'is_active', 'assigned_to', 'pos_status', 'poc_date', 'goal_pct',
  'last_contact_date', 'last_contact_type', 'loc_date',
  ...PREVISIT_DEADLINE_FIELDS,
]

/** Date-only day difference: dateStr minus todayStr (negative = in the past). */
export function daysFromToday(dateStr: string | null, todayStr: string): number | null {
  if (!dateStr) return null
  const d = String(dateStr).slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return null
  const [y, m, dd] = d.split('-').map(Number)
  const [ty, tm, td] = todayStr.split('-').map(Number)
  return Math.round((Date.UTC(y, m - 1, dd) - Date.UTC(ty, tm - 1, td)) / 86400000)
}

type Loaded = {
  client: Record<string, unknown>
  notes: Record<string, unknown>[]
  files: Record<string, unknown>[]
}

/**
 * Assemble the pre-visit packet for one client. Returns { error } when the
 * client is out of role scope or the id is malformed — callers surface it as-is.
 */
export async function assemblePrevisitPacket(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  clientId: string,
  userRole: string,
  userId: string,
): Promise<Record<string, unknown>> {
  if (!UUID_RE.test(clientId)) {
    return { error: 'client_id must be the uuid id field from context or search_clients results, not the display client_id' }
  }
  const today = businessTodayStr()
  const sigCats = SIGNATURE_CATEGORIES as readonly string[]

  let loaded: Loaded | null = null

  if (isAzureConfigured()) {
    loaded = await withRlsContext(userId, async (sql) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const sqlAny = sql as any
      let scope = sql``
      if (userRole === 'supports_planner' || userRole === 'SUPPORT_PLANNER' || userRole === 'STAFF') {
        scope = sql`AND c.assigned_to = ${userId}`
      } else if (userRole === 'team_manager' || userRole === 'TEAM_MANAGER' || userRole === 'MANAGER') {
        const tm = await sql`SELECT id FROM profiles WHERE team_manager_id = ${userId}`
        const ids = (tm as unknown as { id: string }[]).map((m) => m.id)
        ids.push(userId)
        scope = sql`AND c.assigned_to = ANY(${ids}::uuid[])`
      }
      const rows = await sqlAny`SELECT ${sqlAny(PREVISIT_CLIENT_COLS)} FROM clients c WHERE c.id = ${clientId} ${scope} LIMIT 1`
      const clientRows = rows as unknown as Record<string, unknown>[]
      if (!clientRows.length) return null
      const noteRows = await sql`SELECT n.content, n.created_at, p.full_name AS author FROM client_notes n LEFT JOIN profiles p ON p.id = n.author_id WHERE n.client_id = ${clientId} ORDER BY n.created_at DESC LIMIT ${NOTES_LIMIT}`
      const fileRows = await sql`SELECT file_name, category, expires_at, created_at FROM client_documents WHERE client_id = ${clientId} ORDER BY created_at DESC LIMIT ${FILES_LIMIT}`
      return {
        client: clientRows[0],
        notes: noteRows as unknown as Record<string, unknown>[],
        files: fileRows as unknown as Record<string, unknown>[],
      } as Loaded
    }) as Loaded | null
  } else {
    // Supabase fallback (non-Azure dev only) — same scoping semantics.
    let clientQuery = supabase.from('clients').select(PREVISIT_CLIENT_COLS.join(', ')).eq('id', clientId)
    if (userRole === 'supports_planner' || userRole === 'SUPPORT_PLANNER' || userRole === 'STAFF') {
      clientQuery = clientQuery.eq('assigned_to', userId)
    } else if (userRole === 'team_manager' || userRole === 'TEAM_MANAGER' || userRole === 'MANAGER') {
      const { data: teamMembers } = await supabase.from('profiles').select('id').eq('team_manager_id', userId)
      const teamIds = (teamMembers || []).map((m: { id: string }) => m.id)
      teamIds.push(userId)
      clientQuery = clientQuery.in('assigned_to', teamIds)
    }
    const { data: client } = await clientQuery.single()
    if (!client) return { error: 'Client not found (or out of scope)' }
    const { data: noteData } = await supabase
      .from('client_notes')
      .select('content, created_at, profiles(full_name)')
      .eq('client_id', clientId)
      .order('created_at', { ascending: false })
      .limit(NOTES_LIMIT)
    const notes = (noteData || []).map((n: { content: string; created_at: string; profiles?: { full_name: string | null } | null }) => ({
      content: n.content, created_at: n.created_at, author: n.profiles?.full_name ?? null,
    }))
    const { data: fileData } = await supabase
      .from('client_documents')
      .select('file_name, category, expires_at, created_at')
      .eq('client_id', clientId)
      .order('created_at', { ascending: false })
      .limit(FILES_LIMIT)
    loaded = { client: client as Record<string, unknown>, notes, files: fileData || [] }
  }

  if (!loaded) return { error: 'Client not found (or out of scope)' }
  const { client, notes, files } = loaded

  // ── Deadline canon with status vs. business today ──
  const deadlines = PREVISIT_DEADLINE_FIELDS
    .map((f) => {
      const raw = (client[f] as string | null) ?? null
      const days = daysFromToday(raw, today)
      if (days === null) return null
      let status = 'scheduled'
      if (days < 0) status = 'overdue'
      else if (days === 0) status = 'due_today'
      else if (days <= 14) status = 'upcoming'
      return { field: f, label: deadlineLabel(f), date: String(raw).slice(0, 10), days_from_today: days, status }
    })
    .filter(Boolean) as Array<{ field: string; label: string; date: string; days_from_today: number; status: string }>
  deadlines.sort((a, b) => a.days_from_today - b.days_from_today)
  const deadlineSummary = {
    overdue: deadlines.filter((d) => d.status === 'overdue').length,
    due_today: deadlines.filter((d) => d.status === 'due_today').length,
    upcoming_14_days: deadlines.filter((d) => d.status === 'upcoming').length,
    scheduled_later: deadlines.filter((d) => d.status === 'scheduled').length,
  }

  // ── Readiness (verbatim engine; signature gate from the file inventory) ──
  const hasSignatureDoc = files.some((fl) => sigCats.includes(String(fl.category ?? '')))
  const readiness = evaluateReadiness(
    {
      eligibility_end_date: (client.eligibility_end_date as string) ?? null,
      loc_date: (client.loc_date as string) ?? null,
      pos_status: (client.pos_status as string) ?? null,
      poc_date: (client.poc_date as string) ?? null,
      appeal_status: (client.appeal_status as string) ?? null,
    },
    hasSignatureDoc,
  )

  // ── Contact recency ──
  const lcRaw = (client.last_contact_date as string | null) ?? null
  const lcDays = daysFromToday(lcRaw, today)
  const daysSinceContact = lcDays === null ? null : Math.max(0, -lcDays)

  // ── File inventory ──
  const fileCounts: Record<string, number> = {}
  for (const fl of files) {
    const cat = String(fl.category ?? 'uncategorized')
    fileCounts[cat] = (fileCounts[cat] ?? 0) + 1
  }

  const name = [client.first_name, client.last_name].filter(Boolean).join(' ').trim()

  return {
    generated_for: today,
    client: {
      id: client.id,
      client_id: client.client_id,
      name: name || String(client.client_id ?? 'client'),
      category: String(client.category ?? '').toUpperCase() || null,
      eligibility_code: client.eligibility_code ?? null,
      pos_status: client.pos_status ?? null,
      goal_pct: client.goal_pct ?? 0,
      is_active: client.is_active === true,
    },
    contact: {
      last_contact_date: lcRaw ? String(lcRaw).slice(0, 10) : null,
      last_contact_type: client.last_contact_type ?? null,
      days_since_contact: daysSinceContact,
      no_contact_7_days: daysSinceContact === null || daysSinceContact >= 15,
    },
    deadline_summary: deadlineSummary,
    deadlines,
    readiness: {
      ready: readiness.ready,
      gates: readiness.gates,
      blocking: readiness.gates.filter((g) => g.status === 'fail').map((g) => `${g.label}: ${g.detail}`),
      manual_reminders: readiness.reminders,
    },
    notes: notes.map((n) => ({
      created_at: n.created_at ? String(n.created_at).slice(0, 10) : null,
      author: n.author ?? null,
      content: String(n.content ?? '').slice(0, NOTE_TRIM),
    })),
    files: {
      count: files.length,
      by_category: fileCounts,
      has_signed_forms: hasSignatureDoc,
      recent: files.slice(0, 12).map((fl) => ({
        file_name: fl.file_name,
        category: fl.category,
        expires_at: fl.expires_at ? String(fl.expires_at).slice(0, 10) : null,
      })),
    },
  }
}
