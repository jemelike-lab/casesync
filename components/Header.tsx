'use client'

import { useRouter, usePathname } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { User } from '@supabase/supabase-js'
import { Profile } from '@/lib/types'

interface Props {
  user: User
  profile: Profile | null
}

function NavLink({ href, label, active }: { href: string; label: string; active: boolean }) {
  return (
    <Link
      href={href}
      style={{
        fontSize: 13,
        fontWeight: 500,
        color: active ? 'var(--text)' : 'var(--text-secondary)',
        textDecoration: 'none',
        padding: '6px 12px',
        borderRadius: 6,
        background: active ? 'var(--surface-2)' : 'transparent',
        transition: 'all 0.15s',
        minHeight: 44,
        display: 'flex',
        alignItems: 'center',
      }}
    >
      {label}
    </Link>
  )
}

export default function Header({ user, profile }: Props) {
  const router = useRouter()
  const pathname = usePathname()
  const supabase = createClient()

  async function handleLogout() {
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  const role = profile?.role
  const roleName = role === 'supervisor' ? 'Supervisor' : role === 'team_manager' ? 'Team Manager' : role === 'supports_planner' ? 'Supports Planner' : role?.replace(/_/g, ' ') ?? ''

  return (
    <>
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
        {/* Left: Logo + nav */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
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

          {/* Nav links - desktop only */}
          <nav style={{ display: 'flex', gap: 4 }} className="desktop-nav">
            <NavLink href="/dashboard" label="Dashboard" active={pathname === '/dashboard'} />
            {(role === 'team_manager' || role === 'supervisor') && (
              <NavLink href="/team" label="Team" active={pathname === '/team'} />
            )}
            {role === 'supervisor' && (
              <NavLink href="/supervisor" label="Supervisor" active={pathname === '/supervisor'} />
            )}
            {role === 'supervisor' && (
              <NavLink href="/admin" label="Admin" active={pathname === '/admin'} />
            )}
          </nav>
        </div>

        {/* Right: User info + logout */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 13, fontWeight: 500 }}>{profile?.full_name ?? user.email}</div>
            <div style={{ fontSize: 11, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              {roleName}
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

      {/* Mobile bottom nav */}
      <nav className="mobile-nav" style={{
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        height: 64,
        background: 'var(--surface)',
        borderTop: '1px solid var(--border)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-around',
        zIndex: 200,
        paddingBottom: 'env(safe-area-inset-bottom)',
      }}>
        <MobileNavItem href="/dashboard" icon="🏠" label="Dashboard" active={pathname === '/dashboard'} />
        {(role === 'team_manager' || role === 'supervisor') && (
          <MobileNavItem href="/team" icon="👥" label="Team" active={pathname === '/team'} />
        )}
        {role === 'supervisor' && (
          <MobileNavItem href="/supervisor" icon="📊" label="Overview" active={pathname === '/supervisor'} />
        )}
        {role === 'supervisor' && (
          <MobileNavItem href="/admin" icon="⚙️" label="Admin" active={pathname === '/admin'} />
        )}
      </nav>
    </>
  )
}

function MobileNavItem({ href, icon, label, active }: { href: string; icon: string; label: string; active: boolean }) {
  return (
    <Link href={href} style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: 2,
      minWidth: 60,
      minHeight: 44,
      justifyContent: 'center',
      color: active ? 'var(--accent)' : 'var(--text-secondary)',
      textDecoration: 'none',
    }}>
      <span style={{ fontSize: 20 }}>{icon}</span>
      <span style={{ fontSize: 10, fontWeight: 500 }}>{label}</span>
    </Link>
  )
}
