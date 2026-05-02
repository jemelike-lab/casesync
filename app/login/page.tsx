'use client'
import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import Image from 'next/image'

const REASON_MESSAGES: Record<string, string> = {
  session_timeout: 'Your session has expired due to inactivity. Please sign in again.',
  session_expired: 'Your session has expired. Please sign in again.',
  signed_out: 'You have been signed out.',
  account_removed: 'Your account has been removed. Contact an administrator if you think this is a mistake.',
  account_deactivated: 'Your account has been deactivated. Contact an administrator for assistance.',
}

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [resetLoading, setResetLoading] = useState(false)
  const [showRecoveryAction, setShowRecoveryAction] = useState(false)
  const router = useRouter()

  // Show contextual message based on redirect reason (read from URL without useSearchParams)
  useEffect(() => {
    if (typeof window === 'undefined') return
    const params = new URLSearchParams(window.location.search)
    const reason = params.get('reason')
    if (reason && REASON_MESSAGES[reason]) {
      setMessage(REASON_MESSAGES[reason])
    }
  }, [])

  const supabase = useMemo(() => {
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY) return null
    return createClient()
  }, [])

  useEffect(() => {
    let mounted = true
    async function handleInviteLanding() {
      const hash = typeof window !== 'undefined' ? window.location.hash : ''
      const params = new URLSearchParams(hash.startsWith('#') ? hash.slice(1) : hash)
      const accessToken = params.get('access_token')
      const refreshToken = params.get('refresh_token')
      const type = params.get('type')
      if (!accessToken || !refreshToken) return
      if (!supabase) return
      const { error: sessionError } = await supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken })
      if (sessionError) { if (mounted) setError(sessionError.message); return }
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data: profile } = await supabase.from('profiles').select('onboarded').eq('id', user.id).single()
      if (typeof window !== 'undefined') window.history.replaceState({}, document.title, '/login')
      if (type === 'recovery') router.push('/reset-password')
      else if (profile && profile.onboarded === false) router.push('/onboarding')
      else if (type === 'invite' || type === 'magiclink') router.push('/w/dashboard')
      router.refresh()
    }
    handleInviteLanding()
    return () => { mounted = false }
  }, [router, supabase])

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setError(null); setMessage(null); setShowRecoveryAction(false); setLoading(true)
    if (!supabase) { setError('CaseSync is temporarily unavailable. Missing client configuration.'); setLoading(false); return }
    const normalizedEmail = email.trim().toLowerCase()
    try {
      const rateLimitRes = await fetch('/api/auth/rate-limit', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: normalizedEmail }),
      })
      if (rateLimitRes.status === 429) {
        const data = await rateLimitRes.json()
        const minutes = Math.ceil((data.retryAfter ?? 900) / 60)
        setError(`Too many login attempts. Please try again in ${minutes} minute${minutes !== 1 ? 's' : ''}.`)
        setLoading(false); return
      }
    } catch { /* fail open */ }
    const { data, error } = await supabase.auth.signInWithPassword({ email: normalizedEmail, password })
    if (error) {
      const msg = (error.message || '').toLowerCase()
      if (msg.includes('email rate limit exceeded')) {
        setError('Too many sign-in attempts for this email. Use the recovery action below for a fresh reset link instead of retrying sign-in.')
        setShowRecoveryAction(true)
      } else { setError(error.message) }
      setLoading(false); return
    }
    if (data.user) {
      if (data.user.user_metadata?.disabled) {
        await supabase.auth.signOut()
        setError('This account has been removed from active access. Contact an administrator if you think this is a mistake.')
        setLoading(false); return
      }
      const { data: profile } = await supabase.from('profiles').select('onboarded').eq('id', data.user.id).single()
      router.push(profile && profile.onboarded === false ? '/onboarding' : '/w/dashboard')
      router.refresh()
    }
  }

  async function handleForgotPassword() {
    if (!supabase) { setError('CaseSync is temporarily unavailable. Missing client configuration.'); return }
    const normalizedEmail = email.trim().toLowerCase()
    setError(null); setMessage(null); setShowRecoveryAction(false)
    if (!normalizedEmail) { setError('Enter your email address first, then tap Forgot password.'); return }
    setResetLoading(true)
    const { error } = await supabase.auth.resetPasswordForEmail(normalizedEmail, { redirectTo: `${window.location.origin}/reset-password` })
    setResetLoading(false)
    if (error) { setError(error.message); return }
    setMessage('Password reset email sent. Check your inbox for the secure reset link.')
  }

  return (
    <>
      <style>{`
        @keyframes cs-float-1 {
          0%, 100% { transform: translateY(0px) translateX(0px); opacity: 0.6; }
          33% { transform: translateY(-28px) translateX(12px); opacity: 0.9; }
          66% { transform: translateY(14px) translateX(-8px); opacity: 0.5; }
        }
        @keyframes cs-float-2 {
          0%, 100% { transform: translateY(0px) translateX(0px); opacity: 0.4; }
          40% { transform: translateY(22px) translateX(-16px); opacity: 0.8; }
          70% { transform: translateY(-18px) translateX(10px); opacity: 0.3; }
        }
        @keyframes cs-float-3 {
          0%, 100% { transform: translateY(0px) scale(1); opacity: 0.5; }
          50% { transform: translateY(-20px) scale(1.1); opacity: 0.9; }
        }
        @keyframes cs-fadein {
          from { opacity: 0; transform: translateY(16px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes cs-pulse-glow {
          0%, 100% { box-shadow: 0 0 40px rgba(37,99,235,0.18), 0 0 80px rgba(0,122,255,0.08); }
          50%       { box-shadow: 0 0 60px rgba(37,99,235,0.28), 0 0 120px rgba(0,122,255,0.14); }
        }
        .cs-login-card {
          animation: cs-fadein 0.5s cubic-bezier(0.22,1,0.36,1) both, cs-pulse-glow 4s ease-in-out infinite;
        }
        .cs-login-input {
          width: 100%;
          background: rgba(255,255,255,0.05);
          border: 1px solid rgba(255,255,255,0.1);
          border-radius: 10px;
          padding: 11px 14px;
          font-size: 15px;
          color: #f5f5f7;
          outline: none;
          transition: border-color 0.15s, box-shadow 0.15s, background 0.15s;
          box-sizing: border-box;
        }
        .cs-login-input::placeholder { color: rgba(255,255,255,0.28); }
        .cs-login-input:focus {
          border-color: rgba(37,99,235,0.7);
          background: rgba(37,99,235,0.06);
          box-shadow: 0 0 0 3px rgba(37,99,235,0.18);
        }
        .cs-sign-in-btn {
          width: 100%;
          padding: 13px;
          font-size: 15px;
          font-weight: 700;
          border: none;
          border-radius: 11px;
          cursor: pointer;
          background: linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%);
          color: #fff;
          letter-spacing: 0.01em;
          transition: opacity 0.15s, transform 0.15s, box-shadow 0.15s;
          box-shadow: 0 4px 20px rgba(37,99,235,0.45);
        }
        .cs-sign-in-btn:hover:not(:disabled) {
          opacity: 0.92;
          transform: translateY(-1px);
          box-shadow: 0 6px 28px rgba(37,99,235,0.55);
        }
        .cs-sign-in-btn:active:not(:disabled) { transform: translateY(0); }
        .cs-sign-in-btn:disabled { opacity: 0.55; cursor: not-allowed; }
        .cs-forgot-btn {
          width: 100%;
          padding: 10px 12px;
          font-size: 13px;
          background: transparent;
          color: rgba(255,255,255,0.38);
          border: 1px solid rgba(255,255,255,0.08);
          border-radius: 10px;
          cursor: pointer;
          transition: color 0.15s, border-color 0.15s;
        }
        .cs-forgot-btn:hover:not(:disabled) {
          color: rgba(255,255,255,0.65);
          border-color: rgba(255,255,255,0.18);
        }
        .cs-orb {
          position: absolute;
          border-radius: 50%;
          filter: blur(1px);
          pointer-events: none;
        }
      `}</style>

      <div style={{
        minHeight: '100dvh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px',
        position: 'relative',
        overflow: 'hidden',
        background: 'radial-gradient(ellipse 120% 80% at 50% -10%, rgba(37,99,235,0.22) 0%, transparent 60%), radial-gradient(ellipse 80% 60% at 80% 80%, rgba(0,122,255,0.10) 0%, transparent 55%), #0a0a0f',
      }}>
        {/* Floating orbs */}
        <div className="cs-orb" style={{ width: 340, height: 340, background: 'radial-gradient(circle, rgba(37,99,235,0.14) 0%, transparent 70%)', top: '-80px', left: '-60px', animation: 'cs-float-1 12s ease-in-out infinite' }} />
        <div className="cs-orb" style={{ width: 260, height: 260, background: 'radial-gradient(circle, rgba(0,122,255,0.10) 0%, transparent 70%)', bottom: '-40px', right: '-40px', animation: 'cs-float-2 15s ease-in-out infinite' }} />
        <div className="cs-orb" style={{ width: 180, height: 180, background: 'radial-gradient(circle, rgba(167,139,250,0.12) 0%, transparent 70%)', top: '60%', left: '15%', animation: 'cs-float-3 9s ease-in-out infinite' }} />

        {/* Grid overlay */}
        <div style={{
          position: 'absolute', inset: 0, pointerEvents: 'none',
          backgroundImage: 'linear-gradient(rgba(255,255,255,0.025) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.025) 1px, transparent 1px)',
          backgroundSize: '52px 52px',
          maskImage: 'radial-gradient(ellipse 80% 80% at 50% 50%, black 30%, transparent 100%)',
          WebkitMaskImage: 'radial-gradient(ellipse 80% 80% at 50% 50%, black 30%, transparent 100%)',
        }} />

        {/* Card */}
        <div className="cs-login-card" style={{
          width: '100%',
          maxWidth: '400px',
          background: 'rgba(18,18,26,0.82)',
          backdropFilter: 'blur(24px) saturate(1.6)',
          WebkitBackdropFilter: 'blur(24px) saturate(1.6)',
          border: '1px solid rgba(255,255,255,0.09)',
          borderRadius: 20,
          padding: '36px 32px',
          position: 'relative',
          zIndex: 1,
        }}>
          {/* Logo area */}
          <div style={{ textAlign: 'center', marginBottom: 32 }}>
            <div style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'linear-gradient(135deg, rgba(37,99,235,0.15) 0%, rgba(18,18,26,0.8) 100%)',
              border: '1px solid rgba(37,99,235,0.22)',
              borderRadius: 18,
              padding: '10px',
              marginBottom: 16,
              boxShadow: '0 4px 24px rgba(37,99,235,0.2)',
            }}>
              <Image src="/logo.png" alt="Beatrice Loving Heart" width={68} height={68} style={{ objectFit: 'contain', display: 'block' }} />
            </div>
            <h1 style={{ fontSize: 26, fontWeight: 800, margin: '0 0 4px', color: '#f5f5f7', letterSpacing: '-0.02em' }}>CaseSync</h1>
            <p style={{ fontWeight: 600, fontSize: 14, margin: '0 0 4px', color: 'rgba(255,255,255,0.55)' }}>
              Beatrice Loving Heart
            </p>
            <p style={{ color: 'rgba(255,255,255,0.28)', margin: 0, fontSize: 12 }}>
              Sign in to your account
            </p>
          </div>

          {/* Form */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 7, color: 'rgba(255,255,255,0.5)', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                Email
              </label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="you@blhnurses.com"
                required
                className="cs-login-input"
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 7, color: 'rgba(255,255,255,0.5)', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                Password
              </label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                className="cs-login-input"
              />
            </div>

            {error && (
              <div style={{ padding: '10px 14px', borderRadius: 9, background: 'rgba(255,69,58,0.12)', border: '1px solid rgba(255,69,58,0.28)', color: '#ff6b6b', fontSize: 13, lineHeight: 1.5 }}>
                {error}
              </div>
            )}
            {message && (
              <div style={{ padding: '10px 14px', borderRadius: 9, background: 'rgba(48,209,88,0.10)', border: '1px solid rgba(48,209,88,0.22)', color: '#7DFF9B', fontSize: 13, lineHeight: 1.5 }}>
                {message}
              </div>
            )}
            {showRecoveryAction && (
              <button type="button" onClick={handleForgotPassword} disabled={resetLoading}
                style={{ width: '100%', padding: '12px', fontSize: 14, borderRadius: 10, border: '1px solid rgba(255,159,10,0.35)', background: 'rgba(255,159,10,0.10)', color: '#ffb340', fontWeight: 700, cursor: 'pointer' }}>
                {resetLoading ? 'Sending reset link…' : 'Send reset link now'}
              </button>
            )}

            <button type="button" onClick={handleLogin as any} disabled={loading} className="cs-sign-in-btn" style={{ marginTop: 4 }}>
              {loading ? 'Signing in…' : 'Sign In'}
            </button>

            <button type="button" onClick={handleForgotPassword} disabled={resetLoading} className="cs-forgot-btn">
              {resetLoading ? 'Sending reset link…' : 'Forgot password?'}
            </button>
          </div>

          {/* Footer */}
          <p style={{ textAlign: 'center', fontSize: 11, color: 'rgba(255,255,255,0.18)', marginTop: 28, marginBottom: 0, letterSpacing: '0.03em' }}>
            🔒 Secure case management portal
          </p>
        </div>
      </div>
    </>
  )
}
