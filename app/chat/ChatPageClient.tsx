'use client'

import { useState } from 'react'
import Header from '@/components/Header'
import ChatSidebar from '@/components/ChatSidebar'
import ChatWindow from '@/components/ChatWindow'
import { Profile } from '@/lib/types'

interface Channel {
  id: string
  name: string | null
  kind: string
  client_id: string | null
}

interface Props {
  userId: string
  profile: Profile
  channels: Channel[]
  allUsers: { id: string; full_name: string | null }[]
}

export default function ChatPageClient({ userId, profile, channels, allUsers }: Props) {
  const [selectedChannelId, setSelectedChannelId] = useState<string | null>(channels[0]?.id ?? null)

  const selectedChannel = channels.find(c => c.id === selectedChannelId)
  const userLike = { id: userId, email: '' } as any

  return (
    <>
      <Header user={userLike} profile={profile} />
      <div style={{ height: 'calc(100vh - 60px)', display: 'flex', overflow: 'hidden' }}>
        <ChatSidebar
          channels={channels}
          selectedId={selectedChannelId}
          onSelect={setSelectedChannelId}
        />
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: 'var(--bg)' }}>
          {selectedChannelId && selectedChannel ? (
            <ChatWindow
              channelId={selectedChannelId}
              channelName={selectedChannel.name ?? 'Channel'}
              currentUserId={userId}
              users={allUsers}
            />
          ) : (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-secondary)', fontSize: 14 }}>
              Select a channel to start messaging
            </div>
          )}
        </div>
      </div>
    </>
  )
}
