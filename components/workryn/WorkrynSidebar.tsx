'use client'

/**
 * WorkrynSidebar — Aurora rebuild.
 *
 * Visual changes (vs. previous .w-sidebar version):
 *   - Glassmorphic surface (frosted, semi-transparent, backdrop blur)
 *   - Nav items glow in the page's accent color on hover; active item
 *     gets a solid colored bar on the left edge + soft tinted bg + dot
 *   - Logo gets a gradient wordmark with a small chromatic dot
 *   - Avatar in the footer gets a thin gradient ring
 *   - Mobile topbar is also glass and now lives in the same component
 *
 * Behavior parity (all preserved):
 *   - Same nav items, same admin gating
 *   - Notifications panel fetches /api/workryn/notifications + PATCH
 *   - Mobile sidebar open/close + swipe-from-left gesture
 *   - Sign-out via /api/auth/signout with supabase fallback
 *   - Dropdown click-outside dismissal
 */

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import {
  LayoutGrid, Timer, ListChecks, MessageCircle, ClipboardCheck,
  CalendarDays, Umbrella, BookOpen, Settings, LogOut, Landmark, ShieldCheck,
  Bell, Check, User, ArrowLeftRight, Menu, X,
} from 'lucide-react'
import { getInitials, timeAgo } from '@/lib/workryn/utils'
import { useState, useEffect, useRef } from 'react'
import { AURORA_ACCENTS, type AuroraAccent } from '@/lib/workryn/aurora'

// ------------------ helpers ------------------

function getRoleLabel(role: string): string {
  const map: Record<string, string> = {
    SUPPORT_PLANNER: 'Support Planner',
    TEAM_MANAGER:    'Team Manager',
    SUPERVISOR:      'Supervisor',
    STAFF:           'Staff',
    ADMIN:           'Admin',
    MANAGER:         'Manager',
    OWNER:           'Owner',
  }
  return map[role] ?? role
}

function hasElevatedAccess(role: string): boolean {
  return ['OWNER', 'ADMIN', 'MANAGER', 'SUPERVISOR', 'TEAM_MANAGER'].includes(role)
}

type NavItem = { href: string; label: string; icon: React.ComponentType<{ size?: number }>; accent: AuroraAccent }

const navItems: NavItem[] = [
  { href: '/w/dashboard',   label: 'Dashboard',   icon: LayoutGrid,      accent: 'violet' },
  { href: '/w/time-clock',  label: 'Time Clock',  icon: Timer,           accent: 'cyan' },
  { href: '/w/tasks',       label: 'Tasks',       icon: ListChecks,      accent: 'coral' },
  { href: '/w/tickets',     label: 'Tickets',     icon: MessageCircle,   accent: 'orange' },
  { href: '/w/evaluations', label: 'Evaluations', icon: ClipboardCheck,  accent: 'fuchsia' },
  { href: '/w/schedule',    label: 'Schedule',    icon: CalendarDays,    accent: 'sky' },
  { href: '/w/pto',         label: 'PTO',         icon: Umbrella,        accent: 'teal' },
  { href: '/w/training',    label: 'Training',    icon: BookOpen,        accent: 'mint' },
  { href: '/w/departments', label: 'Departments', icon: Landmark,        accent: 'indigo' },
  { href: '/w/profile',     label: 'Profile',     icon: User,            accent: 'violet' },
  { href: '/w/settings',    label: 'Settings',    icon: Settings,        accent: 'slate' },
]
const adminItems: NavItem[] = [
  { href: '/w/admin', label: 'Admin', icon: ShieldCheck, accent: 'amber' },
]

type Notification = {
  id: string; type: string; title: string; message: string
  isRead: boolean; link: string | null; createdAt: string
}
const NOTIF_ICONS: Record<string, string> = {
  TASK: '✓', TICKET: '🎫', MENTION: '@', SYSTEM: '⚙', DEFAULT: '🔔',
}

interface WorkrynSidebarProps {
  user: {
    id: string
    email: string
    name: string
    role: string
    departmentId?: string
    departmentName?: string
    jobTitle?: string
    avatarColor: string
    image: string | null
  }
}

// ============================================================
// COMPONENT
// ============================================================

