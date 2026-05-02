'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Header from '@/components/Header'
import { createClient } from '@/lib/supabase/client'
import { Profile } from '@/lib/types'
import { User } from '@supabase/supabase-js'

interface Factor {
  id: string
  factor_type: string
  type: string
  status: string
  created_at: string
  updated_at: string
  friendly_name?: string | null
  last_challenged_at?: string | null
}

interface Props {
  user: User
  profile: Profile
  factors: Factor[]
}

export default function SecurityPageClient({ user, profile, factors }: Props) {
  const supabase = createClient()
  const router = useRouter()
  const searchParams = useSearchParams()
  const mfaRequired = searchParams.get('mfa_required') === '1'
  const [enrolling, setEnrolling] = useState(false)
  const [qrCode, setQrCode] = useState<string | null>(null)
  const [totpSecret, setTotpSecret] = useState<string | null>(null)
  const [factorId, setFactorId] = useState<string | null>(null)
  const [verifyCode, setVerifyCode] = useState('')
  const [verifying, setVerifying] = useState(false)
  const [verifyError, setVerifyError] = useState('')
  const [unenrolling, setUnenrolling] = useState(false)
  const [signingOut, setSigningOut] = useState(false)
  const [message, setMessage] = useState('')
  // Email MFA state
  const [emailSending, setEmailSending] = useState(false)
  const [emailSent, setEmailSent] = useState(false)
  const [emailCode, setEmailCode] = useState('')
  const [emailVerifying, setEmailVerifying] = useState(false)
  const [emailError, setEmailError] = useState('')
  const [emailUnenrolling, setEmailUnenrolling] = useState(false)

  // About / Check for Updates state
  const [updateStatus, setUpdateStatus] = useState<'idle' | 'checking' | 'up-to-date' | 'update-available' | 'applying' | 'error'>('idle')
  const [updateMessage, setUpdateMessage] = useState<string | null>(null)
  const [serverVersion, setServerVersion] = useState<string | null>(null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const emailMfaEnabled = profile?.mfa_email_enabled === true

  const activeFactor = factors.find(f => f.status === 'verified')
  const lastLogin = user.last_sign_in_at
    ? new Date(user.last_sign_in_at).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })
    : 'Unknown'

  async function startEnroll() {
    setEnrolling(true)
    setVerifyError('')
    const { data, error } = await supabase.auth.mfa.enroll({
      factorType: 'totp',
      friendlyName: 'Authenticator App',
    })
    if (error || !data) {
      setVerifyError(error?.message ?? 'Failed to start enrollment')
      setEnrolling(false)
      return
    }
    setFactorId(data.id)
    setQrCode(data.totp.qr_code)
    setTotpSecret(data.totp.secret)
  }

  async function verifyTOTP() {
    if (!factorId || !verifyCode) return
    setVerifying(true)
    setVerifyError('')
    const { data: challengeData, error: challengeError } = await supabase.auth.mfa.challenge({ factorId })
    if (challengeError) {
      setVerifyError(challengeError.message)
      setVerifying(false)
      return
    }
    const { error } = await supabase.auth.mfa.verify({
      factorId,
      challengeId: challengeData.id,
      code: verifyCode,
    })
    if (error) {
      setVerifyError(error.message)
    } else {
      setMessage('✅ 2FA enabled successfully!')
      setQrCode(null)
      setTotpSecret(null)
      setFactorId(null)
      setVerifyCode('')
      router.refresh()
    }
    setVerifying(false)
  }

  async function unenrollFactor() {
    if (!activeFactor) return
    if (!confirm('Disable 2FA? You will need to re-enable it for added security.')) return
    setUnenrolling(true)
    const { error } = await supabase.auth.mfa.unenroll({ factorId: activeFactor.id })
    if (error) setVerifyError(error.message)
    else { setMessage('2FA has been disabled.'); router.refresh() }
    setUnenrolling(false)
  }

  async function sendEmailCode() {
    setEmailSending(true)
    setEmailError('')
    try {
      const res = await fetch('/api/auth/mfa-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'send' }),
      })
      const data = await res.json()
      if (!res.ok) { setEmailError(data.error || 'Failed to send code'); return }
      setEmailSent(true)
    } catch { setEmailError('Network error') }
    finally { setEmailSending(false) }
  }

  async function verifyEmailCode() {
    if (emailCode.length < 6) return
    setEmailVerifying(true)
    setEmailError('')
    try {
      const res = await fetch('/api/auth/mfa-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'verify', code: emailCode }),
      })
      const data = await res.json()
      if (!res.ok) { setEmailError(data.error || 'Verification failed'); return }
      setMessage('✅ Email 2FA enabled successfully!')
      setEmailSent(false)
      setEmailCode('')
      router.refresh()
    } catch { setEmailError('Network error') }
    finally { setEmailVerifying(false) }
  }

  async function unenrollEmail() {
    if (!confirm('Disable email 2FA?')) return
    setEmailUnenrolling(true)
    try {
      const res = await fetch('/api/auth/mfa-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'unenroll' }),
      })
      if (res.ok) { setMessage('Email 2FA has been disabled.'); router.refresh() }
    } catch { /* ignore */ }
    finally { setEmailUnenrolling(false) }
  }

  async function signOutAll() {
    setSigningOut(true)
    const { error } = await supabase.auth.signOut({ scope: 'global' })
    if (error) setVerifyError(error.message)
    else router.push('/login')
    setSigningOut(false)
  }

  const cardStyle: React.CSSProperties = {
    background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 20, marginBottom: 16,
  }
  const inputStyle: React.CSSProperties = {
    background: '#1c1c1e', border: '1px solid #333336', borderRadius: 6, color: '#f5f5f7',
    padding: '8px 12px', fontSize: 13, width: '100%',
  }

  async function checkForUpdates() {
    setUpdateStatus('checking')
    setUpdateMessage(null)
    setServerVersion(null)
    try {
      const res = await fetch('/api/version', { cache: 'no-store' })
      if (!res.ok) throw new Error('Failed to check')
      const data = await res.json()
      setServerVersion(data.shortVersion)
      const reg = await navigator.serviceWorker?.getRegistration()
      if (reg) { await reg.update(); await new Promise(r => setTimeout(r, 1500)) }
      const hasWaitingSW = !!reg?.waiting
      if (hasWaitingSW) {
        setUpdateStatus('update-available')
        setUpdateMessage(`Version ${data.shortVersion} is available`)
      } else {
        setUpdateStatus('up-to-date')
        setUpdateMessage(`You're on the latest version (${data.shortVersion})`)
        setTimeout(() => setUpdateStatus('idle'), 5000)
      }
    } catch {
      setUpdateStatus('error')
      setUpdateMessage('Could not check for updates. Try again later.')
      setTimeout(() => setUpdateStatus('idle'), 5000)
    }
  }

  async function applyUpdate() {
    setUpdateStatus('applying')
    setUpdateMessage('Applying update…')
    try {
      const reg = await navigator.serviceWorker?.getRegistration()
      if (reg?.waiting) { reg.waiting.postMessage('SKIP_WAITING'); await new Promise(r => setTimeout(r, 800)) }
      window.location.reload()
    } catch { window.location.reload() }
  }

  return (
    <>
      <Header user={user} profile={profile} />
      <main style={{ maxWidth: 680, margin: '0 auto', padding: '24px 16px 100px' }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 24 }}>🔐 Security Settings</h1>

        {mfaRequired && !activeFactor && !emailMfaEnabled && (
          <div style={{ background: 'rgba(255,159,10,0.1)', border: '1px solid rgba(255,159,10,0.3)', borderRadius: 8, padding: 16, marginBottom: 16, fontSize: 13 }}>
            <div style={{ fontWeight: 600, color: '#ff9f0a', marginBottom: 4 }}>Two-factor authentication is required</div>
            <div style={{ color: 'var(--text-secondary)' }}>
              Your organization requires all users to enable 2FA for HIPAA compliance. Choose one of the options below — either an authenticator app or email verification code.
            </div>
          </div>
        )}

        {message && (
          <div style={{ background: 'rgba(48,209,88,0.1)', border: '1px solid rgba(48,209,88,0.3)', borderRadius: 8, padding: 12, marginBottom: 16, fontSize: 13, color: '#30d158' }}>
            {message}
          </div>
        )}

        {/* Account Info */}
        <div style={cardStyle}>
          <h2 style={{ fontSize: 15, fontWeight: 600, marginBottom: 12 }}>Account</h2>
          <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 4 }}>Email: <span style={{ color: 'var(--text)' }}>{user.email}</span></div>
          <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Last sign in: <span style={{ color: 'var(--text)' }}>{lastLogin}</span></div>
        </div>

        {/* 2FA */}
        <div style={cardStyle}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <div>
              <h2 style={{ fontSize: 15, fontWeight: 600, margin: 0 }}>Authenticator App</h2>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4 }}>
                Use Google Authenticator, Authy, or similar
              </div>
            </div>
            {activeFactor ? (
              <span style={{ background: 'rgba(48,209,88,0.15)', color: '#30d158', borderRadius: 8, padding: '4px 10px', fontSize: 12, fontWeight: 600 }}>
                ✓ Enabled
              </span>
            ) : (
              <span style={{ background: 'rgba(255,159,10,0.15)', color: '#ff9f0a', borderRadius: 8, padding: '4px 10px', fontSize: 12, fontWeight: 600 }}>
                Not enabled
              </span>
            )}
          </div>

          {activeFactor ? (
            <div>
              <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 12 }}>
                2FA is active. Enrolled: {new Date(activeFactor.created_at).toLocaleDateString()}
              </div>
              <button onClick={unenrollFactor} disabled={unenrolling} style={{ background: 'rgba(255,69,58,0.1)', border: '1px solid rgba(255,69,58,0.3)', borderRadius: 8, padding: '8px 16px', fontSize: 13, color: '#ff453a', cursor: 'pointer' }}>
                {unenrolling ? 'Disabling…' : 'Disable 2FA'}
              </button>
            </div>
          ) : qrCode ? (
            <div>
              <div style={{ fontSize: 13, marginBottom: 12 }}>
                Scan this QR code with your authenticator app (Google Authenticator, Authy, etc.):
              </div>
              <img src={qrCode} alt="TOTP QR Code" style={{ width: 180, height: 180, borderRadius: 8, background: 'white', padding: 8, display: 'block', marginBottom: 12 }} />
              {totpSecret && (
                <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 12, fontFamily: 'monospace', wordBreak: 'break-all' }}>
                  Manual key: {totpSecret}
                </div>
              )}
              <div style={{ marginBottom: 12 }}>
                <label style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>
                  Enter the 6-digit code from your app to confirm:
                </label>
                <input
                  type="text"
                  placeholder="000000"
                  value={verifyCode}
                  onChange={e => setVerifyCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  style={{ ...inputStyle, maxWidth: 140, fontFamily: 'monospace', letterSpacing: '0.2em', textAlign: 'center' }}
                />
              </div>
              {verifyError && <div style={{ fontSize: 12, color: '#ff453a', marginBottom: 8 }}>{verifyError}</div>}
              <div style={{ display: 'flex', gap: 10 }}>
                <button onClick={verifyTOTP} disabled={verifyCode.length < 6 || verifying} className="btn-primary" style={{ fontSize: 13 }}>
                  {verifying ? 'Verifying…' : 'Activate 2FA'}
                </button>
                <button onClick={() => { setQrCode(null); setFactorId(null) }} style={{ background: 'none', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 14px', fontSize: 13, color: 'var(--text)', cursor: 'pointer' }}>
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <div>
              {verifyError && <div style={{ fontSize: 12, color: '#ff453a', marginBottom: 8 }}>{verifyError}</div>}
              <button onClick={startEnroll} disabled={enrolling} className="btn-primary" style={{ fontSize: 13 }}>
                {enrolling ? 'Loading…' : 'Enable 2FA'}
              </button>
            </div>
          )}
        </div>

        {/* Email Code 2FA */}
        <div style={cardStyle}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <div>
              <h2 style={{ fontSize: 15, fontWeight: 600, margin: 0 }}>Email Verification Code</h2>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4 }}>
                Receive a 6-digit code at {user.email}
              </div>
            </div>
            {emailMfaEnabled ? (
              <span style={{ background: 'rgba(48,209,88,0.15)', color: '#30d158', borderRadius: 8, padding: '4px 10px', fontSize: 12, fontWeight: 600 }}>
                ✓ Enabled
              </span>
            ) : (
              <span style={{ background: 'rgba(255,159,10,0.15)', color: '#ff9f0a', borderRadius: 8, padding: '4px 10px', fontSize: 12, fontWeight: 600 }}>
                Not enabled
              </span>
            )}
          </div>

          {emailMfaEnabled ? (
            <div>
              <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 12 }}>
                A verification code will be sent to your email each time you sign in.
              </div>
              <button onClick={unenrollEmail} disabled={emailUnenrolling} style={{ background: 'rgba(255,69,58,0.1)', border: '1px solid rgba(255,69,58,0.3)', borderRadius: 8, padding: '8px 16px', fontSize: 13, color: '#ff453a', cursor: 'pointer' }}>
                {emailUnenrolling ? 'Disabling…' : 'Disable email 2FA'}
              </button>
            </div>
          ) : emailSent ? (
            <div>
              <div style={{ fontSize: 13, marginBottom: 12 }}>
                We sent a 6-digit code to <strong>{user.email}</strong>. Enter it below:
              </div>
              <div style={{ marginBottom: 12 }}>
                <input
                  type="text"
                  placeholder="000000"
                  value={emailCode}
                  onChange={e => setEmailCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  style={{ ...inputStyle, maxWidth: 140, fontFamily: 'monospace', letterSpacing: '0.2em', textAlign: 'center' }}
                />
              </div>
              {emailError && <div style={{ fontSize: 12, color: '#ff453a', marginBottom: 8 }}>{emailError}</div>}
              <div style={{ display: 'flex', gap: 10 }}>
                <button onClick={verifyEmailCode} disabled={emailCode.length < 6 || emailVerifying} className="btn-primary" style={{ fontSize: 13 }}>
                  {emailVerifying ? 'Verifying…' : 'Activate email 2FA'}
                </button>
                <button onClick={sendEmailCode} disabled={emailSending} style={{ background: 'none', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 14px', fontSize: 13, color: 'var(--text)', cursor: 'pointer' }}>
                  {emailSending ? 'Sending…' : 'Resend code'}
                </button>
                <button onClick={() => { setEmailSent(false); setEmailCode(''); setEmailError('') }} style={{ background: 'none', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 14px', fontSize: 13, color: 'var(--text)', cursor: 'pointer' }}>
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <div>
              {emailError && <div style={{ fontSize: 12, color: '#ff453a', marginBottom: 8 }}>{emailError}</div>}
              <button onClick={sendEmailCode} disabled={emailSending} className="btn-primary" style={{ fontSize: 13 }}>
                {emailSending ? 'Sending…' : 'Enable email 2FA'}
              </button>
            </div>
          )}
        </div>

        {/* Sessions */}
        <div style={cardStyle}>
          <h2 style={{ fontSize: 15, fontWeight: 600, marginBottom: 12 }}>Sessions</h2>
          <div style={{ background: 'var(--surface-2)', borderRadius: 8, padding: 12, marginBottom: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 500 }}>Current Session</div>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>
                  {navigator?.userAgent?.includes('Mobile') ? '📱 Mobile' : '💻 Desktop'} · Last active: {lastLogin}
                </div>
              </div>
              <span style={{ background: 'rgba(48,209,88,0.15)', color: '#30d158', borderRadius: 6, padding: '2px 8px', fontSize: 11, fontWeight: 600 }}>Active</span>
            </div>
          </div>
          <button onClick={signOutAll} disabled={signingOut} style={{ background: 'rgba(255,69,58,0.1)', border: '1px solid rgba(255,69,58,0.3)', borderRadius: 8, padding: '8px 16px', fontSize: 13, color: '#ff453a', cursor: 'pointer' }}>
            {signingOut ? 'Signing out…' : 'Sign out all sessions'}
          </button>
        </div>

        {/* About & Check for Updates */}
        <div style={cardStyle}>
          <h2 style={{ fontSize: 15, fontWeight: 600, marginBottom: 12 }}>About CaseSync</h2>

          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 12, lineHeight: 1.5 }}>
              CaseSync updates automatically, but you can manually check for and apply the latest version here. Especially useful for the installed PWA.
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              {(updateStatus === 'idle' || updateStatus === 'error' || updateStatus === 'up-to-date') && (
                <button onClick={checkForUpdates} style={{ background: 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)', border: 'none', borderRadius: 8, padding: '8px 16px', fontSize: 13, color: '#fff', cursor: 'pointer', fontWeight: 600 }}>
                  🔄 Check for Updates
                </button>
              )}
              {updateStatus === 'checking' && (
                <button disabled style={{ background: '#333', border: 'none', borderRadius: 8, padding: '8px 16px', fontSize: 13, color: '#999', cursor: 'not-allowed' }}>
                  Checking…
                </button>
              )}
              {updateStatus === 'update-available' && (
                <button onClick={applyUpdate} style={{ background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)', border: 'none', borderRadius: 8, padding: '8px 16px', fontSize: 13, color: '#fff', cursor: 'pointer', fontWeight: 600 }}>
                  ⬇️ Apply Update
                </button>
              )}
              {updateStatus === 'applying' && (
                <button disabled style={{ background: '#333', border: 'none', borderRadius: 8, padding: '8px 16px', fontSize: 13, color: '#999', cursor: 'not-allowed' }}>
                  Applying…
                </button>
              )}
            </div>
            {updateMessage && (
              <div style={{
                marginTop: 10, padding: '8px 12px', borderRadius: 6, fontSize: 12,
                background: updateStatus === 'error' ? 'rgba(255,69,58,0.1)' : 'rgba(48,209,88,0.1)',
                border: `1px solid ${updateStatus === 'error' ? 'rgba(255,69,58,0.3)' : 'rgba(48,209,88,0.3)'}`,
                color: updateStatus === 'error' ? '#ff453a' : '#30d158',
              }}>
                {updateMessage}
              </div>
            )}
          </div>

          <div style={{ borderTop: '1px solid var(--border)', paddingTop: 12 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <div style={{ fontSize: 11, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 3 }}>Application</div>
                <div style={{ fontSize: 13, fontWeight: 500 }}>CaseSync</div>
              </div>
              <div>
                <div style={{ fontSize: 11, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 3 }}>Organization</div>
                <div style={{ fontSize: 13, fontWeight: 500 }}>Beatrice Loving Heart</div>
              </div>
              {serverVersion && (
                <div>
                  <div style={{ fontSize: 11, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 3 }}>Server Version</div>
                  <div style={{ fontSize: 13, fontWeight: 500, fontFamily: 'monospace' }}>{serverVersion}</div>
                </div>
              )}
              <div>
                <div style={{ fontSize: 11, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 3 }}>Platform</div>
                <div style={{ fontSize: 13, fontWeight: 500 }}>
                  {typeof window !== 'undefined' && (window.matchMedia?.('(display-mode: standalone)')?.matches ? 'Installed (PWA)' : 'Browser')}
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>
    </>
  )
}
