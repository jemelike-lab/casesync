import { isAzureConfigured, withRlsContext } from '@/lib/db/azure'

/**
 * Batch D: durable BLH Bot conversations on the Azure PHI plane.
 *
 * Bot chats contain client PHI, so they persist to Azure (`bot_conversations`
 * / `bot_messages`), never Supabase. Every read and write runs under
 * withRlsContext(userId) — the same identity-scoped path as all other client
 * data — so RLS owner-only policies apply end to end and no route here can
 * widen a user's scope.
 *
 * Persistence is strictly NON-FATAL: if Azure is down or unconfigured the bot
 * still answers, it just doesn't remember. Callers must never let a
 * persistence failure surface as a bot error.
 */

const MAX_TITLE_CHARS = 80
const MAX_USER_CONTENT_CHARS = 8000
const MAX_ASSISTANT_CONTENT_CHARS = 16000

/** True when durable conversations are available (Azure data plane configured). */
export function isBotPersistenceAvailable(): boolean {
  return isAzureConfigured()
}

/**
 * Resolve the conversation for this request. If `requestedId` is provided and
 * owned by the caller (RLS-verified — a foreign or unknown id simply comes
 * back empty), it is reused; otherwise a new conversation is created titled
 * from the user's message. Returns null when persistence is unavailable or
 * the write fails — the bot proceeds statelessly in that case.
 */
export async function ensureConversation(
  userId: string,
  requestedId: string | null,
  firstUserText: string,
  clientUuid: string | null,
): Promise<string | null> {
  if (!isAzureConfigured()) return null
  try {
    return await withRlsContext(userId, async (sql) => {
      if (requestedId) {
        const rows = await sql`
          SELECT id FROM bot_conversations WHERE id = ${requestedId} LIMIT 1
        `
        if (rows.length > 0) return requestedId
        // Unknown or not ours — fall through and start a fresh conversation
        // rather than silently writing into the void.
      }
      const title =
        (firstUserText || '').replace(/\s+/g, ' ').trim().slice(0, MAX_TITLE_CHARS) ||
        'New conversation'
      const inserted = await sql`
        INSERT INTO bot_conversations (user_id, title, client_uuid)
        VALUES (${userId}, ${title}, ${clientUuid})
        RETURNING id
      `
      return (inserted[0]?.id as string) ?? null
    })
  } catch (err) {
    console.error('[BLH Bot] ensureConversation failed (non-fatal):', err)
    return null
  }
}

/**
 * Persist one completed exchange (the user's message + the assistant's final
 * answer) and touch the conversation's updated_at. The assistant row is
 * written with the caller-supplied id so the UI can attach feedback to it.
 * Action-proposal trailers are the caller's responsibility to strip — what is
 * stored is the display text; the raw proposal goes into `meta` for audit
 * value only and is never re-rendered as actionable.
 */
export async function persistExchange(
  userId: string,
  conversationId: string | null,
  userText: string,
  assistantText: string,
  assistantMessageId: string,
  meta: Record<string, unknown> | null,
): Promise<void> {
  if (!conversationId || !isAzureConfigured()) return
  const user = String(userText ?? '').slice(0, MAX_USER_CONTENT_CHARS)
  const assistant = String(assistantText ?? '').slice(0, MAX_ASSISTANT_CONTENT_CHARS)
  if (!user && !assistant) return
  try {
    await withRlsContext(userId, async (sql) => {
      if (user) {
        await sql`
          INSERT INTO bot_messages (conversation_id, user_id, role, content)
          VALUES (${conversationId}, ${userId}, 'user', ${user})
        `
      }
      if (assistant) {
        await sql`
          INSERT INTO bot_messages (id, conversation_id, user_id, role, content, meta)
          VALUES (${assistantMessageId}, ${conversationId}, ${userId}, 'assistant', ${assistant}, ${meta ? JSON.stringify(meta) : null}::jsonb)
        `
      }
      await sql`
        UPDATE bot_conversations SET updated_at = now() WHERE id = ${conversationId}
      `
    })
  } catch (err) {
    console.error('[BLH Bot] persistExchange failed (non-fatal):', err)
  }
}
