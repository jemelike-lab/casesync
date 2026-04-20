'use client'
import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

export default function InstallBanner() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null)
  const [show, setShow] = useState(false)
  const [animateIn, setAnimateIn] = useState(false)
  const pathname = usePathname()

  // Determine context — are we in Workryn or CaseSync?
  const isWorkryn = pathname?.startsWith('/w/')
  const appName = isWorkryn ? 'Workryn' : 'CaseSync'
  const appSubtitle = isWorkryn ? 'Your HR workspace — on your home screen' : 'Add to your home screen for quick access'
  const iconSrc = isWorkryn ? '/icons/workryn-192x192.png' : '/icons/icon-96x96.png'

  useEffect(() => {
    if (typeof window === 'undefined') return
    // Persistent dismiss — one dismissal hides it for the session in either context
    if (sessionStorage.getItem('pwa-banner-dismissed') === 'true') return
    if (localStorage.getItem('pwa-banner-dismissed') === 'true') return
    // Don't show if already installed as standalone PWA
    if (window.matchMedia('(display-mode: standalone)').matches) return

    const handler = (e: Event) => {
      e.preventDefault()
      setDeferredPrompt(e as BeforeInstallPromptEvent)
      setTimeout(() => {
        setShow(true)
        requestAnimationFrame(() => setAnimateIn(true))
      }, 2500)
    }
    window.addEventListener('beforeinstallprompt', handler)
    return () => window.removeEventListener('beforeinstallprompt', handler)
  }, [])

  const handleInstall = async () => {
    if (!deferredPrompt) return
    await deferredPrompt.prompt()
    const choice = await deferredPrompt.userChoice
    if (choice.outcome === 'accepted') handleDismiss()
    setDeferredPrompt(null)
  }

  const handleClose = () => {
    setAnimateIn(false)
    setTimeout(() => setShow(false), 300)
  }

  const handleDismiss = () => {
    localStorage.setItem('pwa-banner-dismissed', 'true')
    sessionStorage.setItem('pwa-banner-dismissed', 'true')
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
        position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 9999,
        padding: 'max(12px, env(safe-area-inset-bottom)) 12px 12px',
        animation: animateIn ? 'installSlideUp 0.35s cubic-bezier(0.34,1.56,0.64,1) both' : 'installSlideDown 0.25s ease both',
        pointerEvents: animateIn ? 'auto' : 'none',
      }}>
        <div style={{
          background: 'rgba(22,22,30,0.94)',
          backdropFilter: 'blur(24px) saturate(1.4)',
          WebkitBackdropFilter: 'blur(24px) saturate(1.4)',
          borderRadius: 18,
          border: '1px solid rgba(255,255,255,0.09)',
          padding: '14px 16px',
          display: 'flex',
          alignItems: 'center',
          gap: 14,
          boxShadow: '0 -2px 32px rgba(0,0,0,0.55), 0 0 0 0.5px rgba(255,255,255,0.05) inset',
          maxWidth: 500,
          margin: '0 auto',
        }}>
          <img
            src={iconSrc}
            alt={appName}
            style={{ width: 46, height: 46, borderRadius: 12, flexShrink: 0, boxShadow: '0 2px 10px rgba(0,0,0,0.35)' }}
          />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#f5f5f7', lineHeight: 1.3 }}>
              Install {appName}
            </div>
            <div style={{ fontSize: 12, color: '#8e8e93', marginTop: 2, lineHeight: 1.4 }}>
              {appSubtitle}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
            <button
              onClick={handleDismiss}
              style={{ background: 'transparent', border: 'none', color: '#48484a', padding: '8px', fontSize: 14, cursor: 'pointer', lineHeight: 1 }}
              aria-label="Dismiss"
            >✕</button>
            <button
              onClick={handleInstall}
              style={{
                background: isWorkryn ? 'linear-gradient(135deg, #7c6ef0, #a78bfa)' : '#007aff',
                border: 'none', color: 'white', padding: '8px 18px', borderRadius: 11,
                fontSize: 13, fontWeight: 700, cursor: 'pointer', transition: 'all 0.15s',
                boxShadow: isWorkryn ? '0 2px 12px rgba(124,110,240,0.4)' : '0 2px 12px rgba(0,122,255,0.4)',
              }}
            >Install</button>
          </div>
        </div>
      </div>
    </>
  )
}
