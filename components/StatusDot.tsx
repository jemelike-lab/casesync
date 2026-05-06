import { StatusLevel } from '@/lib/types'
import { CSSProperties } from 'react'

interface Props {
  status: StatusLevel
  size?: number
  style?: CSSProperties
}

const colors: Record<StatusLevel, string> = {
  green: '#30d158',
  yellow: '#ffd60a',
  orange: '#ff9f0a',
  red: '#ff453a',
  critical: '#ff453a',
  none: '#636366',
}

export default function StatusDot({ status, size = 8, style }: Props) {
  const isCritical = status === 'critical'
  return (
    <span
      className={isCritical ? 'pulse-dot' : undefined}
      style={{
        display: 'inline-block',
        width: size,
        height: size,
        borderRadius: '50%',
        background: colors[status],
        flexShrink: 0,
        ...(isCritical ? { boxShadow: '0 0 6px 2px rgba(255,69,58,0.5)' } : {}),
        ...style,
      }}
    />
  )
}
