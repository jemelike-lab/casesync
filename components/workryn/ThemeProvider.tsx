'use client'

/**
 * ThemeProvider — manages light/dark/system theme preference.
 *
 * Persists to localStorage under "workryn-theme". On mount, applies the
 * stored preference (or system default) to <html data-theme="...">. Listens
 * to OS preference changes when "system" is selected.
 *
 * Other components can use the `useTheme()` hook to read and change the
 * current theme.
 */

import { createContext, useContext, useEffect, useState, useCallback } from 'react'

export type Theme = 'light' | 'dark' | 'system'

interface ThemeContextValue {
  theme: Theme
  resolved: 'light' | 'dark'
  setTheme: (theme: Theme) => void
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined)
const STORAGE_KEY = 'workryn-theme'

function getSystemTheme(): 'light' | 'dark' {
  if (typeof window === 'undefined') return 'dark'
  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'
}

function applyTheme(resolved: 'light' | 'dark') {
  if (typeof document === 'undefined') return
  document.documentElement.setAttribute('data-theme', resolved)
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  // Default to dark on first paint to avoid flash; the effect below replaces it.
  const [theme, setThemeState] = useState<Theme>('dark')
  const [resolved, setResolved] = useState<'light' | 'dark'>('dark')

  // On mount, read the stored preference and apply it
  useEffect(() => {
    const stored = (typeof localStorage !== 'undefined' && localStorage.getItem(STORAGE_KEY)) as Theme | null
    const initial: Theme = stored === 'light' || stored === 'dark' || stored === 'system' ? stored : 'dark'
    setThemeState(initial)
    const eff = initial === 'system' ? getSystemTheme() : initial
    setResolved(eff)
    applyTheme(eff)
  }, [])

  // Listen for system theme changes if user picked "system"
  useEffect(() => {
    if (theme !== 'system' || typeof window === 'undefined') return
    const mq = window.matchMedia('(prefers-color-scheme: light)')
    const handler = () => {
      const eff = getSystemTheme()
      setResolved(eff)
      applyTheme(eff)
    }
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [theme])

  const setTheme = useCallback((next: Theme) => {
    setThemeState(next)
    if (typeof localStorage !== 'undefined') localStorage.setItem(STORAGE_KEY, next)
    const eff = next === 'system' ? getSystemTheme() : next
    setResolved(eff)
    applyTheme(eff)
  }, [])

  return (
    <ThemeContext.Provider value={{ theme, resolved, setTheme }}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext)
  if (!ctx) {
    // Safe fallback if used outside the provider (e.g. during SSR snapshot)
    return { theme: 'dark', resolved: 'dark', setTheme: () => {} }
  }
  return ctx
}
