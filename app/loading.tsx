'use client'

import { useEffect, useState } from 'react'
import LottieBlock from '@/components/ui/LottieBlock'
import { ANIM } from '@/lib/animations'

/**
 * Root route loading fallback. Includes a session watchdog: if a route stays
 * in its loading state for 10s+, the most common cause in CaseSync is an
 * expired session whose refresh has stalled (15-minute idle timeout) — so we
 * surface a sign-in escape hatch instead of trapping the user on a spinner.
 */
export default function RootLoading() {
  const [stalled, setStalled] = useState(false)
  useEffect(() => {
    const t = setTimeout(() => setStalled(true), 10000)
    return () => clearTimeout(t)
  }, [])
  return (
    <div style={{ minHeight: '55vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 14 }}>
      <LottieBlock src={ANIM.loader} size={120} trigger="loop" label="Loading" />
      <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Loading…</div>
      {stalled && (
        <div style={{ textAlign: 'center', marginTop: 6 }}>
          <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 8 }}>
            This is taking longer than usual — your session may have expired.
          </div>
          <a href="/login?reason=session_timeout" style={{ fontSize: 13.5, fontWeight: 650, color: 'var(--accent)', textDecoration: 'none', border: '1px solid var(--border)', padding: '8px 16px', borderRadius: 10, display: 'inline-block' }}>
            Sign in again
          </a>
        </div>
      )}
    </div>
  )
}
