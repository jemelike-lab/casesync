import { Resend } from 'resend'

const resend = new Resend(process.env.RESEND_API_KEY)

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
  return resend.emails.send({
    from: FROM_ADDRESS,
    to,
    subject,
    html,
  })
}
