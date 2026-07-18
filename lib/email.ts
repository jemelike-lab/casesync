import { Resend } from 'resend'

// Lazy-init so builds don't fail if RESEND_API_KEY isn't present.
// Routes that send mail should handle the "missing key" error at runtime.
function getResend() {
  const key = process.env.RESEND_API_KEY
  if (!key) return null
  return new Resend(key)
}

// Verified sender for branded BLH mail.
const FROM_ADDRESS = 'Beatrice Loving Heart <notifications@blhcasesync.com>'

export async function sendEmail({
  to,
  subject,
  html,
  attachments,
  replyTo,
  scheduledAt,
}: {
  to: string
  subject: string
  html: string
  attachments?: { filename: string; content: string }[]
  replyTo?: string
  scheduledAt?: string
}) {
  const key = process.env.RESEND_API_KEY
  if (!key) {
    throw new Error('Missing RESEND_API_KEY')
  }

  // RESEND_REST_FOR_ATTACHMENTS: the Resend SDK applies a recursive payload
  // transform that overflows the call stack on large base64 attachment
  // strings (RangeError observed in prod, 2026-07-06). For sends WITH
  // attachments we call the Resend REST API directly with JSON.stringify,
  // which handles large strings without recursion. All attachment-free
  // sends keep the SDK path unchanged.
  if (attachments && attachments.length) {
    if (scheduledAt) {
      // Resend limitation: emails with attachments cannot be scheduled.
      throw new Error('Cannot schedule an email with attachments')
    }
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: FROM_ADDRESS,
        to,
        subject,
        html,
        attachments,
        ...(replyTo ? { reply_to: replyTo } : {}),
      }),
    })
    if (!res.ok) {
      const body = await res.text().catch(() => '')
      throw new Error(`Resend REST ${res.status}: ${body.slice(0, 300)}`)
    }
    return res.json()
  }

  const resend = getResend()
  if (!resend) {
    throw new Error('Missing RESEND_API_KEY')
  }

  return resend.emails.send({
    from: FROM_ADDRESS,
    to,
    subject,
    html,
    ...(replyTo ? { replyTo } : {}),
    ...(scheduledAt ? { scheduledAt } : {}),
  })
}
