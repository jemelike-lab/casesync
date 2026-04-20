'use client'

import { useEffect, useState } from 'react'

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

export default function InstallBanner() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null)
  const [show, setShow] = useState(false)
  const [animateIn, setAnimateIn] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined') return
    if (localStorage.getItem('pwa-banner-dismissed') === 'true') return
    if (window.matchMedia('(display-mode: standalone)').matches) return

    const handler = (e: Event) => {
      e.preventDefault()
      setDeferredPrompt(e as BeforeInstallPromptEvent)
      // Delay show for page to settle
      setTimeout(() => {
        setShow(true)
        requestAnimationFrame(() => setAnimateIn(true))
      }, 2000)
    }

    window.addEventListener('beforeinstallprompt', handler)
    return () => window.removeEventListener('beforeinstallprompt', handler)
  }, [])

  const handleInstall = async () => {
    if (!deferredPrompt) return
    await deferredPrompt.prompt()
    const choice = await deferredPrompt.userChoice
    if (choice.outcome === 'accepted') {
      handleClose()
    }
    setDeferredPrompt(null)
  }

  const handleClose = () => {
    setAnimateIn(false)
    setTimeout(() => setShow(false), 300)
  }

  const handleDismiss = () => {
    localStorage.setItem('pwa-banner-dismissed', 'true')
    handleClose()
  }

  if (!show) return null

  return (
    <>
      <style>{`
        @keyframes installSlideUp {
          from { opacity: 0; transform: translateY(100%); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes installSlideDown {
          from { opacity: 1; transform: translateY(0); }
          to   { opacity: 0; transform: translateY(100%); }
        }
      `}</style>
      <div style={{
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        zIndex: 9999,
        padding: 'max(12px, env(safe-area-inset-bottom)) 12px 12px',
        animation: animateIn ? 'installSlideUp 0.35s cubic-bezier(0.34,1.56,0.64,1) both' : 'installSlideDown 0.25s ease both',
        pointerEvents: animateIn ? 'auto' : 'none',
      }}>
        <div style={{
          background: 'rgba(28, 28, 30, 0.92)',
          backdropFilter: 'blur(20px) saturate(1.4)',
          WebkitBackdropFilter: 'blur(20px) saturate(1.4)',
          borderRadius: 16,
          border: '1px solid rgba(255,255,255,0.08)',
          padding: '14px 16px',
          display: 'flex',
          alignItems: 'center',
          gap: 14,
          boxShadow: '0 -2px 24px rgba(0,0,0,0.5), 0 0 0 0.5px rgba(255,255,255,0.05) inset',
          maxWidth: 480,
          margin: '0 auto',
        }}>
          {/* App icon */}
          <img
            src="/icons/icon-96x96.png"
            alt="CaseSync"
            style={{
              width: 44,
              height: 44,
              borderRadius: 11,
              flexShrink: 0,
              boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
            }}
          />

          {/* Text */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: '#f5f5f7', lineHeight: 1.3 }}>
              Install CaseSync
            </div>
            <div style={{ fontSize: 12, color: '#8e8e93', marginTop: 2, lineHeight: 1.3 }}>
              Add to your home screen for quick access
            </div>
          </div>

          {/* Actions */}
          <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
            <button
              onClick={handleDismiss}
              style={{
                background: 'transparent',
                border: 'none',
                color: '#636366',
                padding: '8px',
                fontSize: 13,
                cursor: 'pointer',
                lineHeight: 1,
              }}
              aria-label="Dismiss"
            >
              ✕
            </button>
            <button
              onClick={handleInstall}
              style={{
                background: '#007aff',
                border: 'none',
                color: 'white',
                padding: '8px 16px',
                borderRadius: 10,
                fontSize: 13,
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'all 0.15s',
                lineHeight: 1.2,
              }}
            >
              Install
            </button>
          </div>
        </div>
      </div>
    </>
  )
}
