'use client'

import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

interface Props {
  userId: string
  userEmail: string
  role: string
}

type Step = 1 | 2 | 3 | 4

const ROLE_LABELS: Record<string, string> = {
  supports_planner: 'Supports Planner',
  team_manager: 'Team Manager',
  supervisor: 'Supervisor',
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
        <div style={{
          height: '100%',
          width: `${(step / total) * 100}%`,
          background: 'var(--accent)',
          borderRadius: 2,
          transition: 'width 0.3s ease',
        }} />
      </div>
      <div style={{ display: 'flex', gap: 0, marginTop: 12 }}>
        {Array.from({ length: total }, (_, i) => (
          <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: i === 0 ? 'flex-start' : i === total - 1 ? 'flex-end' : 'center' }}>
            <div style={{
              width: 8,
              height: 8,
              borderRadius: '50%',
              background: i + 1 <= step ? 'var(--accent)' : '#3a3a3c',
              transition: 'background 0.3s',
            }} />
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
    <div style={{
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      padding: '14px 0',
      borderBottom: '1px solid #2c2c2e',
      gap: 16,
    }}>
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
        <div style={{
          position: 'absolute',
          top: 3,
          left: checked ? 21 : 3,
          width: 20,
          height: 20,
          borderRadius: '50%',
          background: 'white',
          transition: 'left 0.2s',
          boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
        }} />
      </button>
    </div>
  )
}

