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
  const [showAll, setShowAll] = useState(canSeeAll)

  const userLike = { id: userId, email: '' } as any
  const assignedTo = canSeeAll ? (showAll ? null : userId) : userId

  return (
    <>
      <Header user={userLike} profile={profile} />
      <main style={{ maxWidth: 1200, margin: '0 auto', padding: '24px 16px 100px' }}>
        {/* Premium Calendar Header */}
        <div style={{
          marginBottom: 24, borderRadius: 22, padding: '28px 28px 24px',
          background: 'linear-gradient(160deg, #0c1a3a 0%, #142244 40%, #0e1630 100%)',
          border: '1px solid rgba(100,140,255,0.12)',
          position: 'relative', overflow: 'hidden',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16, flexWrap: 'wrap',
        }}>
          <div style={{ position: 'absolute', top: -40, right: -40, width: 120, height: 120, borderRadius: '50%', background: 'radial-gradient(circle, rgba(100,140,255,0.08) 0%, transparent 70%)', pointerEvents: 'none' }} />
          <div style={{ position: 'relative', zIndex: 1 }}>
            <div style={{ fontSize: 12, fontWeight: 500, color: 'rgba(160,180,255,0.5)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 6 }}>
              Deadline Calendar
            </div>
            <h1 style={{ fontSize: 26, fontWeight: 800, margin: 0, color: '#fff' }}>📅 Calendar</h1>
            <p style={{ fontSize: 13, color: 'rgba(200,210,255,0.5)', margin: '6px 0 0' }}>
              All client deadlines at a glance — color-coded by urgency
            </p>
          </div>
          {canSeeAll && (
            <button
              onClick={() => setShowAll(v => !v)}
              style={{
                fontSize: 12, fontWeight: 700, padding: '9px 18px', borderRadius: 12,
                background: showAll ? 'rgba(0,122,255,0.15)' : 'rgba(255,255,255,0.06)',
                border: showAll ? '1px solid rgba(0,122,255,0.3)' : '1px solid rgba(255,255,255,0.1)',
                color: showAll ? '#5ac8fa' : 'rgba(255,255,255,0.6)',
                cursor: 'pointer', transition: 'all 0.2s',
                position: 'relative', zIndex: 1,
              }}
            >
              {showAll ? '👤 Scoped View' : '👥 All Clients'}
            </button>
          )}
        </div>

        {/* Calendar Container */}
        <div style={{
          borderRadius: 22, overflow: 'hidden',
          border: '1px solid rgba(255,255,255,0.05)',
          background: 'linear-gradient(160deg, rgba(255,255,255,0.02) 0%, rgba(255,255,255,0.005) 100%)',
          padding: '20px',
        }}>
          <CalendarView assignedTo={assignedTo} />
        </div>
      </main>
    </>
  )
}
