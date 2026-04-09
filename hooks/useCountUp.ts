import { useState, useEffect } from 'react'

export function useCountUp(target: number, duration = 800): number {
  const [count, setCount] = useState(0)

  useEffect(() => {
    if (target === 0) {
      const timeoutId = window.setTimeout(() => setCount(0), 0)
      return () => window.clearTimeout(timeoutId)
    }

    // Respect reduced motion
    if (typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      const timeoutId = window.setTimeout(() => setCount(target), 0)
      return () => window.clearTimeout(timeoutId)
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
    return () => cancelAnimationFrame(animId)
  }, [target, duration])

  return count
}