export default function OnboardingFlow({ userId, userEmail: _userEmail, role }: Props) {
  const router = useRouter()
  const supabase = createClient()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [step, setStep] = useState<Step>(1)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Step 2: Profile
  const [fullName, setFullName] = useState('')
  const [jobTitle, setJobTitle] = useState('')
  const [avatarFile, setAvatarFile] = useState<File | null>(null)
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null)

  // Step 3: Notifications
  const [deadline7day, setDeadline7day] = useState(true)
  const [clientAssigned, setClientAssigned] = useState(true)
  const [dailyDigest, setDailyDigest] = useState(false)

  function handleAvatarChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setAvatarFile(file)
    const reader = new FileReader()
    reader.onload = ev => setAvatarPreview(ev.target?.result as string)
    reader.readAsDataURL(file)
  }

  async function handleStep2Next() {
    if (!fullName.trim()) {
      setError('Full name is required.')
      return
    }
    setError(null)
    setSaving(true)

    let avatarUrl: string | null = null

    // Upload avatar if provided
    if (avatarFile) {
      const ext = avatarFile.name.split('.').pop()
      const path = `${userId}/avatar.${ext}`
      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(path, avatarFile, { upsert: true })

      if (!uploadError) {
        const { data: urlData } = supabase.storage.from('avatars').getPublicUrl(path)
        avatarUrl = urlData.publicUrl
      }
    }

    // Update profile
    const { error: profileError } = await supabase.from('profiles').update({
      full_name: fullName.trim(),
      job_title: jobTitle.trim() || null,
      ...(avatarUrl ? { avatar_url: avatarUrl } : {}),
    }).eq('id', userId)

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
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: '#0f0f11',
      padding: '24px',
    }}>
      <div style={{ width: '100%', maxWidth: 480 }}>
        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 52,
            height: 52,
            borderRadius: 14,
            background: 'var(--accent)',
            marginBottom: 12,
            fontSize: 24,
          }}>
            📋
          </div>
          <div style={{ fontSize: 13, color: '#98989d', fontWeight: 500, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
            CaseSync
          </div>
        </div>

        <div style={{
          background: '#1c1c1e',
          borderRadius: 16,
          border: '1px solid #2c2c2e',
          padding: '32px 28px',
        }}>
          {/* Step 1: Welcome */}
          {step === 1 && (
            <div>
              <ProgressBar step={1} total={4} />
              <div style={{ textAlign: 'center', marginBottom: 32 }}>
                <div style={{ fontSize: 32, marginBottom: 16 }}>👋</div>
                <h1 style={{ fontSize: 24, fontWeight: 700, margin: '0 0 12px' }}>Welcome to CaseSync</h1>
                <p style={{ color: '#98989d', fontSize: 14, lineHeight: 1.6, margin: 0 }}>
                  Your secure case management portal for tracking client plans, deadlines, and documentation.
                  Let's get your account set up in just a few steps.
                </p>
              </div>
              <div style={{
                background: '#2c2c2e',
                borderRadius: 10,
                padding: '16px',
                marginBottom: 28,
                display: 'flex',
                flexDirection: 'column',
                gap: 10,
              }}>
                {[
                  { icon: '👤', text: 'Set up your profile' },
                  { icon: '🔔', text: 'Configure notification preferences' },
                  { icon: '🚀', text: 'Access your dashboard' },
                ].map(item => (
                  <div key={item.text} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <span style={{ fontSize: 18 }}>{item.icon}</span>
                    <span style={{ fontSize: 13, color: '#f5f5f7' }}>{item.text}</span>
                  </div>
                ))}
              </div>
              <button
                className="btn-primary"
                style={{ width: '100%', fontSize: 15 }}
                onClick={() => setStep(2)}
              >
                Get Started →
              </button>
            </div>
          )}

          {/* Step 2: Profile */}
          {step === 2 && (
            <div>
              <ProgressBar step={2} total={4} />
              <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 6 }}>Your Profile</h2>
              <p style={{ color: '#98989d', fontSize: 13, marginBottom: 24 }}>
                Tell us a bit about yourself.
              </p>

              {error && (
                <div style={{
                  padding: '10px 14px',
                  borderRadius: 8,
                  background: 'rgba(255,69,58,0.15)',
                  border: '1px solid rgba(255,69,58,0.3)',
                  color: '#ff453a',
                  fontSize: 13,
                  marginBottom: 16,
                }}>
                  {error}
                </div>
              )}

              {/* Avatar */}
              <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 24 }}>
                <div style={{ position: 'relative' }}>
                  <div
                    style={{
                      width: 80,
                      height: 80,
                      borderRadius: '50%',
                      background: '#2c2c2e',
                      border: '2px solid #3a3a3c',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      overflow: 'hidden',
                      cursor: 'pointer',
                    }}
                    onClick={() => fileInputRef.current?.click()}
                  >
                    {avatarPreview ? (
                      <img src={avatarPreview} alt="Avatar" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    ) : (
                      <span style={{ fontSize: 32 }}>👤</span>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    style={{
                      position: 'absolute',
                      bottom: 0,
                      right: 0,
                      width: 26,
                      height: 26,
                      borderRadius: '50%',
                      background: 'var(--accent)',
                      border: '2px solid #1c1c1e',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: 12,
                      color: 'white',
                    }}
                  >
                    +
                  </button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    style={{ display: 'none' }}
                    onChange={handleAvatarChange}
                  />
                </div>
              </div>
              <div style={{ textAlign: 'center', fontSize: 12, color: '#98989d', marginBottom: 24 }}>
                Click to upload a profile photo (optional)
              </div>

              <div style={{ marginBottom: 16 }}>
                <label style={labelStyle}>Full Name <span style={{ color: '#ff453a' }}>*</span></label>
                <input
                  type="text"
                  value={fullName}
                  onChange={e => setFullName(e.target.value)}
                  placeholder="Jane Smith"
                  style={inputStyle}
                  autoFocus
                />
              </div>

              <div style={{ marginBottom: 28 }}>
                <label style={labelStyle}>Job Title <span style={{ color: '#98989d' }}>(optional)</span></label>
                <input
                  type="text"
                  value={jobTitle}
                  onChange={e => setJobTitle(e.target.value)}
                  placeholder="e.g. Supports Planner II"
                  style={inputStyle}
                />
              </div>

              <button
                className="btn-primary"
                style={{ width: '100%', fontSize: 15 }}
                onClick={handleStep2Next}
                disabled={saving}
              >
                {saving ? 'Saving…' : 'Next →'}
              </button>
            </div>
          )}

          {/* Step 3: Notifications */}
          {step === 3 && (
            <div>
              <ProgressBar step={3} total={4} />
              <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 6 }}>Notifications</h2>
              <p style={{ color: '#98989d', fontSize: 13, marginBottom: 24 }}>
                Choose how you'd like to be notified about updates.
              </p>

              {error && (
                <div style={{
                  padding: '10px 14px',
                  borderRadius: 8,
                  background: 'rgba(255,69,58,0.15)',
                  border: '1px solid rgba(255,69,58,0.3)',
                  color: '#ff453a',
                  fontSize: 13,
                  marginBottom: 16,
                }}>
                  {error}
                </div>
              )}

              <div style={{ marginBottom: 28 }}>
                <Toggle
                  label="Deadline reminders"
                  description="Email me when a deadline is within 7 days"
                  checked={deadline7day}
                  onChange={setDeadline7day}
                />
                <Toggle
                  label="Client assignments"
                  description="Email me when a client is assigned to me"
                  checked={clientAssigned}
                  onChange={setClientAssigned}
                />
                <Toggle
                  label="Daily digest"
                  description="Receive a daily summary of your caseload"
                  checked={dailyDigest}
                  onChange={setDailyDigest}
                />
              </div>

              <div style={{ display: 'flex', gap: 10 }}>
                <button
                  className="btn-secondary"
                  style={{ flex: '0 0 auto', minWidth: 80, fontSize: 14 }}
                  onClick={() => setStep(2)}
                  disabled={saving}
                >
                  ← Back
                </button>
                <button
                  className="btn-primary"
                  style={{ flex: 1, fontSize: 15 }}
                  onClick={handleStep3Next}
                  disabled={saving}
                >
                  {saving ? 'Saving…' : 'Next →'}
                </button>
              </div>
            </div>
          )}

          {/* Step 4: Done */}
          {step === 4 && (
            <div>
              <ProgressBar step={4} total={4} />
              <div style={{ textAlign: 'center', marginBottom: 32 }}>
                <div style={{ fontSize: 48, marginBottom: 16 }}>🎉</div>
                <h2 style={{ fontSize: 24, fontWeight: 700, marginBottom: 12 }}>You're all set!</h2>
                <p style={{ color: '#98989d', fontSize: 14, lineHeight: 1.6, margin: 0 }}>
                  Your account is ready. Welcome to the team!
                </p>
              </div>

              <div style={{
                background: '#2c2c2e',
                borderRadius: 10,
                padding: '16px',
                marginBottom: 28,
              }}>
                <div style={{ fontSize: 12, color: '#98989d', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>Your Role</div>
                <div style={{ fontSize: 16, fontWeight: 600, color: '#f5f5f7' }}>
                  {ROLE_LABELS[role] ?? role}
                </div>
              </div>

              <button
                className="btn-primary"
                style={{ width: '100%', fontSize: 15 }}
                onClick={handleFinish}
                disabled={saving}
              >
                {saving ? 'Loading…' : 'Go to Dashboard →'}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
