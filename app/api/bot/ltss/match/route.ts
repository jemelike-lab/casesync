import { NextResponse } from 'next/server'
import { withBotAuth, botAuditLog } from '@/lib/bot-auth'

export const dynamic = 'force-dynamic'

/**
 * POST /api/bot/ltss/match
 *
 * Given fields from a single LTSS export row, return candidate clients with
 * a confidence score and an explanation. The bot uses this to decide where
 * to attach a downstream file or where to apply parsed data.
 *
 * Body:
 *   {
 *     ma_number?: string,    // BLH internal client_id / MA number (strongest key)
 *     first_name?: string,
 *     last_name?: string,
 *     include_inactive?: boolean  // default false
 *   }
 *
 * Returns:
 *   {
 *     matches: [
 *       { client_id, client_code, first_name, last_name, is_active,
 *         confidence: 0..1, why: 'ma_number_exact' | 'name_exact' | 'name_fuzzy' }
 *     ]
 *   }
 *
 * Matching strategy:
 *   1. Exact match on clients.client_id  -> confidence 1.0
 *   2. Exact match on first_name + last_name (case-insensitive) -> 0.7
 *   3. Exact last_name + first initial    -> 0.5
 *   Results are deduped and sorted by confidence desc.
 *
 * The bot is responsible for the apply step. If confidence < 1.0, the
 * bot's caller (e.g. a human reviewer in CaseSync) should confirm before
 * the bot writes anything to the client record.
 */

interface MatchRequest {
  ma_number?: string
  first_name?: string
  last_name?: string
  include_inactive?: boolean
}

interface Match {
  client_id: string
  client_code: string | null
  first_name: string | null
  last_name: string | null
  is_active: boolean
  confidence: number
  why: string
}

function norm(s: string | null | undefined): string {
  return (s ?? '').trim().toLowerCase()
}

export const POST = withBotAuth(async (req, ctx) => {
  let body: MatchRequest
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const ma = norm(body.ma_number)
  const first = norm(body.first_name)
  const last = norm(body.last_name)
  const includeInactive = body.include_inactive === true

  if (!ma && !last) {
    return NextResponse.json(
      { error: 'At least one of ma_number or last_name is required' },
      { status: 400 }
    )
  }

  // Pull candidate set. We over-fetch a little because cardinality is small
  // (~5k clients) and the matching is cheap in JS.
  let query = ctx.admin
    .from('clients')
    .select('id, client_id, first_name, last_name, is_active')

  if (!includeInactive) {
    query = query.eq('is_active', true)
  }

  // If we have an MA#, restrict the candidate set to that one row plus any
  // name-based matches. Otherwise restrict by last name to keep it bounded.
  if (ma && last) {
    query = query.or(`client_id.eq.${ma},last_name.ilike.${last}`)
  } else if (ma) {
    query = query.eq('client_id', ma)
  } else if (last) {
    query = query.ilike('last_name', last)
  }

  const { data: rows, error } = await query.limit(50)
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const matches: Match[] = []
  for (const r of rows ?? []) {
    const rMa = norm(r.client_id)
    const rFirst = norm(r.first_name)
    const rLast = norm(r.last_name)

    // 1. MA# exact match — strongest signal
    if (ma && rMa && rMa === ma) {
      matches.push({
        client_id: r.id,
        client_code: r.client_id,
        first_name: r.first_name,
        last_name: r.last_name,
        is_active: r.is_active,
        confidence: 1.0,
        why: 'ma_number_exact',
      })
      continue
    }

    // 2. Full name exact
    if (first && last && rFirst === first && rLast === last) {
      matches.push({
        client_id: r.id,
        client_code: r.client_id,
        first_name: r.first_name,
        last_name: r.last_name,
        is_active: r.is_active,
        confidence: 0.7,
        why: 'name_exact',
      })
      continue
    }

    // 3. Last name exact + first initial
    if (last && rLast === last && first && rFirst && rFirst[0] === first[0]) {
      matches.push({
        client_id: r.id,
        client_code: r.client_id,
        first_name: r.first_name,
        last_name: r.last_name,
        is_active: r.is_active,
        confidence: 0.5,
        why: 'last_name_first_initial',
      })
      continue
    }
  }

  // Dedupe by client.id (a row can match more than one rule; keep highest conf)
  const dedup = new Map<string, Match>()
  for (const m of matches) {
    const existing = dedup.get(m.client_id)
    if (!existing || m.confidence > existing.confidence) {
      dedup.set(m.client_id, m)
    }
  }
  const out = [...dedup.values()].sort((a, b) => b.confidence - a.confidence)

  await botAuditLog(req, ctx.origin, {
    action: 'bot.ltss.match',
    resourceType: 'ltss_match',
    details: {
      query: { ma_number: ma || null, first_name: first || null, last_name: last || null },
      match_count: out.length,
      top_confidence: out[0]?.confidence ?? 0,
    },
  })

  return NextResponse.json({ matches: out })
})
