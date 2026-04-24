// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server'
import { getWorkrynSession } from '@/lib/workryn/auth'
import { db } from '@/lib/workryn/db'
import { validateUUID } from '@/lib/validation'

const ADMIN_ROLES = ['SUPERVISOR', 'OWNER', 'ADMIN']

//  Helper: refresh Intuit OAuth token if expired 
async function getIntuitToken(): Promise<{ accessToken: string; realmId: string } | null> {
  const conn = await db.intuitConnection.findFirst({ where: { isActive: true } })
  if (!conn) return null

  // If token expires within 5 minutes, refresh it
  if (conn.tokenExpiresAt < new Date(Date.now() + 5 * 60 * 1000)) {
    const clientId = process.env.INTUIT_CLIENT_ID
    const clientSecret = process.env.INTUIT_CLIENT_SECRET
    if (!clientId || !clientSecret) return null

    const res = await fetch('https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
      },
      body: `grant_type=refresh_token&refresh_token=${encodeURIComponent(conn.refreshToken)}`,
    })
    if (!res.ok) return null

    const tokens = await res.json()
    await db.intuitConnection.update({
      where: { id: conn.id },
      data: {
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token || conn.refreshToken,
        tokenExpiresAt: new Date(Date.now() + tokens.expires_in * 1000),
      },
    })
    return { accessToken: tokens.access_token, realmId: conn.realmId }
  }

  return { accessToken: conn.accessToken, realmId: conn.realmId }
}

//  Helper: call QBO API 
async function qboFetch(path: string, realmId: string, accessToken: string, options?: RequestInit) {
  const baseUrl = process.env.INTUIT_SANDBOX === 'true'
    ? 'https://sandbox-quickbooks.api.intuit.com'
    : 'https://quickbooks.api.intuit.com'

  const res = await fetch(`${baseUrl}/v3/company/${realmId}${path}`, {
    ...options,
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
      ...options?.headers,
    },
  })
  return res
}

