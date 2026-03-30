// CaseSync Email Templates
// Dark-branded, professional HTML emails

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://casesync.vercel.app'

function baseLayout(content: string): string {
  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>CaseSync</title>
</head>
<body style="margin:0;padding:0;background:#0a0a0c;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0a0a0c;padding:32px 16px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">
        <!-- Header -->
        <tr>
          <td style="background:#0f0f11;border-radius:12px 12px 0 0;padding:24px 32px;border-bottom:1px solid #222226;">
            <span style="font-size:20px;font-weight:700;color:#f5f5f7;letter-spacing:-0.3px;">
              Case<span style="color:#007aff;">Sync</span>
            </span>
          </td>
        </tr>
        <!-- Body -->
        <tr>
          <td style="background:#111113;padding:32px;border-radius:0 0 12px 12px;border:1px solid #1e1e22;border-top:none;">
            ${content}
          </td>
        </tr>
        <!-- Footer -->
        <tr>
          <td style="padding:20px 0;text-align:center;">
            <p style="margin:0;font-size:11px;color:#555560;">
              CaseSync · Automated notification · Do not reply to this email
            </p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`
}

function ctaButton(href: string, label: string): string {
  return `<a href="${href}" style="display:inline-block;margin-top:24px;padding:12px 24px;background:#007aff;color:#fff;border-radius:8px;text-decoration:none;font-size:14px;font-weight:600;">${label}</a>`
}

// ─── Deadline Alert ───────────────────────────────────────────────

export function deadlineAlertEmail({
  clientName,
  fieldLabel,
  dueDate,
  daysUntil,
  clientId,
}: {
  clientName: string
  fieldLabel: string
  dueDate: string
  daysUntil: number
  clientId: string
}) {
  const urgencyColor = daysUntil === 1 ? '#ff3b30' : daysUntil <= 3 ? '#ff9500' : '#ffcc00'
  const daysLabel = daysUntil === 1 ? 'tomorrow' : \`in \${daysUntil} days\`

  const content = \`
    <p style="margin:0 0 8px;font-size:13px;font-weight:600;color:\${urgencyColor};text-transform:uppercase;letter-spacing:0.08em;">
      ⚠️ Deadline Alert
    </p>
    <h1 style="margin:0 0 24px;font-size:22px;font-weight:700;color:#f5f5f7;line-height:1.3;">
      \${clientName}
    </h1>

    <table width="100%" cellpadding="0" cellspacing="0" style="background:#1a1a1e;border-radius:8px;padding:20px;margin-bottom:24px;">
      <tr>
        <td style="padding:8px 0;border-bottom:1px solid #2a2a2e;">
          <span style="font-size:12px;color:#888;display:block;margin-bottom:2px;">What's due</span>
          <span style="font-size:15px;font-weight:600;color:#f5f5f7;">\${fieldLabel}</span>
        </td>
      </tr>
      <tr>
        <td style="padding:8px 0;border-bottom:1px solid #2a2a2e;">
          <span style="font-size:12px;color:#888;display:block;margin-bottom:2px;">Due date</span>
          <span style="font-size:15px;font-weight:600;color:\${urgencyColor};">\${dueDate}</span>
        </td>
      </tr>
      <tr>
        <td style="padding:8px 0;">
          <span style="font-size:12px;color:#888;display:block;margin-bottom:2px;">Time remaining</span>
          <span style="font-size:15px;font-weight:600;color:\${urgencyColor};">\${daysLabel.charAt(0).toUpperCase() + daysLabel.slice(1)}</span>
        </td>
      </tr>
    </table>

    \${ctaButton(\`\${BASE_URL}/clients/\${clientId}\`, 'View Client')}
  \`

  return {
    subject: \`⚠️ Deadline Alert: \${clientName} – \${fieldLabel} due \${dueDate}\`,
    html: baseLayout(content),
  }
}

// ─── Client Assigned ─────────────────────────────────────────────

export function clientAssignedEmail({
  clientName,
  clientDisplayId,
  category,
  assignedBy,
  clientId,
}: {
  clientName: string
  clientDisplayId: string
  category: string
  assignedBy: string
  clientId: string
}) {
  const content = \`
    <p style="margin:0 0 8px;font-size:13px;font-weight:600;color:#007aff;text-transform:uppercase;letter-spacing:0.08em;">
      📋 New Assignment
    </p>
    <h1 style="margin:0 0 24px;font-size:22px;font-weight:700;color:#f5f5f7;line-height:1.3;">
      \${clientName}
    </h1>

    <table width="100%" cellpadding="0" cellspacing="0" style="background:#1a1a1e;border-radius:8px;padding:20px;margin-bottom:24px;">
      <tr>
        <td style="padding:8px 0;border-bottom:1px solid #2a2a2e;">
          <span style="font-size:12px;color:#888;display:block;margin-bottom:2px;">Client ID</span>
          <span style="font-size:15px;font-weight:600;color:#f5f5f7;">\${clientDisplayId}</span>
        </td>
      </tr>
      <tr>
        <td style="padding:8px 0;border-bottom:1px solid #2a2a2e;">
          <span style="font-size:12px;color:#888;display:block;margin-bottom:2px;">Category</span>
          <span style="font-size:15px;font-weight:600;color:#f5f5f7;">\${category.toUpperCase()}</span>
        </td>
      </tr>
      <tr>
        <td style="padding:8px 0;">
          <span style="font-size:12px;color:#888;display:block;margin-bottom:2px;">Assigned by</span>
          <span style="font-size:15px;font-weight:600;color:#f5f5f7;">\${assignedBy}</span>
        </td>
      </tr>
    </table>

    \${ctaButton(\`\${BASE_URL}/clients/\${clientId}\`, 'View Client')}
  \`

  return {
    subject: \`📋 New Client Assigned: \${clientName}\`,
    html: baseLayout(content),
  }
}

// ─── Daily Digest ─────────────────────────────────────────────────

export function dailyDigestEmail({
  userName,
  date,
  overdueCount,
  dueThisWeekCount,
  recentActivity,
}: {
  userName: string
  date: string
  overdueCount: number
  dueThisWeekCount: number
  recentActivity: Array<{ clientName: string; action: string; when: string }>
}) {
  const activityRows = recentActivity.length > 0
    ? recentActivity.map(a => \`
        <tr>
          <td style="padding:8px 0;border-bottom:1px solid #2a2a2e;">
            <span style="font-size:13px;font-weight:600;color:#f5f5f7;">\${a.clientName}</span>
            <span style="font-size:12px;color:#888;display:block;">\${a.action} · \${a.when}</span>
          </td>
        </tr>
      \`).join('')
    : '<tr><td style="padding:12px 0;font-size:13px;color:#888;">No recent activity.</td></tr>'

  const content = \`
    <p style="margin:0 0 8px;font-size:13px;font-weight:600;color:#007aff;text-transform:uppercase;letter-spacing:0.08em;">
      📊 Daily Digest
    </p>
    <h1 style="margin:0 0 4px;font-size:22px;font-weight:700;color:#f5f5f7;">
      Good morning, \${userName}
    </h1>
    <p style="margin:0 0 24px;font-size:14px;color:#888;">\${date}</p>

    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
      <tr>
        <td width="48%" style="background:#1a1a1e;border-radius:8px;padding:20px;text-align:center;">
          <span style="font-size:36px;font-weight:700;color:#ff3b30;">\${overdueCount}</span>
          <p style="margin:4px 0 0;font-size:12px;color:#888;text-transform:uppercase;letter-spacing:0.06em;">Overdue</p>
        </td>
        <td width="4%"></td>
        <td width="48%" style="background:#1a1a1e;border-radius:8px;padding:20px;text-align:center;">
          <span style="font-size:36px;font-weight:700;color:#ffcc00;">\${dueThisWeekCount}</span>
          <p style="margin:4px 0 0;font-size:12px;color:#888;text-transform:uppercase;letter-spacing:0.06em;">Due This Week</p>
        </td>
      </tr>
    </table>

    <h2 style="margin:0 0 12px;font-size:14px;font-weight:600;color:#888;text-transform:uppercase;letter-spacing:0.05em;">Recent Activity</h2>
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#1a1a1e;border-radius:8px;padding:0 20px;">
      \${activityRows}
    </table>

    \${ctaButton(\`\${BASE_URL}/dashboard\`, 'Open Dashboard')}
  \`

  return {
    subject: \`📊 CaseSync Daily Digest – \${date}\`,
    html: baseLayout(content),
  }
}

// ─── Welcome / Invite ─────────────────────────────────────────────

export function welcomeEmail({
  fullName,
  role,
  loginUrl,
}: {
  fullName: string
  role: string
  loginUrl?: string
}) {
  const roleDisplay = role.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
  const loginLink = loginUrl || \`\${BASE_URL}/login\`

  const content = \`
    <p style="margin:0 0 8px;font-size:13px;font-weight:600;color:#007aff;text-transform:uppercase;letter-spacing:0.08em;">
      Welcome to CaseSync
    </p>
    <h1 style="margin:0 0 24px;font-size:22px;font-weight:700;color:#f5f5f7;line-height:1.3;">
      Hi \${fullName}, you've been invited!
    </h1>

    <p style="margin:0 0 24px;font-size:15px;color:#b0b0b8;line-height:1.6;">
      You've been added to CaseSync — a case management platform for coordinating client care.
      Your account has been set up and you're ready to log in.
    </p>

    <table width="100%" cellpadding="0" cellspacing="0" style="background:#1a1a1e;border-radius:8px;padding:20px;margin-bottom:24px;">
      <tr>
        <td style="padding:8px 0;">
          <span style="font-size:12px;color:#888;display:block;margin-bottom:2px;">Your role</span>
          <span style="font-size:15px;font-weight:600;color:#007aff;">\${roleDisplay}</span>
        </td>
      </tr>
    </table>

    \${ctaButton(loginLink, 'Log In to CaseSync')}

    <p style="margin:24px 0 0;font-size:12px;color:#555560;">
      If you didn't expect this invitation, you can safely ignore this email.
    </p>
  \`

  return {
    subject: "You've been invited to CaseSync",
    html: baseLayout(content),
  }
}
