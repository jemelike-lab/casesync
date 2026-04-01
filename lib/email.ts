import { Resend } from 'resend'

// Lazy-init so builds don't fail if RESEND_API_KEY isn't present.
// Routes that send mail should handle the "missing key" error at runtime.
function getResend() {
  const key = process.env.RESEND_API_KEY
  if (!key) return null
  return new Resend(key)
}

// NOTE: Using onboarding@resend.dev for testing until blhcasesync.com is verified in Resend.
// Once verified, change FROM_ADDRESS to 'CaseSync <notifications@blhcasesync.com>'
const FROM_ADDRESS = 'CaseSync <onboarding@resend.dev>'

export async function sendEmail({
  to,
  subject,
  html,
}: {
  to: string
  subject: string
  html: string
}) {
  const resend = getResend()
  if (!resend) {
    throw new Error('Missing RESEND_API_KEY')
  }

  return resend.emails.send({
    from: FROM_ADDRESS,
    to,
    subject,
    html,
  })
}
