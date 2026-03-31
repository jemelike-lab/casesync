'use client'

import { useEffect, useRef } from 'react'

const COLORS = ['#007aff', '#30d158', '#ff9f0a', '#ff453a', '#bf5af2']
const COUNT = 30

export default function Confetti({ onDone }: { onDone?: () => void }) {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    // Respect reduced motion
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      onDone?.()
      return
    }
    const container = containerRef.current
    if (!container) return

    const pieces: HTMLDivElement[] = []
    for (let i = 0; i < COUNT; i++) {
      const el = document.createElement('div')
      const color = COLORS[Math.floor(Math.random() * COLORS.length)]
      const size = 8 + Math.random() * 8
      const left = Math.random() * 100
      const delay = Math.random() * 0.8
      const duration = 1.5 + Math.random() * 1.5
      const rotation = Math.random() * 720 - 360
      const xDrift = Math.random() * 100 - 50

      el.style.cssText = `
        position: absolute;
        width: ${size}px;
        height: ${size}px;
        background: ${color};
        border-radius: 2px;
        left: ${left}%;
        top: -20px;
        opacity: 0;
        animation: confettiFall ${duration}s ease-in ${delay}s forwards;
        --x-drift: ${xDrift}px;
        --rotation: ${rotation}deg;
      `
      container.appendChild(el)
      pieces.push(el)
    }

    const timeout = setTimeout(() => {
      pieces.forEach(p => p.remove())
      onDone?.()
    }, 3000)

    return () => {
      clearTimeout(timeout)
      pieces.forEach(p => p.remove())
    }
  }, [onDone])

  return (
    <>
      <style>{`
        @keyframes confettiFall {
          0% { transform: translateY(0) translateX(0) rotate(0deg); opacity: 1; }
          100% { transform: translateY(100vh) translateX(var(--x-drift)) rotate(var(--rotation)); opacity: 0; }
        }
      `}</style>
      <div
        ref={containerRef}
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          pointerEvents: 'none',
          zIndex: 9999,
          overflow: 'hidden',
        }}
      />
    </>
  )
}
