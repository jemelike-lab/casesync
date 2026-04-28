'use client'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import {
  LayoutGrid, Timer, ListChecks, MessageCircle, ClipboardCheck,
  CalendarDays,
  Umbrella, BookOpen, Settings, LogOut, Landmark, ShieldCheck,
  ChevronRight, Bell, Check, Mail, User, ArrowLeftRight, Menu, X,
} from 'lucide-react'
import { getInitials, timeAgo } from '@/lib/workryn/utils'
import { useState, useEffect, useRef } from 'react'

// Role helpers
function getRoleLabel(role: string): string {
  const map: Record<string,string> = {
    SUPPORT_PLANNER: 'Support Planner',
    TEAM_MANAGER: 'Team Manager',
    SUPERVISOR: 'Supervisor',
    STAFF: 'Staff',
    ADMIN: 'Admin',
    MANAGER: 'Manager',
    OWNER: 'Owner',
  }
  return map[role] ?? role
}
function hasElevatedAccess(role: string): boolean {
  return ['OWNER','ADMIN','MANAGER','SUPERVISOR','TEAM_MANAGER'].includes(role)
}

const navItems = [
  { href: '/w/dashboard',    label: 'Dashboard',   icon: LayoutGrid },
  { href: '/w/time-clock',   label: 'Time Clock',  icon: Timer },
  { href: '/w/tasks',        label: 'Tasks',        icon: ListChecks },
  { href: '/w/tickets',      label: 'Tickets',      icon: MessageCircle },
  { href: '/w/evaluations',  label: 'Evaluations',  icon: ClipboardCheck },
  { href: '/w/schedule',     label: 'Schedule',     icon: CalendarDays },
  { href: '/w/pto',          label: 'PTO',          icon: Umbrella },
  { href: '/w/training',     label: 'Training',     icon: BookOpen },
  { href: '/w/departments',  label: 'Departments',  icon: Landmark },
  { href: '/w/profile',      label: 'Profile',      icon: User },
  { href: '/w/settings',     label: 'Settings',     icon: Settings },
]
const adminItems = [
  { href: '/w/admin', label: 'Admin', icon: ShieldCheck },
]

