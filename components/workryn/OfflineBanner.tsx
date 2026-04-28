'use client'

import { useState, useEffect } from 'react'
import { WifiOff, Wifi } from 'lucide-react'

export default function OfflineBanner() {
  const [isOnline, setIsOnline] = useState(true)
  const [showReconnected, setShowReconnected] = useState(false)

  useEffect(() => {
    // Set initial state
    setIsOnline(navigator.onLine)

    function handleOnline() {
      setIsOnline(true)
      setShowReconnected(true)
      // Auto-dismiss "back online" message after 3s
      setTimeout(() => setShowReconnected(false), 3000)
    }

    function handleOffline() {
      setIsOnline(false)
      setShowReconnected(false)
    }

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)

    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  if (isOnline && !showReconnected) return null

  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        position: 'fixed',
        bottom: 'calc(16px + env(safe-area-inset-bottom, 0px))',
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '10px 18px',
        borderRadius: 12,
        fontSize: 13,
        fontWeight: 600,
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
        boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
        animation: 'slideUpBanner 300ms ease-out',
        ...(isOnline
          ? {
              background: 'rgba(16, 185, 129, 0.15)',
              border: '1px solid rgba(16, 185, 129, 0.3)',
              color: '#34d399',
            }
          : {
              background: 'rgba(239, 68, 68, 0.15)',
              border: '1px solid rgba(239, 68, 68, 0.3)',
              color: '#f87171',
            }),
      }}
    >
      {isOnline ? (
        <>
          <Wifi size={15} />
          <span>Back online</span>
        </>
      ) : (
        <>
          <WifiOff size={15} />
          <span>You&apos;re offline — some features may not work</span>
        </>
      )}
      <style>{`
        @keyframes slideUpBanner {
          from { transform: translateX(-50%) translateY(20px); opacity: 0; }
          to { transform: translateX(-50%) translateY(0); opacity: 1; }
        }
      `}</style>
    </div>
  )
}
