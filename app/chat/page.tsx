import { createClient } from '@/lib/supabase/server'
import { Profile } from '@/lib/types'
import { redirect } from 'next/navigation'
import ChatPageClient from './ChatPageClient'

export const dynamic = 'force-dynamic'

export default async function ChatPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single()

  if (!profile) redirect('/login')

  // Get all users for @mention and DM user data
  const { data: allUsers } = await supabase
    .from('profiles')
    .select('id, full_name, role')
    .order('full_name')

  const usersById = Object.fromEntries((allUsers ?? []).map((u: any) => [u.id, u]))

  // Ensure Team channel exists
  let { data: teamChannels } = await supabase
    .from('chat_channels')
    .select('id, name, kind, client_id')
    .eq('kind', 'team')

  if (!teamChannels || teamChannels.length === 0) {
    await supabase
      .from('chat_channels')
      .insert({ name: 'Team', kind: 'team', created_by: user.id })

    const { data: refetched } = await supabase
      .from('chat_channels')
      .select('id, name, kind, client_id')
      .eq('kind', 'team')
    teamChannels = refetched ?? []
  }

  // Get user's memberships in direct + client channels
  const { data: myMemberships } = await supabase
    .from('chat_members')
    .select('channel_id')
    .eq('user_id', user.id)

  const myChannelIds = (myMemberships ?? []).map((m: any) => m.channel_id)

  // Get direct and client channels user is a member of
  let memberChannels: any[] = []
  if (myChannelIds.length > 0) {
    const { data: mc } = await supabase
      .from('chat_channels')
      .select('id, name, kind, client_id')
      .in('id', myChannelIds)
      .in('kind', ['direct', 'client'])
    memberChannels = mc ?? []
  }

  // For direct channels, find the other user
  const directChannels = memberChannels.filter((c: any) => c.kind === 'direct')
  const directChannelIds = directChannels.map((c: any) => c.id)

  let otherMembersMap: Record<string, any> = {}
  if (directChannelIds.length > 0) {
    const { data: otherMembers } = await supabase
      .from('chat_members')
      .select('channel_id, user_id')
      .in('channel_id', directChannelIds)
      .neq('user_id', user.id)

    for (const m of (otherMembers ?? [])) {
      if (!otherMembersMap[m.channel_id]) {
        const otherUser = usersById[m.user_id]
        if (otherUser) otherMembersMap[m.channel_id] = otherUser
      }
    }
  }

  // Get last messages and unread counts for all user's channels
  const allChannelIds = [
    ...((teamChannels ?? []).map((c: any) => c.id)),
    ...memberChannels.map((c: any) => c.id),
  ]

  let unreadMap: Record<string, number> = {}
  let lastMessageMap: Record<string, { content: string; created_at: string }> = {}

  if (allChannelIds.length > 0) {
    // Fetch recent messages per channel for unread counts and last message preview
    const { data: recentMessages } = await supabase
      .from('chat_messages')
      .select('id, channel_id, content, created_at, sender_id, read_by')
      .in('channel_id', allChannelIds)
      .order('created_at', { ascending: false })
      .limit(500)

    for (const msg of (recentMessages ?? [])) {
      // Last message preview
      if (!lastMessageMap[msg.channel_id]) {
        lastMessageMap[msg.channel_id] = { content: msg.content, created_at: msg.created_at }
      }
      // Unread count
      if (msg.sender_id !== user.id) {
        const readBy = msg.read_by ?? []
        if (!readBy.includes(user.id)) {
          unreadMap[msg.channel_id] = (unreadMap[msg.channel_id] ?? 0) + 1
        }
      }
    }
  }

  // Build channel list
  const buildChannel = (c: any) => ({
    id: c.id,
    name: c.name,
    kind: c.kind,
    client_id: c.client_id,
    unread: unreadMap[c.id] ?? 0,
    otherUser: c.kind === 'direct' ? otherMembersMap[c.id] ?? null : undefined,
    lastMessage: lastMessageMap[c.id]?.content ?? undefined,
    lastMessageAt: lastMessageMap[c.id]?.created_at ?? undefined,
  })

  // Filter client channels based on role
  let clientChannels = memberChannels.filter((c: any) => c.kind === 'client')
  // (role-based filtering already handled by membership)

  const channels = [
    ...directChannels.map(buildChannel).sort((a: any, b: any) => {
      // Sort by last message time desc
      if (a.lastMessageAt && b.lastMessageAt) {
        return new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime()
      }
      return 0
    }),
    ...(teamChannels ?? []).map(buildChannel),
    ...clientChannels.map(buildChannel),
  ]

  return (
    <ChatPageClient
      userId={user.id}
      profile={profile as Profile}
      channels={channels}
      allUsers={(allUsers ?? []) as { id: string; full_name: string | null; role?: string | null }[]}
    />
  )
}
