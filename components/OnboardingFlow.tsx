'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

interface Props {
  userId: string
  userEmail: string
  role: string
  skipPasswordStep?: boolean
}

type Step = 1 | 2 | 3 | 4 | 5

const ROLE_LABELS: Record<string, string> = {
  supports_planner: 'Supports Planner',
  team_manager: 'Team Manager',
  supervisor: 'Supervisor',
  it: 'IT',
}

const inputStyle: React.CSSProperties = {
  background: '#1c1c1e',
  border: '1px solid #333336',
  borderRadius: 8,
  color: '#f5f5f7',
  padding: '10px 14px',
  fontSize: 14,
  width: '100%',
  boxSizing: 'border-box',
  outline: 'none',
}

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: 13,
  fontWeight: 500,
  marginBottom: 6,
  color: '#98989d',
}

function ProgressBar({ step, total }: { step: number; total: number }) {
  return (
    <div style={{ marginBottom: 32 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
        <span style={{ fontSize: 12, color: '#98989d' }}>Step {step} of {total}</span>
        <span style={{ fontSize: 12, color: '#98989d' }}>{Math.round((step / total) * 100)}%</span>
      </div>
      <div style={{ height: 4, background: '#2c2c2e', borderRadius: 2, overflow: 'hidden' }}>
        <div
          style={{
            height: '100%',
            width: `${(step / total) * 100}%`,
            background: 'var(--accent)',
            borderRadius: 2,
            transition: 'width 0.3s ease',
          }}
        />
      </div>
      <div style={{ display: 'flex', gap: 0, marginTop: 12 }}>
        {Array.from({ length: total }, (_, i) => (
          <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: i === 0 ? 'flex-start' : i === total - 1 ? 'flex-end' : 'center' }}>
            <div
              style={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                background: i + 1 <= step ? 'var(--accent)' : '#3a3a3c',
                transition: 'background 0.3s',
              }}
            />
          </div>
        ))}
      </div>
    </div>
  )
}

function Toggle({ label, description, checked, onChange }: {
  label: string
  description?: string
  checked: boolean
  onChange: (val: boolean) => void
}) {
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '14px 0',
        borderBottom: '1px solid #2c2c2e',
        gap: 16,
      }}
    >
      <div>
        <div style={{ fontSize: 14, fontWeight: 500, color: '#f5f5f7' }}>{label}</div>
        {description && <div style={{ fontSize: 12, color: '#98989d', marginTop: 2 }}>{description}</div>}
      </div>
      <button
        type="button"
        onClick={() => onChange(!checked)}
        style={{
          position: 'relative',
          width: 44,
          height: 26,
          borderRadius: 13,
          background: checked ? 'var(--accent)' : '#3a3a3c',
          border: 'none',
          cursor: 'pointer',
          flexShrink: 0,
          transition: 'background 0.2s',
          padding: 0,
        }}
        aria-label={label}
        role="switch"
        aria-checked={checked}
      >
        <div
          style={{
            position: 'absolute',
            top: 3,
            left: checked ? 21 : 3,
            width: 20,
            height: 20,
            borderRadius: '50%',
            background: 'white',
            transition: 'left 0.2s',
            boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
          }}
        />
      </button>
    </div>
  )
}

