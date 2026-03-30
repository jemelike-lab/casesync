'use client'

import { useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

interface Props {
  timeoutMs: number
}

export default function IdleTimeout({ timeoutMs }: Props) {
  const router = useRouter()
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const supabase = createClient()

  useEffect(() => {
    function reset() {
      if (timerRef.current) clearTimeout(timerRef.current)
      timerRef.current = setTimeout(async () => {
        await supabase.auth.signOut()
        router.push('/login')
      }, timeoutMs)
    }

    const events = ['mousedown', 'mousemove', 'keydown', 'scroll', 'touchstart']
    events.forEach(e => window.addEventListener(e, reset))
    reset()

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
      events.forEach(e => window.removeEventListener(e, reset))
    }
  }, [timeoutMs, router, supabase])

  return null
}
