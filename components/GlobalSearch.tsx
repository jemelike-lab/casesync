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

interface SearchResultStaff {
  id: string
  full_name: string | null
  role: string
  team_manager_id?: string | null
}

interface SearchResultQueue {
  id: string
  label: string
  description: string
  href: string
  kind?: 'queue' | 'saved_view'
}

interface SearchPayload {
  clients: SearchResultClient[]
  staff: SearchResultStaff[]
  queues: SearchResultQueue[]
}

function roleLabel(role?: string | null) {
  if (role === 'supports_planner') return 'Planner'
  if (role === 'team_manager') return 'Team Manager'
  if (role === 'supervisor') return 'Supervisor'
  if (role === 'it') return 'IT'
  return 'User'
}

export default function GlobalSearch({ userId, profile }: Props) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchPayload>({ clients: [], staff: [], queues: [] })
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
      // Only close if click is outside the entire search component
      if (!panelRef.current.contains(event.target as Node)) {
        setOpen(false)
      }
    }

    window.addEventListener('keydown', onKeyDown)
    // Use capture phase so we get the event before React synthetic handlers
    document.addEventListener('pointerdown', onPointerDown, true)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      document.removeEventListener('pointerdown', onPointerDown, true)
    }
  }, [])

  useEffect(() => {
    if (!open) return
    inputRef.current?.focus()
  }, [open])

  useEffect(() => {
    const q = query.trim()
    if (!open || !q) {
      setResults({ clients: [], staff: [], queues: [] })
      setLoading(false)
      return
    }

    const controller = new AbortController()
    const timer = window.setTimeout(() => {
      const params = new URLSearchParams()
      params.set('q', q)
      params.set('limit', '8')
      if (assignedTo) params.set('assignedTo', assignedTo)

      setLoading(true)
      fetch(`/api/clients/search?${params.toString()}`, { signal: controller.signal })
        .then(async (res) => {
          if (!res.ok) throw new Error(`Search failed (${res.status})`)
          return res.json() as Promise<SearchPayload>
        })
        .then((payload) => {
          setResults({
            clients: payload.clients ?? [],
            staff: payload.staff ?? [],
            queues: payload.queues ?? [],
          })
        })
        .catch((error) => {
          if (controller.signal.aborted) return
          console.error('Global search failed:', error)
          setResults({ clients: [], staff: [], queues: [] })
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

  const hasResults = results.clients.length > 0 || results.staff.length > 0 || results.queues.length > 0

  return (
    <div ref={panelRef} style={{ position: 'relative', minWidth: 0, flex: '1 1 320px', maxWidth: 420 }}>
      <button
        type="button"
        onPointerDown={(e) => e.stopPropagation()}
        onClick={() => {
          setOpen(prev => {
            const next = !prev
            if (next) {
              window.setTimeout(() => inputRef.current?.focus(), 0)
            }
            return next
          })
        }}
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
        aria-label="Open global search"
      >
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>Search clients, staff, queues, or saved views</span>
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
            placeholder="Type a client name, client ID, staff name, queue, or saved view"
            type="search"
            style={{ width: '100%', marginBottom: 10 }}
          />

          <div style={{ maxHeight: 420, overflowY: 'auto', display: 'grid', gap: 10 }}>
            {!query.trim() ? (
              <div style={{ fontSize: 12, color: 'var(--text-secondary)', padding: '8px 6px' }}>
                Search from anywhere. Results are grouped into clients, staff, and jump targets.
              </div>
            ) : loading ? (
              <div style={{ fontSize: 12, color: 'var(--text-secondary)', padding: '8px 6px' }}>Searching…</div>
            ) : !hasResults ? (
              <div style={{ fontSize: 12, color: 'var(--text-secondary)', padding: '8px 6px' }}>No matching clients, staff, queues, or saved views.</div>
            ) : (
              <>
                {results.clients.length > 0 && (
                  <SearchSection title="Clients">
                    {results.clients.map((client) => (
                      <Link
                        key={client.id}
                        href={`/clients/${client.id}`}
                        onClick={() => setOpen(false)}
                        style={itemStyle}
                      >
                        <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 4 }}>
                          {client.last_name}{client.first_name ? `, ${client.first_name}` : ''}
                        </div>
                        <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.55 }}>
                          ID {client.client_id} • Planner: {client.profiles?.full_name ?? 'Unassigned'}
                        </div>
                      </Link>
                    ))}
                  </SearchSection>
                )}

                {results.staff.length > 0 && (
                  <SearchSection title="Staff">
                    {results.staff.map((person) => (
                      <Link
                        key={person.id}
                        href={person.role === 'supports_planner' ? `/team?full=1&planner=${encodeURIComponent(person.id)}` : person.role === 'team_manager' ? '/team' : '/supervisor'}
                        onClick={() => setOpen(false)}
                        style={itemStyle}
                      >
                        <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 4 }}>
                          {person.full_name ?? 'Unnamed user'}
                        </div>
                        <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.55 }}>
                          {roleLabel(person.role)}
                        </div>
                      </Link>
                    ))}
                  </SearchSection>
                )}

                {results.queues.length > 0 && (
                  <SearchSection title="Queues & Views">
                    {results.queues.map((queue) => (
                      <Link
                        key={queue.id}
                        href={queue.href}
                        onClick={() => setOpen(false)}
                        style={itemStyle}
                      >
                        <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 4 }}>{queue.label}</div>
                        <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.55 }}>
                          {queue.description}
                          <span style={{ marginLeft: 6, color: 'var(--text-tertiary)' }}>
                            {queue.kind === 'saved_view' ? '• Saved view' : '• Queue'}
                          </span>
                        </div>
                      </Link>
                    ))}
                  </SearchSection>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function SearchSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'grid', gap: 8 }}>
      <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text-secondary)', padding: '0 4px' }}>
        {title}
      </div>
      <div style={{ display: 'grid', gap: 8 }}>{children}</div>
    </div>
  )
}

const itemStyle: React.CSSProperties = {
  textDecoration: 'none',
  color: 'inherit',
  border: '1px solid var(--border)',
  background: 'var(--surface-2)',
  borderRadius: 10,
  padding: 12,
  display: 'block',
}
