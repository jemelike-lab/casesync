'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import Image from 'next/image'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [resetLoading, setResetLoading] = useState(false)
  const [showRecoveryAction, setShowRecoveryAction] = useState(false)
  const router = useRouter()
  const supabase = useMemo(() => {
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY) {
      return null
    }
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

      const { error: sessionError } = await supabase.auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken,
      })

      if (sessionError) {
        if (mounted) setError(sessionError.message)
        return
      }

      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { data: profile } = await supabase
        .from('profiles')
        .select('onboarded')
        .eq('id', user.id)
        .single()

      if (typeof window !== 'undefined') {
        window.history.replaceState({}, document.title, '/login')
      }

      if (type === 'recovery') {
        router.push('/reset-password')
      } else if (profile && profile.onboarded === false) {
        router.push('/onboarding')
      } else if (type === 'invite' || type === 'magiclink') {
        router.push('/w/dashboard')
      }
      router.refresh()
    }

    handleInviteLanding()
    return () => { mounted = false }
  }, [router, supabase])

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setMessage(null)
    setShowRecoveryAction(false)
    setShowRecoveryAction(false)
    setLoading(true)

    if (!supabase) {
      setError('CaseSync is temporarily unavailable. Missing client configuration.')
      setLoading(false)
      return
    }

    const normalizedEmail = email.trim().toLowerCase()

    // Check rate limit before attempting login
    try {
      const rateLimitRes = await fetch('/api/auth/rate-limit', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: normalizedEmail }),
      })
      if (rateLimitRes.status === 429) {
        const data = await rateLimitRes.json()
        const minutes = Math.ceil((data.retryAfter ?? 900) / 60)
        setError(`Too many login attempts. Please try again in ${minutes} minute${minutes !== 1 ? 's' : ''}.`)
        setLoading(false)
        return
      }
    } catch {
      // If rate limit check fails, proceed with login (fail open)
    }

    const { data, error } = await supabase.auth.signInWithPassword({ email: normalizedEmail, password })

    if (error) {
      const msg = (error.message || '').toLowerCase()
      if (msg.includes('email rate limit exceeded')) {
        setError('Too many sign-in attempts for this email. Use the recovery action below for a fresh reset link instead of retrying sign-in.')
        setShowRecoveryAction(true)
      } else {
        setError(error.message)
      }
      setLoading(false)
      return
    }

    if (data.user) {
      if (data.user.user_metadata?.disabled) {
        await supabase.auth.signOut()
        setError('This account has been removed from active access. Contact an administrator if you think this is a mistake.')
        setLoading(false)
        return
      }

      const { data: profile } = await supabase
        .from('profiles')
        .select('onboarded')
        .eq('id', data.user.id)
        .single()

      if (profile && profile.onboarded === false) {
        router.push('/onboarding')
      } else {
        router.push('/w/dashboard')
      }
      router.refresh()
    }
  }

  async function handleForgotPassword() {
    if (!supabase) {
      setError('CaseSync is temporarily unavailable. Missing client configuration.')
      return
    }

    const normalizedEmail = email.trim().toLowerCase()
    setError(null)
    setMessage(null)
    setShowRecoveryAction(false)

    if (!normalizedEmail) {
      setError('Enter your email address first, then tap Forgot password.')
      return
    }

    setResetLoading(true)
    const { error } = await supabase.auth.resetPasswordForEmail(normalizedEmail, {
      redirectTo: `${window.location.origin}/reset-password`,
    })
    setResetLoading(false)

    if (error) {
      setError(error.message)
      return
    }

    setMessage('Password reset email sent. Check your inbox for the secure reset link.')
  }

  return (
    <div style={{
      minHeight: '100dvh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'var(--bg)',
      padding: '24px',
    }}>
      <div style={{ width: '100%', maxWidth: '380px' }}>
        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: '40px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <div style={{ 
            background: '#1a1108', 
            borderRadius: 16, 
            padding: 8, 
            display: 'inline-block',
            marginBottom: 12
          }}>
            <Image
              src="/logo.png"
              alt="Beatrice Loving Heart"
              width={120}
              height={120}
              style={{ objectFit: 'contain', display: 'block' }}
            />
          </div>
          <h1 style={{ fontSize: 28, fontWeight: 700, margin: 0 }}>CaseSync</h1>
          <p style={{ fontWeight: 700, fontSize: 16, marginTop: 6, color: 'var(--text)' }}>
            Beatrice Loving Heart
          </p>
          <p style={{ color: 'var(--text-secondary)', marginTop: 2, fontSize: 13 }}>
            Sign in to your account
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 500, marginBottom: 6, color: 'var(--text-secondary)' }}>
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="you@example.com"
              required
              style={{ width: '100%', fontSize: 15 }}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 500, marginBottom: 6, color: 'var(--text-secondary)' }}>
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              style={{ width: '100%', fontSize: 15 }}
            />
          </div>

          {error && (
            <div style={{
              padding: '10px 14px',
              borderRadius: 8,
              background: 'rgba(255, 69, 58, 0.15)',
              border: '1px solid rgba(255, 69, 58, 0.3)',
              color: 'var(--red)',
              fontSize: 13,
            }}>
              {error}
            </div>
          )}

          {message && (
            <div style={{
              padding: '10px 14px',
              borderRadius: 8,
              background: 'rgba(48, 209, 88, 0.14)',
              border: '1px solid rgba(48, 209, 88, 0.25)',
              color: '#7DFF9B',
              fontSize: 13,
            }}>
              {message}
            </div>
          )}

          {showRecoveryAction && (
            <button
              type="button"
              onClick={handleForgotPassword}
              disabled={resetLoading}
              style={{
                width: '100%',
                padding: '12px',
                fontSize: 14,
                borderRadius: 10,
                border: '1px solid rgba(255, 159, 10, 0.35)',
                background: 'rgba(255, 159, 10, 0.10)',
                color: '#ffb340',
                fontWeight: 700,
              }}
            >
              {resetLoading ? 'Sending reset link…' : 'Send reset link now'}
            </button>
          )}

          <button
            type="submit"
            className="btn-primary"
            disabled={loading}
            style={{ width: '100%', padding: '12px', fontSize: 15, marginTop: 4 }}
          >
            {loading ? 'Signing in…' : 'Sign In'}
          </button>

          <button
            type="button"
            onClick={handleForgotPassword}
            disabled={resetLoading}
            style={{
              width: '100%',
              padding: '10px 12px',
              fontSize: 14,
              marginTop: 2,
              background: 'transparent',
              color: 'var(--text-secondary)',
              border: '1px solid #2c2c2e',
              borderRadius: 10,
              cursor: 'pointer',
            }}
          >
            {resetLoading ? 'Sending reset link…' : 'Forgot password?'}
          </button>
        </form>

        <p style={{ textAlign: 'center', fontSize: 12, color: 'var(--text-secondary)', marginTop: 32 }}>
          Secure case management portal
        </p>
      </div>
    </div>
  )
}
