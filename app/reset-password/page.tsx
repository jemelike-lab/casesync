'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { createClient } from '@/lib/supabase/client'

export default function ResetPasswordPage() {
  const supabase = useMemo(() => {
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY) {
      return null
    }
    return createClient()
  }, [])
  const router = useRouter()

  const [ready, setReady] = useState(false)
  const [validSession, setValidSession] = useState(false)
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    let active = true

    async function bootstrapRecoverySession() {
      const hash = typeof window !== 'undefined' ? window.location.hash : ''
      const params = new URLSearchParams(hash.startsWith('#') ? hash.slice(1) : hash)
      const accessToken = params.get('access_token')
      const refreshToken = params.get('refresh_token')
      const type = params.get('type')

      if (!supabase) {
        if (active) {
          setError('CaseSync is temporarily unavailable. Missing client configuration.')
          setReady(true)
        }
        return
      }

      if (accessToken && refreshToken && type === 'recovery') {
        const { error: sessionError } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        })

        if (sessionError) {
          if (active) {
            setError(sessionError.message)
            setReady(true)
          }
          return
        }

        if (typeof window !== 'undefined') {
          window.history.replaceState({}, document.title, '/reset-password')
        }

        if (active) {
          setValidSession(true)
          setReady(true)
        }
        return
      }

      const { data: { session } } = await supabase.auth.getSession()
      if (active) {
        setValidSession(Boolean(session))
        setReady(true)
      }
    }

    bootstrapRecoverySession()
    return () => { active = false }
  }, [supabase])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!supabase) {
      setError('CaseSync is temporarily unavailable. Missing client configuration.')
      return
    }
    setError(null)
    setMessage(null)

    if (password.length < 8) {
      setError('Password must be at least 8 characters.')
      return
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match.')
      return
    }

    setLoading(true)
    const { error: updateError } = await supabase.auth.updateUser({ password })
    setLoading(false)

    if (updateError) {
      setError(updateError.message)
      return
    }

    setMessage('Password updated. Redirecting to dashboard…')
    setTimeout(() => {
      router.push('/dashboard')
      router.refresh()
    }, 900)
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
      <div style={{ width: '100%', maxWidth: '400px' }}>
        <div style={{ textAlign: 'center', marginBottom: '40px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <div style={{ background: '#1a1108', borderRadius: 16, padding: 8, display: 'inline-block', marginBottom: 12 }}>
            <Image src="/logo.png" alt="Beatrice Loving Heart" width={120} height={120} style={{ objectFit: 'contain', display: 'block' }} />
          </div>
          <h1 style={{ fontSize: 28, fontWeight: 700, margin: 0 }}>Reset Password</h1>
          <p style={{ color: 'var(--text-secondary)', marginTop: 8, fontSize: 13 }}>
            Choose a new password for your CaseSync account.
          </p>
        </div>

        {!ready ? (
          <div className="card" style={{ padding: 24, textAlign: 'center', color: 'var(--text-secondary)' }}>
            Checking your reset link…
          </div>
        ) : !validSession ? (
          <div className="card" style={{ padding: 24 }}>
            <div style={{
              padding: '10px 14px',
              borderRadius: 8,
              background: error ? 'rgba(255, 69, 58, 0.15)' : 'rgba(255, 159, 10, 0.12)',
              border: error ? '1px solid rgba(255, 69, 58, 0.3)' : '1px solid rgba(255, 159, 10, 0.25)',
              color: error ? 'var(--red)' : '#ffb340',
              fontSize: 13,
              lineHeight: 1.6,
            }}>
              {error ?? 'This reset link is missing, expired, or already used. Go back to login and request a fresh password reset email.'}
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="card" style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 500, marginBottom: 6, color: 'var(--text-secondary)' }}>
                New password
              </label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="At least 8 characters"
                required
                minLength={8}
                style={{ width: '100%', fontSize: 15 }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 500, marginBottom: 6, color: 'var(--text-secondary)' }}>
                Confirm password
              </label>
              <input
                type="password"
                value={confirmPassword}
                onChange={e => setConfirmPassword(e.target.value)}
                placeholder="Re-enter password"
                required
                minLength={8}
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

            <button type="submit" className="btn-primary" disabled={loading} style={{ width: '100%', padding: '12px', fontSize: 15, marginTop: 4 }}>
              {loading ? 'Updating…' : 'Update Password'}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
