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
          currentUser={profile}
        />
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: '#0f0f11' }}>
          {selectedChannelId && selectedChannel ? (
            <ChatWindow
              channelId={selectedChannelId}
              channelName={selectedChannel.name ?? 'Channel'}
              currentUserId={userId}
              users={allUsers}
            />
          ) : (
            <div style={{
              flex: 1, display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'center',
              color: '#636366', fontSize: 14, gap: 12,
            }}>
              <div style={{ fontSize: 40 }}>💬</div>
              <div style={{ fontWeight: 600, color: '#8e8e93' }}>Select a channel to start messaging</div>
              <div style={{ fontSize: 13, color: '#48484a' }}>Choose from the sidebar on the left</div>
            </div>
          )}
        </div>
      </div>
    </>
  )
}
