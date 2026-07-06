import { useState, useEffect, useRef } from 'react'

export function useCountUp(target: number, duration = 800): number {
  const [count, setCount] = useState(target) // SSR-safe: start at target
  const prevTarget = useRef(target)
  const hasMounted = useRef(false)

  useEffect(() => {
    if (!hasMounted.current) {
      // First mount: show the real value immediately — no 0->target intro.
      // The intro animation left counters painted at 0 whenever a hydration
      // failure (React #418) forced remount loops: each mount ran setCount(0)
      // before the animation could complete. Correct numbers beat animation.
      hasMounted.current = true
      prevTarget.current = target
      setCount(target)
      return
    }

    // Subsequent updates: animate from previous value to new target
    const startValue = prevTarget.current
    prevTarget.current = target

    if (target === startValue) {
      setCount(target)
      return
    }

    if (typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setCount(target)
      return
    }

    const start = Date.now()
    let animId: number
    const tick = () => {
      const elapsed = Date.now() - start
      const progress = Math.min(elapsed / duration, 1)
      const eased = 1 - Math.pow(1 - progress, 3)
      setCount(Math.round(startValue + (target - startValue) * eased))
      if (progress < 1) animId = requestAnimationFrame(tick)
    }
    animId = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(animId)
  }, [target, duration])

  return count
}
