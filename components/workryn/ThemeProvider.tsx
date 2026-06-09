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
const STORAGE_KEY = 'theme'
// Also sync the legacy workryn-specific key for backwards compatibility
const LEGACY_KEY = 'workryn-theme'

function getSystemTheme(): 'light' | 'dark' {
  if (typeof window === 'undefined') return 'dark'
  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'
}

function getInitialResolved(): 'light' | 'dark' {
  // The early script in app/layout.tsx <head> already set data-theme on
  // documentElement before React hydrated. Read from there so Mantine's
  // first render matches what the CSS is already showing — no flash.
  if (typeof document === 'undefined') return 'dark'
  const attr = document.documentElement.getAttribute('data-theme')
  return attr === 'light' ? 'light' : 'dark'
}

function getInitialTheme(): Theme {
  if (typeof localStorage === 'undefined') return 'dark'
  const stored = localStorage.getItem(STORAGE_KEY) || localStorage.getItem(LEGACY_KEY)
  if (stored === 'light' || stored === 'dark' || stored === 'system') return stored
  return 'dark'
}

function applyTheme(resolved: 'light' | 'dark') {
  if (typeof document === 'undefined') return
  document.documentElement.setAttribute('data-theme', resolved)
  document.documentElement.style.colorScheme = resolved
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  // Initialize from the value the early head-script already applied.
  // This way the very first hydration render of the Mantine provider
  // matches what data-theme already says — no flash to dark.
  const [theme, setThemeState] = useState<Theme>(() =>
    typeof window !== 'undefined' ? getInitialTheme() : 'dark'
  )
  const [resolved, setResolved] = useState<'light' | 'dark'>(() =>
    typeof window !== 'undefined' ? getInitialResolved() : 'dark'
  )

  // Re-sync on mount in case the early script and localStorage got out
  // of step (shouldn't happen, but safe).
  useEffect(() => {
    const stored = getInitialTheme()
    const eff = stored === 'system' ? getSystemTheme() : stored
    setThemeState(stored)
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
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, next)
      localStorage.setItem(LEGACY_KEY, next)
    }
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
