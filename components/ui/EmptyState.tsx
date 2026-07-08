'use client'

/**
 * EmptyState — shared empty-surface pattern: animation + one-line title
 * + optional description/action. Fed by the ANIM manifest so QA slots
 * match the Verification Mock ledger.
 */

import LottieBlock from '@/components/ui/LottieBlock'
import type { ReactNode } from 'react'

export default function EmptyState({
  anim,
  title,
  description,
  action,
  size = 132,
  compact = false,
}: {
  anim: string
  title: string
  description?: string
  action?: ReactNode
  size?: number
  compact?: boolean
}) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        textAlign: 'center',
        gap: 6,
        padding: compact ? '18px 12px' : '34px 16px',
      }}
    >
      <LottieBlock src={anim} size={size} trigger="mount" />
      <div style={{ fontWeight: 700, fontSize: compact ? 13.5 : 15, marginTop: 4 }}>{title}</div>
      {description && (
        <div style={{ fontSize: compact ? 12 : 13, color: 'var(--text-secondary)', maxWidth: 340 }}>
          {description}
        </div>
      )}
      {action && <div style={{ marginTop: 8 }}>{action}</div>}
    </div>
  )
}
