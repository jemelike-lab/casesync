import { NextRequest, NextResponse } from 'next/server'
import { requireWorkrynSession } from '@/lib/workryn/auth'
import { db } from '@/lib/workryn/db'

const ELEVATED_ROLES = ['OWNER', 'ADMIN', 'MANAGER', 'SUPERVISOR', 'TEAM_MANAGER']

export async function POST(req: NextRequest) {
  const session = await requireWorkrynSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!ELEVATED_ROLES.includes(session.user.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const clientId = process.env.INTUIT_CLIENT_ID
  const clientSecret = process.env.INTUIT_CLIENT_SECRET
  if (!clientId || !clientSecret) return NextResponse.json({ error: 'Intuit credentials not configured. Set INTUIT_CLIENT_ID and INTUIT_CLIENT_SECRET.' }, { status: 500 })

  let body: { code: string; realmId: string; redirectUri: string }
  try { body = await req.json() } catch (_e) { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }

  const { code, realmId, redirectUri } = body
  if (!code || !realmId || !redirectUri) return NextResponse.json({ error: 'code, realmId, and redirectUri are required' }, { status: 400 })

  const tokenUrl = 'https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer'
  const basicAuth = Buffer.from(clientId + ':' + clientSecret).toString('base64')

  let tokenData: { access_token: string; refresh_token: string; expires_in: number }
  try {
    const tokenRes = await fetch(tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json', Authorization: 'Basic ' + basicAuth },
      body: new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: redirectUri }),
    })
    if (!tokenRes.ok) { const errText = await tokenRes.text(); return NextResponse.json({ error: 'Failed to exchange authorization code', detail: errText }, { status: 502 }) }
    tokenData = await tokenRes.json()
  } catch (err) { return NextResponse.json({ error: 'Network error contacting Intuit', detail: String(err) }, { status: 502 }) }

  const tokenExpiresAt = new Date(Date.now() + tokenData.expires_in * 1000)

  let companyName: string | null = null
  try {
    const infoRes = await fetch('https://quickbooks.api.intuit.com/v3/company/' + realmId + '/companyinfo/' + realmId + '?minorversion=65', {
      headers: { Authorization: 'Bearer ' + tokenData.access_token, Accept: 'application/json' },
    })
    if (infoRes.ok) { const info = await infoRes.json(); companyName = info?.CompanyInfo?.CompanyName ?? null }
  } catch (_e) {}

  const connection = await db.intuitConnection.upsert({
    where: { realmId },
    update: { accessToken: tokenData.access_token, refreshToken: tokenData.refresh_token, tokenExpiresAt, companyName, isActive: true },
    create: { realmId, accessToken: tokenData.access_token, refreshToken: tokenData.refresh_token, tokenExpiresAt, companyName, isActive: true },
  })

  return NextResponse.json({ success: true, realmId: connection.realmId, companyName: connection.companyName, expiresAt: connection.tokenExpiresAt.toISOString() })
}
