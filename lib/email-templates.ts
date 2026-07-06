// CaseSync Email Templates
// Dark-branded, professional HTML emails

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://blhcasesync.com'

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
        <tr>
          <td style="background:#0f0f11;border-radius:12px 12px 0 0;padding:24px 32px;border-bottom:1px solid #222226;">
            <span style="font-size:12px;font-weight:700;color:#8ab4ff;letter-spacing:0.12em;text-transform:uppercase;display:block;margin-bottom:8px;">
              Beatrice Loving Heart
            </span>
            <span style="font-size:20px;font-weight:700;color:#f5f5f7;letter-spacing:-0.3px;">
              Case<span style="color:#007aff;">Sync</span>
            </span>
          </td>
        </tr>
        <tr>
          <td style="background:#111113;padding:32px;border-radius:0 0 12px 12px;border:1px solid #1e1e22;border-top:none;">
            ${content}
          </td>
        </tr>
        <tr>
          <td style="padding:20px 0;text-align:center;">
            <p style="margin:0;font-size:11px;color:#555560;">
              Beatrice Loving Heart &middot; CaseSync &middot; Secure system email
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
  return `<a href="${href}" style="display:inline-block;margin-top:24px;padding:12px 24px;background:#007aff;color:#fff;border-radius:8px;text-decoration:none;font-size:14px;font-weight:700;">${label}</a>`
}

// Human-friendly role label; keeps known acronyms uppercase (e.g. IT).
function formatRoleLabel(role: string): string {
  if ((role ?? '').toLowerCase() === 'it') return 'IT'
  return role.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}

