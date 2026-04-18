/**
 * Email service — wraps nodemailer with environment-based configuration.
 *
 * To enable email sending, set these environment variables:
 *
 *   SMTP_HOST=smtp.gmail.com
 *   SMTP_PORT=587
 *   SMTP_USER=you@example.com
 *   SMTP_PASS=your-app-password
 *   SMTP_FROM="Workryn Support <support@workryn.com>"
 *   SMTP_SECURE=false   (true for port 465)
 *
 * Compatible with Gmail, Outlook, SendGrid, AWS SES, Mailgun, plain SMTP.
 *
 * If SMTP is not configured, send() will log to console and return success
 * (so the rest of the app keeps working in dev). In production this is a
 * no-op until you wire up real credentials.
 */

import nodemailer, { type Transporter } from 'nodemailer'

interface SendOptions {
  to: string
  subject: string
  text?: string
  html?: string
  replyTo?: string
}

let _transporter: Transporter | null = null
let _configured: boolean | null = null

function isConfigured(): boolean {
  if (_configured !== null) return _configured
  _configured = !!(process.env.SMTP_HOST && process.env.SMTP_PORT)
  return _configured
}

function getTransporter(): Transporter | null {
  if (!isConfigured()) return null
  if (_transporter) return _transporter

  _transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT),
    secure: process.env.SMTP_SECURE === 'true',
    auth: process.env.SMTP_USER && process.env.SMTP_PASS
      ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
      : undefined,
  })

  return _transporter
}

export async function sendEmail(opts: SendOptions): Promise<{ ok: boolean; messageId?: string; error?: string }> {
  const transporter = getTransporter()

  if (!transporter) {
    // Dev / unconfigured fallback — log and pretend success
    console.log('[email] (not configured) Would send:', {
      to: opts.to,
      subject: opts.subject,
      preview: (opts.text || opts.html || '').slice(0, 200),
    })
    return { ok: true, messageId: 'dev-noop' }
  }

  try {
    const result = await transporter.sendMail({
      from: process.env.SMTP_FROM || 'Workryn <noreply@workryn.local>',
      to: opts.to,
      subject: opts.subject,
      text: opts.text,
      html: opts.html,
      replyTo: opts.replyTo,
    })
    return { ok: true, messageId: result.messageId }
  } catch (err: any) {
    console.error('[email] send failed:', err)
    return { ok: false, error: err?.message || 'Unknown email error' }
  }
}

/** Render a basic HTML wrapper for outbound emails. */
export function renderEmailHtml(opts: { heading: string; body: string; ticketId?: string }): string {
  const ticketRef = opts.ticketId ? `<p style="color:#94a3b8;font-size:12px;margin-top:24px">Ref: #${opts.ticketId.slice(-8).toUpperCase()}</p>` : ''
  return `
<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;background:#0a0b0f;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#f1f5f9">
  <table width="100%" cellpadding="0" cellspacing="0" border="0">
    <tr><td align="center" style="padding:32px 16px">
      <table width="100%" style="max-width:560px;background:#0f1117;border:1px solid rgba(255,255,255,0.1);border-radius:16px;overflow:hidden">
        <tr><td style="background:linear-gradient(135deg,#6366f1 0%,#8b5cf6 100%);height:4px"></td></tr>
        <tr><td style="padding:32px">
          <h1 style="margin:0 0 16px 0;font-size:20px;color:#f1f5f9">${escape(opts.heading)}</h1>
          <div style="font-size:14px;color:#94a3b8;line-height:1.6;white-space:pre-wrap">${escape(opts.body)}</div>
          ${ticketRef}
        </td></tr>
      </table>
      <p style="color:#475569;font-size:11px;margin-top:16px">Powered by Workryn</p>
    </td></tr>
  </table>
</body>
</html>`
}

function escape(s: string): string {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
