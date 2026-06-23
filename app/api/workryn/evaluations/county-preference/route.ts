import { NextRequest, NextResponse } from 'next/server'
import { getWorkrynSession } from '@/lib/workryn/auth'
import { db } from '@/lib/workryn/db'
import { canViewEvaluations } from '@/lib/workryn/permissions'
import { sendEmail } from '@/lib/workryn/email'

const SARAH_EMAIL = 'sarah.abbott@blhnurses.com'

const MARYLAND_COUNTIES = [
  'Garrett', 'Allegany', 'Washington', 'Frederick', 'Carroll',
  'Howard', 'Montgomery', 'Baltimore', 'Baltimore City', 'Anne Arundel',
  "Prince George's", 'Charles', 'Calvert', "St. Mary's",
  'Harford', 'Cecil', 'Kent', "Queen Anne's", 'Talbot',
  'Caroline', 'Dorchester', 'Wicomico', 'Somerset', 'Worcester',
]

// ── GET: Fetch county preference ──
// Staff: own only. Managers/admins: any user via ?userId=
export async function GET(req: NextRequest) {
  const session = await getWorkrynSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const url = new URL(req.url)
  const targetUserId = url.searchParams.get('userId') ?? session.user.id
  const isManager = canViewEvaluations(session.user.role)

  // Staff can only view their own
  if (targetUserId !== session.user.id && !isManager) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const pref = await db.countyPreference.findUnique({
    where: { userId: targetUserId },
    include: {
      user: { select: { id: true, name: true, email: true, jobTitle: true, avatarColor: true } },
    },
  })

  return NextResponse.json({
    preference: pref,
    counties: MARYLAND_COUNTIES,
  })
}

// ── POST: Submit county preference ──
export async function POST(req: NextRequest) {
  const session = await getWorkrynSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const {
    residenceCounty,
    preferredCounties,
    additionalCounties,
    excusedFromVisits,
    notes,
  } = body

  // Validate
  if (!residenceCounty || !MARYLAND_COUNTIES.includes(residenceCounty)) {
    return NextResponse.json({ error: 'Valid residence county is required' }, { status: 400 })
  }

  const preferred: string[] = Array.isArray(preferredCounties) ? preferredCounties : []
  const additional: string[] = Array.isArray(additionalCounties) ? additionalCounties : []

  // Must select at least 2 preferred counties
  if (preferred.length < 2 && !excusedFromVisits) {
    return NextResponse.json({ error: 'Please select at least 2 preferred counties' }, { status: 400 })
  }

  // Validate all county names
  for (const c of [...preferred, ...additional]) {
    if (!MARYLAND_COUNTIES.includes(c)) {
      return NextResponse.json({ error: `Invalid county: ${c}` }, { status: 400 })
    }
  }

  // Upsert
  const pref = await db.countyPreference.upsert({
    where: { userId: session.user.id },
    create: {
      userId: session.user.id,
      residenceCounty,
      preferredCounties: JSON.stringify(preferred),
      additionalCounties: additional.length > 0 ? JSON.stringify(additional) : null,
      excusedFromVisits: !!excusedFromVisits,
      notes: notes?.trim() || null,
    },
    update: {
      residenceCounty,
      preferredCounties: JSON.stringify(preferred),
      additionalCounties: additional.length > 0 ? JSON.stringify(additional) : null,
      excusedFromVisits: !!excusedFromVisits,
      notes: notes?.trim() || null,
      updatedAt: new Date(),
    },
  })

  // Email Sarah a copy
  const userName = session.user.name ?? 'A team member'
  const userEmail = session.user.email ?? ''

  const emailHtml = buildEmailHtml({
    userName,
    userEmail,
    residenceCounty,
    preferred,
    additional,
    excusedFromVisits: !!excusedFromVisits,
    notes: notes?.trim() || null,
  })

  await sendEmail({
    to: SARAH_EMAIL,
    subject: `County Preference Submitted — ${userName}`,
    html: emailHtml,
    text: `County Preference submitted by ${userName} (${userEmail}).\n\nResidence: ${residenceCounty}\nPreferred: ${preferred.join(', ')}\nAdditional: ${additional.join(', ') || 'None'}\nExcused from visits: ${excusedFromVisits ? 'Yes' : 'No'}\nNotes: ${notes || 'None'}`,
  })

  return NextResponse.json({ success: true, preference: pref })
}