// INVITE_PREMIUM_LAYOUT — cream & gold, logo-forward layout for invite + reminder.
function invitePremiumLayout({
  eyebrow,
  heading,
  intro,
  roleDisplay,
  ctaUrl,
  ctaLabel,
  guideAttached,
}: {
  eyebrow: string
  heading: string
  intro: string
  roleDisplay: string
  ctaUrl: string
  ctaLabel: string
  guideAttached: boolean
}): string {
  const logo = `${BASE_URL}/email/blh-logo.png`
  const guideBlock = guideAttached
    ? `
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:24px 0 2px;">
        <tr><td style="background:#FBF4E2;border:1px solid #E7D5A6;border-radius:12px;padding:15px 17px;">
          <table role="presentation" cellpadding="0" cellspacing="0"><tr>
            <td valign="top" style="width:30px;font-size:18px;line-height:1;">&#128278;</td>
            <td>
              <div style="font-family:Georgia,'Times New Roman',serif;font-size:14.5px;font-weight:700;color:#3B2F14;">Your ${roleDisplay} guide is attached</div>
              <div style="font-size:12.5px;color:#7A6A45;line-height:1.65;margin-top:4px;">A plain-language PDF walkthrough of CaseSync &amp; Workryn, written for your role. Keep it handy for your first week.</div>
            </td>
          </tr></table>
        </td></tr>
      </table>`
    : ''

  return `<!DOCTYPE html>
<html lang="en"><head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta name="color-scheme" content="light only" />
  <title>CaseSync</title>
</head>
<body bgcolor="#F5EEDD" style="margin:0;padding:0;background:#F5EEDD;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F5EEDD;padding:36px 12px;">
    <tr><td align="center">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#FFFDF7;border-radius:18px;overflow:hidden;border:1px solid #E4D3A4;box-shadow:0 10px 34px rgba(97,74,17,0.12);">
        <tr><td height="7" bgcolor="#C99722" style="height:7px;line-height:7px;font-size:0;background:#C99722;background:linear-gradient(90deg,#E4B84A 0%,#C99722 45%,#A87A16 100%);">&nbsp;</td></tr>
        <tr><td align="center" style="padding:34px 32px 2px;">
          <img src="${logo}" width="196" alt="Beatrice Loving Heart" style="display:block;border:0;outline:none;text-decoration:none;height:auto;width:196px;max-width:66%;" />
        </td></tr>
        <tr><td align="center" style="padding:12px 32px 0;">
          <span style="font-family:Georgia,'Times New Roman',serif;font-size:20px;font-weight:700;color:#2B2312;letter-spacing:0.2px;">Case<span style="color:#B8860B;">Sync</span> <span style="color:#B3A276;font-weight:400;font-style:italic;">&amp; Workryn</span></span>
        </td></tr>
        <tr><td align="center" style="padding:14px 60px 0;">
          <table role="presentation" cellpadding="0" cellspacing="0" width="100%"><tr>
            <td style="height:1px;background:#EADFC2;line-height:1px;font-size:0;">&nbsp;</td>
            <td style="width:44px;text-align:center;font-size:11px;color:#C99722;padding:0 8px;line-height:1;">&#10022;</td>
            <td style="height:1px;background:#EADFC2;line-height:1px;font-size:0;">&nbsp;</td>
          </tr></table>
        </td></tr>
        <tr><td style="padding:24px 46px 6px;">
          <p style="margin:0 0 10px;font-size:11.5px;font-weight:800;color:#A87A16;text-transform:uppercase;letter-spacing:0.18em;">${eyebrow}</p>
          <h1 style="margin:0 0 10px;font-family:Georgia,'Times New Roman',serif;font-size:27px;font-weight:700;color:#2B2312;line-height:1.3;letter-spacing:-0.2px;">${heading}</h1>
          <table role="presentation" cellpadding="0" cellspacing="0" style="margin:6px 0 16px;"><tr>
            <td style="background:#F6ECCE;border:1px solid #E7D5A6;border-radius:20px;padding:6px 15px;"><span style="font-size:12px;font-weight:700;color:#8C6A14;letter-spacing:0.03em;">Role &middot; ${roleDisplay}</span></td>
          </tr></table>
          <p style="margin:0 0 20px;font-size:15px;color:#4E4327;line-height:1.75;">${intro}</p>

          <table role="presentation" cellpadding="0" cellspacing="0" align="center" style="margin:8px auto 2px;">
            <tr><td align="center" bgcolor="#B8860B" style="border-radius:12px;border:1px solid #96700A;">
              <a href="${ctaUrl}" style="display:inline-block;padding:15px 42px;font-size:15px;font-weight:700;color:#FFFDF7;text-decoration:none;border-radius:12px;background:#B8860B;background:linear-gradient(135deg,#D2A02C 0%,#A87A16 100%);letter-spacing:0.02em;">${ctaLabel} &rarr;</a>
            </td></tr>
          </table>

          ${guideBlock}

          <p style="margin:24px 0 0;font-size:12.5px;color:#9A8B5E;line-height:1.7;">
            This invitation link expires in 48 hours. If the button doesn&rsquo;t work, copy and paste this secure link into your browser:<br />
            <a href="${ctaUrl}" style="color:#A87A16;word-break:break-all;">${ctaUrl}</a>
          </p>
        </td></tr>
        <tr><td style="padding:10px 46px 0;"><div style="height:1px;background:#EADFC2;line-height:1px;font-size:0;">&nbsp;</div></td></tr>
        <tr><td style="padding:18px 46px 32px;text-align:center;">
          <p style="margin:0;font-family:Georgia,'Times New Roman',serif;font-size:12.5px;font-weight:700;color:#6B5A32;">Beatrice Loving Heart</p>
          <p style="margin:5px 0 0;font-size:11px;color:#AC9C74;line-height:1.6;">CaseSync &amp; Workryn &middot; Secure system email &middot; Please do not share this link</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`
}

