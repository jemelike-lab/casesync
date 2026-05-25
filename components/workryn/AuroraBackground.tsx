'use client'

import { useEffect } from 'react'
import { usePathname } from 'next/navigation'
import { accentForPath } from '@/lib/workryn/aurora'

/**
 * Renders the fixed Aurora background layer + grain overlay and keeps
 * the parent .w-app-shell's `data-accent` attribute in sync with the
 * current route. That attribute drives the --accent CSS variable
 * defined in aurora.css, which in turn tints the background bloom and
 * any element that reads var(--accent) (e.g. page heroes, focus rings).
 */
export default function AuroraBackground() {
  const pathname = usePathname()

  useEffect(() => {
    const accent = accentForPath(pathname)
    // Find the nearest .w-app-shell ancestor and set the attribute on it
    const shell = document.querySelector('.w-app-shell') as HTMLElement | null
    if (shell) shell.setAttribute('data-accent', accent)
  }, [pathname])

  return (
    <>
      <div className="aurora-bg" aria-hidden>
        <div className="aurora-float" />
      </div>
      <div className="aurora-grain" aria-hidden />
    </>
  )
}
