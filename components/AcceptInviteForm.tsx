'use client'

import { useActionState } from 'react'
import Image from 'next/image'
import { acceptInvite } from '@/app/actions/invite'
import { UserInvite } from '@/lib/types'

const initialState: { error?: string } = {}

export default function AcceptInviteForm({ invite, token }: { invite: UserInvite; token: string }) {
  const [state, formAction, pending] = useActionState(acceptInvite, initialState)
  const roleLabel = invite.role.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())

  return (
    <div style={{
      minHeight: '100dvh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'var(--bg)',
      padding: '24px',
    }}>
      <div style={{ width: '100%', maxWidth: '440px' }}>
        <div style={{ textAlign: 'center', marginBottom: '32px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <div style={{ background: '#1a1108', borderRadius: 16, padding: 8, display: 'inline-block', marginBottom: 12 }}>
            <Image src="/logo.png" alt="Beatrice Loving Heart" width={120} height={120} style={{ objectFit: 'contain', display: 'block' }} />
          </div>
          <h1 style={{ fontSize: 28, fontWeight: 700, margin: 0 }}>Welcome to CaseSync</h1>
          <p style={{ color: 'var(--text-secondary)', marginTop: 8, fontSize: 14, lineHeight: 1.6 }}>
            Set your password to activate your account, then we’ll walk you through onboarding.
          </p>
        </div>

        <div className="card" style={{ padding: 24 }}>
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 12, color: '#8ab4ff', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>
              Invitation Details
            </div>
            <div style={{ display: 'grid', gap: 10 }}>
              <div>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Name</div>
                <div style={{ fontSize: 15, fontWeight: 600 }}>{invite.full_name ?? '—'}</div>
              </div>
              <div>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Email</div>
                <div style={{ fontSize: 15, fontWeight: 600 }}>{invite.email}</div>
              </div>
              <div>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Role</div>
                <div style={{ fontSize: 15, fontWeight: 600 }}>{roleLabel}</div>
              </div>
            </div>
          </div>

          <form action={formAction} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <input type="hidden" name="token" value={token} />

            <div>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 500, marginBottom: 6, color: 'var(--text-secondary)' }}>
                Create password
              </label>
              <input name="password" type="password" minLength={8} required placeholder="At least 8 characters" style={{ width: '100%', fontSize: 15 }} />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 500, marginBottom: 6, color: 'var(--text-secondary)' }}>
                Confirm password
              </label>
              <input name="confirmPassword" type="password" minLength={8} required placeholder="Re-enter password" style={{ width: '100%', fontSize: 15 }} />
            </div>

            {state?.error && (
              <div style={{
                padding: '10px 14px',
                borderRadius: 8,
                background: 'rgba(255, 69, 58, 0.15)',
                border: '1px solid rgba(255, 69, 58, 0.3)',
                color: 'var(--red)',
                fontSize: 13,
              }}>
                {state.error}
              </div>
            )}

            <button type="submit" className="btn-primary" disabled={pending} style={{ width: '100%', padding: '12px', fontSize: 15, marginTop: 4 }}>
              {pending ? 'Setting up account…' : 'Continue'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