// --------------------

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
  const daysLabel = daysUntil === 1 ? 'tomorrow' : `in ${daysUntil} days`

  const content = `
    <p style="margin:0 0 8px;font-size:13px;font-weight:600;color:${urgencyColor};text-transform:uppercase;letter-spacing:0.08em;">
      &#9888;&#65039; Deadline Alert
    </p>
    <h1 style="margin:0 0 24px;font-size:22px;font-weight:700;color:#f5f5f7;line-height:1.3;">
      ${clientName}
    </h1>

    <table width="100%" cellpadding="0" cellspacing="0" style="background:#1a1a1e;border-radius:8px;padding:20px;margin-bottom:24px;">
      <tr>
        <td style="padding:8px 0;border-bottom:1px solid #2a2a2e;">
          <span style="font-size:12px;color:#888;display:block;margin-bottom:2px;">What's due</span>
          <span style="font-size:15px;font-weight:600;color:#f5f5f7;">${fieldLabel}</span>
        </td>
      </tr>
      <tr>
        <td style="padding:8px 0;border-bottom:1px solid #2a2a2e;">
          <span style="font-size:12px;color:#888;display:block;margin-bottom:2px;">Due date</span>
          <span style="font-size:15px;font-weight:600;color:${urgencyColor};">${dueDate}</span>
        </td>
      </tr>
      <tr>
        <td style="padding:8px 0;">
          <span style="font-size:12px;color:#888;display:block;margin-bottom:2px;">Time remaining</span>
          <span style="font-size:15px;font-weight:600;color:${urgencyColor};">${daysLabel.charAt(0).toUpperCase() + daysLabel.slice(1)}</span>
        </td>
      </tr>
    </table>

    ${ctaButton(`${BASE_URL}/clients/${clientId}`, 'View Client')}
  `

  return {
    subject: `-- Deadline Alert: ${clientName} - ${fieldLabel} due ${dueDate}`,
    html: baseLayout(content),
  }
}

// --------------------

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
  const content = `
    <p style="margin:0 0 8px;font-size:13px;font-weight:600;color:#007aff;text-transform:uppercase;letter-spacing:0.08em;">
      &#128203; New Assignment
    </p>
    <h1 style="margin:0 0 24px;font-size:22px;font-weight:700;color:#f5f5f7;line-height:1.3;">
      ${clientName}
    </h1>

    <table width="100%" cellpadding="0" cellspacing="0" style="background:#1a1a1e;border-radius:8px;padding:20px;margin-bottom:24px;">
      <tr>
        <td style="padding:8px 0;border-bottom:1px solid #2a2a2e;">
          <span style="font-size:12px;color:#888;display:block;margin-bottom:2px;">Client ID</span>
          <span style="font-size:15px;font-weight:600;color:#f5f5f7;">${clientDisplayId}</span>
        </td>
      </tr>
      <tr>
        <td style="padding:8px 0;border-bottom:1px solid #2a2a2e;">
          <span style="font-size:12px;color:#888;display:block;margin-bottom:2px;">Category</span>
          <span style="font-size:15px;font-weight:600;color:#f5f5f7;">${category.toUpperCase()}</span>
        </td>
      </tr>
      <tr>
        <td style="padding:8px 0;">
          <span style="font-size:12px;color:#888;display:block;margin-bottom:2px;">Assigned by</span>
          <span style="font-size:15px;font-weight:600;color:#f5f5f7;">${assignedBy}</span>
        </td>
      </tr>
    </table>

    ${ctaButton(`${BASE_URL}/clients/${clientId}`, 'View Client')}
  `

  return {
    subject: `- New Client Assigned: ${clientName}`,
    html: baseLayout(content),
  }
}

