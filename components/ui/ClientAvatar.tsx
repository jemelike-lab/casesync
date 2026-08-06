'use client'

/**
 * ClientAvatar — gender-neutral head-and-shoulders avatar for client rows
 * (Josh 08-05, Option B approved from mockup: avatar beside the name).
 *
 * Colors span the FULL hue wheel ("every possible color" — Josh): the hue is
 * derived deterministically from the seed (client_id) via a golden-angle
 * spread, so neighbouring rows land far apart on the wheel and the same
 * client always renders the same color everywhere.
 *
 * Motion is a pure-CSS idle blink with a per-avatar stagger — deliberately
 * NOT a Lottie player: 200+ player instances on the index would wreck
 * scroll performance. The page keeps one true Lottie (the header avatar).
 * The keyframes live in <ClientAvatarStyles/>, rendered ONCE per page.
 */

const BLINK_KEYFRAMES = `
@keyframes cs-av-blink {
  0%, 92%, 100% { transform: scaleY(1); }
  95% { transform: scaleY(0.12); }
}
.cs-av-eyes { animation: cs-av-blink 4.6s infinite; transform-origin: center 39%; }
@media (prefers-reduced-motion: reduce) { .cs-av-eyes { animation: none; } }
`

export function ClientAvatarStyles() {
  return <style dangerouslySetInnerHTML={{ __html: BLINK_KEYFRAMES }} />
}

function hashSeed(seed: string): number {
  let h = 0
  for (let i = 0; i < seed.length; i++) {
    h = (h * 31 + seed.charCodeAt(i)) >>> 0
  }
  return h
}

export default function ClientAvatar({ seed, size = 32 }: { seed: string; size?: number }) {
  const h = hashSeed(seed || 'client')
  // Golden-angle hue spread across the entire wheel.
  const hue = Math.round((h * 137.508) % 360)
  // Vary saturation and figure lightness bands too, so even close hues differ.
  const sat = 40 + (h % 3) * 8            // 40–56%
  const ringL = 92 + (h % 3)              // 92–94% — soft ring in light and dark
  const figL = 40 + ((h >> 3) % 4) * 3    // 40–49% — avoids muddy near-black figures
  const ring = `hsl(${hue}, ${sat}%, ${ringL}%)`
  const fig = `hsl(${hue}, ${sat}%, ${figL}%)`
  const delay = ((h % 43) / 10).toFixed(1) // 0.0–4.2s stagger
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 34 34"
      aria-hidden="true"
      style={{ flexShrink: 0, display: 'block' }}
    >
      <circle cx="17" cy="17" r="17" fill={ring} />
      <circle cx="17" cy="13.5" r="5.4" fill={fig} />
      <g className="cs-av-eyes" style={{ animationDelay: `${delay}s` }}>
        <circle cx="15" cy="13" r="0.9" fill={ring} />
        <circle cx="19" cy="13" r="0.9" fill={ring} />
      </g>
      <path d="M6.5 29c1.6-5 6-7.4 10.5-7.4S26 24 27.5 29a17 17 0 0 1-21 0Z" fill={fig} />
    </svg>
  )
}
