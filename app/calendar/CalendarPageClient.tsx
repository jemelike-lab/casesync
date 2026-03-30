'use client'

import { useState } from 'react'
import Header from '@/components/Header'
import CalendarView from '@/components/CalendarView'
import { Client, Profile } from '@/lib/types'
import { User } from '@supabase/supabase-js'

interface Props {
  clients: Client[]
  userId: string
  profile: Profile
  canSeeAll: boolean
}

export default function CalendarPageClient({ clients, userId, profile, canSeeAll }: Props) {
  const [showAll, setShowAll] = useState(false)

  const visibleClients = showAll ? clients : clients.filter(c => c.assigned_to === userId)

  // Create a minimal User-like object for Header
  const userLike = { id: userId, email: '' } as any

  return (
    <>
      <Header user={userLike} profile={profile} />
      <main style={{ maxWidth: 1100, margin: '0 auto', padding: '24px 16px 100px' }}>
        <div style={{ marginBottom: 24 }}>
          <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 4 }}>📅 Calendar</h1>
          <p style={{ fontSize: 14, color: 'var(--text-secondary)' }}>
            All client deadlines at a glance
          </p>
        </div>
        <div className="card">
          <CalendarView
            clients={visibleClients}
            showAll={showAll}
            onToggleShowAll={canSeeAll ? () => setShowAll(v => !v) : undefined}
            canToggle={canSeeAll}
          />
        </div>
      </main>
    </>
  )
}