// --------------------

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
    ? recentActivity.map(a => `
        <tr>
          <td style="padding:8px 0;border-bottom:1px solid #2a2a2e;">
            <span style="font-size:13px;font-weight:600;color:#f5f5f7;">${a.clientName}</span>
            <span style="font-size:12px;color:#888;display:block;">${a.action} &middot; ${a.when}</span>
          </td>
        </tr>
      `).join('')
    : '<tr><td style="padding:12px 0;font-size:13px;color:#888;">No recent activity.</td></tr>'

  const content = `
    <p style="margin:0 0 8px;font-size:13px;font-weight:600;color:#007aff;text-transform:uppercase;letter-spacing:0.08em;">
      &#128202; Daily Digest
    </p>
    <h1 style="margin:0 0 4px;font-size:22px;font-weight:700;color:#f5f5f7;">
      Good morning, ${userName}
    </h1>
    <p style="margin:0 0 24px;font-size:14px;color:#888;">${date}</p>

    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
      <tr>
        <td width="48%" style="background:#1a1a1e;border-radius:8px;padding:20px;text-align:center;">
          <span style="font-size:36px;font-weight:700;color:#ff3b30;">${overdueCount}</span>
          <p style="margin:4px 0 0;font-size:12px;color:#888;text-transform:uppercase;letter-spacing:0.06em;">Overdue</p>
        </td>
        <td width="4%"></td>
        <td width="48%" style="background:#1a1a1e;border-radius:8px;padding:20px;text-align:center;">
          <span style="font-size:36px;font-weight:700;color:#ffcc00;">${dueThisWeekCount}</span>
          <p style="margin:4px 0 0;font-size:12px;color:#888;text-transform:uppercase;letter-spacing:0.06em;">Due This Week</p>
        </td>
      </tr>
    </table>

    <h2 style="margin:0 0 12px;font-size:14px;font-weight:600;color:#888;text-transform:uppercase;letter-spacing:0.05em;">Recent Activity</h2>
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#1a1a1e;border-radius:8px;padding:0 20px;">
      ${activityRows}
    </table>

    ${ctaButton(`${BASE_URL}/dashboard`, 'Open Dashboard')}
  `

  return {
    subject: `- CaseSync Daily Digest - ${date}`,
    html: baseLayout(content),
  }
}

// --------------------

export function teamManagerPlannerAlertEmail({
  managerName,
  plannerName,
  overdueClientCount,
  dueSoonClientCount,
  topIssues,
  queueHref,
}: {
  managerName: string
  plannerName: string
  overdueClientCount: number
  dueSoonClientCount: number
  topIssues: Array<{ clientName: string; issue: string; dueDate: string }>
  queueHref: string
}) {
  const issueRows = topIssues.length > 0
    ? topIssues.map(issue => `
        <tr>
          <td style="padding:10px 0;border-bottom:1px solid #2a2a2e;">
            <span style="font-size:13px;font-weight:600;color:#f5f5f7;">${issue.clientName}</span>
            <span style="font-size:12px;color:#888;display:block;">${issue.issue} · ${issue.dueDate}</span>
          </td>
        </tr>
      `).join('')
    : '<tr><td style="padding:12px 0;font-size:13px;color:#888;">No client details available.</td></tr>'

  const content = `
    <p style="margin:0 0 8px;font-size:13px;font-weight:600;color:#ff9500;text-transform:uppercase;letter-spacing:0.08em;">
      &#9888;&#65039; Planner Deadline Escalation
    </p>
    <h1 style="margin:0 0 4px;font-size:22px;font-weight:700;color:#f5f5f7;">
      ${plannerName} needs attention
    </h1>
    <p style="margin:0 0 24px;font-size:14px;color:#888;">Hi ${managerName}, one of your planners has client deadlines that need follow-up.</p>

    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
      <tr>
        <td width="48%" style="background:#1a1a1e;border-radius:8px;padding:20px;text-align:center;">
          <span style="font-size:36px;font-weight:700;color:#ff3b30;">${overdueClientCount}</span>
          <p style="margin:4px 0 0;font-size:12px;color:#888;text-transform:uppercase;letter-spacing:0.06em;">Overdue Clients</p>
        </td>
        <td width="4%"></td>
        <td width="48%" style="background:#1a1a1e;border-radius:8px;padding:20px;text-align:center;">
          <span style="font-size:36px;font-weight:700;color:#ffcc00;">${dueSoonClientCount}</span>
          <p style="margin:4px 0 0;font-size:12px;color:#888;text-transform:uppercase;letter-spacing:0.06em;">Due This Week</p>
        </td>
      </tr>
    </table>

    <h2 style="margin:0 0 12px;font-size:14px;font-weight:600;color:#888;text-transform:uppercase;letter-spacing:0.05em;">Top Issues</h2>
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#1a1a1e;border-radius:8px;padding:0 20px;">
      ${issueRows}
    </table>

    ${ctaButton(`${BASE_URL}${queueHref}`, 'Open Team Queue')}
  `

  return {
    subject: `⚠️ ${plannerName} has ${overdueClientCount} overdue clients in CaseSync`,
    html: baseLayout(content),
  }
}