//  POST /api/workryn/pto/intuit/sync 
// Actions: sync-employees, push-pto, auto-map
export async function POST(req: NextRequest) {
  const session = await getWorkrynSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  if (!ADMIN_ROLES.includes(session.user.role)) {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
  }

  const { action, requestId } = await req.json()

  //  SYNC EMPLOYEES: Pull QBO employees + auto-match to Workryn users 
  if (action === 'sync-employees') {
    const auth = await getIntuitToken()
    if (!auth) return NextResponse.json({ error: 'Intuit not connected' }, { status: 400 })

    const query = encodeURIComponent("SELECT * FROM Employee WHERE Active = true MAXRESULTS 1000")
    const res = await qboFetch(`/query?query=${query}`, auth.realmId, auth.accessToken)
    if (!res.ok) {
      const err = await res.text()
      return NextResponse.json({ error: 'Failed to fetch QBO employees', detail: err }, { status: 502 })
    }

    const data = await res.json()
    const qboEmployees = data.QueryResponse?.Employee || []

    const workrynUsers = await db.user.findMany({
      where: { isActive: true },
      select: { id: true, name: true, email: true },
    })

    const existingMaps = await db.intuitEmployeeMap.findMany()
    const mappedUserIds = new Set(existingMaps.map(m => m.userId))

    const results: {
      matched: { workrynUser: string; qboEmployee: string; matchedBy: string }[]
      unmatched_qbo: { id: string; name: string; email?: string }[]
      unmatched_workryn: { id: string; name: string; email?: string }[]
      already_mapped: number
    } = { matched: [], unmatched_qbo: [], unmatched_workryn: [], already_mapped: existingMaps.length }

    const workrynByEmail = new Map<string, typeof workrynUsers[0]>()
    const workrynByName = new Map<string, typeof workrynUsers[0]>()
    for (const u of workrynUsers) {
      if (u.email) workrynByEmail.set(u.email.toLowerCase().trim(), u)
      if (u.name) workrynByName.set(u.name.toLowerCase().trim(), u)
    }

    const matchedWorkrynIds = new Set<string>()
    const newMappings: { userId: string; intuitEmployeeId: string; intuitDisplayName: string; intuitEmail: string | null }[] = []

    for (const emp of qboEmployees) {
      const qboId = String(emp.Id)
      const qboDisplayName = [emp.GivenName, emp.MiddleName, emp.FamilyName].filter(Boolean).join(' ').trim()
      const qboEmail = emp.PrimaryEmailAddr?.Address?.toLowerCase().trim() || null

      if (existingMaps.some(m => m.intuitEmployeeId === qboId)) { continue }

      let matched: typeof workrynUsers[0] | undefined
      let matchedBy = ''

      if (qboEmail && workrynByEmail.has(qboEmail)) {
        const candidate = workrynByEmail.get(qboEmail)!
        if (!mappedUserIds.has(candidate.id) && !matchedWorkrynIds.has(candidate.id)) {
          matched = candidate; matchedBy = 'email'
        }
      }
      if (!matched && qboDisplayName) {
        const candidate = workrynByName.get(qboDisplayName.toLowerCase())
        if (candidate && !mappedUserIds.has(candidate.id) && !matchedWorkrynIds.has(candidate.id)) {
          matched = candidate; matchedBy = 'name'
        }
      }
      if (!matched && emp.GivenName && emp.FamilyName) {
        const firstLast = `${emp.GivenName} ${emp.FamilyName}`.toLowerCase().trim()
        const candidate = workrynByName.get(firstLast)
        if (candidate && !mappedUserIds.has(candidate.id) && !matchedWorkrynIds.has(candidate.id)) {
          matched = candidate; matchedBy = 'first+last name'
        }
      }

      if (matched) {
        matchedWorkrynIds.add(matched.id)
        results.matched.push({ workrynUser: matched.name || matched.email || matched.id, qboEmployee: qboDisplayName, matchedBy })
        newMappings.push({ userId: matched.id, intuitEmployeeId: qboId, intuitDisplayName: qboDisplayName, intuitEmail: qboEmail })
      } else {
        results.unmatched_qbo.push({ id: qboId, name: qboDisplayName, email: qboEmail || undefined })
      }
    }

    for (const u of workrynUsers) {
      if (!mappedUserIds.has(u.id) && !matchedWorkrynIds.has(u.id)) {
        results.unmatched_workryn.push({ id: u.id, name: u.name || 'Unknown', email: u.email || undefined })
      }
    }

    if (newMappings.length > 0) {
      await db.$transaction(newMappings.map(m => db.intuitEmployeeMap.create({ data: m })))
    }

    await db.auditLog.create({
      data: {
        userId: session.user.id, action: 'INTUIT_EMPLOYEE_SYNC', resourceType: 'INTUIT',
        details: `Synced ${qboEmployees.length} QBO employees. Auto-matched: ${newMappings.length}. Unmatched QBO: ${results.unmatched_qbo.length}. Unmatched Workryn: ${results.unmatched_workryn.length}.`,
      },
    })
    return NextResponse.json(results)
  }

  if (action === 'manual-map') {
    const { userId, intuitEmployeeId, intuitDisplayName, intuitEmail } = await req.json()
    if (!userId || !intuitEmployeeId) return NextResponse.json({ error: 'userId and intuitEmployeeId required' }, { status: 400 })
    if (!validateUUID(userId)) return NextResponse.json({ error: 'Invalid userId' }, { status: 400 })
    const mapping = await db.intuitEmployeeMap.upsert({
      where: { userId },
      create: { userId, intuitEmployeeId: String(intuitEmployeeId), intuitDisplayName, intuitEmail },
      update: { intuitEmployeeId: String(intuitEmployeeId), intuitDisplayName, intuitEmail, syncStatus: 'ACTIVE', lastSyncError: null },
    })
    await db.auditLog.create({
      data: { userId: session.user.id, action: 'INTUIT_MANUAL_MAP', resourceType: 'INTUIT', resourceId: mapping.id,
        details: `Manually mapped Workryn user ${userId}  QBO employee ${intuitEmployeeId} (${intuitDisplayName || 'unknown'})` },
    })
    return NextResponse.json(mapping)
  }

  if (action === 'push-pto') {
    if (!requestId) return NextResponse.json({ error: 'requestId required' }, { status: 400 })
    if (!validateUUID(requestId)) return NextResponse.json({ error: 'Invalid requestId' }, { status: 400 })
    const ptoReq = await db.ptoRequest.findUnique({
      where: { id: requestId },
      include: {
        user: { select: { id: true, name: true, intuitMapping: true } },
        type: { select: { name: true, code: true, excludeFromPayroll: true } },
      },
    })
    if (!ptoReq) return NextResponse.json({ error: 'PTO request not found' }, { status: 404 })
    if (ptoReq.type.excludeFromPayroll) return NextResponse.json({ error: `${ptoReq.type.name} is excluded from payroll sync. This type is tracked in Workryn only.` }, { status: 400 })
    if (ptoReq.status !== 'APPROVED') return NextResponse.json({ error: 'Only approved requests can be pushed to Intuit' }, { status: 400 })
    if (ptoReq.intuitSynced) return NextResponse.json({ error: 'Already synced to Intuit' }, { status: 400 })

    const mapping = await db.intuitEmployeeMap.findUnique({ where: { userId: ptoReq.userId } })
    if (!mapping) return NextResponse.json({ error: 'No Intuit employee mapping found for this user. Map them first via sync-employees or manual-map.' }, { status: 400 })

    const auth = await getIntuitToken()
    if (!auth) return NextResponse.json({ error: 'Intuit not connected' }, { status: 400 })

    const timeActivity = {
      NameOf: 'Employee',
      EmployeeRef: { value: mapping.intuitEmployeeId, name: mapping.intuitDisplayName },
      TxnDate: ptoReq.startDate.toISOString().split('T')[0],
      Hours: Math.floor(ptoReq.totalHours),
      Minutes: Math.round((ptoReq.totalHours % 1) * 60),
      Description: `PTO: ${ptoReq.type.name}  ${ptoReq.totalHours}hrs (Workryn #${ptoReq.id.slice(-6)})`,
    }

    const res = await qboFetch('/timeactivity', auth.realmId, auth.accessToken, { method: 'POST', body: JSON.stringify(timeActivity) })
    if (!res.ok) {
      const errText = await res.text()
      await db.ptoRequest.update({ where: { id: requestId }, data: { intuitSyncError: errText.slice(0, 500) } })
      await db.intuitEmployeeMap.update({ where: { userId: ptoReq.userId }, data: { syncStatus: 'ERROR', lastSyncError: errText.slice(0, 500) } })
      return NextResponse.json({ error: 'Intuit sync failed', detail: errText.slice(0, 500) }, { status: 502 })
    }

    const result = await res.json()
    const timeActivityId = result.TimeActivity?.Id
    await db.ptoRequest.update({ where: { id: requestId }, data: { intuitSynced: true, intuitSyncedAt: new Date(), intuitTimeActivityId: timeActivityId ? String(timeActivityId) : null, intuitSyncError: null } })
    await db.intuitEmployeeMap.update({ where: { userId: ptoReq.userId }, data: { lastSyncedAt: new Date(), syncStatus: 'ACTIVE', lastSyncError: null } })
    await db.auditLog.create({
      data: { userId: session.user.id, action: 'INTUIT_PTO_PUSHED', resourceType: 'PTO_REQUEST', resourceId: requestId,
        details: `Pushed ${ptoReq.type.name} (${ptoReq.totalHours}hrs) to QBO TimeActivity #${timeActivityId} for employee ${mapping.intuitDisplayName}` },
    })
    return NextResponse.json({ success: true, timeActivityId })
  }

  return NextResponse.json({ error: 'Unknown action. Use: sync-employees, manual-map, push-pto' }, { status: 400 })
}

//  GET: list current employee mappings 
export async function GET(req: NextRequest) {
  const session = await getWorkrynSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!ADMIN_ROLES.includes(session.user.role)) return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
  const mappings = await db.intuitEmployeeMap.findMany({
    include: { user: { select: { id: true, name: true, email: true, avatarColor: true, jobTitle: true, role: true } } },
    orderBy: { user: { name: 'asc' } },
  })
  return NextResponse.json(mappings)
}
