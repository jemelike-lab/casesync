import { useCallback, useEffect, useRef } from 'react'

/**
 * 3D tilt-on-hover. Drop-in for any block: attach the returned ref to a
 * container, pass onMouseMove + onMouseLeave through. Matches the
 * existing DashboardClient/TasksClient tilt feel (perspective 600,
 * ±6deg). Respects prefers-reduced-motion.
 */
export function useTilt(intensity = 6) {
  const ref = useRef<HTMLDivElement>(null)

  const onMouseMove = useCallback(
    (e: React.MouseEvent) => {
      const el = ref.current
      if (!el) return
      if (
        typeof window !== 'undefined' &&
        window.matchMedia('(prefers-reduced-motion: reduce)').matches
      ) {
        return
      }
      const rect = el.getBoundingClientRect()
      const x = (e.clientX - rect.left) / rect.width - 0.5
      const y = (e.clientY - rect.top) / rect.height - 0.5
      el.style.transform = `perspective(640px) rotateY(${x * intensity}deg) rotateX(${
        -y * intensity
      }deg) translateY(-4px)`
    },
    [intensity],
  )

  const onMouseLeave = useCallback(() => {
    const el = ref.current
    if (el) el.style.transform = ''
  }, [])

  return { ref, onMouseMove, onMouseLeave }
}

/**
 * Mouse spotlight follow. Updates two CSS variables (--mx, --my) on the
 * attached element so a child layer can render a radial gradient at the
 * cursor. Useful for hero spotlight effects.
 *
 * Usage:
 *   const spot = useMouseSpotlight()
 *   <div ref={spot.ref} onMouseMove={spot.onMouseMove}>
 *     <div className="spotlight-layer" />
 *   </div>
 *
 * Then in CSS:
 *   .spotlight-layer {
 *     background: radial-gradient(circle 360px at var(--mx,50%) var(--my,50%),
 *       rgba(124,58,237,0.25), transparent 60%);
 *   }
 */
export function useMouseSpotlight() {
  const ref = useRef<HTMLDivElement>(null)

  const onMouseMove = useCallback((e: React.MouseEvent) => {
    const el = ref.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    el.style.setProperty('--mx', `${e.clientX - rect.left}px`)
    el.style.setProperty('--my', `${e.clientY - rect.top}px`)
  }, [])

  // Initialize to center so the spotlight is visible before any movement
  useEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.setProperty('--mx', '50%')
    el.style.setProperty('--my', '50%')
  }, [])

  return { ref, onMouseMove }
}
