'use client'

import { useRouter, usePathname } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { User } from '@supabase/supabase-js'
import { Profile } from '@/lib/types'
import NotificationBell from './NotificationBell'
import { useTheme } from '@/hooks/useTheme'
import { useState } from 'react'
import OnboardingTour from './OnboardingTour'

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
  const { theme } = useTheme()
  const { theme, toggle } = useTheme()
  const [showTour, setShowTour] = useState(false)

  async function handleLogout() {
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  const role = profile?.role
  const roleName = role === 'supervisor' ? 'Supervisor' : role === 'team_manager' ? 'Team Manager' : role === 'supports_planner' ? 'Supports Planner' : (role as string | undefined)?.replace(/_/g, ' ') ?? ''

  return (
    <>
      <header style={{
        background: theme === 'light' ? '#3b2a1a' : 'var(--surface)',
        borderBottom: theme === 'light' ? '1px solid #2a1e10' : '1px solid var(--border)',
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
            <img src="/logo.png" alt="BLH" style={{ width: 36, height: 36, objectFit: 'contain' }} />
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
            <NavLink href="/chat" label="Chat" active={pathname?.startsWith('/chat') ?? false} />
            <NavLink href="/calendar" label="Calendar" active={pathname?.startsWith('/calendar') ?? false} />
            {role === 'supervisor' && (
              <NavLink href="/admin" label="Admin" active={pathname === '/admin'} />
            )}
            {role === 'supervisor' && (
              <NavLink href="/admin/audit" label="Audit Log" active={pathname === '/admin/audit'} />
            )}
            <NavLink href="/settings/security" label="Settings" active={pathname?.startsWith('/settings') ?? false} />
            <NavLink href="/help" label="📚 Help" active={pathname === '/help'} />
          </nav>
        </div>

        {/* Right: Help & Tour + theme toggle + notifications + user info + logout */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {/* Help & Tour button */}
          <button
            onClick={() => setShowTour(true)}
            style={{
              background: 'var(--surface-2)',
              border: '1px solid var(--border)',
              borderRadius: 8,
              cursor: 'pointer',
              fontSize: 12,
              fontWeight: 600,
              height: 36,
              padding: '0 12px',
              display: 'flex',
              alignItems: 'center',
              gap: 5,
              color: 'var(--text-secondary)',
              transition: 'all 0.2s',
              flexShrink: 0,
              whiteSpace: 'nowrap',
            }}
            title="Take a guided tour of CaseSync"
            aria-label="Help & Tour"
            className="desktop-only"
          >
            <span>❓</span>
            <span className="desktop-nav-label">Help & Tour</span>
          </button>

          {/* Theme toggle */}
          <button
            onClick={toggle}
            style={{
              background: 'var(--surface-2)',
              border: '1px solid var(--border)',
              borderRadius: 8,
              cursor: 'pointer',
              fontSize: 16,
              width: 36,
              height: 36,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'background 0.2s',
              flexShrink: 0,
            }}
            title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            aria-label="Toggle theme"
          >
            {theme === 'dark' ? '☀️' : '🌙'}
          </button>

          <div data-tour="notification-bell">
            {user.id && <NotificationBell userId={user.id} />}
          </div>
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
        <MobileNavItem href="/chat" icon="💬" label="Chat" active={pathname?.startsWith('/chat') ?? false} />
        <MobileNavItem href="/calendar" icon="📅" label="Calendar" active={pathname?.startsWith('/calendar') ?? false} />
        {role === 'supervisor' && (
          <MobileNavItem href="/supervisor" icon="📊" label="Overview" active={pathname === '/supervisor'} />
        )}
        {role === 'supervisor' && (
          <MobileNavItem href="/admin" icon="⚙️" label="Admin" active={pathname === '/admin'} />
        )}
        <MobileNavItem href="/settings/security" icon="🔐" label="Security" active={pathname?.startsWith('/settings') ?? false} />
        <MobileNavItem href="/help" icon="📚" label="Help" active={pathname === '/help'} />
        {/* Mobile help button */}
        <button
          onClick={() => setShowTour(true)}
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 2,
            minWidth: 60,
            minHeight: 44,
            justifyContent: 'center',
            color: 'var(--text-secondary)',
            background: 'transparent',
            border: 'none',
            cursor: 'pointer',
            padding: 0,
          }}
          aria-label="Help & Tour"
        >
          <span style={{ fontSize: 20 }}>❓</span>
          <span style={{ fontSize: 10, fontWeight: 500 }}>Help</span>
        </button>
      </nav>

      {/* Onboarding Tour (replay) */}
      {showTour && (
        <OnboardingTour
          forceShow={true}
          onClose={() => setShowTour(false)}
        />
      )}
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
