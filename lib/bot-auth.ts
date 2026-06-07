import { NextRequest, NextResponse } from 'next/server'
import { createClient as createSupabaseJsClient, SupabaseClient } from '@supabase/supabase-js'
import { auditLog as baseAuditLog, AuditPayload } from '@/lib/audit'

/**
 * BLH Bot — API-key authentication for /api/bot/* endpoints.
 *
 * BLH Bot (Nigel / OpenClaw) calls these endpoints with a shared bearer
 * token in the Authorization header. We deliberately don't use Supabase
 * auth here — bots aren't real users, and creating a fake auth.users row
 * would muddy reporting. Instead:
 *
 *   - The bot presents `Authorization: Bearer <BLH_BOT_API_KEY>`
 *   - We compare in constant time against the env value
 *   - The handler runs as the service role, but every operation it does
 *     is recorded in audit_logs with was_bot=true and a `bot_origin` field
 *     so HR can prove later who/what touched a record.
 *
 * The bot is not omnipotent. Every write should still flow through the
 * same business logic as a human (e.g. client lookups via the same matching
 * rules, file uploads via the same path convention), and every action is
 * audited the same way.
 */

const BOT_API_KEY_ENV = 'BLH_BOT_API_KEY'

export interface BotContext {
  /** Identifier the bot sends in the X-Bot-Origin header (e.g. 'nigel', 'rachel'). Free-form tag for audit purposes. */
  origin: string
  admin: SupabaseClient
}

type BotHandler = (
  req: NextRequest,
  ctx: BotContext,
  routeCtx?: { params: Promise<Record<string, string>> }
) => Promise<NextResponse | Response>

// Constant-time string compare so we don't leak key length via timing.
function safeCompare(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  }
  return diff === 0
}

export function withBotAuth(handler: BotHandler) {
  return async function botAuthHandler(
    req: NextRequest,
    routeCtx?: { params: Promise<Record<string, string>> }
  ): Promise<NextResponse | Response> {
    const expected = process.env[BOT_API_KEY_ENV]
    if (!expected) {
      // Misconfiguration — fail closed
      console.error(`[bot-auth] ${BOT_API_KEY_ENV} not set; rejecting bot request`)
      return NextResponse.json(
        { error: 'Bot API is not configured on this server' },
        { status: 503 }
      )
    }

    const authHeader = req.headers.get('authorization') ?? ''
    const m = /^Bearer\s+(.+)$/i.exec(authHeader.trim())
    if (!m) {
      return NextResponse.json(
        { error: 'Missing or malformed Authorization header' },
        { status: 401 }
      )
    }
    const presented = m[1].trim()
    if (!safeCompare(presented, expected)) {
      return NextResponse.json({ error: 'Invalid bot token' }, { status: 401 })
    }

    // Free-form bot identifier — used only for audit tagging.
    // Defaults to 'unknown-bot' if not provided.
    const origin = (req.headers.get('x-bot-origin') ?? 'unknown-bot')
      .toLowerCase()
      .slice(0, 64)

    const admin = createSupabaseJsClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    try {
      return await handler(req, { origin, admin }, routeCtx)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Internal bot error'
      console.error('[bot-auth] Handler error:', message)
      return NextResponse.json({ error: message }, { status: 500 })
    }
  }
}

/**
 * Bot-flavored audit log. Sets was_bot=true via a `bot_origin` field in details
 * and uses null user_id since there's no auth.users row backing the bot.
 */
export async function botAuditLog(
  req: NextRequest,
  origin: string,
  payload: Omit<AuditPayload, 'userId' | 'userEmail' | 'userRole'>
): Promise<void> {
  await baseAuditLog(req, {
    ...payload,
    userId: undefined,
    userEmail: `bot:${origin}`,
    userRole: 'bot',
    details: {
      ...(payload.details ?? {}),
      bot_origin: origin,
      was_bot: true,
    },
  })
}