function deriveNameFromEmail(email: string) {
  const local = email.split('@')[0] || ''
  const base = local.split('+')[0]
  return base
    .split(/[._-]+/)
    .filter(Boolean)
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

export default function OnboardingFlow({ userId, userEmail, role, skipPasswordStep = false }: Props) {
  const router = useRouter()
  const supabase = useMemo(() => createClient(), [])
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [step, setStep] = useState<Step>(skipPasswordStep ? 2 : 1)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loadingProfile, setLoadingProfile] = useState(true)

  // Step 1: Password setup
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')

  // Step 2: Profile
  const [fullName, setFullName] = useState('')
  const [jobTitle, setJobTitle] = useState('')
  const [avatarFile, setAvatarFile] = useState<File | null>(null)
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null)

  // Step 3: Notifications
  const [deadline7day, setDeadline7day] = useState(true)
  const [clientAssigned, setClientAssigned] = useState(true)
  const [dailyDigest, setDailyDigest] = useState(false)

  const displayRole = ROLE_LABELS[role] ?? role
  const firstName = fullName.trim().split(' ')[0] || deriveNameFromEmail(userEmail) || 'there'

  useEffect(() => {
    let active = true

    async function loadProfile() {
      const { data: profile } = await supabase
        .from('profiles')
        .select('full_name, job_title, avatar_url')
        .eq('id', userId)
        .maybeSingle()

      if (!active) return

      const derivedName = deriveNameFromEmail(userEmail)
      setFullName(profile?.full_name || derivedName)
      setJobTitle(profile?.job_title || '')
      setAvatarPreview(profile?.avatar_url || null)
      setLoadingProfile(false)
    }

    loadProfile()
    return () => {
      active = false
    }
  }, [supabase, userEmail, userId])

  function handleAvatarChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setAvatarFile(file)
    const reader = new FileReader()
    reader.onload = ev => setAvatarPreview(ev.target?.result as string)
    reader.readAsDataURL(file)
  }

  async function handleStep1Next() {
    if (password.length < 8) {
      setError('Password must be at least 8 characters.')
      return
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.')
      return
    }

    setError(null)
    setSaving(true)
    const { error: passwordError } = await supabase.auth.updateUser({ password })
    setSaving(false)

    if (passwordError) {
      setError(passwordError.message)
      return
    }

    setStep(2)
  }

  async function handleStep2Next() {
    if (!fullName.trim()) {
      setError('Full name is required.')
      return
    }

    setError(null)
    setSaving(true)

    let avatarUrl: string | null = avatarPreview && !avatarPreview.startsWith('data:') ? avatarPreview : null

    if (avatarFile) {
      try {
        const ext = avatarFile.name.split('.').pop()
        const path = `${userId}/avatar.${ext}`
        const { error: uploadError } = await supabase.storage
          .from('avatars')
          .upload(path, avatarFile, { upsert: true })

        if (!uploadError) {
          const { data: urlData } = supabase.storage.from('avatars').getPublicUrl(path)
          avatarUrl = urlData.publicUrl
        }
      } catch (err) {
        console.warn('Avatar upload skipped during onboarding:', err)
      }
    }

    const { error: profileError } = await supabase.from('profiles').update({
      full_name: fullName.trim(),
      job_title: jobTitle.trim() || null,
      ...(avatarUrl ? { avatar_url: avatarUrl } : {}),
    }).eq('id', userId).select('id').single()

    setSaving(false)
    if (profileError) {
      setError(profileError.message)
      return
    }

    setStep(3)
  }

  async function handleStep3Next() {
    setError(null)
    setSaving(true)

    const { error: prefError } = await supabase.from('notification_preferences').upsert({
      user_id: userId,
      deadline_7day: deadline7day,
      client_assigned: clientAssigned,
      daily_digest: dailyDigest,
      updated_at: new Date().toISOString(),
    })

    setSaving(false)
    if (prefError) {
      setError(prefError.message)
      return
    }

    setStep(4)
  }

  async function handleFinish() {
    setSaving(true)
    await supabase.from('profiles').update({ onboarded: true }).eq('id', userId)
    setSaving(false)
    router.push('/dashboard')
    router.refresh()
  }

  return (
    <div
      style={{
        minHeight: '100dvh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#0f0f11',
        padding: '24px',
      }}
    >
      <div style={{ width: '100%', maxWidth: 500 }}>
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 56,
              height: 56,
              borderRadius: 16,
              background: 'linear-gradient(135deg, rgba(0,122,255,1), rgba(88,86,214,0.95))',
              marginBottom: 14,
              fontSize: 25,
              boxShadow: '0 10px 28px rgba(0,122,255,0.22)',
            }}
          >
            ✨
          </div>
          <div style={{ fontSize: 13, color: '#98989d', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
            CaseSync Setup
          </div>
        </div>

        <div
          style={{
            background: '#1c1c1e',
            borderRadius: 18,
            border: '1px solid #2c2c2e',
            padding: '32px 28px',
            boxShadow: '0 18px 48px rgba(0,0,0,0.28)',
          }}
        >
          {step === 1 && (
            <div>
              <ProgressBar step={1} total={5} />
              <div style={{ textAlign: 'center', marginBottom: 32 }}>
                <div style={{ fontSize: 32, marginBottom: 16 }}>🔐</div>
                <h1 style={{ fontSize: 24, fontWeight: 700, margin: '0 0 12px' }}>Create your password</h1>
                <p style={{ color: '#98989d', fontSize: 14, lineHeight: 1.6, margin: 0 }}>
                  You’re almost in. Set a secure password to activate your CaseSync account and continue setup.
                </p>
              </div>

              {error && (
                <div style={{ padding: '10px 14px', borderRadius: 8, background: 'rgba(255,69,58,0.15)', border: '1px solid rgba(255,69,58,0.3)', color: '#ff453a', fontSize: 13, marginBottom: 16 }}>
                  {error}
                </div>
              )}

              <div style={{ marginBottom: 16 }}>
                <label style={labelStyle}>New Password</label>
                <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="At least 8 characters" style={inputStyle} autoFocus />
              </div>

              <div style={{ marginBottom: 28 }}>
                <label style={labelStyle}>Confirm Password</label>
                <input type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} placeholder="Re-enter password" style={inputStyle} />
              </div>

              <button className="btn-primary" style={{ width: '100%', fontSize: 15 }} onClick={handleStep1Next} disabled={saving}>
                {saving ? 'Saving…' : 'Continue →'}
              </button>
            </div>
          )}

          {step === 2 && (
            <div>
              <ProgressBar step={2} total={5} />

              <div style={{ marginBottom: 24 }}>
                <div style={{ fontSize: 12, color: '#8ab4ff', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>
                  Welcome
                </div>
                <h2 style={{ fontSize: 24, fontWeight: 700, margin: '0 0 8px' }}>Let’s get your profile ready</h2>
                <p style={{ color: '#98989d', fontSize: 14, lineHeight: 1.6, margin: 0 }}>
                  This helps your team recognize you quickly and makes CaseSync feel like yours from the start.
                </p>
              </div>

              <div style={{
                background: 'linear-gradient(135deg, rgba(0,122,255,0.12), rgba(88,86,214,0.08))',
                border: '1px solid rgba(0,122,255,0.18)',
                borderRadius: 12,
                padding: 14,
                marginBottom: 22,
              }}>
                <div style={{ fontSize: 12, color: '#8ab4ff', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>
                  Account Preview
                </div>
                <div style={{ fontSize: 15, fontWeight: 600, color: '#f5f5f7' }}>{displayRole}</div>
                <div style={{ fontSize: 13, color: '#b0b0b8', marginTop: 4 }}>{userEmail}</div>
              </div>

              {error && (
                <div style={{ padding: '10px 14px', borderRadius: 8, background: 'rgba(255,69,58,0.15)', border: '1px solid rgba(255,69,58,0.3)', color: '#ff453a', fontSize: 13, marginBottom: 16 }}>
                  {error}
                </div>
              )}

              <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 14 }}>
                <div style={{ position: 'relative' }}>
                  <div
                    style={{
                      width: 92,
                      height: 92,
                      borderRadius: '50%',
                      background: '#2c2c2e',
                      border: '2px solid #3a3a3c',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      overflow: 'hidden',
                      cursor: 'pointer',
                      boxShadow: avatarPreview ? '0 10px 22px rgba(0,0,0,0.24)' : 'none',
                    }}
                    onClick={() => fileInputRef.current?.click()}
                  >
                    {avatarPreview ? (
                      <img src={avatarPreview} alt="Avatar" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    ) : (
                      <span style={{ fontSize: 36 }}>👤</span>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    style={{
                      position: 'absolute',
                      bottom: 0,
                      right: 0,
                      minWidth: 30,
                      height: 30,
                      borderRadius: '50%',
                      background: 'var(--accent)',
                      border: '2px solid #1c1c1e',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: 13,
                      color: 'white',
                      padding: 0,
                    }}
                    aria-label="Upload profile photo"
                  >
                    +
                  </button>
                  <input ref={fileInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleAvatarChange} />
                </div>
              </div>

              <div style={{ textAlign: 'center', fontSize: 12, color: '#98989d', marginBottom: 22, lineHeight: 1.6 }}>
                {avatarPreview ? 'Looking good. You can change this anytime.' : 'Add a profile photo if you want — optional, but it helps make the app feel more personal.'}
              </div>

              {loadingProfile ? (
                <div style={{ color: '#98989d', fontSize: 13, marginBottom: 18 }}>Loading your profile…</div>
              ) : null}

              <div style={{ marginBottom: 16 }}>
                <label style={labelStyle}>Full Name <span style={{ color: '#ff453a' }}>*</span></label>
                <input type="text" value={fullName} onChange={e => setFullName(e.target.value)} placeholder="Jane Smith" style={inputStyle} autoFocus />
              </div>

              <div style={{ marginBottom: 24 }}>
                <label style={labelStyle}>Job Title <span style={{ color: '#98989d' }}>(optional)</span></label>
                <input type="text" value={jobTitle} onChange={e => setJobTitle(e.target.value)} placeholder={displayRole} style={inputStyle} />
              </div>

              <div style={{ display: 'flex', gap: 10 }}>
                {!skipPasswordStep && (
                  <button className="btn-secondary" style={{ flex: '0 0 auto', minWidth: 80, fontSize: 14 }} onClick={() => setStep(1)} disabled={saving}>
                    ← Back
                  </button>
                )}
                <button className="btn-primary" style={{ flex: 1, fontSize: 15 }} onClick={handleStep2Next} disabled={saving || loadingProfile}>
                  {saving ? 'Saving…' : 'Continue →'}
                </button>
              </div>
            </div>
          )}

          {step === 3 && (
            <div>
              <ProgressBar step={3} total={5} />
              <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 6 }}>Stay in the loop</h2>
              <p style={{ color: '#98989d', fontSize: 13, marginBottom: 24 }}>
                Pick the updates you want first. You can change these anytime in settings.
              </p>

              {error && (
                <div style={{ padding: '10px 14px', borderRadius: 8, background: 'rgba(255,69,58,0.15)', border: '1px solid rgba(255,69,58,0.3)', color: '#ff453a', fontSize: 13, marginBottom: 16 }}>
                  {error}
                </div>
              )}

              <div style={{ marginBottom: 28 }}>
                <Toggle label="Deadline reminders" description="Email me when something is due within 7 days" checked={deadline7day} onChange={setDeadline7day} />
                <Toggle label="Client assignments" description="Email me when a client is assigned to me" checked={clientAssigned} onChange={setClientAssigned} />
                <Toggle label="Daily digest" description="Send me a quick caseload summary each day" checked={dailyDigest} onChange={setDailyDigest} />
              </div>

              <div style={{ display: 'flex', gap: 10 }}>
                <button className="btn-secondary" style={{ flex: '0 0 auto', minWidth: 80, fontSize: 14 }} onClick={() => setStep(2)} disabled={saving}>
                  ← Back
                </button>
                <button className="btn-primary" style={{ flex: 1, fontSize: 15 }} onClick={handleStep3Next} disabled={saving}>
                  {saving ? 'Saving…' : 'Continue →'}
                </button>
              </div>
            </div>
          )}

          {step === 4 && (
            <div>
              <ProgressBar step={5} total={5} />
              <div style={{ textAlign: 'center', marginBottom: 28 }}>
                <div style={{ fontSize: 48, marginBottom: 16 }}>🎉</div>
                <h2 style={{ fontSize: 26, fontWeight: 700, marginBottom: 10 }}>You’re all set, {firstName}</h2>
                <p style={{ color: '#98989d', fontSize: 14, lineHeight: 1.7, margin: 0 }}>
                  Your CaseSync account is ready. Next up: your dashboard, your clients, and a cleaner view of what needs attention this week.
                </p>
              </div>

              <div style={{ background: '#2c2c2e', borderRadius: 12, padding: '16px', marginBottom: 16 }}>
                <div style={{ fontSize: 12, color: '#98989d', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>Your Role</div>
                <div style={{ fontSize: 16, fontWeight: 600, color: '#f5f5f7' }}>{displayRole}</div>
              </div>

              <div style={{ background: 'rgba(0,122,255,0.08)', border: '1px solid rgba(0,122,255,0.18)', borderRadius: 12, padding: '14px 16px', marginBottom: 24 }}>
                <div style={{ fontSize: 13, color: '#8ab4ff', fontWeight: 700, marginBottom: 6 }}>What you’ll see next</div>
                <div style={{ fontSize: 13, color: '#d1d5db', lineHeight: 1.7 }}>
                  A dashboard summary, upcoming deadlines, and the clients that need attention first.
                </div>
              </div>

              <button className="btn-primary" style={{ width: '100%', fontSize: 15 }} onClick={handleFinish} disabled={saving}>
                {saving ? 'Loading…' : 'Go to Dashboard →'}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