// --------------------

export function brandedInviteEmail({
  fullName,
  role,
  inviteUrl,
}: {
  fullName: string
  role: string
  inviteUrl: string
}) {
  const roleDisplay = formatRoleLabel(role)

  const html = invitePremiumLayout({
    eyebrow: 'You\u2019re invited',
    heading: `Welcome to CaseSync, ${fullName}`,
    roleDisplay,
    intro: `Beatrice Loving Heart has invited you to <strong style="color:#0F1B2D;">CaseSync</strong> \u2014 our secure portal for managing your caseload, tracking deadlines, and keeping documentation and your team in one place. Set up your account to get started.`,
    ctaUrl: inviteUrl,
    ctaLabel: 'Set up your account',
    guideAttached: true,
  })

  return {
    subject: 'You\u2019re invited to Beatrice Loving Heart CaseSync',
    html,
  }
}

export function inviteReminderEmail({
  fullName,
  role,
  inviteUrl,
}: {
  fullName: string
  role: string
  inviteUrl: string
}) {
  const roleDisplay = formatRoleLabel(role)

  const html = invitePremiumLayout({
    eyebrow: 'Reminder',
    heading: `Your CaseSync invite is waiting, ${fullName}`,
    roleDisplay,
    intro: `Just a friendly nudge \u2014 Beatrice Loving Heart invited you to join <strong style="color:#0F1B2D;">CaseSync</strong>. Your account is ready to set up whenever you are.`,
    ctaUrl: inviteUrl,
    ctaLabel: 'Set up your account',
    guideAttached: true,
  })

  return {
    subject: 'Reminder: set up your Beatrice Loving Heart CaseSync account',
    html,
  }
}

export function welcomeEmail({
  fullName,
  role,
  loginUrl,
}: {
  fullName: string
  role: string
  loginUrl?: string
}) {
  const roleDisplay = formatRoleLabel(role)
  const loginLink = loginUrl || `${BASE_URL}/login`

  const content = `
    <p style="margin:0 0 8px;font-size:13px;font-weight:600;color:#007aff;text-transform:uppercase;letter-spacing:0.08em;">
      Welcome to CaseSync
    </p>
    <h1 style="margin:0 0 24px;font-size:22px;font-weight:700;color:#f5f5f7;line-height:1.3;">
      Hi ${fullName}, you've been invited!
    </h1>

    <p style="margin:0 0 24px;font-size:15px;color:#b0b0b8;line-height:1.6;">
      You've been added to CaseSync &mdash; a case management platform for coordinating client care.
      Your account has been set up and you're ready to log in.
    </p>

    <table width="100%" cellpadding="0" cellspacing="0" style="background:#1a1a1e;border-radius:8px;padding:20px;margin-bottom:24px;">
      <tr>
        <td style="padding:8px 0;">
          <span style="font-size:12px;color:#888;display:block;margin-bottom:2px;">Your role</span>
          <span style="font-size:15px;font-weight:600;color:#007aff;">${roleDisplay}</span>
        </td>
      </tr>
    </table>

    ${ctaButton(loginLink, 'Log In to CaseSync')}

    <p style="margin:24px 0 0;font-size:12px;color:#555560;">
      If you didn't expect this invitation, you can safely ignore this email.
    </p>
  `

  return {
    subject: "You've been invited to CaseSync",
    html: baseLayout(content),
  }
}
