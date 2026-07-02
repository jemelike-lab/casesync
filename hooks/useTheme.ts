'use client'

import { useState, useEffect } from 'react'

type Theme = 'dark' | 'light'

export function useTheme() {
  const [theme, setThemeState] = useState<Theme>('dark')

  useEffect(() => {
    try {
      const stored = localStorage.getItem('theme') as Theme | null
      const initial: Theme =
        stored === 'light' || stored === 'dark' ? stored : 'dark'
      setThemeState(initial)
      document.documentElement.setAttribute('data-theme', initial)
    } catch {}

    const sync = () => {
      const attr = document.documentElement.getAttribute('data-theme')
      if (attr === 'light' || attr === 'dark') {
        setThemeState(attr as Theme)
      }
    }
    const obs = new MutationObserver(sync)
    obs.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme'],
    })

    const onStorage = (e: StorageEvent) => {
      const v = e.newValue
      if (e.key === 'theme' && (v === 'light' || v === 'dark')) {
        setThemeState(v)
      }
    }
    window.addEventListener('storage', onStorage)

    return () => {
      obs.disconnect()
      window.removeEventListener('storage', onStorage)
    }
  }, [])

  function setTheme(t: Theme) {
    setThemeState(t)
    try {
      localStorage.setItem('theme', t)
      localStorage.setItem('workryn-theme', t)
    } catch {}
    document.documentElement.setAttribute('data-theme', t)
    // Keep color-scheme in sync with the theme so the browser repaints the page
    // (canvas + native controls) on toggle. Without this, the load-time init
    // script set color-scheme but the toggle didn't, so the change only fully
    // applied after a hard refresh.
    document.documentElement.style.colorScheme = t
  }

  function toggle() {
    setTheme(theme === 'dark' ? 'light' : 'dark')
  }

  return { theme, setTheme, toggle }
}
