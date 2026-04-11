'use client'

import { useRouter } from 'next/navigation'
import { Profile } from '@/lib/types'
import { useNotifications } from '@/hooks/useNotifications'

interface Props {
  userId: string
  profile: Profile | null
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

export default function NotificationsPageClient({ userId, profile }: Props) {
  const router = useRouter()
  const { notifications, unreadCount, markAllRead, markRead } = useNotifications(userId)

  async function handleOpen(id: string, link: string | null, title: string, body: string | null) {
    await markRead(id)
    const resolvedLink = resolveNotificationLink(link, title, body)
    if (resolvedLink) {
      router.push(resolvedLink)
      return
    }
  }

  return (
    <main style={{ padding: '20px 16px 120px', maxWidth: 820, margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, marginBottom: 20 }}>
        <div>
          <div style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-secondary)', marginBottom: 6 }}>
            Inbox
          </div>
          <h1 style={{ margin: 0, fontSize: 28, lineHeight: 1.1 }}>Notifications</h1>
          <div style={{ marginTop: 8, fontSize: 14, color: 'var(--text-secondary)' }}>
            {unreadCount > 0 ? `${unreadCount} unread` : 'All caught up'}
            {profile?.full_name ? ` · ${profile.full_name}` : ''}
          </div>
        </div>
        {unreadCount > 0 && (
          <button
            onClick={markAllRead}
            className="btn-secondary"
            style={{ whiteSpace: 'nowrap' }}
          >
            Mark all read
          </button>
        )}
      </div>

      <div style={{ border: '1px solid var(--border)', borderRadius: 16, overflow: 'hidden', background: 'var(--surface)' }}>
        {notifications.length === 0 ? (
          <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-secondary)', fontSize: 14 }}>
            No notifications yet.
          </div>
        ) : (
          notifications.map((notification) => {
            const resolvedLink = resolveNotificationLink(notification.link, notification.title, notification.body)
            return (
              <button
                key={notification.id}
                onClick={() => handleOpen(notification.id, notification.link, notification.title, notification.body)}
                style={{
                  width: '100%',
                  textAlign: 'left',
                  padding: '16px 18px',
                  border: 'none',
                  borderBottom: '1px solid var(--border)',
                  background: notification.read ? 'transparent' : 'rgba(0,122,255,0.06)',
                  color: 'inherit',
                  cursor: resolvedLink ? 'pointer' : 'default',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                      {!notification.read && (
                        <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--accent)', flexShrink: 0 }} />
                      )}
                      <span style={{ fontSize: 15, fontWeight: notification.read ? 500 : 700 }}>{notification.title}</span>
                    </div>
                    {notification.body && (
                      <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.45 }}>
                        {notification.body}
                      </div>
                    )}
                    {resolvedLink && (
                      <div style={{ marginTop: 8, fontSize: 12, color: 'var(--accent)', fontWeight: 600 }}>
                        Open
                      </div>
                    )}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)', whiteSpace: 'nowrap', flexShrink: 0 }}>
                    {timeAgo(notification.created_at)}
                  </div>
                </div>
              </button>
            )
          })
        )}
      </div>
    </main>
  )
}
