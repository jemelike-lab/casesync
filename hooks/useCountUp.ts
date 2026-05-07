import { useState, useEffect, useRef } from 'react'

export function useCountUp(target: number, duration = 800): number {
  const [count, setCount] = useState(target) // SSR-safe: start at target
  const prevTarget = useRef(target)
  const hasMounted = useRef(false)

  useEffect(() => {
    if (!hasMounted.current) {
      // First mount: reset to 0 and animate up
      hasMounted.current = true
      prevTarget.current = target

      if (target === 0) { setCount(0); return }

      // Respect reduced motion
      if (typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        setCount(target)
        return
      }

      setCount(0)
      const start = Date.now()
      let animId: number
      const tick = () => {
        const elapsed = Date.now() - start
        const progress = Math.min(elapsed / duration, 1)
        const eased = 1 - Math.pow(1 - progress, 3)
        setCount(Math.round(target * eased))
        if (progress < 1) animId = requestAnimationFrame(tick)
      }
      animId = requestAnimationFrame(tick)
      return () => cancelAnimationFrame(animId)
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
