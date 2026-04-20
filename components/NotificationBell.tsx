'use client'

import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useNotifications } from '@/hooks/useNotifications'

interface Props {
  userId: string
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

function resolveNotificationLink(link: string | null, title: string, body: string | null) {
  if (!link) return null

  const raw = `${title} ${body ?? ''}`.toLowerCase()
  const isClientLink = /^\/clients\/[^/?#]+$/.test(link)
  const isDeadlineLike = raw.includes('overdue') || raw.includes('due') || raw.includes('deadline') || raw.includes('spm')

  if (isClientLink && isDeadlineLike) {
    return `${link}?highlight=overdue#section-plans-assessments`
  }

  return link
}

export default function NotificationBell({ userId }: Props) {
  const router = useRouter()
  const { notifications, unreadCount, markAllRead, markRead } = useNotifications(userId)
  const [open, setOpen] = useState(false)
  const [shake, setShake] = useState(false)
  const [isMobileViewport, setIsMobileViewport] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const prevUnreadRef = useRef(unreadCount)

  // Trigger shake animation when new notifications arrive
  useEffect(() => {
    if (unreadCount > prevUnreadRef.current) {
      setShake(true)
      setTimeout(() => setShake(false), 600)
    }
    prevUnreadRef.current = unreadCount
  }, [unreadCount])

  useEffect(() => {
    function handle(e: MouseEvent | PointerEvent | TouchEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handle as EventListener)
    document.addEventListener('pointerdown', handle as EventListener)
    document.addEventListener('touchstart', handle as EventListener)
    return () => {
      document.removeEventListener('mousedown', handle as EventListener)
      document.removeEventListener('pointerdown', handle as EventListener)
      document.removeEventListener('touchstart', handle as EventListener)
    }
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') return
    const media = window.matchMedia('(max-width: 640px)')
    const sync = () => setIsMobileViewport(media.matches || window.innerWidth <= 640)
    sync()
    if (typeof media.addEventListener === 'function') {
      media.addEventListener('change', sync)
      window.addEventListener('resize', sync)
      return () => {
        media.removeEventListener('change', sync)
        window.removeEventListener('resize', sync)
      }
    }
    media.addListener(sync)
    window.addEventListener('resize', sync)
    return () => {
      media.removeListener(sync)
      window.removeEventListener('resize', sync)
    }
  }, [])

  async function handleClick(id: string, link: string | null, title: string, body: string | null) {
    await markRead(id)
    setOpen(false)
    const resolvedLink = resolveNotificationLink(link, title, body)
    if (resolvedLink) router.push(resolvedLink)
  }

  return (
    <div ref={ref} style={{ position: 'relative', zIndex: 6000 }}>
      <button
        onPointerUp={(event) => {
          event.preventDefault()
          event.stopPropagation()
          if (isMobileViewport) {
            router.push('/dashboard/notifications')
            return
          }
          setOpen(v => !v)
        }}
        onClick={(event) => {
          event.preventDefault()
          event.stopPropagation()
          if (isMobileViewport) {
            router.push('/dashboard/notifications')
            return
          }
          setOpen(v => !v)
        }}
        onTouchEnd={(event) => {
          event.preventDefault()
          event.stopPropagation()
          if (isMobileViewport) {
            router.push('/dashboard/notifications')
            return
          }
          setOpen(v => !v)
        }}
        className={shake ? 'bell-shake' : undefined}
        style={{
          background: 'none', border: 'none', cursor: 'pointer', position: 'relative',
          padding: 6, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: 'var(--text)', fontSize: 20, minHeight: 36, minWidth: 36,
          // Gentle pulse animation on the whole button when there are unread
          animation: unreadCount > 0 && !shake ? 'bellPulse 3s ease-in-out infinite' : undefined,
        }}
        aria-label={`${unreadCount} notifications`}
      >
        <style>{`
          @keyframes bellPulse {
            0%, 100% { transform: scale(1) rotate(0deg); }
            25% { transform: scale(1.1) rotate(-8deg); }
            75% { transform: scale(1.1) rotate(8deg); }
          }
          @keyframes badgePulse {
            0%, 100% { transform: scale(1); }
            50% { transform: scale(1.2); }
          }
        `}</style>
        🔔
        {unreadCount > 0 && (
          <span style={{
            position: 'absolute', top: 2, right: 2, background: '#ff453a', color: 'white',
            borderRadius: '50%', width: 16, height: 16, fontSize: 10, fontWeight: 700,
            display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1,
            animation: 'badgePulse 2s ease-in-out infinite',
          }}>
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <>
        {isMobileViewport && (
          <div
            onClick={() => setOpen(false)}
            style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 8998 }}
          />
        )}
        <div className="slide-in-up" style={{
          position: isMobileViewport ? 'fixed' : 'absolute',
          right: isMobileViewport ? 0 : 0,
          left: isMobileViewport ? 0 : 'auto',
          top: isMobileViewport ? 0 : 'calc(100% + 8px)',
          bottom: isMobileViewport ? 0 : 'auto',
          width: isMobileViewport ? '100vw' : 340,
          maxHeight: isMobileViewport ? '100dvh' : 420,
          background: 'var(--surface)', border: isMobileViewport ? 'none' : '1px solid var(--border)', borderRadius: isMobileViewport ? 0 : 12,
          boxShadow: isMobileViewport ? 'none' : '0 8px 32px rgba(0,0,0,0.5)', zIndex: 8999, overflow: 'hidden',
          display: 'flex', flexDirection: 'column',
        }}>
          <div style={{ padding: isMobileViewport ? '16px 16px 12px' : '12px 16px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
            <span style={{ fontWeight: 600, fontSize: 14 }}>Notifications</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              {unreadCount > 0 && (
                <button
                  onClick={markAllRead}
                  style={{ fontSize: 12, color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                >
                  Mark all read
                </button>
              )}
              {isMobileViewport && (
                <button
                  onClick={() => setOpen(false)}
                  style={{ fontSize: 13, color: 'var(--text)', background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontWeight: 700 }}
                >
                  Close
                </button>
              )}
            </div>
          </div>
          <div style={{ overflowY: 'auto', flex: 1 }}>
            {notifications.length === 0 ? (
              <div style={{ padding: 24, textAlign: 'center', fontSize: 13, color: 'var(--text-secondary)' }}>
                No notifications yet
              </div>
            ) : (
              notifications.map(n => (
                <div
                  key={n.id}
                  onClick={(event) => {
                    event.preventDefault()
                    event.stopPropagation()
                    handleClick(n.id, n.link, n.title, n.body)
                  }}
                  style={{
                    padding: '12px 16px', borderBottom: '1px solid var(--border)',
                    cursor: n.link ? 'pointer' : 'default',
                    background: n.read ? 'transparent' : 'rgba(0,122,255,0.06)',
                    transition: 'background 0.15s',
                  }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface-2)')}
                  onMouseLeave={e => (e.currentTarget.style.background = n.read ? 'transparent' : 'rgba(0,122,255,0.06)')}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13, fontWeight: n.read ? 400 : 600 }}>{n.title}</div>
                      {n.body && <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>{n.body}</div>}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      {!n.read && <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--accent)', display: 'inline-block', flexShrink: 0 }} />}
                      <span style={{ fontSize: 11, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>{timeAgo(n.created_at)}</span>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
        </>
      )}
    </div>
  )
}
