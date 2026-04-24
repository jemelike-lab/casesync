import { NextRequest, NextResponse } from 'next/server'
import { getWorkrynSession } from '@/lib/workryn/auth'
import crypto from 'crypto'

const ELEVATED_ROLES = ['OWNER', 'ADMIN', 'MANAGER', 'SUPERVISOR', 'TEAM_MANAGER']

// GET /api/workryn/pto/intuit/auth
// Builds the Intuit OAuth 2.0 authorization URL and redirects the user.
// After granting access, Intuit redirects back to /api/workryn/pto/intuit/callback
export async function GET(req: NextRequest) {
  const session = await getWorkrynSession()
  if (!session) {
    return NextResponse.redirect(new URL('/login', req.url))
  }

  if (!ELEVATED_ROLES.includes(session.user.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const clientId = process.env.INTUIT_CLIENT_ID
  if (!clientId) {
    return NextResponse.json(
      { error: 'INTUIT_CLIENT_ID not configured' },
      { status: 500 }
    )
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://www.blhcasesync.com'
  const redirectUri = `${appUrl}/api/workryn/pto/intuit/callback`

  // CSRF state token
  const state = crypto.randomBytes(24).toString('hex')

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'com.intuit.quickbooks.accounting',
    state,
  })

  const authUrl = `https://appcenter.intuit.com/connect/oauth2?${params.toString()}`

  // Store state in a short-lived cookie for CSRF validation on callback
  const response = NextResponse.redirect(authUrl)
  response.cookies.set('intuit_oauth_state', state, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    maxAge: 600, // 10 minutes
    path: '/api/workryn/pto/intuit',
  })

  return response
}
