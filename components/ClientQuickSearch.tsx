'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { Client } from '@/lib/types'

interface Props {
  assignedTo?: string | null
  placeholder?: string
  helperText?: string
  maxResults?: number
}

export default function ClientQuickSearch({
  assignedTo,
  placeholder = 'Search clients by name or ID',
  helperText,
  maxResults = 8,
}: Props) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Client[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    const q = query.trim()
    if (!q) {
      setResults([])
      setLoading(false)
      return
    }

    const controller = new AbortController()
    const timer = window.setTimeout(() => {
      const params = new URLSearchParams()
      params.set('q', q)
      params.set('limit', String(maxResults))
      if (assignedTo) params.set('assignedTo', assignedTo)

      setLoading(true)
      fetch(`/api/clients/search?${params.toString()}`, { signal: controller.signal })
        .then(async (res) => {
          if (!res.ok) throw new Error(`Search failed (${res.status})`)
          return res.json() as Promise<{ clients: Client[] }>
        })
        .then((payload) => {
          setResults(payload.clients ?? [])
        })
        .catch((error) => {
          if (controller.signal.aborted) return
          console.error('Client quick search failed:', error)
          setResults([])
        })
        .finally(() => {
          if (!controller.signal.aborted) setLoading(false)
        })
    }, 250)

    return () => {
      controller.abort()
      window.clearTimeout(timer)
    }
  }, [query, assignedTo, maxResults])

  return (
    <div className="card" style={{ marginBottom: 20 }}>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
        <input
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder={placeholder}
          style={{ flex: '1 1 320px' }}
        />
        {helperText && <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{helperText}</div>}
      </div>

      {query.trim() && (
        <div style={{ marginTop: 14, display: 'grid', gap: 10, maxHeight: 420, overflowY: 'auto', paddingRight: 4 }}>
          {loading ? (
            <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Searching…</div>
          ) : results.length === 0 ? (
            <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>No active clients match that search.</div>
          ) : (
            results.map(client => (
              <Link key={client.id} href={`/clients/${client.id}`} style={{ textDecoration: 'none', color: 'inherit' }}>
                <div style={{ border: '1px solid var(--border)', borderRadius: 10, padding: 12, background: 'var(--surface-2)' }}>
                  <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 4 }}>
                    {client.last_name}{client.first_name ? `, ${client.first_name}` : ''}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                    ID {client.client_id} • Planner: {client.profiles?.full_name ?? 'Unassigned'}
                  </div>
                </div>
              </Link>
            ))
          )}
        </div>
      )}
    </div>
  )
}
