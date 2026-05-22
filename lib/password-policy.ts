/**
 * HIPAA-aligned password policy.
 *
 * Rules:
 *   - Length: 12 – 128 characters (upper bound prevents bcrypt-bypass via
 *     truncation and stops DoS via very long inputs)
 *   - At least 3 of 4 character classes: lowercase, uppercase, digit, symbol
 *   - Cannot be one of a small banlist of trivially-guessable passwords
 *     (extend as needed; full breach-corpus integration is a follow-up)
 *
 * Returns null on success or a human-friendly error string on failure.
 * Never reveal WHICH rule failed in a way that helps brute-force guess
 * the policy structure — but DO tell the legitimate user what to fix.
 */
const BANLIST = new Set([
  'password',
  'password1',
  'password123',
  'changeme',
  'qwerty123456',
  'letmeinplease',
  '123456789012',
  'blhcasesync1',
  'welcome12345',
])

export function validatePasswordStrength(value: unknown): string | null {
  if (typeof value !== 'string') return 'Password is required'
  if (value.length < 12) return 'Password must be at least 12 characters'
  if (value.length > 128) return 'Password must be 128 characters or fewer'

  let classes = 0
  if (/[a-z]/.test(value)) classes++
  if (/[A-Z]/.test(value)) classes++
  if (/[0-9]/.test(value)) classes++
  if (/[^A-Za-z0-9]/.test(value)) classes++
  if (classes < 3) {
    return 'Password must include at least 3 of: lowercase, uppercase, digit, symbol'
  }

  if (BANLIST.has(value.toLowerCase())) {
    return 'Password is too common — choose something less guessable'
  }

  return null
}
