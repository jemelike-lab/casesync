import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

interface Options {
  canAddClient?: boolean
  onShowShortcuts?: () => void
  onCloseModal?: () => void
}

function isInputActive(): boolean {
  const el = document.activeElement
  if (!el) return false
  const tag = el.tagName.toLowerCase()
  return tag === 'input' || tag === 'textarea' || tag === 'select' || (el as HTMLElement).isContentEditable
}

export function useKeyboardShortcuts({ canAddClient = false, onShowShortcuts, onCloseModal }: Options = {}) {
  const router = useRouter()

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Never fire in input fields
      if (isInputActive()) return

      switch (e.key) {
        case 'n':
        case 'N':
          if (canAddClient) {
            e.preventDefault()
            router.push('/clients/new')
          }
          break
        case 'c':
        case 'C':
          e.preventDefault()
          router.push('/calendar')
          break
        case '/':
          e.preventDefault()
          const searchInput = document.querySelector('input[placeholder*="Search"], input[type="search"]') as HTMLInputElement | null
          searchInput?.focus()
          break
        case 'Escape':
          onCloseModal?.()
          break
        case '?':
          e.preventDefault()
          onShowShortcuts?.()
          break
      }
    }

    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [router, canAddClient, onShowShortcuts, onCloseModal])
}
