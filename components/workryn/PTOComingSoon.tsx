'use client'

/**
 * PTOComingSoon — placeholder rendered while the PTO module is gated off
 * (see PTO_COMING_SOON in app/(workryn)/w/pto/page.tsx). Self-contained
 * aurora-teal glass panel; no data dependencies. Delete-safe: removing the
 * flag restores the full PTOClient untouched.
 */

import LottieBlock from '@/components/ui/LottieBlock'
import { ANIM } from '@/lib/animations'

export default function PTOComingSoon() {
  return (
    <div style={{ padding: '24px 24px 40px', maxWidth: 1100, margin: '0 auto' }}>
      <div
        style={{
          position: 'relative',
          overflow: 'hidden',
          borderRadius: 20,
          minHeight: 460,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          border: '1px solid rgba(45,212,191,0.22)',
          boxShadow: '0 24px 60px -28px rgba(0,0,0,0.6)',
          background:
            'radial-gradient(110% 140% at 12% 0%, rgba(45,212,191,0.16), rgba(45,212,191,0) 55%),' +
            'radial-gradient(120% 150% at 95% 10%, rgba(94,234,212,0.10), rgba(94,234,212,0) 50%),' +
            'radial-gradient(140% 180% at 70% 120%, rgba(13,148,136,0.20), rgba(13,148,136,0) 60%),' +
            'linear-gradient(135deg, #0a1620 0%, #0c1f26 50%, #0f2a2c 100%)',
        }}
      >
        <img
          src="/heroes/pto.svg"
          alt=""
          aria-hidden="true"
          style={{
            position: 'absolute',
            left: '50%',
            top: '50%',
            transform: 'translate(-50%, -50%)',
            height: '78%',
            zIndex: 0,
            opacity: 0.14,
            pointerEvents: 'none',
          }}
        />

        <div style={{ position: 'relative', zIndex: 2, textAlign: 'center', padding: '48px 28px', maxWidth: 560 }}>
          <div
            style={{
              display: 'inline-flex',
              background: 'rgba(255,255,255,0.88)',
              backdropFilter: 'blur(8px)',
              borderRadius: 18,
              padding: 10,
              boxShadow: '0 8px 26px rgba(0,0,0,0.35)',
              marginBottom: 22,
            }}
          >
            <LottieBlock src={ANIM.heroPto} size={64} trigger="mount" />
          </div>

          <div
            style={{
              fontSize: 12,
              letterSpacing: '0.14em',
              textTransform: 'uppercase',
              fontWeight: 700,
              color: 'rgba(94,234,212,0.9)',
              marginBottom: 10,
            }}
          >
            Paid Time Off
          </div>

          <h1
            style={{
              margin: '0 0 12px',
              fontSize: 42,
              lineHeight: 1.05,
              fontWeight: 800,
              letterSpacing: '-0.02em',
              color: '#fff',
            }}
          >
            Coming soon
          </h1>

          <p style={{ margin: '0 0 22px', fontSize: 15, lineHeight: 1.6, color: 'rgba(226,232,240,0.75)' }}>
            PTO balances, requests, and approvals are being built right into Workryn. Until this launches, keep
            submitting time-off requests to your supervisor the way you do today.
          </p>

          <a
            href="/w/benefits#pto"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              padding: '10px 18px',
              borderRadius: 12,
              fontSize: 13.5,
              fontWeight: 650,
              color: '#5eead4',
              background: 'rgba(45,212,191,0.10)',
              border: '1px solid rgba(45,212,191,0.35)',
              textDecoration: 'none',
            }}
          >
            View your PTO policy in Benefits
            <svg
              width="15"
              height="15"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M5 12h14M13 6l6 6-6 6" />
            </svg>
          </a>
        </div>
      </div>
    </div>
  )
}
