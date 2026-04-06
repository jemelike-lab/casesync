'use client'

import { useState } from 'react'
import Header from '@/components/Header'
import CalendarView from '@/components/CalendarView'
import { Profile } from '@/lib/types'

interface Props {
  userId: string
  profile: Profile
  canSeeAll: boolean
}

export default function CalendarPageClient({ userId, profile, canSeeAll }: Props) {
  const [showAll, setShowAll] = useState(false)

  const userLike = { id: userId, email: '' } as any
  const assignedTo = canSeeAll ? (showAll ? null : userId) : userId

  return (
    <>
      <Header user={userLike} profile={profile} />
      <main style={{ maxWidth: 1100, margin: '0 auto', padding: '24px 16px 100px' }}>
        <div style={{ marginBottom: 24, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <div>
            <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 4 }}>📅 Calendar</h1>
            <p style={{ fontSize: 14, color: 'var(--text-secondary)' }}>
              All client deadlines at a glance
            </p>
          </div>
          {canSeeAll && (
            <button onClick={() => setShowAll(v => !v)} className="btn-secondary" style={{ fontSize: 12 }}>
              {showAll ? '👤 My Clients' : '👥 All Clients'}
            </button>
          )}
        </div>
        <div className="card">
          <CalendarView assignedTo={assignedTo} />
        </div>
      </main>
    </>
  )
}
