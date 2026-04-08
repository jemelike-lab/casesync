import { useState, useEffect, useRef } from 'react'

export function useCountUp(target: number, duration = 800): number {
  const [count, setCount] = useState(0)
  const prevTarget = useRef(target)

  useEffect(() => {
    if (target === 0) {
      if (prevTarget.current !== 0) setCount(0)
      prevTarget.current = target
      return
    }
    // Respect reduced motion
    if (typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setCount(target)
      prevTarget.current = target
      return
    }
    const start = Date.now()
    let animId: number
    const tick = () => {
      const elapsed = Date.now() - start
      const progress = Math.min(elapsed / duration, 1)
      const eased = 1 - Math.pow(1 - progress, 3)
      setCount(Math.round(eased * target))
      if (progress < 1) animId = requestAnimationFrame(tick)
    }
    animId = requestAnimationFrame(tick)
    prevTarget.current = target
    return () => cancelAnimationFrame(animId)
  }, [target, duration])

  return count
}
