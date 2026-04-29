import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { sendEmail } from '@/lib/email'
import crypto from 'crypto'

export const dynamic = 'force-dynamic'

function getServiceSupabase() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

function generateCode(): string {
  // Cryptographically secure 6-digit code
  return crypto.randomInt(100000, 999999).toString()
}

/**
 * POST /api/auth/mfa-email
 * Body: { action: 'send' } — sends a new code to the user's email
 * Body: { action: 'verify', code: '123456' } — verifies a code
 * Body: { action: 'unenroll' } — removes email MFA for the user
 */
export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json()
  const { action } = body
  const admin = getServiceSupabase()

  if (action === 'send') {
    const code = generateCode()
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000) // 5 minutes

    // Invalidate any existing unused codes for this user
    await admin
      .from('mfa_email_codes')
      .update({ used: true })
      .eq('user_id', user.id)
      .eq('used', false)

    // Insert new code
    const { error } = await admin.from('mfa_email_codes').insert({
      user_id: user.id,
      code,
      expires_at: expiresAt.toISOString(),
    })

    if (error) {
      console.error('[mfa-email] Failed to store code:', error.message)
      return NextResponse.json({ error: 'Failed to generate code' }, { status: 500 })
    }

    // Send email
    try {
      await sendEmail({
        to: user.email,
        subject: 'Your CaseSync verification code',
        html: `
          <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 480px; margin: 0 auto; padding: 40px 20px;">
            <h2 style="font-size: 20px; font-weight: 600; margin-bottom: 8px; color: #1a1a1a;">Verification code</h2>
            <p style="font-size: 14px; color: #666; margin-bottom: 24px;">Use this code to set up two-factor authentication on CaseSync.</p>
            <div style="background: #f5f5f5; border-radius: 8px; padding: 20px; text-align: center; margin-bottom: 24px;">
              <span style="font-size: 32px; font-weight: 700; letter-spacing: 0.15em; color: #1a1a1a; font-family: monospace;">${code}</span>
            </div>
            <p style="font-size: 13px; color: #999;">This code expires in 5 minutes. If you didn't request this, you can safely ignore this email.</p>
          </div>
        `,
      })
    } catch (emailErr: any) {
      console.error('[mfa-email] Failed to send email:', emailErr?.message)
      return NextResponse.json({ error: 'Failed to send verification email' }, { status: 500 })
    }

    return NextResponse.json({ sent: true })
  }

  if (action === 'verify') {
    const { code } = body
    if (!code || typeof code !== 'string' || code.length !== 6) {
      return NextResponse.json({ error: 'Invalid code format' }, { status: 400 })
    }

    // Look up valid code
    const { data: codeRow } = await admin
      .from('mfa_email_codes')
      .select('id, code, expires_at')
      .eq('user_id', user.id)
      .eq('used', false)
      .gte('expires_at', new Date().toISOString())
      .order('created_at', { ascending: false })
      .limit(1)
      .single()

    if (!codeRow || codeRow.code !== code) {
      return NextResponse.json({ error: 'Invalid or expired code' }, { status: 400 })
    }

    // Mark as used
    await admin.from('mfa_email_codes').update({ used: true }).eq('id', codeRow.id)

    // Store that this user has email MFA enabled in their profile metadata
    await admin.from('profiles').update({ mfa_email_enabled: true }).eq('id', user.id)

    return NextResponse.json({ verified: true })
  }

  if (action === 'unenroll') {
    await admin.from('profiles').update({ mfa_email_enabled: false }).eq('id', user.id)
    // Clean up any pending codes
    await admin.from('mfa_email_codes').update({ used: true }).eq('user_id', user.id).eq('used', false)
    return NextResponse.json({ unenrolled: true })
  }

  return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
}
