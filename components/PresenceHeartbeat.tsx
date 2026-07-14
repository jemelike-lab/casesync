'use client'

// Invisible presence heartbeat, mounted inside Header (authenticated pages
// only). POSTs /api/presence on mount, on route change (throttled), and
// every 60s. Backs off silently on 401 (signed-out tab).

import { useEffect, useRef } from 'react'
import { usePathname } from 'next/navigation'

const INTERVAL_MS = 60_000
const MIN_GAP_MS = 15_000

export default function PresenceHeartbeat() {
  const pathname = usePathname()
  const lastSent = useRef(0)
  const dead = useRef(false)

  useEffect(() => {
    const send = async () => {
      if (dead.current) return
      const now = Date.now()
      if (now - lastSent.current < MIN_GAP_MS) return
      lastSent.current = now
      try {
        const res = await fetch('/api/presence', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ path: window.location.pathname }),
          keepalive: true,
        })
        if (res.status === 401) dead.current = true
      } catch { /* network blip - next tick retries */ }
    }
    send()
    const t = setInterval(send, INTERVAL_MS)
    return () => clearInterval(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname])

  return null
}
