import { createClient } from '@supabase/supabase-js'

/**
 * Batch D: admin-maintained BLH Bot knowledge (Supabase `bot_knowledge`).
 *
 * Non-PHI organizational guidance (policies, program rules, canned procedures)
 * that supervisors edit at /admin/bot-knowledge and the bot injects into its
 * system prompt. Lives on the Supabase identity plane deliberately — it is not
 * client data, and it must be editable through the normal admin UI + RLS.
 *
 * Scale: this loads once per warm instance per TTL window (60s), NOT once per
 * request — the bot is used concurrently by many staff and a per-request
 * Supabase read here would add latency and load for content that changes
 * rarely. Concurrent cache misses coalesce into a single fetch (same pattern
 * as the Entra token cache). Failures degrade to the last good value (or an
 * empty section) — knowledge is additive, never a reason for the bot to fail.
 */

const TTL_MS = 60 * 1000
// Hard cap on injected prompt characters so a long knowledge base can never
// blow up per-request token cost. Entries are included in sort_order until
// the budget is spent.
const MAX_SECTION_CHARS = 6000
const MAX_ROWS = 50

let cache: { section: string; expiresAt: number } | null = null
let inflight: Promise<string> | null = null

async function load(): Promise<string> {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
  const { data, error } = await supabase
    .from('bot_knowledge')
    .select('title, content, category')
    .eq('is_active', true)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true })
    .limit(MAX_ROWS)

  if (error || !data || data.length === 0) return ''

  let out =
    '\n\n=== BLH KNOWLEDGE BASE (maintained by BLH administrators — treat as authoritative BLH policy and guidance; it supplements, never overrides, the guidelines above) ==='
  for (const row of data) {
    const entry = `\n\n[${String(row.category ?? 'general')}] ${String(row.title ?? '')}\n${String(row.content ?? '')}`
    if (out.length + entry.length > MAX_SECTION_CHARS) break
    out += entry
  }
  out += '\n=== END BLH KNOWLEDGE BASE ==='
  return out
}

/**
 * Returns the knowledge-base section to append to the bot system prompt, or ''
 * when there is no active knowledge (or Supabase is unreachable). Never throws.
 */
export async function getBotKnowledgeSection(): Promise<string> {
  if (cache && cache.expiresAt > Date.now()) return cache.section
  if (inflight) return inflight
  inflight = load()
    .then((section) => {
      cache = { section, expiresAt: Date.now() + TTL_MS }
      return section
    })
    .catch(() => cache?.section ?? '')
    .finally(() => {
      inflight = null
    })
  return inflight
}

/** Test/ops hook: drop the cache so the next call reloads immediately. */
export function invalidateBotKnowledgeCache(): void {
  cache = null
}
