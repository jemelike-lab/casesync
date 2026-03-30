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
  none: '#636366',
}

export default function StatusDot({ status, size = 8, style }: Props) {
  return (
    <span
      style={{
        display: 'inline-block',
        width: size,
        height: size,
        borderRadius: '50%',
        background: colors[status],
        flexShrink: 0,
        ...style,
      }}
    />
  )
}