export default function WorkrynSidebar({ user }: WorkrynSidebarProps) {
  const pathname = usePathname()
  const router = useRouter()
  const supabase = createClient()
  const [notifs, setNotifs] = useState<Notification[]>([])
  const [showNotifs, setShowNotifs] = useState(false)
  const [notifFromTopbar, setNotifFromTopbar] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const bellRef = useRef<HTMLButtonElement>(null)
  const topbarBellRef = useRef<HTMLButtonElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)

  // ----------- mobile swipe-to-open gesture (preserved) -----------
  useEffect(() => {
    let startX = 0, startY = 0, tracking = false
    function onStart(e: TouchEvent) {
      const t = e.touches[0]; startX = t.clientX; startY = t.clientY
      tracking = startX < 30 || sidebarOpen
    }
    function onEnd(e: TouchEvent) {
      if (!tracking) return
      const t = e.changedTouches[0]
      const dx = t.clientX - startX
      const dy = Math.abs(t.clientY - startY)
      if (Math.abs(dx) > 60 && dy < Math.abs(dx) * 0.75) {
        if (dx > 0 && !sidebarOpen && startX < 30) setSidebarOpen(true)
        else if (dx < 0 && sidebarOpen) setSidebarOpen(false)
      }
      tracking = false
    }
    const mq = window.matchMedia('(max-width: 768px)')
    if (mq.matches) {
      document.addEventListener('touchstart', onStart, { passive: true })
      document.addEventListener('touchend',   onEnd,   { passive: true })
    }
    return () => {
      document.removeEventListener('touchstart', onStart)
      document.removeEventListener('touchend',   onEnd)
    }
  }, [sidebarOpen])

  const unread  = notifs.filter((n) => !n.isRead).length
  const isAdmin = hasElevatedAccess(user.role)

  useEffect(() => { setSidebarOpen(false) }, [pathname])

  useEffect(() => {
    fetch('/api/workryn/notifications')
      .then((r) => r.json())
      .then((d) => setNotifs(Array.isArray(d) ? d : []))
      .catch(() => {})
  }, [])

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (
        dropdownRef.current && !dropdownRef.current.contains(e.target as Node) &&
        bellRef.current && !bellRef.current.contains(e.target as Node) &&
        topbarBellRef.current && !topbarBellRef.current.contains(e.target as Node)
      ) setShowNotifs(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  async function markAllRead() {
    await fetch('/api/workryn/notifications', { method: 'PATCH' })
    setNotifs((n) => n.map((x) => ({ ...x, isRead: true })))
  }

  async function handleLogout() {
    try {
      await fetch('/api/auth/signout', { method: 'POST' })
    } catch {
      await supabase.auth.signOut()
    }
    window.location.href = '/login?reason=signed_out'
  }

  function isActive(href: string) {
    return pathname === href || pathname.startsWith(href + '/')
  }

  return (
    <>
      {/* ====================== Mobile topbar ====================== */}
      <div className="aurora-topbar">
        <button
          className="aurora-hamburger"
          onClick={() => setSidebarOpen((v) => !v)}
          aria-label={sidebarOpen ? 'Close menu' : 'Open menu'}
        >
          {sidebarOpen ? <X size={22} /> : <Menu size={22} />}
        </button>

        <div className="aurora-brand">
          <span className="aurora-brand-dot" aria-hidden />
          <span className="aurora-brand-mark">Workryn</span>
        </div>

        <Link href="/dashboard" className="aurora-cs-pill" aria-label="Switch to CaseSync">
          <ArrowLeftRight size={13} />
          <span>CaseSync</span>
        </Link>

        <button
          ref={topbarBellRef}
          className="aurora-icon-btn aurora-bell"
          onClick={() => { setNotifFromTopbar(true); setShowNotifs((v) => !v) }}
          aria-label="Notifications"
        >
          <Bell size={18} />
          {unread > 0 && <span className="aurora-badge">{unread > 9 ? '9+' : unread}</span>}
        </button>
      </div>

      {/* ====================== Backdrop (mobile only) ====================== */}
      {sidebarOpen && (
        <div className="aurora-backdrop" onClick={() => setSidebarOpen(false)} aria-hidden />
      )}

      {/* ====================== Sidebar ====================== */}
      <aside
        className={`aurora-sidebar${sidebarOpen ? ' open' : ''}`}
        data-tour-w="sidebar"
      >
        {/* Logo block */}
        <div className="aurora-sidebar-header">
          <Link href="/w/dashboard" className="aurora-brand">
            <span className="aurora-brand-dot" aria-hidden />
            <span className="aurora-brand-mark">Workryn</span>
          </Link>

          <div className="aurora-sidebar-header-actions">
            <Link
              href="/dashboard"
              className="aurora-cs-pill"
              title="Switch to CaseSync"
              aria-label="Switch to CaseSync"
              data-tour-w="cs-toggle"
            >
              <ArrowLeftRight size={13} />
              <span>CaseSync</span>
            </Link>
            <button
              ref={bellRef}
              className="aurora-icon-btn aurora-bell"
              onClick={() => { setNotifFromTopbar(false); setShowNotifs((v) => !v) }}
              title="Notifications"
              aria-label="Notifications"
              data-tour-w="notif-bell"
            >
              <Bell size={18} />
              {unread > 0 && <span className="aurora-badge">{unread > 9 ? '9+' : unread}</span>}
            </button>
          </div>
        </div>

        {/* Notification dropdown */}
        {showNotifs && (
          <div
            ref={dropdownRef}
            className={`aurora-notif-panel${notifFromTopbar ? ' aurora-notif-panel--mobile' : ''}`}
          >
            <div className="aurora-notif-panel-head">
              <span style={{ fontWeight: 700, fontSize: '0.9375rem' }}>Notifications</span>
              {unread > 0 && (
                <button className="aurora-link-btn" onClick={markAllRead}>
                  <Check size={13} /> Mark all read
                </button>
              )}
            </div>
            <div className="aurora-notif-list">
              {notifs.length === 0 ? (
                <div style={{ padding: '24px 16px', textAlign: 'center', color: 'rgba(255,255,255,0.55)', fontSize: '0.875rem' }}>
                  No notifications
                </div>
              ) : notifs.map((n) => (
                <div
                  key={n.id}
                  className={`aurora-notif-row${!n.isRead ? ' unread' : ''}`}
                  onClick={() => { setShowNotifs(false); if (n.link) router.push(n.link) }}
                >
                  <div className="aurora-notif-icon">{NOTIF_ICONS[n.type] ?? NOTIF_ICONS.DEFAULT}</div>
                  <div className="aurora-notif-body">
                    <div className="aurora-notif-title">{n.title}</div>
                    <div className="aurora-notif-msg">{n.message}</div>
                    <div className="aurora-notif-time">{timeAgo(n.createdAt)}</div>
                  </div>
                  {!n.isRead && <div className="aurora-notif-dot" />}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Nav */}
        <nav className="aurora-nav">
          <div className="aurora-nav-label">Workspace</div>
          {navItems.map(({ href, label, icon: Icon, accent }) => (
            <Link
              key={href}
              href={href}
              className={`aurora-nav-item${isActive(href) ? ' active' : ''}`}
              data-tour-w={href.replace('/w/', '')}
              style={{
                ['--item-accent' as string]: AURORA_ACCENTS[accent].hex,
                ['--item-accent-rgb' as string]: AURORA_ACCENTS[accent].rgb,
              } as React.CSSProperties}
            >
              <span className="aurora-nav-bar" aria-hidden />
              <Icon size={18} />
              <span className="aurora-nav-label-text">{label}</span>
              {isActive(href) && <span className="aurora-nav-dot" aria-hidden />}
            </Link>
          ))}

          {isAdmin && (
            <>
              <div className="aurora-nav-label" style={{ marginTop: 12 }}>Management</div>
              {adminItems.map(({ href, label, icon: Icon, accent }) => (
                <Link
                  key={href}
                  href={href}
                  className={`aurora-nav-item${isActive(href) ? ' active' : ''}`}
                  style={{
                    ['--item-accent' as string]: AURORA_ACCENTS[accent].hex,
                    ['--item-accent-rgb' as string]: AURORA_ACCENTS[accent].rgb,
                  } as React.CSSProperties}
                >
                  <span className="aurora-nav-bar" aria-hidden />
                  <Icon size={18} />
                  <span className="aurora-nav-label-text">{label}</span>
                  {isActive(href) && <span className="aurora-nav-dot" aria-hidden />}
                </Link>
              ))}
            </>
          )}
        </nav>

        {/* Footer / user */}
        <div className="aurora-sidebar-footer">
          <Link href="/w/profile" className="aurora-user" title="Open your profile" aria-label="Open your profile">
            <div className="aurora-user-avatar-wrap">
              <div className="aurora-user-avatar-ring" aria-hidden />
              <div
                className="aurora-user-avatar"
                style={{ background: user.avatarColor ?? '#7C3AED' }}
              >
                {user.image ? (
                  <img src={user.image} alt={user.name ?? 'avatar'} width={28} height={28} />
                ) : (
                  getInitials(user.name ?? user.email ?? 'U')
                )}
              </div>
            </div>
            <div className="aurora-user-info">
              <span className="aurora-user-name">{user.name ?? 'User'}</span>
              <span className="aurora-user-role">{getRoleLabel(user.role)}</span>
            </div>
          </Link>
          <button className="aurora-icon-btn" onClick={handleLogout} title="Sign out" aria-label="Sign out">
            <LogOut size={16} />
          </button>
        </div>
      </aside>

      {/* ====================== Scoped styles ====================== */}
      <style>{`
        /* ---------- Topbar (mobile) ---------- */
        .aurora-topbar {
          display: none;
          position: sticky; top: 0; z-index: 40;
          padding: 10px 14px;
          padding-top: max(10px, env(safe-area-inset-top, 10px));
          align-items: center;
          gap: 10px;
          background: rgba(11,15,30,0.62);
          backdrop-filter: blur(18px) saturate(160%);
          -webkit-backdrop-filter: blur(18px) saturate(160%);
          border-bottom: 1px solid rgba(255,255,255,0.06);
        }
        @media (max-width: 1023px) { .aurora-topbar { display: flex; } }

        .aurora-hamburger {
          background: rgba(255,255,255,0.04);
          border: 1px solid rgba(255,255,255,0.08);
          border-radius: 10px;
          padding: 6px;
          color: #fff;
          cursor: pointer;
          display: grid; place-items: center;
        }
        .aurora-hamburger:hover { background: rgba(255,255,255,0.08); }

        /* ---------- Brand mark ---------- */
        .aurora-brand {
          display: inline-flex; align-items: center; gap: 8px;
          text-decoration: none;
        }
        .aurora-brand-dot {
          width: 10px; height: 10px;
          border-radius: 50%;
          background: conic-gradient(from 0deg, #7C3AED, #FB7185, #34D399, #06B6D4, #7C3AED);
          box-shadow: 0 0 12px rgba(124,58,237,0.65);
        }
        .aurora-brand-mark {
          font-weight: 800;
          letter-spacing: -0.02em;
          font-size: 1.05rem;
          background: linear-gradient(135deg, #ffffff 0%, #c4b5fd 100%);
          -webkit-background-clip: text; background-clip: text;
          -webkit-text-fill-color: transparent;
        }

        .aurora-cs-pill {
          display: inline-flex; align-items: center; gap: 6px;
          padding: 5px 10px;
          font-size: 0.75rem;
          font-weight: 600;
          color: #c4b5fd;
          background: rgba(124,58,237,0.10);
          border: 1px solid rgba(124,58,237,0.30);
          border-radius: 999px;
          text-decoration: none;
          transition: all 180ms ease;
        }
        .aurora-cs-pill:hover {
          background: rgba(124,58,237,0.20);
          border-color: rgba(124,58,237,0.55);
          color: #fff;
        }

        /* ---------- Icon buttons + bell ---------- */
        .aurora-icon-btn {
          position: relative;
          background: rgba(255,255,255,0.04);
          border: 1px solid rgba(255,255,255,0.08);
          border-radius: 10px;
          color: #e2e8f0;
          padding: 7px;
          cursor: pointer;
          display: grid; place-items: center;
          transition: all 180ms ease;
        }
        .aurora-icon-btn:hover {
          background: rgba(255,255,255,0.08);
          border-color: rgba(255,255,255,0.16);
          color: #fff;
        }
        .aurora-badge {
          position: absolute;
          top: -4px; right: -4px;
          min-width: 18px;
          height: 18px;
          padding: 0 5px;
          font-size: 10px;
          font-weight: 700;
          color: #fff;
          background: linear-gradient(135deg, #FB7185 0%, #ef4444 100%);
          border-radius: 999px;
          display: inline-flex; align-items: center; justify-content: center;
          box-shadow: 0 0 12px rgba(251,113,133,0.55);
        }

        /* ---------- Backdrop ---------- */
        .aurora-backdrop {
          display: none;
          position: fixed; inset: 0; z-index: 49;
          background: rgba(7,9,18,0.6);
          backdrop-filter: blur(4px);
          -webkit-backdrop-filter: blur(4px);
        }
        @media (max-width: 1023px) { .aurora-backdrop { display: block; } }

        /* ---------- Sidebar ---------- */
        .aurora-sidebar {
          position: fixed;
          top: 0; left: 0; bottom: 0;
          width: 280px;
          z-index: 50;
          display: flex; flex-direction: column;
          padding: 18px 14px;
          gap: 14px;
          background: rgba(11,15,30,0.72);
          backdrop-filter: blur(22px) saturate(160%);
          -webkit-backdrop-filter: blur(22px) saturate(160%);
          border-right: 1px solid rgba(255,255,255,0.06);
          /* Gradient spine on right edge */
          box-shadow:
            inset -1px 0 0 rgba(124,58,237,0.20),
            6px 0 28px -10px rgba(0,0,0,0.6);
        }
        @media (max-width: 1023px) {
          .aurora-sidebar {
            transform: translateX(-100%);
            transition: transform 280ms cubic-bezier(0.4, 0, 0.2, 1);
          }
          .aurora-sidebar.open { transform: translateX(0); }
        }

        .aurora-sidebar-header {
          display: flex; align-items: center; gap: 8px;
          padding: 4px 6px 14px;
          border-bottom: 1px solid rgba(255,255,255,0.06);
          position: relative;
        }
        .aurora-sidebar-header-actions {
          margin-left: auto;
          display: flex; align-items: center; gap: 6px;
        }
        @media (max-width: 1023px) {
          /* Hide the in-sidebar header actions on mobile (they live in the topbar) */
          .aurora-sidebar-header-actions { display: none; }
        }

        /* ---------- Nav ---------- */
        .aurora-nav {
          flex: 1;
          display: flex; flex-direction: column;
          gap: 2px;
          overflow-y: auto;
          padding: 2px 2px 12px;
        }
        .aurora-nav-label {
          font-size: 0.6875rem;
          font-weight: 700;
          color: rgba(255,255,255,0.40);
          text-transform: uppercase;
          letter-spacing: 0.10em;
          padding: 8px 10px 6px;
        }
        .aurora-nav-item {
          position: relative;
          display: flex; align-items: center; gap: 12px;
          padding: 10px 12px 10px 16px;
          font-size: 0.9375rem;
          font-weight: 500;
          color: rgba(226,232,240,0.85);
          text-decoration: none;
          border-radius: 10px;
          transition: all 180ms ease;
          isolation: isolate;
        }
        .aurora-nav-item::before {
          content: '';
          position: absolute; inset: 0;
          border-radius: 10px;
          background: rgba(var(--item-accent-rgb, 124,58,237), 0.0);
          transition: background 180ms ease;
          z-index: -1;
        }
        .aurora-nav-bar {
          position: absolute;
          left: 4px;
          top: 50%;
          width: 3px;
          height: 0;
          transform: translateY(-50%);
          border-radius: 99px;
          background: var(--item-accent, #7C3AED);
          transition: height 220ms cubic-bezier(0.4, 0, 0.2, 1), box-shadow 220ms;
        }
        .aurora-nav-item:hover {
          color: #fff;
        }
        .aurora-nav-item:hover::before {
          background: rgba(var(--item-accent-rgb, 124,58,237), 0.10);
        }
        .aurora-nav-item:hover .aurora-nav-bar {
          height: 18px;
        }
        .aurora-nav-item.active {
          color: #fff;
          font-weight: 600;
        }
        .aurora-nav-item.active::before {
          background:
            linear-gradient(90deg, rgba(var(--item-accent-rgb), 0.18), rgba(var(--item-accent-rgb), 0.04));
        }
        .aurora-nav-item.active .aurora-nav-bar {
          height: 22px;
          box-shadow: 0 0 12px var(--item-accent, #7C3AED);
        }
        .aurora-nav-item.active svg {
          color: var(--item-accent, #7C3AED);
        }
        .aurora-nav-dot {
          margin-left: auto;
          width: 6px; height: 6px;
          border-radius: 50%;
          background: var(--item-accent, #7C3AED);
          box-shadow: 0 0 8px var(--item-accent, #7C3AED);
        }
        .aurora-nav-label-text { flex: 1; }

        /* ---------- Footer ---------- */
        .aurora-sidebar-footer {
          display: flex; align-items: center; gap: 8px;
          padding-top: 12px;
          border-top: 1px solid rgba(255,255,255,0.06);
        }
        .aurora-user {
          display: flex; align-items: center; gap: 10px;
          flex: 1;
          padding: 6px;
          border-radius: 10px;
          text-decoration: none;
          color: inherit;
          transition: background 180ms ease;
        }
        .aurora-user:hover { background: rgba(255,255,255,0.04); }
        .aurora-user-avatar-wrap {
          position: relative;
          width: 36px; height: 36px;
          display: grid; place-items: center;
          flex-shrink: 0;
        }
        .aurora-user-avatar-ring {
          position: absolute; inset: 0;
          border-radius: 50%;
          padding: 2px;
          background: conic-gradient(from 0deg, #7C3AED, #FB7185, #34D399, #06B6D4, #7C3AED);
          -webkit-mask:
            linear-gradient(#000 0 0) content-box,
            linear-gradient(#000 0 0);
          -webkit-mask-composite: xor;
                  mask-composite: exclude;
          opacity: 0.7;
        }
        .aurora-user-avatar {
          position: relative;
          z-index: 1;
          width: 30px; height: 30px;
          border-radius: 50%;
          display: grid; place-items: center;
          color: #fff;
          font-weight: 700;
          font-size: 0.8125rem;
          overflow: hidden;
        }
        .aurora-user-avatar img {
          width: 100%; height: 100%; object-fit: cover;
        }
        .aurora-user-info {
          display: flex; flex-direction: column; min-width: 0;
        }
        .aurora-user-name {
          font-size: 0.875rem;
          font-weight: 600;
          color: #fff;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .aurora-user-role {
          font-size: 0.6875rem;
          color: rgba(255,255,255,0.55);
          text-transform: uppercase;
          letter-spacing: 0.06em;
          font-weight: 600;
        }

        /* ---------- Notifications panel ---------- */
        .aurora-notif-panel {
          position: absolute;
          top: 58px;
          right: 14px;
          width: 340px;
          max-height: 70vh;
          z-index: 60;
          border-radius: 14px;
          background: rgba(11,15,30,0.86);
          backdrop-filter: blur(24px) saturate(160%);
          -webkit-backdrop-filter: blur(24px) saturate(160%);
          border: 1px solid rgba(255,255,255,0.10);
          box-shadow: 0 24px 60px -16px rgba(0,0,0,0.65);
          overflow: hidden;
          animation: aurora-scale-in 160ms cubic-bezier(0.16, 1, 0.3, 1);
        }
        .aurora-notif-panel--mobile { right: 14px; top: 56px; }
        @keyframes aurora-scale-in {
          from { opacity: 0; transform: scale(0.96) translateY(-4px); }
          to   { opacity: 1; transform: scale(1) translateY(0); }
        }
        .aurora-notif-panel-head {
          display: flex; align-items: center; justify-content: space-between;
          padding: 12px 14px;
          border-bottom: 1px solid rgba(255,255,255,0.06);
        }
        .aurora-link-btn {
          background: none; border: none;
          color: #c4b5fd;
          font-size: 0.75rem;
          font-weight: 600;
          cursor: pointer;
          display: inline-flex; align-items: center; gap: 4px;
        }
        .aurora-link-btn:hover { color: #fff; }
        .aurora-notif-list {
          max-height: calc(70vh - 56px);
          overflow-y: auto;
        }
        .aurora-notif-row {
          display: grid;
          grid-template-columns: 28px 1fr 8px;
          gap: 12px;
          padding: 12px 14px;
          border-bottom: 1px solid rgba(255,255,255,0.04);
          cursor: pointer;
          transition: background 160ms ease;
        }
        .aurora-notif-row:hover { background: rgba(124,58,237,0.08); }
        .aurora-notif-row.unread { background: rgba(124,58,237,0.06); }
        .aurora-notif-icon {
          width: 28px; height: 28px;
          display: grid; place-items: center;
          background: rgba(124,58,237,0.15);
          border-radius: 8px;
          font-size: 13px;
        }
        .aurora-notif-title {
          font-size: 0.875rem;
          font-weight: 600;
          color: #fff;
          margin-bottom: 2px;
        }
        .aurora-notif-msg {
          font-size: 0.75rem;
          color: rgba(255,255,255,0.65);
          line-height: 1.4;
        }
        .aurora-notif-time {
          font-size: 0.6875rem;
          color: rgba(255,255,255,0.45);
          margin-top: 4px;
        }
        .aurora-notif-dot {
          width: 8px; height: 8px;
          border-radius: 50%;
          background: #FB7185;
          box-shadow: 0 0 8px #FB7185;
          align-self: center;
        }

        /* ---------- Shell layout: leave space for sidebar on desktop ---------- */
        @media (min-width: 1024px) {
          :global(.w-page-content) { margin-left: 280px; }
        }
      `}</style>
    </>
  )
}
