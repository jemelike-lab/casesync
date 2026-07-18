// lib/email-send-access.ts
// Who may send email from inside CaseSync (/api/admin/email).
//
// ID ALLOWLIST, NEVER ROLE CHECKS \u2014 same rule as lib/monitor-access.ts.
// Josh (owner) holds role `supervisor`, so `role === 'administrator'`
// would lock the owner out. Add IDs deliberately; never widen by role.

export const EMAIL_SEND_ALLOWLIST = new Set<string>([
  'ced7dfd5-23c3-4609-b573-c69ac2bca689', // Josh Evans \u2014 owner
  '94e443c8-8e00-44b4-89b6-1464338e027a', // Chris McBorough \u2014 administrator
])

export function canSendMail(userId: string | null | undefined): boolean {
  return !!userId && EMAIL_SEND_ALLOWLIST.has(userId)
}
