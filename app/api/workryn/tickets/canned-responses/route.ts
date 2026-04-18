import { NextResponse } from 'next/server'
import { getWorkrynSession } from '@/lib/workryn/auth'


const CANNED_RESPONSES = [
  {
    id: 'ack',
    title: 'Acknowledge Receipt',
    content: `Hi there,\n\nThanks for reaching out to IT support. We've received your request and will look into it shortly. We'll be in touch with an update as soon as possible.\n\nBest regards,\nIT Support`,
  },
  {
    id: 'restart',
    title: 'Restart Computer',
    content: `Hi,\n\nBefore we dig deeper, could you try restarting your computer? A fresh reboot clears up a surprising number of issues. Let us know if the problem persists after you restart.\n\nThanks!`,
  },
  {
    id: 'need-info',
    title: 'Request More Info',
    content: `Hi,\n\nTo help us troubleshoot this faster, could you send us:\n\n1. A screenshot of the error (if any)\n2. The exact steps you took before the issue appeared\n3. The name of the device or application affected\n\nAppreciate the extra details!`,
  },
  {
    id: 'escalated',
    title: 'Escalated to Network Team',
    content: `Hello,\n\nThis issue has been escalated to our network engineering team for further investigation. We'll keep you posted with updates as they come in — typically within the next business day.\n\nThanks for your patience.`,
  },
  {
    id: 'working-fix',
    title: 'Working on Fix',
    content: `Hi,\n\nGood news — we've identified the root cause of the issue and our team is actively working on a fix. We'll let you know as soon as it's resolved.\n\nThanks for your patience!`,
  },
  {
    id: 'resolved',
    title: 'Mark as Resolved',
    content: `Hi,\n\nThe issue should now be resolved on our end. Please give it another try and let us know if everything is working as expected. If it happens again, just reply to this ticket and we'll dig in further.\n\nGlad we could help!`,
  },
  {
    id: 'password-reset',
    title: 'Password Reset',
    content: `Hi,\n\nWe've reset your password. You should receive a temporary password at your registered email address within a few minutes. Please log in and change it to something personal as soon as possible.\n\nLet us know if you run into any trouble.`,
  },
  {
    id: 'software-install',
    title: 'Software Install Request',
    content: `Hi,\n\nWe've received your software install request. Please note that all software installs require manager approval for compliance reasons. Once approved, the install typically takes 1–2 business days.\n\nWe'll follow up once it's been scheduled.`,
  },
]

export async function GET() {
  const session = await getWorkrynSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  return NextResponse.json(CANNED_RESPONSES)
}
