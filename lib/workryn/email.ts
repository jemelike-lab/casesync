/**
 * Email service - sends via Microsoft Graph when the Microsoft 365 app is
 * configured (preferred: no mailbox password, no SMTP sign-in), otherwise falls
 * back to SMTP, otherwise a dev no-op.
 *
 * -- Microsoft Graph mode (preferred) ---------------------------------------
 * Authenticates to Entra by federation (Vercel OIDC -> AZURE_CLIENT_ID, the same
 * principal the database uses) and requests a Microsoft Graph token. No client
 * secret and no mailbox password are involved. The app registration needs the
 * **Mail.Send** application permission (admin-consented). Sends as GRAPH_MAIL_SENDER.
 *
 *   GRAPH_MAIL_SENDER=benefits@blhnurses.com   (a real M365 mailbox to send as)
 *   AZURE_CLIENT_ID / AZURE_TENANT_ID          (already set for the database)
 *
 * -- SMTP mode (legacy fallback) --------------------------------------------
 *   SMTP_HOST, SMTP_PORT (+ SMTP_USER, SMTP_PASS, SMTP_FROM, SMTP_SECURE)
 *
 * If neither is configured, send() logs and returns success so dev keeps working.
 */

import nodemailer, { type Transporter } from 'nodemailer'
import { ClientAssertionCredential } from '@azure/identity'
import { getVercelOidcToken } from '@vercel/oidc'

interface SendOptions {
  to: string
  subject: string
  text?: string
  html?: string
  replyTo?: string
  attachments?: Array<{ filename: string; content: Buffer | string; contentType?: string }>
}

type SendResult = { ok: boolean; messageId?: string; error?: string }

// ------------------------- Microsoft Graph (preferred) -------------------------
//
// Federated, no stored secret: we authenticate to Entra with the per-request
// Vercel OIDC token (Workload Identity Federation) as the SAME principal the DB
// uses (casesync-db-client / AZURE_CLIENT_ID), and request a Graph token. The
// app needs the **Mail.Send** application permission (admin-consented). Mail is
// sent as the mailbox in GRAPH_MAIL_SENDER.
//
// REQUEST-SCOPED: getVercelOidcToken() reads the current request header, so the
// credential is constructed per send (never at module load).

const GRAPH_SCOPE = 'https://graph.microsoft.com/.default'

function isGraphConfigured(): boolean {
  return Boolean(
    process.env.AZURE_TENANT_ID && process.env.AZURE_CLIENT_ID && process.env.GRAPH_MAIL_SENDER,
  )
}

/** Mint an app-only Graph token via Entra federation (no secret). Request-scoped. */
async function getGraphToken(): Promise<string> {
  const tenantId = process.env.AZURE_TENANT_ID
  const clientId = process.env.AZURE_CLIENT_ID
  if (!tenantId || !clientId) {
    throw new Error('AZURE_TENANT_ID / AZURE_CLIENT_ID not set; Graph mail auth is unavailable.')
  }
  const credential = new ClientAssertionCredential(tenantId, clientId, getVercelOidcToken)
  const token = await credential.getToken(GRAPH_SCOPE)
  if (!token?.token) throw new Error('Entra returned no Graph access token.')
  return token.token
}

function toRecipients(list: string): Array<{ emailAddress: { address: string } }> {
  return list
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((address) => ({ emailAddress: { address } }))
}

async function sendViaGraph(opts: SendOptions): Promise<SendResult> {
  const sender = process.env.GRAPH_MAIL_SENDER!
  const token = await getGraphToken()

  const message: Record<string, unknown> = {
    subject: opts.subject,
    body: { contentType: opts.html ? 'HTML' : 'Text', content: opts.html || opts.text || '' },
    toRecipients: toRecipients(opts.to),
  }
  if (opts.replyTo) message.replyTo = toRecipients(opts.replyTo)
  if (opts.attachments?.length) {
    message.attachments = opts.attachments.map((a) => ({
      '@odata.type': '#microsoft.graph.fileAttachment',
      name: a.filename,
      contentType: a.contentType || 'application/octet-stream',
      contentBytes: Buffer.isBuffer(a.content)
        ? a.content.toString('base64')
        : Buffer.from(a.content).toString('base64'),
    }))
  }

  const res = await fetch(
    `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(sender)}/sendMail`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ message, saveToSentItems: true }),
    },
  )
  // Graph sendMail returns 202 Accepted with an empty body on success.
  if (res.status === 202) return { ok: true, messageId: `graph:${Date.now()}` }
  return { ok: false, error: `Graph sendMail failed (${res.status}): ${await res.text()}` }
}

// ----------------------------- SMTP (legacy fallback) --------------------------

let _transporter: Transporter | null = null
let _smtpConfigured: boolean | null = null

function isSmtpConfigured(): boolean {
  if (_smtpConfigured !== null) return _smtpConfigured
  _smtpConfigured = !!(process.env.SMTP_HOST && process.env.SMTP_PORT)
  return _smtpConfigured
}

function getTransporter(): Transporter | null {
  if (!isSmtpConfigured()) return null
  if (_transporter) return _transporter
  _transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT),
    secure: process.env.SMTP_SECURE === 'true',
    auth:
      process.env.SMTP_USER && process.env.SMTP_PASS
        ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
        : undefined,
  })
  return _transporter
}

async function sendViaSmtp(opts: SendOptions): Promise<SendResult> {
  const transporter = getTransporter()!
  try {
    const result = await transporter.sendMail({
      from: process.env.SMTP_FROM || 'Workryn <noreply@workryn.local>',
      to: opts.to,
      subject: opts.subject,
      text: opts.text,
      html: opts.html,
      replyTo: opts.replyTo,
      attachments: opts.attachments,
    })
    return { ok: true, messageId: result.messageId }
  } catch (err: any) {
    console.error('[email] SMTP send failed:', err)
    return { ok: false, error: err?.message || 'Unknown email error' }
  }
}

// --------------------------------- public API ----------------------------------

export async function sendEmail(opts: SendOptions): Promise<SendResult> {
  // 1) Microsoft Graph - preferred; no mailbox password, reuses the M365 app.
  if (isGraphConfigured()) {
    try {
      return await sendViaGraph(opts)
    } catch (err: any) {
      console.error('[email] Graph send failed:', err)
      return { ok: false, error: err?.message || 'Unknown Graph email error' }
    }
  }

  // 2) SMTP - legacy fallback.
  if (isSmtpConfigured()) return sendViaSmtp(opts)

  // 3) Dev / unconfigured fallback - log and pretend success.
  console.log('[email] (not configured) Would send:', {
    to: opts.to,
    subject: opts.subject,
    preview: (opts.text || opts.html || '').slice(0, 200),
    attachments: opts.attachments?.length || 0,
  })
  return { ok: true, messageId: 'dev-noop' }
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
