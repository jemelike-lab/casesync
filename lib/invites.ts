import crypto from 'crypto'

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://blhcasesync.com'
const INVITE_EXPIRY_HOURS = 48

export function generateInviteToken() {
  return crypto.randomBytes(24).toString('hex')
}

export function buildAcceptInviteUrl(token: string) {
  return `${APP_URL}/accept-invite?token=${encodeURIComponent(token)}`
}

export function getInviteExpiryIso() {
  return new Date(Date.now() + INVITE_EXPIRY_HOURS * 60 * 60 * 1000).toISOString()
}
