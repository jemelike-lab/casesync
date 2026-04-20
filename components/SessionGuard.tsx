'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import IdleTimeout from './IdleTimeout'

/**
 * SessionGuard — mounts IdleTimeout for any authenticated user, regardless
 * of which route they are on. Placed in root layout so it covers all routes.
 */
export default function SessionGuard() {
  const [authed, setAuthed] = useState(false)
  const supabase = createClient()

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setAuthed(!!data.session)
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setAuthed(!!session)
    })
    return () => subscription.unsubscribe()
  }, [supabase])

  if (!authed) return null

  // 15-minute timeout, 2-minute warning
  return <IdleTimeout timeoutMs={15 * 60 * 1000} warningMs={2 * 60 * 1000} />
}
