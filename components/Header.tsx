'use client'

import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { User } from '@supabase/supabase-js'
import { Profile } from '@/lib/types'

interface Props {
  user: User
  profile: Profile | null
}

export default function Header({ user, profile }: Props) {
  const router = useRouter()
  const supabase = createClient()

  async function handleLogout() {
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  return (
    <header style={{
      background: 'var(--surface)',
      borderBottom: '1px solid var(--border)',
      padding: '0 24px',
      height: 60,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      position: 'sticky',
      top: 0,
      zIndex: 100,
      backdropFilter: 'blur(12px)',
    }}>
      {/* Left: Logo */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{
          width: 32,
          height: 32,
          borderRadius: 8,
          background: 'var(--accent)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 16,
        }}>
          📋
        </div>
        <span style={{ fontSize: 17, fontWeight: 700 }}>CaseSync</span>
      </div>

      {/* Right: User info + logout */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 13, fontWeight: 500 }}>{profile?.full_name ?? user.email}</div>
          <div style={{ fontSize: 11, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            {profile?.role?.replace('_', ' ')}
          </div>
        </div>
        <button
          onClick={handleLogout}
          className="btn-secondary"
          style={{ fontSize: 12 }}
        >
          Sign out
        </button>
      </div>
    </header>
  )
}
