'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Header from '@/components/Header'
import { createClient } from '@/lib/supabase/client'
import { Profile } from '@/lib/types'
import { User } from '@supabase/supabase-js'

interface Factor {
  id: string
  factor_type: string
  type?: string
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

  return (
    <>
      <Header user={user} profile={profile} />
      <main style={{ maxWidth: 680, margin: '0 auto', padding: '24px 16px 100px' }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 24 }}>🔐 Security Settings</h1>

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
              <h2 style={{ fontSize: 15, fontWeight: 600, margin: 0 }}>Two-Factor Authentication</h2>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4 }}>
                Add an extra layer of security with TOTP
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
      </main>
    </>
  )
}
