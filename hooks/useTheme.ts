'use client'

import { useState, useEffect } from 'react'

type Theme = 'dark' | 'light'

export function useTheme() {
  const [theme, setThemeState] = useState<Theme>('dark')

  useEffect(() => {
    try {
      const stored = localStorage.getItem('theme') as Theme | null
      if (stored === 'light' || stored === 'dark') {
        setThemeState(stored)
        document.documentElement.setAttribute('data-theme', stored)
      } else {
        document.documentElement.setAttribute('data-theme', 'dark')
      }
    } catch {}
  }, [])

  function setTheme(t: Theme) {
    setThemeState(t)
    try {
      localStorage.setItem('theme', t)
    } catch {}
    document.documentElement.setAttribute('data-theme', t)
  }

  function toggle() {
    setTheme(theme === 'dark' ? 'light' : 'dark')
  }

  return { theme, setTheme, toggle }
}
