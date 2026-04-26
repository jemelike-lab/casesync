'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'

export interface Notification {
  id: string
  user_id: string
  title: string
  body: string | null
  link: string | null
  read: boolean
  created_at: string
}

export function useNotifications(userId: string | null) {
  const supabase = createClient()
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [archivedNotifications, setArchivedNotifications] = useState<Notification[]>([])
  const [unreadCount, setUnreadCount] = useState(0)

  async function fetchNotifications() {
    if (!userId) return

    const { data: unreadData } = await supabase
      .from('notifications')
      .select('*')
      .eq('user_id', userId)
      .eq('read', false)
      .order('created_at', { ascending: false })
      .limit(50)

    const { data: readData } = await supabase
      .from('notifications')
      .select('*')
      .eq('user_id', userId)
      .eq('read', true)
      .order('created_at', { ascending: false })
      .limit(50)

    const { count } = await supabase
      .from('notifications')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('read', false)

    const notifs = (unreadData as Notification[]) ?? []
    const archived = (readData as Notification[]) ?? []
    setNotifications(notifs)
    setArchivedNotifications(archived)
    setUnreadCount(count ?? notifs.length)
  }

  async function markAllRead() {
    if (!userId) return
    await supabase
      .from('notifications')
      .update({ read: true })
      .eq('user_id', userId)
      .eq('read', false)
    setArchivedNotifications(prev => [...notifications.map(n => ({ ...n, read: true })), ...prev])
    setNotifications([])
    setUnreadCount(0)
  }

  async function markRead(id: string) {
    let movedNotification: Notification | null = null
    setNotifications(prev => {
      const match = prev.find(n => n.id === id) ?? null
      movedNotification = match ? { ...match, read: true } : null
      return prev.filter(n => n.id !== id)
    })
    if (movedNotification) {
      setArchivedNotifications(prev => [movedNotification!, ...prev])
    }
    await supabase.from('notifications').update({ read: true }).eq('id', id)
    setUnreadCount(prev => Math.max(0, prev - 1))
  }

  useEffect(() => {
    if (!userId) return
    void fetchNotifications()

    const channel = supabase
      .channel(`notifications:${userId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}` },
        (payload) => {
          const newNotif = payload.new as Notification
          setNotifications(prev => [newNotif, ...prev])
          setUnreadCount(prev => prev + 1)
        }
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId])

  return { notifications, archivedNotifications, unreadCount, markAllRead, markRead, refetch: fetchNotifications }
}
