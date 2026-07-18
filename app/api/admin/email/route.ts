// app/api/admin/email/route.ts
// Send branded email from inside CaseSync (owner + admin allowlist only).
//
// GET  \u2014 recipient directory: all active CaseSync profiles (id, name, role).
//        Names/roles only; addresses are never sent to the browser.
// POST \u2014 { toUserId, subject, body, scheduledAt? } \u2014 resolves the recipient's
//        address SERVER-SIDE from their user id (never accepts a raw address,
//        so this cannot be used as an open relay), wraps the plain-text body
//        in the branded layout, sends (or schedules) via Resend with
//        reply-to set to the caller, and writes an audit_logs row.

import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { createClient as createSupabaseJsClient } from '@supabase/supabase-js'
import { canSendMail } from '@/lib/email-send-access'
import { sendEmail } from '@/lib/email'
import { baseLayout } from '@/lib/email-templates'
import { textToEmailHtml } from '@/lib/pilot-email-drafts'
import { auditLog } from '@/lib/audit'

export const dynamic = 'force-dynamic'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const MAX_SCHEDULE_DAYS = 30

function adminClient() {
  return createSupabaseJsClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

async function requireSender() {
  const supabase = await createServerClient()
  const { data: authData, error: authErr } = await supabase.auth.getUser()
  if (authErr || !authData?.user) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  const caller = authData.user
  if (!canSendMail(caller.id)) return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  const { data: profile } = await supabase.from('profiles').select('role, full_name').eq('id', caller.id).single()
  return { caller, profile }
}

export async function GET() {
  const gate = await requireSender()
  if ('error' in gate) return gate.error
  try {
    const admin = adminClient()
    const { data, error } = await admin
      .from('profiles')
      .select('id, full_name, role')
      .order('full_name', { ascending: true })
    if (error) throw error
    return NextResponse.json({ users: data ?? [] })
  } catch (err) {
    console.error('[Email] directory failed:', err)
    return NextResponse.json({ error: 'Directory unavailable' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const gate = await requireSender()
  if ('error' in gate) return gate.error
  const { caller, profile } = gate

  let body: { toUserId?: unknown; subject?: unknown; body?: unknown; scheduledAt?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const toUserId = typeof body.toUserId === 'string' && UUID_RE.test(body.toUserId) ? body.toUserId : null
  const subject = typeof body.subject === 'string' ? body.subject.trim().slice(0, 200) : ''
  const messageText = typeof body.body === 'string' ? body.body.trim().slice(0, 10000) : ''
  if (!toUserId || !subject || !messageText) {
    return NextResponse.json({ error: 'toUserId, subject and body are required' }, { status: 400 })
  }

  let scheduledAt: string | undefined
  if (body.scheduledAt !== undefined && body.scheduledAt !== null && body.scheduledAt !== '') {
    if (typeof body.scheduledAt !== 'string') {
      return NextResponse.json({ error: 'scheduledAt must be an ISO datetime string' }, { status: 400 })
    }
    const when = new Date(body.scheduledAt)
    if (Number.isNaN(when.getTime())) {
      return NextResponse.json({ error: 'scheduledAt is not a valid datetime' }, { status: 400 })
    }
    const now = Date.now()
    if (when.getTime() <= now) {
      return NextResponse.json({ error: 'scheduledAt must be in the future' }, { status: 400 })
    }
    if (when.getTime() > now + MAX_SCHEDULE_DAYS * 86400000) {
      return NextResponse.json({ error: `scheduledAt must be within ${MAX_SCHEDULE_DAYS} days` }, { status: 400 })
    }
    scheduledAt = when.toISOString()
  }

  try {
    const admin = adminClient()
    const { data: userData, error: userErr } = await admin.auth.admin.getUserById(toUserId)
    const toEmail = userData?.user?.email
    if (userErr || !toEmail) {
      return NextResponse.json({ error: 'Recipient not found' }, { status: 404 })
    }

    const html = baseLayout(textToEmailHtml(messageText))
    const result = await sendEmail({
      to: toEmail,
      subject,
      html,
      replyTo: caller.email || undefined,
      scheduledAt,
    })

    await auditLog(req, {
      userId: caller.id,
      userEmail: caller.email ?? undefined,
      userRole: profile?.role ?? undefined,
      action: 'email.send',
      resourceType: 'user',
      resourceId: toUserId,
      details: {
        subject,
        scheduledAt: scheduledAt ?? null,
        bodyChars: messageText.length,
      },
    })

    const emailId = (result as { data?: { id?: string } } | { id?: string } | null | undefined)
    const id = (emailId as { data?: { id?: string } })?.data?.id ?? (emailId as { id?: string })?.id ?? null
    return NextResponse.json({ ok: true, scheduled: Boolean(scheduledAt), scheduledAt: scheduledAt ?? null, emailId: id })
  } catch (err) {
    console.error('[Email] send failed:', err)
    return NextResponse.json({ error: 'Send failed' }, { status: 500 })
  }
}
