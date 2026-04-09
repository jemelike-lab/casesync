'use client'

import Link from 'next/link'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { Profile } from '@/lib/types'

interface Props {
  userId: string
  profile: Profile | null
}

interface SearchResultClient {
  id: string
  client_id: string
  last_name: string
  first_name: string | null
  assigned_to: string | null
  profiles?: { id?: string; full_name?: string | null; role?: string | null; team_manager_id?: string | null } | null
}

export default function GlobalSearch({ userId, profile }: Props) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResultClient[]>([])
  const [loading, setLoading] = useState(false)
  const inputRef = useRef<HTMLInputElement | null>(null)
  const panelRef = useRef<HTMLDivElement | null>(null)

  const assignedTo = useMemo(() => {
    if (!profile?.role) return userId
    if (profile.role === 'supports_planner') return userId
    return ''
  }, [profile?.role, userId])

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null
      const isTypingTarget = target && (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.getAttribute('contenteditable') === 'true'
      )

      if (event.key === '/' && !event.metaKey && !event.ctrlKey && !event.altKey && !isTypingTarget) {
        event.preventDefault()
        setOpen(true)
        window.setTimeout(() => inputRef.current?.focus(), 0)
      }

      if (event.key === 'Escape') {
        setOpen(false)
      }
    }

    function onPointerDown(event: MouseEvent) {
      if (!panelRef.current) return
      if (!panelRef.current.contains(event.target as Node)) {
        setOpen(false)
      }
    }

    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('mousedown', onPointerDown)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('mousedown', onPointerDown)
    }
  }, [])

  useEffect(() => {
    if (!open) return
    inputRef.current?.focus()
  }, [open])

  useEffect(() => {
    const q = query.trim()
    if (!open || !q) {
      setResults([])
      setLoading(false)
      return
    }

    const controller = new AbortController()
    const timer = window.setTimeout(() => {
      const params = new URLSearchParams()
      params.set('q', q)
      params.set('limit', '10')
      if (assignedTo) params.set('assignedTo', assignedTo)

      setLoading(true)
      fetch(`/api/clients/search?${params.toString()}`, { signal: controller.signal })
        .then(async (res) => {
          if (!res.ok) throw new Error(`Search failed (${res.status})`)
          return res.json() as Promise<{ clients: SearchResultClient[] }>
        })
        .then((payload) => {
          setResults(payload.clients ?? [])
        })
        .catch((error) => {
          if (controller.signal.aborted) return
          console.error('Global search failed:', error)
          setResults([])
        })
        .finally(() => {
          if (!controller.signal.aborted) setLoading(false)
        })
    }, 180)

    return () => {
      controller.abort()
      window.clearTimeout(timer)
    }
  }, [open, query, assignedTo])

  return (
    <div ref={panelRef} style={{ position: 'relative', minWidth: 0, flex: '1 1 320px', maxWidth: 420 }}>
      <button
        type="button"
        onClick={() => setOpen(prev => !prev)}
        style={{
          width: '100%',
          height: 36,
          borderRadius: 8,
          border: '1px solid var(--border)',
          background: 'var(--surface-2)',
          color: 'var(--text-secondary)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 10,
          padding: '0 12px',
          cursor: 'text',
          fontSize: 13,
        }}
        aria-label="Open global client search"
      >
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>Search clients by name or ID</span>
        <span style={{ fontSize: 11, opacity: 0.8 }}>/</span>
      </button>

      {open && (
        <div
          style={{
            position: 'absolute',
            top: 'calc(100% + 8px)',
            left: 0,
            right: 0,
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: 12,
            boxShadow: '0 18px 50px rgba(0,0,0,0.22)',
            padding: 10,
            zIndex: 400,
          }}
        >
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Type a client name or ID"
            type="search"
            style={{ width: '100%', marginBottom: 10 }}
          />

          <div style={{ maxHeight: 360, overflowY: 'auto', display: 'grid', gap: 8 }}>
            {!query.trim() ? (
              <div style={{ fontSize: 12, color: 'var(--text-secondary)', padding: '8px 6px' }}>
                Search from anywhere. Supports planner names are already scoped by role.
              </div>
            ) : loading ? (
              <div style={{ fontSize: 12, color: 'var(--text-secondary)', padding: '8px 6px' }}>Searching…</div>
            ) : results.length === 0 ? (
              <div style={{ fontSize: 12, color: 'var(--text-secondary)', padding: '8px 6px' }}>No active clients match that search.</div>
            ) : (
              results.map((client) => (
                <Link
                  key={client.id}
                  href={`/clients/${client.id}`}
                  onClick={() => setOpen(false)}
                  style={{
                    textDecoration: 'none',
                    color: 'inherit',
                    border: '1px solid var(--border)',
                    background: 'var(--surface-2)',
                    borderRadius: 10,
                    padding: 12,
                    display: 'block',
                  }}
                >
                  <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 4 }}>
                    {client.last_name}{client.first_name ? `, ${client.first_name}` : ''}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.55 }}>
                    ID {client.client_id} • Planner: {client.profiles?.full_name ?? 'Unassigned'}
                  </div>
                </Link>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}
