'use client'

import { Paper, Title } from '@mantine/core'

/**
 * Full-bleed page banner: photo (cover) + page name, sized to match the
 * Training hero (260px). Rendered only when a banner image exists; pages keep
 * their original hero as fallback when the folder is empty.
 */
export default function PageBanner({
  title,
  bannerUrl,
  minHeight = 260,
}: {
  title?: string
  bannerUrl: string
  minHeight?: number
}) {
  return (
    <Paper radius="lg" p={0} mb="md" style={{ position: 'relative', overflow: 'hidden', minHeight }}>
      <img
        src={bannerUrl}
        alt=""
        aria-hidden="true"
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', zIndex: 0, pointerEvents: 'none' }}
      />
      <div
        aria-hidden="true"
        style={{ position: 'absolute', inset: 0, zIndex: 1, pointerEvents: 'none', background: 'linear-gradient(0deg, rgba(8,10,24,0.82) 0%, rgba(8,10,24,0.30) 38%, rgba(8,10,24,0.06) 66%, transparent 100%)' }}
      />
      {title ? (
        <div style={{ position: 'absolute', left: 32, bottom: 26, zIndex: 2 }}>
          <Title order={1} className="banner-heading" style={{ fontSize: 34, fontWeight: 800, letterSpacing: '-0.01em', textShadow: '0 2px 18px rgba(0,0,0,0.55)' }}>
            {title}
          </Title>
        </div>
      ) : null}
    </Paper>
  )
}
