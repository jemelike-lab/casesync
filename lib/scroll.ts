/**
 * PWA-safe smooth scroll to an element by ID or ref.
 * Uses window.scrollTo with manual offset instead of scrollIntoView,
 * which is unreliable in iOS PWA standalone mode.
 *
 * @param target - element ID string, HTMLElement, or React ref
 * @param offset - pixels to offset from top (default 80 for header)
 * @param delay  - ms to wait for React render before scrolling (default 200)
 */
export function scrollToElement(
  target: string | HTMLElement | null | undefined,
  offset = 80,
  delay = 200
) {
  window.setTimeout(() => {
    const el = typeof target === 'string'
      ? document.getElementById(target)
      : target
    if (!el) return
    const rect = el.getBoundingClientRect()
    const scrollTop = window.pageYOffset || document.documentElement.scrollTop
    const y = rect.top + scrollTop - offset
    window.scrollTo({ top: Math.max(0, y), behavior: 'smooth' })
  }, delay)
}