type Notification = {
  id: string; type: string; title: string; message: string
  isRead: boolean; link: string | null; createdAt: string
}
const NOTIF_ICONS: Record<string, string> = {
  TASK: '✓', TICKET: '🎫', MENTION: '@', SYSTEM: '⚙', DEFAULT: '🔔'
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

  const unread = notifs.filter(n => !n.isRead).length
  const isAdmin = hasElevatedAccess(user.role)

  useEffect(() => { setSidebarOpen(false) }, [pathname])

  useEffect(() => {
    fetch('/api/workryn/notifications')
      .then(r => r.json())
      .then(data => setNotifs(Array.isArray(data) ? data : []))
      .catch(() => {})
  }, [])

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (
        dropdownRef.current && !dropdownRef.current.contains(e.target as Node) &&
        bellRef.current && !bellRef.current.contains(e.target as Node) &&
        topbarBellRef.current && !topbarBellRef.current.contains(e.target as Node)
      ) { setShowNotifs(false) }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  async function markAllRead() {
    await fetch('/api/workryn/notifications', { method: 'PATCH' })
    setNotifs(n => n.map(x => ({ ...x, isRead: true })))
  }

  async function handleLogout() {
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  function isActive(href: string) {
    return pathname === href || pathname.startsWith(href + '/')
  }

  return (
    <>
      {/* Mobile hamburger */}
      <div className="w-mobile-topbar">
        <button className="w-hamburger w-focus-ring" onClick={() => setSidebarOpen(v => !v)}
          aria-label={sidebarOpen ? 'Close menu' : 'Open menu'}>
          {sidebarOpen ? <X size={22} /> : <Menu size={22} />}
        </button>
        <span className="w-mobile-title">Workryn</span>
        <button ref={topbarBellRef} className="w-btn w-btn-icon w-btn-ghost w-notif-bell w-focus-ring"
          onClick={() => { setNotifFromTopbar(true); setShowNotifs(v => !v) }} aria-label="Notifications">
          <Bell size={20} />
          {unread > 0 && <span className="w-notif-badge">{unread > 9 ? '9+' : unread}</span>}
        </button>
      </div>

      {sidebarOpen && (
        <div className="w-sidebar-backdrop" onClick={() => setSidebarOpen(false)} aria-hidden="true" />
      )}

      <aside className={`w-sidebar${sidebarOpen ? ' open' : ''}`} data-tour-w="sidebar">
        {/* Logo */}
        <div className="w-sidebar-logo">
          <div className="w-sidebar-logo-icon" style={{ padding: 0, overflow: 'hidden', background: 'transparent', boxShadow: 'none' }}>
            <img src="/icons/workryn-192x192.png" alt="Workryn"
              style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 10 }} />
          </div>
          <span className="w-sidebar-logo-text">Workryn</span>
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 4 }}>
            <Link href="/dashboard" className="w-toggle-btn w-focus-ring" title="Switch to CaseSync" aria-label="Switch to CaseSync" data-tour-w="cs-toggle">
              <ArrowLeftRight size={14} />
              <span className="w-toggle-label">CaseSync</span>
            </Link>
            <button ref={bellRef} className="w-btn w-btn-icon w-btn-ghost w-notif-bell w-focus-ring"
              onClick={() => { setNotifFromTopbar(false); setShowNotifs(v => !v) }}
              title="Notifications" aria-label="Notifications" data-tour-w="notif-bell">
              <Bell size={18} />
              {unread > 0 && <span className="w-notif-badge">{unread > 9 ? '9+' : unread}</span>}
            </button>
          </div>
          {showNotifs && (
            <div ref={dropdownRef} className={`w-notif-dropdown w-animate-scale-in${notifFromTopbar ? ' w-notif-dropdown--topbar' : ''}`}>
              <div className="w-notif-header">
                <span style={{ fontWeight: 700, fontSize: '0.9375rem' }}>Notifications</span>
                {unread > 0 && (
                  <button className="w-btn-link" onClick={markAllRead}>
                    <Check size={13} /> Mark all read
                  </button>
                )}
              </div>
              <div className="w-notif-list">
                {notifs.length === 0 ? (
                  <div style={{ padding: '24px 16px', textAlign: 'center', color: 'var(--w-text-muted)', fontSize: '0.875rem' }}>
                    No notifications
                  </div>
                ) : notifs.map(n => (
                  <div key={n.id} className={`w-notif-item ${!n.isRead ? 'unread' : ''}`}
                    onClick={() => { setShowNotifs(false); if (n.link) router.push(n.link) }}>
                    <div className="w-notif-icon">{NOTIF_ICONS[n.type] ?? NOTIF_ICONS.DEFAULT}</div>
                    <div className="w-notif-body">
                      <div className="w-notif-title">{n.title}</div>
                      <div className="w-notif-msg">{n.message}</div>
                      <div className="w-notif-time">{timeAgo(n.createdAt)}</div>
                    </div>
                    {!n.isRead && <div className="w-notif-dot" />}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Nav */}
        <nav className="w-sidebar-nav">
          <div className="w-sidebar-section-label">Workspace</div>
          {navItems.map(({ href, label, icon: Icon }) => (
            <Link key={href} href={href} className={`w-sidebar-item w-focus-ring ${isActive(href) ? 'active' : ''}`} data-tour-w={href.replace('/w/','')}>
              <Icon size={18} />
              <span>{label}</span>
              {isActive(href) && <ChevronRight size={14} className="w-sidebar-item-arrow" />}
            </Link>
          ))}
          {isAdmin && (
            <>
              <div className="w-sidebar-section-label" style={{ marginTop: 12 }}>Management</div>
              {adminItems.map(({ href, label, icon: Icon }) => (
                <Link key={href} href={href} className={`w-sidebar-item w-focus-ring ${isActive(href) ? 'active' : ''}`}>
                  <Icon size={18} />
                  <span>{label}</span>
                  {isActive(href) && <ChevronRight size={14} className="w-sidebar-item-arrow" />}
                </Link>
              ))}
            </>
          )}
        </nav>

        {/* Footer */}
        <div className="w-sidebar-footer">
          <div className="w-sidebar-user">
            <Link href="/w/profile" className="w-sidebar-user-link w-focus-ring"
              title="Open your profile" aria-label="Open your profile">
              <div className="w-avatar w-avatar-sm"
                style={{ background: user.avatarColor ?? '#6366f1', overflow: 'hidden' }}>
                {user.image ? (
                  <img src={user.image} alt={user.name ?? 'avatar'} width={28} height={28}
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                ) : (
                  getInitials(user.name ?? user.email ?? 'U')
                )}
              </div>
              <div className="w-sidebar-user-info">
                <span className="w-sidebar-user-name">{user.name ?? 'User'}</span>
                <span className="w-sidebar-user-role">{getRoleLabel(user.role)}</span>
              </div>
            </Link>
            <button className="w-btn w-btn-icon w-btn-ghost w-focus-ring" onClick={handleLogout}
              title="Sign out" aria-label="Sign out">
              <LogOut size={16} />
            </button>
          </div>
        </div>
      </aside>
    </>
  )
}
