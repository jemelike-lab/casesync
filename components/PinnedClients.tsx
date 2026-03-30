'use client'

import Link from 'next/link'
import { Client, getDateStatus } from '@/lib/types'
import StatusDot from './StatusDot'

interface Props {
  clients: Client[]
  pinnedIds: string[]
  onUnpin: (id: string) => void
}

function worstStatus(client: Client) {
  const dates = [
    client.eligibility_end_date,
    client.three_month_visit_due,
    client.quarterly_waiver_date,
    client.assessment_due,
  ]
  const statuses = dates.map(d => getDateStatus(d))
  if (statuses.includes('red')) return 'red' as const
  if (statuses.includes('orange')) return 'orange' as const
  if (statuses.includes('yellow')) return 'yellow' as const
  if (statuses.includes('green')) return 'green' as const
  return 'none' as const
}

export default function PinnedClients({ clients, pinnedIds, onUnpin }: Props) {
  const pinned = clients.filter(c => pinnedIds.includes(c.id))
  if (pinned.length === 0) return null

  return (
    <div style={{ marginBottom: 24 }}>
      <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
        📌 Pinned ({pinned.length}/5)
      </div>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        {pinned.map(c => {
          const status = worstStatus(c)
          return (
            <div key={c.id} style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '8px 12px',
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              borderRadius: 10,
              fontSize: 13,
            }}>
              <StatusDot status={status} size={8} />
              <Link href={`/clients/${c.id}`} style={{ color: 'var(--text)', textDecoration: 'none', fontWeight: 500 }}>
                {c.last_name}, {c.first_name}
              </Link>
              <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{c.client_id}</span>
              <button
                onClick={() => onUnpin(c.id)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', fontSize: 14, padding: 0 }}
              >
                ×
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}
