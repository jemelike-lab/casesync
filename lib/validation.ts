/**
 * Shared input validation helpers for CaseSync API routes.
 * P2 hardening — centralises inline UUID checks and search sanitisation.
 */

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Returns true when `value` is a valid UUID string.
 * Use at route boundaries before passing IDs to Supabase queries.
 */
export function validateUUID(value: unknown): value is string {
  return typeof value === 'string' && UUID_PATTERN.test(value)
}

/**
 * Strips Postgres ilike/pattern special characters: %  _  \\  (  )  ,
 * and lowercases the result so it is safe to interpolate into
 * `.ilike('col', `%${safe}%`)`
 */
export function sanitizeSearchParam(raw: string): string {
  return raw.toLowerCase().replace(/[,()%_\\]/g, '')
}
