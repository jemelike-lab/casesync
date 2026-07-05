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
import { LogOut } from 'lucide-react'
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
      className="nav-pill"
      style={{
        // Fluid scaling (2026-07-05): font and padding track viewport width
        // continuously so links shrink smoothly instead of clipping mid-word
        // between the old 1280/1080 breakpoints.
        fontSize: 'clamp(10.5px, 0.85vw, 13px)',
        fontWeight: 600,
        color: active ? '#FFFFFF' : 'rgba(255,255,255,0.78)',
        textDecoration: 'none',
        padding: 'clamp(3px, 0.3vw, 6px) clamp(5px, 0.6vw, 12px)',
        borderRadius: 6,
        background: active ? 'rgba(255,255,255,0.15)' : 'transparent',
        transition: 'all 0.15s',
        minHeight: 44,
        display: 'flex',
        alignItems: 'center',
        whiteSpace: 'nowrap',
        flexShrink: 0,
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
    try {
      // Server-side signout clears cookies properly
      await fetch('/api/auth/signout', { method: 'POST' })
    } catch {
      // Fallback to client-side
      await supabase.auth.signOut()
    }
    router.push('/login?reason=signed_out')
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
        background: 'linear-gradient(135deg, #1E7CFF 0%, #2D8BFF 50%, #1A6FEB 100%)',
        borderBottom: '1px solid rgba(255,255,255,0.08)',
        boxShadow: '0 4px 16px rgba(30,124,255,0.18)',
        padding: '0 max(12px, env(safe-area-inset-left)) 0 max(12px, env(safe-area-inset-right))',
        paddingTop: 'env(safe-area-inset-top, 0px)',
        width: '100%',
        maxWidth: '100vw',
        overflow: 'visible',
        minHeight: 60,
        height: 'calc(60px + env(safe-area-inset-top, 0px))',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        position: 'sticky',
        top: 0,
        zIndex: 100,
        backdropFilter: 'blur(12px)',
      }}>
        {/* Left: Logo + nav */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 'clamp(6px, 0.9vw, 12px)', minWidth: 0, flex: '1 1 auto' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0, overflow: 'hidden' }}>
            <img src="/logo.png" alt="BLH" style={{ width: 36, height: 36, objectFit: 'contain' }} />
            <span style={{ fontSize: 'clamp(15px, 1.25vw, 17px)', fontWeight: 700, whiteSpace: 'nowrap', color: '#FFFFFF', letterSpacing: '-0.01em' }}>CaseSync</span>
          </div>

          {/* Nav links - desktop only */}
          <nav style={{ display: 'flex', gap: 'clamp(1px, 0.3vw, 4px)' }} className="desktop-nav">
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
                fontSize: 'clamp(10px, 0.8vw, 12px)',
                fontWeight: 600,
                color: '#E0E7FF',
                textDecoration: 'none',
                padding: 'clamp(3px, 0.3vw, 6px) clamp(5px, 0.6vw, 12px)',
                whiteSpace: 'nowrap',
                flexShrink: 0,
                borderRadius: 6,
                background: 'rgba(199,210,254,0.18)',
                border: '1px solid rgba(199,210,254,0.45)',
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
          <div className="desktop-only" style={{ minWidth: 0, flex: '0 3 clamp(140px, 24vw, 340px)', maxWidth: 420 }}>
            <GlobalSearch userId={user.id} profile={profile} />
          </div>
          {/* Help & Tour button */}
          <button
            onClick={() => setShowTour(true)}
            style={{
              background: 'rgba(255,255,255,0.18)',
              border: '1px solid rgba(255,255,255,0.4)',
              borderRadius: 8,
              cursor: 'pointer',
              fontSize: 12,
              fontWeight: 600,
              height: 36,
              padding: '0 12px',
              display: 'flex',
              alignItems: 'center',
              gap: 5,
              color: '#ffffff',
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
              background: 'rgba(255,255,255,0.18)',
              border: '1px solid rgba(255,255,255,0.4)',
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
            <div style={{ fontSize: 13, fontWeight: 500, color: '#ffffff' }}>{profile?.full_name ?? user.email}</div>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.7)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              {roleName}
            </div>
          </div>
          <button
            onClick={handleLogout}
            className="btn-secondary header-signout"
            style={{
              fontSize: 12,
              background: 'rgba(255,255,255,0.18)',
              border: '1px solid rgba(255,255,255,0.4)',
              color: '#FFFFFF',
            }}
            aria-label="Sign out"
            title="Sign out"
          >
            <span className="header-signout-text">Sign out</span>
            <LogOut className="header-signout-icon" size={18} aria-hidden="true" />
          </button>
        </div>
      </header>

      <style>{`
        .header-signout-icon {
          display: none;
        }

        .desktop-nav {
          min-width: 0;
          overflow-x: auto;
          scrollbar-width: none;
        }
        .desktop-nav::-webkit-scrollbar { display: none; }

        /* Fluid scaling (2026-07-05): continuous clamp() sizing on the nav
           pills replaces the old 1280/1080 step-downs, which left dead zones
           where links clipped mid-word ("Settings" -> "Set"). The user meta
           still hides below 1280 to buy space. */
        @media (max-width: 1280px) {
          .header-user-meta { display: none !important; }
        }

        @media (max-width: 640px) {
          .header-user-meta {
            display: none !important;
          }

          .header-signout {
            padding: 6px 10px !important;
            font-size: 16px !important;
            min-width: 36px;
            height: 36px;
            display: inline-flex !important;
            align-items: center;
            justify-content: center;
          }

          .header-signout-text {
            display: none;
          }

          .header-signout-icon {
            display: inline-block;
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
