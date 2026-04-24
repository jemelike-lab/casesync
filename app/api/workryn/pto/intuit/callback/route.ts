import { NextRequest, NextResponse } from 'next/server'
import { getWorkrynSession } from '@/lib/workryn/auth'
import { db } from '@/lib/workryn/db'

const ELEVATED_ROLES = ['OWNER', 'ADMIN', 'MANAGER', 'SUPERVISOR', 'TEAM_MANAGER']

// GET /api/workryn/pto/intuit/callback
// Intuit redirects here after the user grants (or denies) access.
// Exchanges the authorization code for tokens, stores the connection,
// then redirects back to /w/pto with a status query param.
export async function GET(req: NextRequest) {
  const session = await getWorkrynSession()
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://www.blhcasesync.com'
  const ptoUrl = `${appUrl}/w/pto`

  if (!session) {
    return NextResponse.redirect(new URL('/login', req.url))
  }

  if (!ELEVATED_ROLES.includes(session.user.role)) {
    return NextResponse.redirect(
      `${ptoUrl}?intuit=error&detail=${encodeURIComponent('Forbidden: insufficient role')}`
    )
  }

  const searchParams = req.nextUrl.searchParams
  const code = searchParams.get('code')
  const realmId = searchParams.get('realmId')
  const state = searchParams.get('state')
  const error = searchParams.get('error')

  // Handle Intuit errors (user denied, etc.)
  if (error) {
    return NextResponse.redirect(
      `${ptoUrl}?intuit=error&detail=${encodeURIComponent(error)}`
    )
  }

  if (!code || !realmId) {
    return NextResponse.redirect(
      `${ptoUrl}?intuit=error&detail=${encodeURIComponent('Missing code or realmId from Intuit')}`
    )
  }

  // Validate CSRF state
  const storedState = req.cookies.get('intuit_oauth_state')?.value
  if (!storedState || storedState !== state) {
    return NextResponse.redirect(
      `${ptoUrl}?intuit=error&detail=${encodeURIComponent('Invalid OAuth state. Please try again.')}`
    )
  }

  const clientId = process.env.INTUIT_CLIENT_ID
  const clientSecret = process.env.INTUIT_CLIENT_SECRET

  if (!clientId || !clientSecret) {
    return NextResponse.redirect(
      `${ptoUrl}?intuit=error&detail=${encodeURIComponent('INTUIT_CLIENT_ID or INTUIT_CLIENT_SECRET not configured')}`
    )
  }

  const redirectUri = `${appUrl}/api/workryn/pto/intuit/callback`
  const tokenUrl = 'https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer'
  const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64')

  try {
    // Exchange authorization code for tokens
    const tokenRes = await fetch(tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
        Authorization: `Basic ${basicAuth}`,
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: redirectUri,
      }),
    })

    if (!tokenRes.ok) {
      const errText = await tokenRes.text()
      console.error('[Intuit OAuth] Token exchange failed:', errText)
      return NextResponse.redirect(
        `${ptoUrl}?intuit=error&detail=${encodeURIComponent('Token exchange failed')}`
      )
    }

    const tokenData: {
      access_token: string
      refresh_token: string
      expires_in: number
    } = await tokenRes.json()

    const tokenExpiresAt = new Date(Date.now() + tokenData.expires_in * 1000)

    // Fetch company name (best-effort)
    let companyName: string | null = null
    try {
      const isSandbox = process.env.INTUIT_SANDBOX === 'true'
      const baseUrl = isSandbox
        ? 'https://sandbox-quickbooks.api.intuit.com'
        : 'https://quickbooks.api.intuit.com'

      const infoRes = await fetch(
        `${baseUrl}/v3/company/${realmId}/companyinfo/${realmId}?minorversion=65`,
        {
          headers: {
            Authorization: `Bearer ${tokenData.access_token}`,
            Accept: 'application/json',
          },
        }
      )
      if (infoRes.ok) {
        const info = await infoRes.json()
        companyName = info?.CompanyInfo?.CompanyName ?? null
      }
    } catch (_e) {
      // Not critical
    }

    // Upsert the connection
    await db.intuitConnection.upsert({
      where: { realmId },
      update: {
        accessToken: tokenData.access_token,
        refreshToken: tokenData.refresh_token,
        tokenExpiresAt,
        companyName,
        isActive: true,
      },
      create: {
        realmId,
        accessToken: tokenData.access_token,
        refreshToken: tokenData.refresh_token,
        tokenExpiresAt,
        companyName,
        isActive: true,
      },
    })

    // Audit log
    await db.auditLog.create({
      data: {
        userId: session.user.id,
        action: 'INTUIT_CONNECTED',
        resourceType: 'INTUIT',
        details: `Connected QuickBooks company "${companyName || realmId}" (realm ${realmId})`,
      },
    })

    // Clear state cookie and redirect with success
    const successUrl = companyName
      ? `${ptoUrl}?intuit=connected&company=${encodeURIComponent(companyName)}`
      : `${ptoUrl}?intuit=connected`

    const response = NextResponse.redirect(successUrl)
    response.cookies.delete('intuit_oauth_state')
    return response
  } catch (err) {
    console.error('[Intuit OAuth] Unexpected error:', err)
    return NextResponse.redirect(
      `${ptoUrl}?intuit=error&detail=${encodeURIComponent('Unexpected error during OAuth')}`
    )
  }
}
