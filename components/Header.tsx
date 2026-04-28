'use client'

import { isSupervisorLike, canManageTeam, getRoleLabel, getRoleColor } from '@/lib/roles'
import { useRouter, usePathname } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { User } from '@supabase/supabase-js'
import { Profile } from '@/lib/types'
import NotificationBell from './NotificationBell'
import { useTheme } from '@/hooks/useTheme'
import { useState } from 'react'
import OnboardingTour from './OnboardingTour'
import GlobalSearch from './GlobalSearch'

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
  const { theme, toggle } = useTheme()
  const [showTour, setShowTour] = useState(false)

  async function handleLogout() {
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  const role = profile?.role
  const roleName = getRoleLabel(role)
  const dashboardActive = pathname === '/' || pathname?.startsWith('/dashboard')
  const teamActive = pathname?.startsWith('/team') ?? false
  const supervisorActive = pathname?.startsWith('/supervisor') ?? false
  const adminActive = pathname === '/admin'
  const auditActive = pathname?.startsWith('/admin/audit') ?? false
  const settingsActive = pathname?.startsWith('/settings') ?? false
  const helpActive = pathname?.startsWith('/help') ?? false

  return (
    <>
      <header style={{
        background: theme === 'light' ? '#3b2a1a' : 'var(--surface)',
        borderBottom: theme === 'light' ? '1px solid #2a1e10' : '1px solid var(--border)',
        padding: '0 max(12px, env(safe-area-inset-left)) 0 max(12px, env(safe-area-inset-right))',
        width: '100%',
        maxWidth: '100vw',
        overflow: 'visible',
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
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0, overflow: 'hidden' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0, overflow: 'hidden' }}>
            <img src="/logo.png" alt="BLH" style={{ width: 36, height: 36, objectFit: 'contain' }} />
            <span style={{ fontSize: 17, fontWeight: 700, whiteSpace: 'nowrap' }}>CaseSync</span>
          </div>

          {/* Nav links - desktop only */}
          <nav style={{ display: 'flex', gap: 4 }} className="desktop-nav">
            <NavLink href="/dashboard" label="Dashboard" active={dashboardActive} />
            {(role === 'team_manager' || isSupervisorLike(role)) && (
              <NavLink href="/team" label="Team" active={teamActive} />
            )}
            {isSupervisorLike(role) && (
              <NavLink href="/supervisor" label="Supervisor" active={supervisorActive} />
            )}
            <NavLink href="/calendar" label="Calendar" active={pathname?.startsWith('/calendar') ?? false} />
            {isSupervisorLike(role) && (
              <NavLink href="/admin" label="Admin" active={adminActive} />
            )}
            {isSupervisorLike(role) && (
              <NavLink href="/admin/audit" label="Audit Log" active={auditActive} />
            )}
            <NavLink href="/settings/security" label="Settings" active={settingsActive} />
            <NavLink href="/help" label="📚 Help" active={helpActive} />
            <Link
              href="/w/dashboard"
              data-tour="workryn-button"
              style={{
                fontSize: 12,
                fontWeight: 600,
                color: '#818cf8',
                textDecoration: 'none',
                padding: '6px 12px',
                borderRadius: 6,
                background: 'rgba(99,102,241,0.12)',
                border: '1px solid rgba(99,102,241,0.25)',
                transition: 'all 0.15s',
                minHeight: 44,
                display: 'flex',
                alignItems: 'center',
                gap: 5,
              }}
            >
              ⇄ Workryn
            </Link>
          </nav>
        </div>

        {/* Right: global search + Help & Tour + theme toggle + notifications + user info + logout */}
        <div className="header-right" style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0, flexShrink: 1 }}>
          <div className="desktop-only" style={{ minWidth: 0, flex: '1 1 320px', maxWidth: 420 }}>
            <GlobalSearch userId={user.id} profile={profile} />
          </div>
          {/* Help & Tour button */}
          <button
            onClick={() => setShowTour(true)}
            style={{
              background: theme === 'light' ? 'rgba(255,255,255,0.18)' : 'var(--surface-2)',
              border: theme === 'light' ? '1px solid rgba(255,255,255,0.4)' : '1px solid var(--border)',
              borderRadius: 8,
              cursor: 'pointer',
              fontSize: 12,
              fontWeight: 600,
              height: 36,
              padding: '0 12px',
              display: 'flex',
              alignItems: 'center',
              gap: 5,
              color: theme === 'light' ? '#ffffff' : 'var(--text-secondary)',
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
              background: theme === 'light' ? 'rgba(255,255,255,0.18)' : 'var(--surface-2)',
              border: theme === 'light' ? '1px solid rgba(255,255,255,0.4)' : '1px solid var(--border)',
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

          <div data-tour="notification-bell" style={{ position: 'relative', zIndex: 7000, flexShrink: 0 }}>
            {user.id && <NotificationBell userId={user.id} />}
          </div>
          <div className="header-user-meta" style={{ textAlign: 'right', minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 500, color: theme === 'light' ? '#ffffff' : 'var(--text)' }}>{profile?.full_name ?? user.email}</div>
            <div style={{ fontSize: 11, color: theme === 'light' ? 'rgba(255,255,255,0.7)' : 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              {roleName}
            </div>
          </div>
          <button
            onClick={handleLogout}
            className="btn-secondary header-signout"
            style={{ fontSize: 12 }}
          >
            Sign out
          </button>
        </div>
      </header>

      <style>{`
        @media (max-width: 640px) {
          .header-user-meta,
          .header-signout {
            display: none !important;
          }

          .header-right {
            gap: 6px !important;
            flex-shrink: 0 !important;
            overflow: visible !important;
          }
        }
      `}</style>

      {/* Mobile bottom nav */}
      <nav className="mobile-nav" style={{
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        width: '100%',
        maxWidth: '100vw',
        overflowX: 'auto',
        overflowY: 'hidden',
        minHeight: 'calc(64px + env(safe-area-inset-bottom))',
        background: 'var(--surface)',
        borderTop: '1px solid var(--border)',
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'flex-start',
        zIndex: 200,
        paddingTop: 6,
        paddingLeft: 'max(8px, env(safe-area-inset-left))',
        paddingRight: 'max(8px, env(safe-area-inset-right))',
        paddingBottom: 'max(6px, env(safe-area-inset-bottom))',
        gap: 2,
        boxSizing: 'border-box',
      }}>
        <MobileNavItem href="/dashboard" icon="🏠" label="Home" active={dashboardActive} />
        <MobileNavItem href="/w/dashboard" icon="⇄" label="Workryn" active={false} accent />
        {(role === 'team_manager' || isSupervisorLike(role)) && (
          <MobileNavItem href="/team" icon="👥" label="Team" active={teamActive} />
        )}
        <MobileNavItem href="/calendar" icon="📅" label="Cal" active={pathname?.startsWith('/calendar') ?? false} />
        {isSupervisorLike(role) && (
          <MobileNavItem href="/supervisor" icon="📊" label="Stats" active={supervisorActive} />
        )}
        {isSupervisorLike(role) && (
          <MobileNavItem href="/admin" icon="⚙️" label="Admin" active={adminActive || auditActive} />
        )}
        <MobileNavItem href="/settings/security" icon="🔐" label="Prefs" active={settingsActive} />
        <MobileNavItem href="/help" icon="📚" label="Help" active={helpActive} />
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

function MobileNavItem({ href, icon, label, active, accent }: { href: string; icon: string; label: string; active: boolean; accent?: boolean }) {
  return (
    <Link href={href} aria-current={active ? 'page' : undefined} style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: 3,
      minWidth: 58,
      flex: '0 0 auto',
      minHeight: 44,
      justifyContent: 'center',
      color: active ? 'var(--accent)' : accent ? '#818cf8' : 'var(--text-secondary)',
      textDecoration: 'none',
      padding: '4px 6px 2px',
      whiteSpace: 'nowrap',
      opacity: active ? 1 : 0.92,
      borderRadius: 12,
      background: active ? 'rgba(0,122,255,0.14)' : accent ? 'rgba(99,102,241,0.1)' : 'transparent',
      border: active ? '1px solid rgba(0,122,255,0.22)' : accent ? '1px solid rgba(99,102,241,0.2)' : '1px solid transparent',
    }}>
      <span style={{ fontSize: 19, lineHeight: 1 }}>{icon}</span>
      <span style={{ fontSize: 12, fontWeight: active ? 800 : 700, lineHeight: 1.1, letterSpacing: '0.01em', opacity: 1 }}>{label}</span>
    </Link>
  )
}