// ── GET all preferences (manager/admin) ──
// via ?all=true
function buildEmailHtml(data: {
  userName: string
  userEmail: string
  residenceCounty: string
  preferred: string[]
  additional: string[]
  excusedFromVisits: boolean
  notes: string | null
}): string {
  const countyChips = (counties: string[], color: string) =>
    counties.map(c =>
      `<span style="display:inline-block;padding:4px 12px;margin:2px 4px 2px 0;border-radius:6px;background:${color};font-size:13px;font-weight:600;color:#fff">${esc(c)}</span>`
    ).join('')

  return `<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;background:#0a0b0f;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#f1f5f9">
  <table width="100%" cellpadding="0" cellspacing="0" border="0">
    <tr><td align="center" style="padding:32px 16px">
      <table width="100%" style="max-width:600px;background:#0f1117;border:1px solid rgba(255,255,255,0.1);border-radius:16px;overflow:hidden">
        <tr><td style="background:linear-gradient(135deg,#2563eb 0%,#7c3aed 100%);padding:24px 32px">
          <h1 style="margin:0;font-size:20px;color:#fff;font-weight:800">📋 County Preference Submitted</h1>
          <p style="margin:6px 0 0;font-size:13px;color:rgba(255,255,255,0.7)">${esc(data.userName)} · ${esc(data.userEmail)}</p>
        </td></tr>
        <tr><td style="padding:28px 32px">
          <table width="100%" style="border-collapse:collapse">
            <tr>
              <td style="padding:12px 0;border-bottom:1px solid rgba(255,255,255,0.08)">
                <div style="font-size:11px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:0.06em;margin-bottom:6px">County of Residence</div>
                <span style="display:inline-block;padding:5px 14px;border-radius:8px;background:rgba(59,130,246,0.2);font-size:14px;font-weight:700;color:#60a5fa">${esc(data.residenceCounty)}</span>
              </td>
            </tr>
            <tr>
              <td style="padding:12px 0;border-bottom:1px solid rgba(255,255,255,0.08)">
                <div style="font-size:11px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:0.06em;margin-bottom:6px">Preferred Counties (${data.preferred.length})</div>
                ${countyChips(data.preferred, 'rgba(16,185,129,0.3)')}
              </td>
            </tr>
            ${data.additional.length > 0 ? `<tr>
              <td style="padding:12px 0;border-bottom:1px solid rgba(255,255,255,0.08)">
                <div style="font-size:11px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:0.06em;margin-bottom:6px">Additional Counties</div>
                ${countyChips(data.additional, 'rgba(168,85,247,0.3)')}
              </td>
            </tr>` : ''}
            ${data.excusedFromVisits ? `<tr>
              <td style="padding:12px 0;border-bottom:1px solid rgba(255,255,255,0.08)">
                <span style="display:inline-block;padding:4px 12px;border-radius:6px;background:rgba(245,158,11,0.2);font-size:12px;font-weight:700;color:#fbbf24">⚠️ Excused from visits</span>
              </td>
            </tr>` : ''}
            ${data.notes ? `<tr>
              <td style="padding:12px 0">
                <div style="font-size:11px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:0.06em;margin-bottom:6px">Notes</div>
                <div style="font-size:13px;color:#cbd5e1;line-height:1.5">${esc(data.notes)}</div>
              </td>
            </tr>` : ''}
          </table>
        </td></tr>
      </table>
      <p style="color:#475569;font-size:11px;margin-top:16px">Beatrice Loving Heart · Workryn HR Platform</p>
    </td></tr>
  </table>
</body>
</html>`
}

function esc(s: string): string {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}
