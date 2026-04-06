'use client'

import { isSupervisorLike, canManageTeam, getRoleLabel, getRoleColor } from '@/lib/roles'
import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { Profile } from '@/lib/types'

interface Props {
  profile: Profile | null
  onLogContact?: () => void
}

interface Action {
  icon: string
  label: string
  onClick: () => void
  visible?: boolean
}

export default function QuickActions({ profile, onLogContact }: Props) {
  const [open, setOpen] = useState(false)
  const router = useRouter()
  const containerRef = useRef<HTMLDivElement>(null)
  const canManage = profile?.role === 'team_manager' || isSupervisorLike(profile?.role)

  const actions: Action[] = [
    {
      icon: '📞',
      label: 'Log Contact',
      onClick: () => { setOpen(false); onLogContact?.() },
      visible: true,
    },
    {
      icon: '➕',
      label: 'Add Client',
      onClick: () => { setOpen(false); router.push('/clients/new') },
      visible: canManage,
    },
    {
      icon: '📅',
      label: 'Calendar',
      onClick: () => { setOpen(false); router.push('/calendar') },
      visible: true,
    },
    {
      icon: '🔍',
      label: 'Search',
      onClick: () => {
        setOpen(false)
        setTimeout(() => {
          const input = document.querySelector('input[placeholder*="Search"], input[type="search"]') as HTMLInputElement | null
          input?.focus()
        }, 100)
      },
      visible: true,
    },
  ].filter(a => a.visible !== false)

  // Close on outside click
  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  // Close on Escape
  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [open])

  return (
    <div
      ref={containerRef}
      style={{
        position: 'fixed',
        bottom: typeof window !== 'undefined' && window.innerWidth <= 768
          ? 'calc(150px + env(safe-area-inset-bottom))'
          : 80,
        right: 20,
        zIndex: 500,
        display: 'flex',
        flexDirection: 'column-reverse',
        alignItems: 'flex-end',
        gap: 10,
      }}
    >
      {/* Action items */}
      {actions.map((action, i) => (
        <div
          key={i}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            opacity: open ? 1 : 0,
            transform: open ? 'scale(1) translateY(0)' : 'scale(0.7) translateY(20px)',
            transition: `opacity 0.2s ease ${i * 0.05}s, transform 0.2s ease ${i * 0.05}s`,
            pointerEvents: open ? 'auto' : 'none',
          }}
        >
          <span style={{
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: 8,
            padding: '4px 10px',
            fontSize: 12,
            color: 'var(--text)',
            whiteSpace: 'nowrap',
            boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
          }}>
            {action.label}
          </span>
          <button
            onClick={action.onClick}
            style={{
              width: 44,
              height: 44,
              borderRadius: '50%',
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              fontSize: 18,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
              flexShrink: 0,
            }}
          >
            {action.icon}
          </button>
        </div>
      ))}

      {/* FAB */}
      <button
        onClick={() => setOpen(v => !v)}
        style={{
          width: 56,
          height: 56,
          borderRadius: '50%',
          background: '#007aff',
          border: 'none',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 24,
          boxShadow: '0 4px 16px rgba(0,122,255,0.4)',
          transform: open ? 'rotate(45deg)' : 'rotate(0deg)',
          transition: 'transform 0.2s ease, box-shadow 0.2s ease',
          color: 'white',
        }}
        title="Quick Actions"
        aria-label="Quick Actions"
      >
        {open ? '✕' : '⚡'}
      </button>
    </div>
  )
}
