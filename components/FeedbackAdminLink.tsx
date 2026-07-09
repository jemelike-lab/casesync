'use client'

// FeedbackAdminLink — "Feedback & Issues" entry on the Admin Panel header with
// a live new-report count. Self-contained so AdminClient only needs a one-line
// mount. Hides itself when the count endpoint returns 403 (IT can open /admin
// but has no feedback triage scope — Tier 1 IT scope-down).

import { useEffect, useState } from 'react'
import Link from 'next/link'

export default function FeedbackAdminLink() {
  const [newCount, setNewCount] = useState<number | null>(null)
  const [hidden, setHidden] = useState(false)

  useEffect(() => {
    let cancelled = false
    fetch('/api/feedback?count=new')
      .then(async (res) => {
        if (cancelled) return
        if (res.status === 403) {
          setHidden(true)
          return
        }
        if (!res.ok) return
        const d = await res.json().catch(() => null)
        if (!cancelled && typeof d?.new_count === 'number') setNewCount(d.new_count)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [])

  if (hidden) return null

  return (
    <Link
      href="/admin/feedback"
      style={{
        fontSize: 13, color: 'var(--accent)', textDecoration: 'none',
        padding: '6px 12px', border: '1px solid var(--border)', borderRadius: 6,
        display: 'inline-flex', alignItems: 'center', gap: 6,
      }}
    >
      📮 Feedback &amp; Issues
      {newCount !== null && newCount > 0 && (
        <span
          style={{
            fontSize: 11, fontWeight: 700, lineHeight: 1,
            padding: '3px 7px', borderRadius: 999,
            background: 'var(--red)', color: '#ffffff',
          }}
        >
          {newCount > 99 ? '99+' : newCount}
        </span>
      )}
    </Link>
  )
}
