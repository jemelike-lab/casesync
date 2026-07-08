'use client'

/**
 * LottieBlock — the one way animations render in CaseSync + Workryn.
 *
 * - Lazy-loads the dotLottie player (no cost to initial bundles).
 * - trigger="loop"  : plays continuously (loaders only).
 * - trigger="mount" : plays once when it enters the viewport (heroes, empties).
 * - trigger="hover" : idles on a static frame, plays on pointer enter and
 *                     whenever `playKey` changes (stat cards: play on count change).
 * - prefers-reduced-motion: never autoplays; shows the static first frame.
 * - Fails closed: if the file 404s or the player errors, renders nothing
 *   (surfaces must always work without their animation).
 */

import { useEffect, useRef, useState } from 'react'
import dynamic from 'next/dynamic'

const DotLottieReact = dynamic(
  () => import('@lottiefiles/dotlottie-react').then(m => m.DotLottieReact),
  { ssr: false, loading: () => null },
)

type Trigger = 'loop' | 'mount' | 'hover'

export default function LottieBlock({
  src,
  size = 36,
  width,
  height,
  trigger = 'mount',
  playKey,
  className,
  label,
}: {
  src: string
  size?: number
  width?: number
  height?: number
  trigger?: Trigger
  /** hover mode: replay whenever this value changes (e.g. a stat count) */
  playKey?: string | number
  className?: string
  label?: string
}) {
  const [reduced, setReduced] = useState(false)
  const [visible, setVisible] = useState(false)
  const [failed, setFailed] = useState(false)
  const holderRef = useRef<HTMLDivElement | null>(null)
  const playerRef = useRef<any>(null)
  const firstKey = useRef(true)

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    setReduced(mq.matches)
    const onChange = (e: MediaQueryListEvent) => setReduced(e.matches)
    mq.addEventListener?.('change', onChange)
    return () => mq.removeEventListener?.('change', onChange)
  }, [])

  useEffect(() => {
    const el = holderRef.current
    if (!el) return
    const io = new IntersectionObserver(
      entries => {
        if (entries[0]?.isIntersecting) {
          setVisible(true)
          io.disconnect()
        }
      },
      { rootMargin: '120px' },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [])

  // hover mode: replay on playKey change (skip initial mount)
  useEffect(() => {
    if (trigger !== 'hover' || playKey === undefined) return
    if (firstKey.current) { firstKey.current = false; return }
    if (!reduced) playerRef.current?.play?.()
  }, [playKey, trigger, reduced])

  const w = width ?? size
  const h = height ?? size

  if (failed) return null

  const autoplay = !reduced && (trigger === 'loop' || trigger === 'mount')
  const loop = trigger === 'loop'

  return (
    <div
      ref={holderRef}
      className={className}
      style={{ width: w, height: h, flex: 'none', pointerEvents: trigger === 'hover' ? 'auto' : 'none' }}
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      onMouseEnter={trigger === 'hover' && !reduced ? () => playerRef.current?.play?.() : undefined}
    >
      {visible && (
        <DotLottieReact
          src={src}
          autoplay={autoplay}
          loop={loop}
          dotLottieRefCallback={(d: any) => {
            playerRef.current = d
            d?.addEventListener?.('loadError', () => setFailed(true))
            // hover mode: park on the first frame so the icon is visible
            if (trigger === 'hover' && d) {
              d.addEventListener?.('load', () => { try { d.setFrame?.(0) } catch {} })
            }
          }}
          style={{ width: '100%', height: '100%' }}
        />
      )}
    </div>
  )
}
