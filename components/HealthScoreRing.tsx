'use client'

import { useEffect, useRef } from 'react'

interface Props {
  score: number
  size?: number
  strokeWidth?: number
}

function getScoreColor(score: number): string {
  if (score >= 80) return '#30d158'
  if (score >= 60) return '#ffd60a'
  if (score >= 40) return '#ff9f0a'
  return '#ff453a'
}

export default function HealthScoreRing({ score, size = 44, strokeWidth = 4 }: Props) {
  const circleRef = useRef<SVGCircleElement>(null)
  const radius = (size - strokeWidth) / 2
  const circumference = 2 * Math.PI * radius
  const color = getScoreColor(score)
  const pct = Math.max(0, Math.min(100, score)) / 100
  const offset = circumference * (1 - pct)

  useEffect(() => {
    const el = circleRef.current
    if (!el) return
    // Start fully hidden
    el.style.strokeDashoffset = String(circumference)
    el.style.transition = 'none'
    // Force reflow
    void el.getBoundingClientRect()
    // Check reduced motion
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reducedMotion) {
      el.style.strokeDashoffset = String(offset)
    } else {
      el.style.transition = 'stroke-dashoffset 0.6s ease-out'
      el.style.strokeDashoffset = String(offset)
    }
  }, [score, offset, circumference])

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ flexShrink: 0 }}>
      {/* Background circle */}
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="#2c2c2e"
        strokeWidth={strokeWidth}
      />
      {/* Progress circle */}
      <circle
        ref={circleRef}
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeDasharray={circumference}
        strokeDashoffset={circumference}
        strokeLinecap="round"
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
        style={{ transition: 'stroke-dashoffset 0.6s ease-out' }}
      />
      {/* Score text */}
      <text
        x={size / 2}
        y={size / 2}
        textAnchor="middle"
        dominantBaseline="central"
        fill={color}
        fontSize={size <= 32 ? 10 : 13}
        fontWeight="bold"
        fontFamily="-apple-system, BlinkMacSystemFont, 'SF Pro Display', sans-serif"
      >
        {score}
      </text>
    </svg>
  )
}
